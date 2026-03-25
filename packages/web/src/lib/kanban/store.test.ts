import { describe, it, expect, beforeEach } from 'vitest'
import {
  createTicket,
  updateTicket,
  moveTicket,
  deleteTicket,
  getTicketsByStatus,
  bulkAssign,
  bulkMove,
  validateTransition,
  createHistory,
  historyPush,
  historyUndo,
  historyRedo,
  type KanbanStore,
} from './store'
import { DEFAULT_CONFIG, type KanbanConfig } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(...overrides: Partial<Parameters<typeof createTicket>[1]>[]): KanbanStore {
  let store: KanbanStore = {}
  for (const o of overrides) {
    store = createTicket(store, {
      title: 'Test ticket',
      description: '',
      status: 'backlog',
      priority: 'medium',
      assigneeId: null,
      department: null,
      departmentId: null,
      topicId: null,
      ...o,
    })
  }
  return store
}

function ids(store: KanbanStore): string[] {
  return Object.keys(store)
}

// ---------------------------------------------------------------------------
// validateTransition
// ---------------------------------------------------------------------------

describe('validateTransition', () => {
  it('allows same-column move (no-op)', () => {
    expect(validateTransition('backlog', 'backlog', DEFAULT_CONFIG)).toBe(true)
  })

  it('allows backlog → todo', () => {
    expect(validateTransition('backlog', 'todo', DEFAULT_CONFIG)).toBe(true)
  })

  it('allows review → done', () => {
    expect(validateTransition('review', 'done', DEFAULT_CONFIG)).toBe(true)
  })

  it('blocks backlog → done (shortcut)', () => {
    expect(validateTransition('backlog', 'done', DEFAULT_CONFIG)).toBe(false)
  })

  it('blocks backlog → review (shortcut)', () => {
    expect(validateTransition('backlog', 'review', DEFAULT_CONFIG)).toBe(false)
  })

  it('blocks todo → done (shortcut)', () => {
    expect(validateTransition('todo', 'done', DEFAULT_CONFIG)).toBe(false)
  })

  it('allows unknown transition (permissive default)', () => {
    expect(validateTransition('backlog', 'custom-column', DEFAULT_CONFIG)).toBe(true)
  })

  it('respects custom config rules', () => {
    const config: KanbanConfig = {
      ...DEFAULT_CONFIG,
      transitions: [{ from: 'todo', to: 'done', allowed: false }],
    }
    expect(validateTransition('todo', 'done', config)).toBe(false)
    // Not in rules → allowed
    expect(validateTransition('backlog', 'todo', config)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

describe('createTicket', () => {
  it('adds a ticket with a unique id', () => {
    const s0: KanbanStore = {}
    const s1 = createTicket(s0, {
      title: 'Alpha',
      description: '',
      status: 'backlog',
      priority: 'high',
      assigneeId: null,
      department: null,
      departmentId: null,
      topicId: null,
    })
    expect(ids(s1)).toHaveLength(1)
    expect(Object.values(s1)[0].title).toBe('Alpha')
    expect(Object.values(s1)[0].workState).toBe('idle')
    expect(Object.values(s1)[0].topicId).toBeNull()
  })

  it('does not mutate original store', () => {
    const s0: KanbanStore = {}
    createTicket(s0, { title: 'X', description: '', status: 'backlog', priority: 'low', assigneeId: null, department: null, departmentId: null, topicId: null })
    expect(ids(s0)).toHaveLength(0)
  })

  it('stores topicId when provided', () => {
    const s = createTicket({}, { title: 'T', description: '', status: 'todo', priority: 'medium', assigneeId: null, department: null, departmentId: null, topicId: 'topic-123' })
    expect(Object.values(s)[0].topicId).toBe('topic-123')
  })
})

describe('updateTicket', () => {
  it('updates fields and bumps updatedAt', () => {
    const s0 = makeStore({ title: 'Old' })
    const [id] = ids(s0)
    const before = s0[id].updatedAt

    const s1 = updateTicket(s0, id, { title: 'New' })
    expect(s1[id].title).toBe('New')
    expect(s1[id].updatedAt).toBeGreaterThanOrEqual(before)
  })

  it('returns same store when id not found', () => {
    const s0 = makeStore()
    expect(updateTicket(s0, 'nonexistent', { title: 'X' })).toBe(s0)
  })
})

describe('moveTicket', () => {
  it('changes ticket status', () => {
    const s0 = makeStore({ status: 'backlog' })
    const [id] = ids(s0)
    const s1 = moveTicket(s0, id, 'todo')
    expect(s1[id].status).toBe('todo')
  })
})

describe('deleteTicket', () => {
  it('removes the ticket', () => {
    const s0 = makeStore()
    const [id] = ids(s0)
    const s1 = deleteTicket(s0, id)
    expect(s1[id]).toBeUndefined()
  })
})

describe('getTicketsByStatus', () => {
  it('returns only tickets with matching status, sorted by updatedAt desc', () => {
    let store = makeStore({ status: 'backlog', title: 'A' }, { status: 'todo', title: 'B' }, { status: 'backlog', title: 'C' })
    const backlog = getTicketsByStatus(store, 'backlog')
    expect(backlog).toHaveLength(2)
    expect(backlog.every((t) => t.status === 'backlog')).toBe(true)
    // Sorted descending — updatedAt values must be non-increasing
    expect(backlog[0].updatedAt).toBeGreaterThanOrEqual(backlog[1].updatedAt)
  })

  it('returns tickets sorted by updatedAt desc after an update', () => {
    let store = makeStore({ status: 'backlog', title: 'A' }, { status: 'backlog', title: 'B' })
    const aId = Object.values(store).find((t) => t.title === 'A')!.id
    // Manually bump A's updatedAt to be strictly later
    store = { ...store, [aId]: { ...store[aId], updatedAt: store[aId].updatedAt + 1 } }
    const backlog = getTicketsByStatus(store, 'backlog')
    expect(backlog[0].title).toBe('A')
  })

  it('returns empty array when no tickets match', () => {
    const store = makeStore({ status: 'backlog' })
    expect(getTicketsByStatus(store, 'done')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// bulkAssign
// ---------------------------------------------------------------------------

describe('bulkAssign', () => {
  it('assigns multiple tickets to same assignee', () => {
    const s0 = makeStore({ title: 'A' }, { title: 'B' }, { title: 'C' })
    const [id1, id2, id3] = ids(s0)
    const s1 = bulkAssign(s0, [id1, id2], 'alice')
    expect(s1[id1].assigneeId).toBe('alice')
    expect(s1[id2].assigneeId).toBe('alice')
    expect(s1[id3].assigneeId).toBeNull() // untouched
  })

  it('unassigns when assigneeId is null', () => {
    const s0 = makeStore({ assigneeId: 'alice' })
    const [id] = ids(s0)
    const s1 = bulkAssign(s0, [id], null)
    expect(s1[id].assigneeId).toBeNull()
  })

  it('silently skips unknown ids', () => {
    const s0 = makeStore({ title: 'A' })
    const s1 = bulkAssign(s0, ['ghost-id'], 'bob')
    expect(s1).toEqual(s0)
  })

  it('returns original store when ids is empty', () => {
    const s0 = makeStore()
    expect(bulkAssign(s0, [], 'alice')).toEqual(s0)
  })
})

// ---------------------------------------------------------------------------
// bulkMove
// ---------------------------------------------------------------------------

describe('bulkMove', () => {
  it('moves allowed tickets and returns empty blocked list', () => {
    const s0 = makeStore({ status: 'backlog', title: 'A' }, { status: 'backlog', title: 'B' })
    const [id1, id2] = ids(s0)
    const { store: s1, blocked } = bulkMove(s0, [id1, id2], 'todo', DEFAULT_CONFIG)
    expect(s1[id1].status).toBe('todo')
    expect(s1[id2].status).toBe('todo')
    expect(blocked).toHaveLength(0)
  })

  it('blocks tickets whose transition is forbidden', () => {
    const s0 = makeStore({ status: 'backlog', title: 'A' }, { status: 'backlog', title: 'B' })
    const [id1, id2] = ids(s0)
    const { store: s1, blocked } = bulkMove(s0, [id1, id2], 'done', DEFAULT_CONFIG)
    // Both should be blocked (backlog → done is forbidden)
    expect(blocked).toContain(id1)
    expect(blocked).toContain(id2)
    expect(s1[id1].status).toBe('backlog') // unchanged
    expect(s1[id2].status).toBe('backlog')
  })

  it('partially moves — allowed go, forbidden stay', () => {
    let s0 = makeStore({ status: 'review', title: 'ReadyForDone' })
    s0 = createTicket(s0, { title: 'NotReady', description: '', status: 'backlog', priority: 'medium', assigneeId: null, department: null, departmentId: null, topicId: null })
    const [id1, id2] = ids(s0)

    const { store: s1, blocked } = bulkMove(s0, [id1, id2], 'done', DEFAULT_CONFIG)
    // id1 (review → done) should succeed
    expect(s1[id1].status).toBe('done')
    // id2 (backlog → done) should be blocked
    expect(blocked).toContain(id2)
    expect(s1[id2].status).toBe('backlog')
  })

  it('silently skips unknown ids', () => {
    const s0 = makeStore()
    const { store: s1, blocked } = bulkMove(s0, ['ghost'], 'todo', DEFAULT_CONFIG)
    expect(blocked).toHaveLength(0)
    expect(s1).toEqual(s0)
  })
})

// ---------------------------------------------------------------------------
// History — undo / redo
// ---------------------------------------------------------------------------

describe('createHistory', () => {
  it('initialises with empty past/future', () => {
    const store = makeStore()
    const h = createHistory(store)
    expect(h.past).toHaveLength(0)
    expect(h.future).toHaveLength(0)
    expect(h.present).toBe(store)
  })
})

describe('historyPush', () => {
  it('pushes present into past and sets new present', () => {
    const s0 = makeStore({ title: 'V1' })
    const h0 = createHistory(s0)
    const s1 = makeStore({ title: 'V2' })
    const h1 = historyPush(h0, s1)

    expect(h1.past).toHaveLength(1)
    expect(h1.past[0]).toBe(s0)
    expect(h1.present).toBe(s1)
    expect(h1.future).toHaveLength(0)
  })

  it('clears future when a new action is pushed', () => {
    const h0 = createHistory(makeStore())
    const h1 = historyPush(h0, makeStore({ title: 'A' }))
    const h2 = historyUndo(h1) // future now has 1
    expect(h2.future).toHaveLength(1)
    const h3 = historyPush(h2, makeStore({ title: 'B' })) // new action clears redo
    expect(h3.future).toHaveLength(0)
  })
})

describe('historyUndo', () => {
  it('restores previous state', () => {
    const s0 = makeStore({ title: 'Before' })
    const s1 = makeStore({ title: 'After' })
    const h = historyPush(createHistory(s0), s1)
    const undone = historyUndo(h)

    expect(undone.present).toBe(s0)
    expect(undone.past).toHaveLength(0)
    expect(undone.future[0]).toBe(s1)
  })

  it('is a no-op when past is empty', () => {
    const h = createHistory(makeStore())
    expect(historyUndo(h)).toBe(h)
  })

  it('supports multiple consecutive undos', () => {
    const s0 = makeStore({ title: 'S0' })
    const s1 = makeStore({ title: 'S1' })
    const s2 = makeStore({ title: 'S2' })

    let h = createHistory(s0)
    h = historyPush(h, s1)
    h = historyPush(h, s2)

    h = historyUndo(h)
    expect(h.present).toBe(s1)

    h = historyUndo(h)
    expect(h.present).toBe(s0)
    expect(h.past).toHaveLength(0)
  })
})

describe('historyRedo', () => {
  it('reapplies undone state', () => {
    const s0 = makeStore({ title: 'Before' })
    const s1 = makeStore({ title: 'After' })
    let h = historyPush(createHistory(s0), s1)
    h = historyUndo(h)
    h = historyRedo(h)

    expect(h.present).toBe(s1)
    expect(h.future).toHaveLength(0)
    expect(h.past[h.past.length - 1]).toBe(s0)
  })

  it('is a no-op when future is empty', () => {
    const h = createHistory(makeStore())
    expect(historyRedo(h)).toBe(h)
  })
})

describe('undo + redo round-trip', () => {
  it('survives full undo → redo → undo cycle', () => {
    const s0 = makeStore({ title: 'S0' })
    let h = createHistory(s0)
    const s1 = makeStore({ title: 'S1' })
    h = historyPush(h, s1)
    const s2 = makeStore({ title: 'S2' })
    h = historyPush(h, s2)

    // Undo twice
    h = historyUndo(historyUndo(h))
    expect(h.present).toBe(s0)
    expect(h.future).toHaveLength(2)

    // Redo once
    h = historyRedo(h)
    expect(h.present).toBe(s1)

    // New push should clear s2 from future
    const s3 = makeStore({ title: 'S3' })
    h = historyPush(h, s3)
    expect(h.future).toHaveLength(0)
    expect(h.present).toBe(s3)
  })
})
