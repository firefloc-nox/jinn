/**
 * Tests for NodeRegistry — registry.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { NodeType } from '../types.js'
import type { NodeHandler, NodeResult, NodeServices } from '../registry.js'
import type { WorkflowNode, RunContext } from '../types.js'

// ── helpers ────────────────────────────────────────────────────────────────

function makeHandler(type: NodeType, label = 'Test'): NodeHandler {
  return {
    type,
    label,
    async execute(_node: WorkflowNode, _context: RunContext, _services: NodeServices): Promise<NodeResult> {
      return { output: 'ok', next: null }
    },
  }
}

// Import fresh registry impl to avoid shared-singleton issues in other tests.
// We test the class behaviour by creating a fresh instance.
// The exported singleton is covered indirectly by runner tests.
import { nodeRegistry } from '../registry.js'

describe('NodeRegistry — fresh instance', () => {
  // We use a private class reconstruction to avoid touching the shared singleton.
  // Instead we import the singleton and just verify structural behaviour.

  it('register + get: stores a handler and retrieves it by type', () => {
    const h = makeHandler(NodeType.DONE)
    // The shared singleton may already have a done handler; we just verify get works
    nodeRegistry.register(h)
    expect(nodeRegistry.getHandler(NodeType.DONE)).toBe(h)
  })

  it('get: returns undefined for unknown type', () => {
    // Cast to bypass TS — simulate unknown enum value
    const unknown = 'nonexistent_type' as NodeType
    expect(nodeRegistry.getHandler(unknown)).toBeUndefined()
  })

  it('listTypes: returns array of registered type/label pairs', () => {
    const types = nodeRegistry.listTypes()
    expect(Array.isArray(types)).toBe(true)
    expect(types.length).toBeGreaterThan(0)
    for (const entry of types) {
      expect(entry).toHaveProperty('type')
      expect(entry).toHaveProperty('label')
    }
  })

  it('execute: calls the right handler', async () => {
    const called: unknown[] = []
    const h: NodeHandler = {
      type: NodeType.TRIGGER,
      label: 'Trigger',
      async execute(node, context, services) {
        called.push({ node, context, services })
        return { output: 'triggered', next: null }
      },
    }
    nodeRegistry.register(h)

    const fakeNode: WorkflowNode = {
      id: 'n1',
      type: NodeType.TRIGGER,
      config: {},
    }
    const fakeCtx: RunContext = {
      run_id: 'r1',
      workflow_id: 'w1',
      trigger: { type: 'manual' },
    }

    const result = await nodeRegistry.execute(fakeNode, fakeCtx, {})
    expect(result.output).toBe('triggered')
    expect(called).toHaveLength(1)
  })

  it('execute: throws when no handler registered', async () => {
    const fakeNode: WorkflowNode = {
      id: 'n1',
      type: 'no_such_type' as NodeType,
      config: {},
    }
    const fakeCtx: RunContext = {
      run_id: 'r1',
      workflow_id: 'w1',
      trigger: { type: 'manual' },
    }
    await expect(nodeRegistry.execute(fakeNode, fakeCtx, {})).rejects.toThrow('No handler registered for node type: no_such_type')
  })
})

describe('NodeRegistry — default registrations (via runner import side-effects)', () => {
  // Import runner to trigger the side-effect registrations
  beforeEach(async () => {
    // runner.ts registers all handlers as a side-effect on import; ensure it's loaded
    await import('../runner.js')
  })

  const expectedTypes: NodeType[] = [
    NodeType.TRIGGER,
    NodeType.AGENT,
    NodeType.CONDITION,
    NodeType.MOVE_CARD,
    NodeType.NOTIFY,
    NodeType.WAIT,
    NodeType.CRON,
    NodeType.DONE,
  ]

  for (const type of expectedTypes) {
    it(`has handler for ${type}`, () => {
      expect(nodeRegistry.getHandler(type)).toBeDefined()
    })
  }

  it('listTypes includes all 8 expected node types', () => {
    const registeredTypes = nodeRegistry.listTypes().map((t) => t.type)
    for (const type of expectedTypes) {
      expect(registeredTypes).toContain(type)
    }
  })
})
