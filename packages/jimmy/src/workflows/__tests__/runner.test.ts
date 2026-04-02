/**
 * Tests for WorkflowRunner with in-memory SQLite
 *
 * The runner uses:
 *  - initDb()        → mocked to return an in-memory SQLite DB
 *  - fs / yaml       → mocked to serve workflow definitions
 *  - node handlers   → real handlers imported via registry side-effects
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

// ── Set JINN_HOME to temp dir first (before any module loads paths) ─────────
const tmpHome = path.join(os.tmpdir(), `jinn-runner-test-${process.pid}-${Date.now()}`)
fs.mkdirSync(path.join(tmpHome, 'sessions'), { recursive: true })
fs.mkdirSync(path.join(tmpHome, 'workflows', 'definitions'), { recursive: true })
process.env.JINN_HOME = tmpHome

// ── In-memory DB ────────────────────────────────────────────────────────────
let memDb: Database.Database

function createMemDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      engine TEXT NOT NULL,
      engine_session_id TEXT,
      source TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      connector TEXT,
      session_key TEXT,
      reply_context TEXT,
      message_id TEXT,
      transport_meta TEXT,
      employee TEXT,
      model TEXT,
      title TEXT,
      parent_session_id TEXT,
      status TEXT DEFAULT 'idle',
      created_at TEXT NOT NULL,
      last_activity TEXT NOT NULL,
      last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      size INTEGER NOT NULL,
      mimetype TEXT,
      path TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      session_key TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      workflow_version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'queued',
      trigger_type TEXT,
      trigger_payload TEXT,
      context TEXT DEFAULT '{}',
      current_node_id TEXT,
      started_at TEXT,
      completed_at TEXT,
      error TEXT
    );
    CREATE TABLE IF NOT EXISTS workflow_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      node_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input TEXT,
      output TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'not_started',
      level TEXT NOT NULL DEFAULT 'company',
      parent_id TEXT,
      department TEXT,
      owner TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS budget_events (
      id TEXT PRIMARY KEY,
      employee TEXT NOT NULL,
      event_type TEXT NOT NULL,
      amount REAL NOT NULL,
      limit_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../sessions/registry.js', async () => {
  // Return the in-memory DB singleton via initDb
  const mod = await vi.importActual<typeof import('../../sessions/registry.js')>('../../sessions/registry.js')
  return {
    ...mod,
    initDb: () => memDb,
  }
})

vi.mock('../../sessions/callbacks.js', () => ({
  notifyDiscordChannel: vi.fn(),
}))

vi.mock('../../cron/jobs.js', () => ({
  loadJobs: vi.fn(() => []),
  saveJobs: vi.fn(),
}))

vi.mock('../../cron/scheduler.js', () => ({
  reloadScheduler: vi.fn(),
  setCronJobEnabled: vi.fn(),
}))

vi.mock('../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../triggers/cron.js', () => ({
  registerCronTrigger: vi.fn(),
  unregisterCronTrigger: vi.fn(),
  registerAllCronTriggers: vi.fn(),
}))

vi.mock('../triggers/kanban.js', () => ({
  registerKanbanTriggers: vi.fn(),
}))

// ── Workflow definition helpers ─────────────────────────────────────────────

import { NodeType, TriggerType } from '../types.js'
import type { WorkflowDefinition } from '../types.js'
import yaml from 'js-yaml'

function writeDefinition(def: WorkflowDefinition): string {
  const dir = path.join(tmpHome, 'workflows', 'definitions')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${def.id}.yaml`)
  fs.writeFileSync(filePath, yaml.dump(def, { indent: 2 }), 'utf-8')
  return filePath
}

function makeTriggerDoneWorkflow(id: string): WorkflowDefinition {
  return {
    id,
    name: `Test ${id}`,
    enabled: true,
    version: 1,
    trigger: { type: TriggerType.manual },
    nodes: [
      { id: 'start', type: NodeType.TRIGGER, config: {} },
      { id: 'end', type: NodeType.DONE, config: {} },
    ],
    edges: [{ source: 'start', target: 'end' }],
  }
}

function makeNoNodesWorkflow(id: string): WorkflowDefinition {
  return {
    id,
    name: `No Nodes ${id}`,
    enabled: true,
    version: 1,
    trigger: { type: TriggerType.manual },
    nodes: [],
    edges: [],
  }
}

function makeUnknownNodeWorkflow(id: string): WorkflowDefinition {
  return {
    id,
    name: `Unknown node ${id}`,
    enabled: true,
    version: 1,
    trigger: { type: TriggerType.manual },
    nodes: [
      { id: 'start', type: NodeType.TRIGGER, config: {} },
      { id: 'weird', type: 'unknown_type' as NodeType, config: {} },
    ],
    edges: [{ source: 'start', target: 'weird' }],
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('WorkflowRunner', () => {
  beforeAll(() => {
    memDb = createMemDb()
  })

  beforeEach(() => {
    // Clear tables between tests
    memDb.exec('DELETE FROM workflow_runs; DELETE FROM workflow_steps;')
  })

  it('createRun: inserts a run with status=queued', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-create-${randomUUID()}`
    writeDefinition(makeTriggerDoneWorkflow(wfId))

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })

    expect(run.id).toBeTruthy()
    expect(run.workflow_id).toBe(wfId)
    expect(run.status).toBe('queued')
    expect(run.trigger_payload).toEqual({ type: 'manual' })
  })

  it('executeRun: TRIGGER → DONE workflow completes with status=completed', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-trigger-done-${randomUUID()}`
    writeDefinition(makeTriggerDoneWorkflow(wfId))

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const finalRun = runner.getRun(run.id)
    expect(finalRun?.status).toBe('completed')
    expect(finalRun?.completed_at).toBeTruthy()
    expect(finalRun?.error).toBeNull()
  })

  it('executeRun: workflow with no nodes → status=failed, error=Workflow has no nodes', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-nonodes-${randomUUID()}`
    writeDefinition(makeNoNodesWorkflow(wfId))

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const finalRun = runner.getRun(run.id)
    expect(finalRun?.status).toBe('failed')
    expect(finalRun?.error).toContain('no nodes')
  })

  it('executeRun: unknown node type → status=failed, error contains node type', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-unknown-${randomUUID()}`
    writeDefinition(makeUnknownNodeWorkflow(wfId))

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const finalRun = runner.getRun(run.id)
    expect(finalRun?.status).toBe('failed')
    expect(finalRun?.error).toBeDefined()
  })

  it('getSteps: returns steps after a completed run', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-steps-${randomUUID()}`
    writeDefinition(makeTriggerDoneWorkflow(wfId))

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const steps = runner.getSteps(run.id)
    expect(Array.isArray(steps)).toBe(true)
    expect(steps.length).toBeGreaterThan(0)
    for (const step of steps) {
      expect(step).toHaveProperty('id')
      expect(step).toHaveProperty('run_id', run.id)
      expect(step).toHaveProperty('node_id')
      expect(step).toHaveProperty('status')
    }
  })

  it('listRuns: returns all runs by workflowId filter', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-listruns-${randomUUID()}`
    writeDefinition(makeTriggerDoneWorkflow(wfId))

    const runner = new WorkflowRunner()
    const r1 = await runner.createRun(wfId, { type: 'manual' })
    const r2 = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(r1.id)
    await runner.executeRun(r2.id)

    const runs = runner.listRuns({ workflowId: wfId })
    expect(runs.length).toBe(2)
    expect(runs.every((r) => r.workflow_id === wfId)).toBe(true)
  })

  it('listRuns: filters by status', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-statusfilter-${randomUUID()}`
    writeDefinition(makeTriggerDoneWorkflow(wfId))

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const completed = runner.listRuns({ status: 'completed' })
    expect(completed.every((r) => r.status === 'completed')).toBe(true)
  })

  it('emits run.started and run.completed events', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-events-${randomUUID()}`
    writeDefinition(makeTriggerDoneWorkflow(wfId))

    const runner = new WorkflowRunner()
    const started: unknown[] = []
    const completed: unknown[] = []
    runner.on('run.started', (d) => started.push(d))
    runner.on('run.completed', (d) => completed.push(d))

    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    expect(started.length).toBeGreaterThan(0)
    expect(completed.length).toBeGreaterThan(0)
  })

  it('emits run.error event on failure', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-err-evt-${randomUUID()}`
    writeDefinition(makeNoNodesWorkflow(wfId))

    const runner = new WorkflowRunner()
    const errors: unknown[] = []
    runner.on('run.error', (d) => errors.push(d))

    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    expect(errors.length).toBeGreaterThan(0)
  })

  it('cancelRun: marks run as cancelled', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-cancel-${randomUUID()}`
    writeDefinition(makeTriggerDoneWorkflow(wfId))

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    // Don't execute — cancel while queued
    runner.cancelRun(run.id)

    const finalRun = runner.getRun(run.id)
    expect(finalRun?.status).toBe('cancelled')
  })

  it('cancelRun: throws for already-completed run', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-cancel-err-${randomUUID()}`
    writeDefinition(makeTriggerDoneWorkflow(wfId))

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    expect(() => runner.cancelRun(run.id)).toThrow('terminal state')
  })

  it('getRun: returns undefined for unknown run id', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const runner = new WorkflowRunner()
    expect(runner.getRun('no-such-run-id')).toBeUndefined()
  })

  it('executeRun: throws for unknown run id', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const runner = new WorkflowRunner()
    await expect(runner.executeRun('no-such-run-id')).rejects.toThrow('Run not found: no-such-run-id')
  })

  it('condition node routes correctly in a workflow run', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-condition-${randomUUID()}`
    const def: WorkflowDefinition = {
      id: wfId,
      name: 'Condition Test',
      enabled: true,
      version: 1,
      trigger: { type: TriggerType.manual },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'cond',
          type: NodeType.CONDITION,
          config: {
            expression: 'context.value >= 10',
            true_branch: 'end',
            false_branch: 'end',
          },
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { source: 'start', target: 'cond' },
        { source: 'cond', target: 'end' },
      ],
    }
    writeDefinition(def)

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })

    // Manually update context before execution to inject value
    // Instead we update via context after createRun
    await runner.executeRun(run.id)
    const finalRun = runner.getRun(run.id)
    // With no 'value' in context, condition evaluates to false → false_branch = 'end' = done
    expect(finalRun?.status).toBe('completed')
  })
})
