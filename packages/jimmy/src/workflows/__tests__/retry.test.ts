/**
 * Tests for Workflow Step Retry functionality
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

// ── Set JINN_HOME to temp dir first (before any module loads paths) ─────────
const tmpHome = path.join(os.tmpdir(), `jinn-retry-test-${process.pid}-${Date.now()}`)
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
import type { WorkflowDefinition, RetryConfig } from '../types.js'
import yaml from 'js-yaml'

function writeDefinition(def: WorkflowDefinition): string {
  const dir = path.join(tmpHome, 'workflows', 'definitions')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, `${def.id}.yaml`)
  fs.writeFileSync(filePath, yaml.dump(def, { indent: 2 }), 'utf-8')
  return filePath
}

// Track HTTP node execution attempts
let httpCallCount = 0
let httpShouldFail = true

// Mock the HTTP handler to simulate failures
vi.mock('../nodes/http.js', () => ({
  httpHandler: {
    type: 'http',
    execute: vi.fn(async () => {
      httpCallCount++
      if (httpShouldFail && httpCallCount < 3) {
        throw new Error(`HTTP call failed (attempt ${httpCallCount})`)
      }
      return { output: { status: 200, data: 'success' }, context_updates: { http_result: 'success' } }
    }),
  },
}))

// ── Tests ───────────────────────────────────────────────────────────────────

describe('WorkflowRunner Retry', () => {
  beforeAll(() => {
    memDb = createMemDb()
  })

  beforeEach(() => {
    memDb.exec('DELETE FROM workflow_runs; DELETE FROM workflow_steps;')
    httpCallCount = 0
    httpShouldFail = true
    vi.clearAllMocks()
  })

  it('no retry by default: node fails immediately without retry (maxRetries=0)', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-no-retry-${randomUUID()}`

    const def: WorkflowDefinition = {
      id: wfId,
      name: 'No Retry Test',
      enabled: true,
      version: 1,
      trigger: { type: TriggerType.manual },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'http',
          type: NodeType.HTTP,
          config: { url: 'http://example.com', method: 'GET' },
          // No retry config = default 0 retries
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { source: 'start', target: 'http' },
        { source: 'http', target: 'end' },
      ],
    }
    writeDefinition(def)

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const finalRun = runner.getRun(run.id)
    expect(finalRun?.status).toBe('failed')
    expect(httpCallCount).toBe(1) // Only 1 attempt, no retries
  })

  it('retry on failure: node retries up to maxRetries times', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-retry-success-${randomUUID()}`

    const def: WorkflowDefinition = {
      id: wfId,
      name: 'Retry Success Test',
      enabled: true,
      version: 1,
      trigger: { type: TriggerType.manual },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'http',
          type: NodeType.HTTP,
          config: { url: 'http://example.com', method: 'GET' },
          retry: { maxRetries: 3, retryDelayMs: 10 }, // 3 retries, minimal delay for testing
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { source: 'start', target: 'http' },
        { source: 'http', target: 'end' },
      ],
    }
    writeDefinition(def)

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const finalRun = runner.getRun(run.id)
    // httpShouldFail is true, but succeeds on 3rd attempt (httpCallCount >= 3)
    expect(finalRun?.status).toBe('completed')
    expect(httpCallCount).toBe(3) // Failed twice, succeeded on third
  })

  it('max retries exceeded: workflow fails after all retries exhausted', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-retry-exhausted-${randomUUID()}`

    // Make HTTP always fail
    httpShouldFail = true

    // Override mock to always fail
    const { httpHandler } = await import('../nodes/http.js')
    ;(httpHandler.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      httpCallCount++
      throw new Error(`HTTP call always fails (attempt ${httpCallCount})`)
    })

    const def: WorkflowDefinition = {
      id: wfId,
      name: 'Retry Exhausted Test',
      enabled: true,
      version: 1,
      trigger: { type: TriggerType.manual },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'http',
          type: NodeType.HTTP,
          config: { url: 'http://example.com', method: 'GET' },
          retry: { maxRetries: 2, retryDelayMs: 10 }, // 2 retries
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { source: 'start', target: 'http' },
        { source: 'http', target: 'end' },
      ],
    }
    writeDefinition(def)

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const finalRun = runner.getRun(run.id)
    expect(finalRun?.status).toBe('failed')
    expect(finalRun?.error).toContain('HTTP call always fails')
    expect(httpCallCount).toBe(3) // 1 initial + 2 retries = 3 attempts
  })

  it('step records: retry_count is tracked in step records', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-retry-steps-${randomUUID()}`

    // Reset mock to succeed on 3rd attempt
    const { httpHandler } = await import('../nodes/http.js')
    ;(httpHandler.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      httpCallCount++
      if (httpCallCount < 3) {
        throw new Error(`HTTP call failed (attempt ${httpCallCount})`)
      }
      return { output: { status: 200 }, context_updates: {} }
    })

    const def: WorkflowDefinition = {
      id: wfId,
      name: 'Step Records Test',
      enabled: true,
      version: 1,
      trigger: { type: TriggerType.manual },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'http',
          type: NodeType.HTTP,
          config: { url: 'http://example.com', method: 'GET' },
          retry: { maxRetries: 3, retryDelayMs: 10 },
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { source: 'start', target: 'http' },
        { source: 'http', target: 'end' },
      ],
    }
    writeDefinition(def)

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const steps = runner.getSteps(run.id)
    const httpSteps = steps.filter((s) => s.node_id === 'http')

    // Should have 3 step records for the HTTP node (2 failed, 1 completed)
    expect(httpSteps.length).toBe(3)
    expect(httpSteps[0].retry_count).toBe(0)
    expect(httpSteps[0].status).toBe('failed')
    expect(httpSteps[1].retry_count).toBe(1)
    expect(httpSteps[1].status).toBe('failed')
    expect(httpSteps[2].retry_count).toBe(2)
    expect(httpSteps[2].status).toBe('completed')
  })

  it('legacy config: max_attempts still works for backward compatibility', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-legacy-retry-${randomUUID()}`

    // Reset mock
    const { httpHandler } = await import('../nodes/http.js')
    ;(httpHandler.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      httpCallCount++
      if (httpCallCount < 2) {
        throw new Error(`HTTP call failed (attempt ${httpCallCount})`)
      }
      return { output: { status: 200 }, context_updates: {} }
    })

    const def: WorkflowDefinition = {
      id: wfId,
      name: 'Legacy Retry Test',
      enabled: true,
      version: 1,
      trigger: { type: TriggerType.manual },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'http',
          type: NodeType.HTTP,
          config: { url: 'http://example.com', method: 'GET' },
          // Using legacy field (treated as total attempts, not retries)
          max_attempts: 2,
          retry_delay_ms: 10,
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { source: 'start', target: 'http' },
        { source: 'http', target: 'end' },
      ],
    }
    writeDefinition(def)

    const runner = new WorkflowRunner()
    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    const finalRun = runner.getRun(run.id)
    expect(finalRun?.status).toBe('completed')
    // Legacy max_attempts=2 means maxRetries=2, so total attempts = 3
    // But we succeed on attempt 2
    expect(httpCallCount).toBe(2)
  })

  it('emits step.failed events on retry attempts', async () => {
    const { WorkflowRunner } = await import('../runner.js')
    const wfId = `wf-retry-events-${randomUUID()}`

    // Reset mock
    const { httpHandler } = await import('../nodes/http.js')
    ;(httpHandler.execute as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      httpCallCount++
      if (httpCallCount < 3) {
        throw new Error(`HTTP call failed (attempt ${httpCallCount})`)
      }
      return { output: { status: 200 }, context_updates: {} }
    })

    const def: WorkflowDefinition = {
      id: wfId,
      name: 'Retry Events Test',
      enabled: true,
      version: 1,
      trigger: { type: TriggerType.manual },
      nodes: [
        { id: 'start', type: NodeType.TRIGGER, config: {} },
        {
          id: 'http',
          type: NodeType.HTTP,
          config: { url: 'http://example.com', method: 'GET' },
          retry: { maxRetries: 3, retryDelayMs: 10 },
        },
        { id: 'end', type: NodeType.DONE, config: {} },
      ],
      edges: [
        { source: 'start', target: 'http' },
        { source: 'http', target: 'end' },
      ],
    }
    writeDefinition(def)

    const runner = new WorkflowRunner()
    const failedEvents: unknown[] = []
    runner.on('step.failed', (e) => failedEvents.push(e))

    const run = await runner.createRun(wfId, { type: 'manual' })
    await runner.executeRun(run.id)

    // Should have 2 step.failed events (attempts 1 and 2 failed)
    expect(failedEvents.length).toBe(2)
    expect((failedEvents[0] as { attempt: number }).attempt).toBe(0)
    expect((failedEvents[1] as { attempt: number }).attempt).toBe(1)
  })
})
