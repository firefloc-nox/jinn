/**
 * Tests for WorkflowEngine
 *
 * The engine uses:
 *  - fs / WORKFLOWS_DIR for persistence → mock paths module + real fs on tmpDir
 *  - WorkflowRunner for run creation    → uses real runner (in-memory db)
 *  - cron triggers                      → mock
 *  - kanban triggers                    → mock
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { describe, it, expect, vi } from 'vitest'

// ── vi.hoisted: define tmp paths before the hoisted vi.mock calls run ────────
// vi.hoisted callbacks cannot use ESM imports — use require() or node builtins inline
const { tmpHome, wfDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _os = require('node:os') as typeof os
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _path = require('node:path') as typeof path
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _fs = require('node:fs') as typeof fs

  const home = _path.join(_os.tmpdir(), `jinn-engine-test-${process.pid}-${Date.now()}`)
  const wf = _path.join(home, 'workflows', 'definitions')
  _fs.mkdirSync(_path.join(home, 'sessions'), { recursive: true })
  _fs.mkdirSync(wf, { recursive: true })
  return { tmpHome: home, wfDir: wf }
})

// ── Mock the shared/paths module so WORKFLOWS_DIR → our tmpDir ─────────────
vi.mock('../../shared/paths.js', () => ({
  JINN_HOME: tmpHome,
  SESSIONS_DB: path.join(tmpHome, 'sessions', 'registry.db'),
  WORKFLOWS_DIR: path.join(tmpHome, 'workflows', 'definitions'),
  CRON_JOBS: path.join(tmpHome, 'cron', 'jobs.json'),
  CRON_RUNS: path.join(tmpHome, 'cron', 'runs'),
  ORG_DIR: path.join(tmpHome, 'org'),
  SKILLS_DIR: path.join(tmpHome, 'skills'),
  DOCS_DIR: path.join(tmpHome, 'docs'),
  LOGS_DIR: path.join(tmpHome, 'logs'),
  TMP_DIR: path.join(tmpHome, 'tmp'),
  MODELS_DIR: path.join(tmpHome, 'models'),
  STT_MODELS_DIR: path.join(tmpHome, 'models', 'whisper'),
  PID_FILE: path.join(tmpHome, 'gateway.pid'),
  CLAUDE_SKILLS_DIR: path.join(tmpHome, '.claude', 'skills'),
  AGENTS_SKILLS_DIR: path.join(tmpHome, '.agents', 'skills'),
  TEMPLATE_DIR: path.join(tmpHome, 'template'),
  FILES_DIR: path.join(tmpHome, 'files'),
  MIGRATIONS_DIR: path.join(tmpHome, 'migrations'),
  TEMPLATE_MIGRATIONS_DIR: path.join(tmpHome, 'template', 'migrations'),
  INSTANCES_REGISTRY: path.join(os.homedir(), '.jinn', 'instances.json'),
  BOARDS_DIR: path.join(tmpHome, 'boards'),
}))

// ── Mock modules with side-effects that access external services ────────────

vi.mock('../../sessions/callbacks.js', () => ({ notifyDiscordChannel: vi.fn() }))

vi.mock('../triggers/cron.js', () => ({
  registerCronTrigger: vi.fn(),
  unregisterCronTrigger: vi.fn(),
  registerAllCronTriggers: vi.fn(),
}))

vi.mock('../triggers/kanban.js', () => ({
  registerKanbanTriggers: vi.fn(),
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

// ── Imports (after mocks are set) ──────────────────────────────────────────

import { WorkflowEngine } from '../engine.js'
import { NodeType, TriggerType } from '../types.js'
import type { WorkflowDefinition } from '../types.js'

// ── Helpers ────────────────────────────────────────────────────────────────

function getEngine() {
  return new WorkflowEngine()
}

function writeWorkflowFile(def: WorkflowDefinition) {
  const yamlContent = `
id: ${def.id}
name: ${def.name}
enabled: ${def.enabled}
version: 1
trigger:
  type: manual
nodes: []
edges: []
`.trim()
  fs.mkdirSync(wfDir, { recursive: true })
  fs.writeFileSync(path.join(wfDir, `${def.id}.yaml`), yamlContent, 'utf-8')
}

function makeMinimalDef(id: string, enabled = false): WorkflowDefinition {
  return {
    id,
    name: `Test ${id}`,
    enabled,
    trigger: { type: TriggerType.manual },
    nodes: [
      { id: 'start', type: NodeType.TRIGGER, config: {} },
      { id: 'end', type: NodeType.DONE, config: {} },
    ],
    edges: [{ source: 'start', target: 'end' }],
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('WorkflowEngine.listWorkflows', () => {
  it('returns empty array initially', () => {
    const engine = getEngine()
    expect(engine.listWorkflows()).toEqual([])
  })

  it('returns workflows after loading from disk', () => {
    const def = makeMinimalDef('wf-list-test')
    writeWorkflowFile(def)
    const engine = getEngine()
    engine.loadAll()
    const list = engine.listWorkflows()
    expect(Array.isArray(list)).toBe(true)
    expect(list.some((w) => w.id === 'wf-list-test')).toBe(true)
  })
})

describe('WorkflowEngine.getWorkflow', () => {
  it('returns undefined for unknown id', () => {
    const engine = getEngine()
    expect(engine.getWorkflow('does-not-exist')).toBeUndefined()
  })

  it('returns workflow after loading', () => {
    const def = makeMinimalDef('wf-get-test')
    writeWorkflowFile(def)
    const engine = getEngine()
    engine.loadAll()
    const result = engine.getWorkflow('wf-get-test')
    expect(result).toBeDefined()
    expect(result?.id).toBe('wf-get-test')
  })
})

describe('WorkflowEngine.saveWorkflow / toggleWorkflow', () => {
  it('saveWorkflow: persists workflow to in-memory map and disk', () => {
    const engine = getEngine()
    const def = makeMinimalDef('wf-save-test')
    engine.saveWorkflow(def)

    expect(engine.getWorkflow('wf-save-test')).toBeDefined()
    // file should exist on disk
    const filePath = path.join(wfDir, 'wf-save-test.yaml')
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('toggleWorkflow: enables a disabled workflow', () => {
    const engine = getEngine()
    const def = makeMinimalDef('wf-toggle-test', false)
    engine.saveWorkflow(def)

    const updated = engine.toggleWorkflow('wf-toggle-test', true)
    expect(updated.enabled).toBe(true)
    expect(engine.getWorkflow('wf-toggle-test')?.enabled).toBe(true)
  })

  it('toggleWorkflow: disables an enabled workflow', () => {
    const engine = getEngine()
    const def = makeMinimalDef('wf-toggle-off-test', true)
    engine.saveWorkflow(def)

    const updated = engine.toggleWorkflow('wf-toggle-off-test', false)
    expect(updated.enabled).toBe(false)
  })

  it('toggleWorkflow: throws for unknown id', () => {
    const engine = getEngine()
    expect(() => engine.toggleWorkflow('no-such-id', true)).toThrow('Workflow not found: no-such-id')
  })
})

describe('WorkflowEngine.deleteWorkflow', () => {
  it('removes workflow from in-memory map', () => {
    const engine = getEngine()
    const def = makeMinimalDef('wf-delete-test')
    engine.saveWorkflow(def)

    expect(engine.getWorkflow('wf-delete-test')).toBeDefined()
    engine.deleteWorkflow('wf-delete-test')
    expect(engine.getWorkflow('wf-delete-test')).toBeUndefined()
  })

  it('removes yaml file from disk', () => {
    const engine = getEngine()
    const def = makeMinimalDef('wf-delete-disk')
    engine.saveWorkflow(def)

    const filePath = path.join(wfDir, 'wf-delete-disk.yaml')
    expect(fs.existsSync(filePath)).toBe(true)
    engine.deleteWorkflow('wf-delete-disk')
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('throws when workflow file does not exist', () => {
    const engine = getEngine()
    expect(() => engine.deleteWorkflow('never-existed')).toThrow('not found on disk')
  })
})

describe('WorkflowEngine.trigger', () => {
  it('throws when workflow is not found', async () => {
    const engine = getEngine()
    await expect(engine.trigger('nonexistent', { type: 'manual' })).rejects.toThrow('Workflow not found: nonexistent')
  })

  it('throws when workflow is disabled', async () => {
    const engine = getEngine()
    const def = makeMinimalDef('wf-disabled', false)
    engine.saveWorkflow(def)

    await expect(engine.trigger('wf-disabled', { type: 'manual' })).rejects.toThrow('disabled')
  })

  it('creates a run with status queued and returns run object', async () => {
    const engine = getEngine()
    const def = makeMinimalDef('wf-trigger-test', true)
    engine.saveWorkflow(def)

    const run = await engine.trigger('wf-trigger-test', { type: 'manual' })
    expect(run).toBeDefined()
    expect(run.id).toBeTruthy()
    expect(run.workflow_id).toBe('wf-trigger-test')
    expect(run.status).toBe('queued')
  })
})

// ── ModeRegistry / templates ───────────────────────────────────────────────

describe('modeRegistry.getTemplates', () => {
  it('returns templates from all registered modes', async () => {
    // Import templates file to trigger registration side-effects
    await import('../modes/templates.js')
    const { modeRegistry } = await import('../modes/registry.js')

    const templates = modeRegistry.getTemplates()
    expect(Array.isArray(templates)).toBe(true)
    expect(templates.length).toBeGreaterThanOrEqual(3) // at least 3 general templates

    for (const tpl of templates) {
      expect(tpl).toHaveProperty('id')
      expect(tpl).toHaveProperty('name')
      expect(tpl).toHaveProperty('mode')
      expect(tpl).toHaveProperty('definition')
      expect(tpl.definition).toHaveProperty('trigger')
      expect(tpl.definition).toHaveProperty('nodes')
      expect(tpl.definition).toHaveProperty('edges')
    }
  })

  it('includes the expected general template ids', async () => {
    await import('../modes/templates.js')
    const { modeRegistry } = await import('../modes/registry.js')
    const templates = modeRegistry.getTemplates()
    const ids = templates.map((t) => t.id)
    expect(ids).toContain('simple-agent')
    expect(ids).toContain('review-pipeline')
    expect(ids).toContain('cron-brief')
  })
})
