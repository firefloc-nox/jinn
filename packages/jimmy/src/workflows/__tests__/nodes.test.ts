/**
 * Tests for individual node handlers
 * Heavy external dependencies are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NodeType } from '../types.js'
import type { WorkflowNode, RunContext } from '../types.js'
import type { NodeServices } from '../registry.js'

// ── Mock external modules ──────────────────────────────────────────────────

vi.mock('../../sessions/callbacks.js', () => ({
  notifyDiscordChannel: vi.fn(),
}))

vi.mock('../../sessions/registry.js', () => ({
  initDb: vi.fn(),
  createSession: vi.fn(() => ({
    id: 'sess-001',
    engine: 'claude',
    source: 'workflow',
    sourceRef: 'workflow:run1:node1',
    employee: 'test',
  })),
  insertMessage: vi.fn(),
}))

vi.mock('../../cron/jobs.js', () => ({
  loadJobs: vi.fn(() => []),
  saveJobs: vi.fn(),
}))

vi.mock('../../cron/scheduler.js', () => ({
  reloadScheduler: vi.fn(),
  setCronJobEnabled: vi.fn((id: string, enabled: boolean) => ({ id, enabled })),
}))

vi.mock('../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../shared/config.js', () => ({
  loadConfig: vi.fn(() => ({ gateway: { port: 7777 } })),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    run_id: 'run-001',
    workflow_id: 'wf-001',
    trigger: { type: 'manual' },
    ...overrides,
  }
}

function makeNode(
  type: NodeType,
  config: Record<string, unknown> = {},
  id = 'node-001',
): WorkflowNode {
  return { id, type, config }
}

// ── done handler ──────────────────────────────────────────────────────────

describe('doneHandler', () => {
  it('returns output: null and next: null when no output_var', async () => {
    const { doneHandler } = await import('../nodes/done.js')
    const node = makeNode(NodeType.DONE, {})
    const ctx = makeContext()
    const result = await doneHandler.execute(node, ctx, {})
    expect(result.next).toBeNull()
    expect(result.output).toBeNull()
  })

  it('returns context value when output_var is set', async () => {
    const { doneHandler } = await import('../nodes/done.js')
    const node = makeNode(NodeType.DONE, { output_var: 'myResult' })
    const ctx = makeContext({ myResult: 'hello world' })
    const result = await doneHandler.execute(node, ctx, {})
    expect(result.output).toBe('hello world')
    expect(result.next).toBeNull()
  })
})

// ── trigger handler ────────────────────────────────────────────────────────

describe('triggerHandler', () => {
  it('returns context.trigger as output and next: null', async () => {
    const { triggerHandler } = await import('../nodes/trigger.js')
    const node = makeNode(NodeType.TRIGGER, {})
    const trigger = { type: 'manual', card: { id: 'c1', title: 'T', status: 'todo' } }
    const ctx = makeContext({ trigger })
    const result = await triggerHandler.execute(node, ctx, {})
    expect(result.output).toEqual(trigger)
    expect(result.next).toBeNull()
  })
})

// ── condition handler ──────────────────────────────────────────────────────
//
// Note on resolveValue:
//   - 'trigger.x'  → resolves context.trigger.x  (path[0]==='trigger' is shifted off)
//   - 'context.x'  → resolves context['context']['x'] which is almost always undefined
//                    because RunContext has no 'context' property
//   - literal string/number → returned as-is
//
// Tests therefore use trigger.* paths to access data stored in context.trigger.

describe('conditionHandler', () => {
  it('routes to true_branch when >= expression is true', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.score >= 5',
      true_branch: 'approved',
      false_branch: 'rejected',
    })
    const ctx = makeContext({ trigger: { type: 'manual', score: 10 } })
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('approved')
    expect(result.output).toBe(true)
  })

  it('routes to false_branch when >= expression is false', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.score >= 5',
      true_branch: 'approved',
      false_branch: 'rejected',
    })
    const ctx = makeContext({ trigger: { type: 'manual', score: 2 } })
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('rejected')
    expect(result.output).toBe(false)
  })

  it('handles == operator (truthy branch)', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.status == "done"',
      true_branch: 'done-node',
      false_branch: 'not-done',
    })
    const ctx = makeContext({ trigger: { type: 'manual', status: 'done' } })
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('done-node')
  })

  it('handles != operator (truthy branch)', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.status != "done"',
      true_branch: 'not-done',
      false_branch: 'done-node',
    })
    const ctx = makeContext({ trigger: { type: 'manual', status: 'todo' } })
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('not-done')
  })

  it('handles contains operator (truthy branch)', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.message contains "hello"',
      true_branch: 'yes',
      false_branch: 'no',
    })
    const ctx = makeContext({ trigger: { type: 'manual', message: 'say hello world' } })
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('yes')
  })

  it('handles contains operator (falsy branch)', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.message contains "goodbye"',
      true_branch: 'yes',
      false_branch: 'no',
    })
    const ctx = makeContext({ trigger: { type: 'manual', message: 'say hello world' } })
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('no')
  })

  it('handles boolean-only expression with trigger var', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.approved',
      true_branch: 'yes',
      false_branch: 'no',
    })
    const ctx = makeContext({ trigger: { type: 'manual', approved: true } })
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('yes')
  })

  it('handles boolean-only expression — falsy when var is absent', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.approved',
      true_branch: 'yes',
      false_branch: 'no',
    })
    const ctx = makeContext()
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('no')
  })

  it('handles < operator', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.count < 3',
      true_branch: 'small',
      false_branch: 'large',
    })
    const ctx = makeContext({ trigger: { type: 'manual', count: 1 } })
    const result = await conditionHandler.execute(node, ctx, {})
    expect(result.next).toBe('small')
  })

  it('throws if expression is missing', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      true_branch: 'yes',
      false_branch: 'no',
    })
    await expect(conditionHandler.execute(node, makeContext(), {})).rejects.toThrow('condition node requires config.expression')
  })

  it('throws if true_branch is missing', async () => {
    const { conditionHandler } = await import('../nodes/condition.js')
    const node = makeNode(NodeType.CONDITION, {
      expression: 'trigger.x == "y"',
      false_branch: 'no',
    })
    await expect(conditionHandler.execute(node, makeContext(), {})).rejects.toThrow('true_branch')
  })
})

// ── wait handler ──────────────────────────────────────────────────────────

describe('waitHandler', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('throws if mode is missing', async () => {
    const { waitHandler } = await import('../nodes/wait.js')
    const node = makeNode(NodeType.WAIT, {})
    await expect(waitHandler.execute(node, makeContext(), {})).rejects.toThrow('wait node requires config.mode')
  })

  it('mode=human_approval: returns suspend info with reason=human_approval', async () => {
    const { waitHandler } = await import('../nodes/wait.js')
    const node = makeNode(NodeType.WAIT, {
      mode: 'human_approval',
      approval_message: 'Please approve',
    })
    const ctx = makeContext()
    const result = await waitHandler.execute(node, ctx, {})
    expect(result.suspend).toBeDefined()
    expect(result.suspend?.reason).toBe('human_approval')
    expect(result.suspend?.node_id).toBe('node-001')
    expect(result.suspend?.message).toBe('Please approve')
    expect(result.output).toEqual({ mode: 'human_approval', suspended: true })
    expect(result.next).toBeNull()
  })

  it('mode=delay without resumeRun service: blocks inline', async () => {
    vi.useFakeTimers()
    const { waitHandler } = await import('../nodes/wait.js')
    const node = makeNode(NodeType.WAIT, { mode: 'delay', delay_ms: 100 })
    const ctx = makeContext()
    // No services.resumeRun — inline delay path
    const promise = waitHandler.execute(node, ctx, {})
    await vi.runAllTimersAsync()
    const result = await promise
    expect(result.suspend).toBeUndefined()
    expect(result.output).toEqual({ mode: 'delay', delay_ms: 100 })
  })

  it('mode=delay with resumeRun service: returns suspend and schedules auto-resume', async () => {
    vi.useFakeTimers()
    const { waitHandler } = await import('../nodes/wait.js')
    const node = makeNode(NodeType.WAIT, { mode: 'delay', delay_ms: 500 })
    const ctx = makeContext()
    const resumeRun = vi.fn().mockResolvedValue(undefined)
    const services: NodeServices = { resumeRun }

    const result = await waitHandler.execute(node, ctx, services)
    expect(result.suspend).toBeDefined()
    expect(result.suspend?.reason).toBe('delay')

    // Auto-resume scheduled
    await vi.runAllTimersAsync()
    expect(resumeRun).toHaveBeenCalledWith('run-001', { resumed_by: 'delay', node_id: 'node-001' })
  })

  it('throws for unknown mode', async () => {
    const { waitHandler } = await import('../nodes/wait.js')
    const node = makeNode(NodeType.WAIT, { mode: 'unknown_mode' })
    await expect(waitHandler.execute(node, makeContext(), {})).rejects.toThrow('Unknown wait mode: unknown_mode')
  })
})

// ── notify handler ─────────────────────────────────────────────────────────

describe('notifyHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws if connector is missing', async () => {
    const { notifyHandler } = await import('../nodes/notify.js')
    const node = makeNode(NodeType.NOTIFY, { message: 'hello' })
    await expect(notifyHandler.execute(node, makeContext(), {})).rejects.toThrow('notify node requires config.connector')
  })

  it('throws if message is missing', async () => {
    const { notifyHandler } = await import('../nodes/notify.js')
    const node = makeNode(NodeType.NOTIFY, { connector: 'discord' })
    await expect(notifyHandler.execute(node, makeContext(), {})).rejects.toThrow('notify node requires config.message')
  })

  it('calls notifyDiscordChannel for discord connector', async () => {
    const { notifyHandler } = await import('../nodes/notify.js')
    const { notifyDiscordChannel } = await import('../../sessions/callbacks.js')
    const node = makeNode(NodeType.NOTIFY, { connector: 'discord', message: 'Hello {{trigger.type}}' })
    const ctx = makeContext()
    const result = await notifyHandler.execute(node, ctx, {})

    expect(notifyDiscordChannel).toHaveBeenCalledWith('Hello manual')
    expect(result.output).toMatchObject({ sent: true, connector: 'discord' })
    expect(result.next).toBeNull()
  })

  it('interpolates template variables in message', async () => {
    const { notifyHandler } = await import('../nodes/notify.js')
    const { notifyDiscordChannel } = await import('../../sessions/callbacks.js')
    const node = makeNode(NodeType.NOTIFY, {
      connector: 'discord',
      message: 'Run: {{run_id}} on {{workflow_id}}',
    })
    const ctx = makeContext()
    await notifyHandler.execute(node, ctx, {})
    expect(notifyDiscordChannel).toHaveBeenCalledWith('Run: run-001 on wf-001')
  })
})

// ── cron handler ──────────────────────────────────────────────────────────

describe('cronHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws if action is missing', async () => {
    const { cronHandler } = await import('../nodes/cron.js')
    const node = makeNode(NodeType.CRON, {})
    await expect(cronHandler.execute(node, makeContext(), {})).rejects.toThrow('cron node requires config.action')
  })

  it('action=create: creates a new cron job', async () => {
    const { cronHandler } = await import('../nodes/cron.js')
    const { loadJobs, saveJobs } = await import('../../cron/jobs.js')
    vi.mocked(loadJobs).mockReturnValue([])

    const node = makeNode(NodeType.CRON, {
      action: 'create',
      schedule: '0 9 * * 1-5',
      employee: 'test-emp',
      prompt: 'do something',
      name: 'test-cron',
    })
    const result = await cronHandler.execute(node, makeContext(), {})
    expect(result.output).toMatchObject({ action: 'create' })
    expect(saveJobs).toHaveBeenCalled()
  })

  it('action=pause: pauses an existing job', async () => {
    const { cronHandler } = await import('../nodes/cron.js')
    const { setCronJobEnabled } = await import('../../cron/scheduler.js')
    vi.mocked(setCronJobEnabled).mockReturnValue({ id: 'job-1', enabled: false } as never)

    const node = makeNode(NodeType.CRON, { action: 'pause', job_id: 'job-1' })
    const result = await cronHandler.execute(node, makeContext(), {})
    expect(result.output).toMatchObject({ action: 'pause', job_id: 'job-1' })
    expect(setCronJobEnabled).toHaveBeenCalledWith('job-1', false)
  })

  it('action=resume: resumes a paused job', async () => {
    const { cronHandler } = await import('../nodes/cron.js')
    const { setCronJobEnabled } = await import('../../cron/scheduler.js')
    vi.mocked(setCronJobEnabled).mockReturnValue({ id: 'job-1', enabled: true } as never)

    const node = makeNode(NodeType.CRON, { action: 'resume', job_id: 'job-1' })
    const result = await cronHandler.execute(node, makeContext(), {})
    expect(result.output).toMatchObject({ action: 'resume', job_id: 'job-1' })
    expect(setCronJobEnabled).toHaveBeenCalledWith('job-1', true)
  })

  it('action=delete: removes a job', async () => {
    const { cronHandler } = await import('../nodes/cron.js')
    const { loadJobs, saveJobs } = await import('../../cron/jobs.js')
    vi.mocked(loadJobs).mockReturnValue([{ id: 'job-1', name: 'j', schedule: '* * * * *', enabled: true, employee: 'e', prompt: 'p', timezone: 'UTC' }] as never)

    const node = makeNode(NodeType.CRON, { action: 'delete', job_id: 'job-1' })
    const result = await cronHandler.execute(node, makeContext(), {})
    expect(result.output).toMatchObject({ action: 'delete', job_id: 'job-1' })
    expect(saveJobs).toHaveBeenCalled()
  })

  it('action=create: throws if schedule missing', async () => {
    const { cronHandler } = await import('../nodes/cron.js')
    const node = makeNode(NodeType.CRON, { action: 'create', employee: 'e', prompt: 'p' })
    await expect(cronHandler.execute(node, makeContext(), {})).rejects.toThrow('cron create requires config.schedule')
  })
})
