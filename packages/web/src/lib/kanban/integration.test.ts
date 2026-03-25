/**
 * Kanban Integration Tests — frontend store with mocked API at fetch level.
 * Tests full workflows: config loading, CRUD, bulk ops, undo/redo, transition validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  loadConfig,
  loadTickets,
  saveTickets,
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
import { DEFAULT_CONFIG, type KanbanConfig, type KanbanTicket } from './types'

// ─── Helpers ───

function makeStore(count: number, defaults: Partial<Parameters<typeof createTicket>[1]> = {}): KanbanStore {
  let store: KanbanStore = {}
  for (let i = 0; i < count; i++) {
    store = createTicket(store, {
      title: `Ticket ${i}`,
      description: `Desc ${i}`,
      status: 'backlog',
      priority: 'medium',
      assigneeId: null,
      department: null,
      departmentId: null,
      topicId: null,
      ...defaults,
    })
  }
  return store
}

function ids(store: KanbanStore): string[] {
  return Object.keys(store)
}

// ─── Tests ───

describe('kanban frontend integration', () => {

  // ════════════════════════════════════════════════════
  // Config loading with fetch mock
  // ════════════════════════════════════════════════════

  describe('loadConfig', () => {
    const originalFetch = globalThis.fetch

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('returns API config when fetch succeeds', async () => {
      const apiConfig: KanbanConfig = {
        columns: [
          { id: 'open', title: 'Open', order: 0 },
          { id: 'closed', title: 'Closed', order: 1 },
        ],
        topics: [
          { id: 't1', name: 'Bug', description: 'Fix bugs', color: '#f00', tags: ['bug'] },
        ],
        transitions: [{ from: '*', to: '*', allowed: true }],
      }

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiConfig),
      }) as any

      const config = await loadConfig()
      expect(config.columns).toHaveLength(2)
      expect(config.columns[0].id).toBe('open')
      expect(config.topics).toHaveLength(1)
    })

    it('returns DEFAULT_CONFIG when fetch fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as any

      const config = await loadConfig()
      expect(config).toEqual(DEFAULT_CONFIG)
    })

    it('returns DEFAULT_CONFIG when fetch throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any

      const config = await loadConfig()
      expect(config).toEqual(DEFAULT_CONFIG)
    })
  })

  // ════════════════════════════════════════════════════
  // Full CRUD + history workflow
  // ════════════════════════════════════════════════════

  describe('CRUD + history workflow', () => {
    it('creates, updates, moves, deletes, then undoes all steps', () => {
      let h = createHistory({})

      // Step 1: Create ticket
      const s1 = createTicket(h.present, {
        title: 'New feature',
        description: 'Build it',
        status: 'backlog',
        priority: 'high',
        assigneeId: 'alice',
        department: 'dev',
        departmentId: 'dev',
        topicId: null,
      })
      h = historyPush(h, s1)
      const [ticketId] = ids(h.present)
      expect(h.present[ticketId].title).toBe('New feature')

      // Step 2: Update title
      const s2 = updateTicket(h.present, ticketId, { title: 'Updated feature' })
      h = historyPush(h, s2)
      expect(h.present[ticketId].title).toBe('Updated feature')

      // Step 3: Move to todo
      const s3 = moveTicket(h.present, ticketId, 'todo')
      h = historyPush(h, s3)
      expect(h.present[ticketId].status).toBe('todo')

      // Step 4: Delete
      const s4 = deleteTicket(h.present, ticketId)
      h = historyPush(h, s4)
      expect(h.present[ticketId]).toBeUndefined()

      // Undo 4 times — back to empty
      h = historyUndo(h) // undo delete → ticket back
      expect(h.present[ticketId]).toBeDefined()
      expect(h.present[ticketId].status).toBe('todo')

      h = historyUndo(h) // undo move → backlog
      expect(h.present[ticketId].status).toBe('backlog')

      h = historyUndo(h) // undo update → original title
      expect(h.present[ticketId].title).toBe('New feature')

      h = historyUndo(h) // undo create → empty
      expect(ids(h.present)).toHaveLength(0)

      // Redo all
      h = historyRedo(h) // create
      h = historyRedo(h) // update
      h = historyRedo(h) // move
      h = historyRedo(h) // delete
      expect(h.present[ticketId]).toBeUndefined()
    })
  })

  // ════════════════════════════════════════════════════
  // Transition validation with dynamic config
  // ════════════════════════════════════════════════════

  describe('transition validation with dynamic config', () => {
    it('validates against custom column config', () => {
      const config: KanbanConfig = {
        columns: [
          { id: 'draft', title: 'Draft', order: 0 },
          { id: 'active', title: 'Active', order: 1 },
          { id: 'archived', title: 'Archived', order: 2 },
        ],
        topics: [],
        transitions: [
          { from: 'draft', to: 'archived', allowed: false },
          { from: 'draft', to: 'active', allowed: true },
          { from: 'active', to: 'archived', allowed: true },
        ],
      }

      expect(validateTransition('draft', 'active', config)).toBe(true)
      expect(validateTransition('draft', 'archived', config)).toBe(false)
      expect(validateTransition('active', 'archived', config)).toBe(true)
      // Not in rules → permissive default
      expect(validateTransition('archived', 'draft', config)).toBe(true)
    })

    it('validates bulk move respects transitions', () => {
      const store = makeStore(3, { status: 'backlog' })
      const allIds = ids(store)

      // backlog → todo: allowed
      const { store: s1, blocked: b1 } = bulkMove(store, allIds, 'todo', DEFAULT_CONFIG)
      expect(b1).toHaveLength(0)
      expect(Object.values(s1).every((t) => t.status === 'todo')).toBe(true)

      // todo → done: blocked in DEFAULT_CONFIG
      const { store: s2, blocked: b2 } = bulkMove(s1, allIds, 'done', DEFAULT_CONFIG)
      expect(b2).toHaveLength(3)
      // Original statuses preserved (still todo)
      expect(Object.values(s2).every((t) => t.status === 'todo')).toBe(true)
    })
  })

  // ════════════════════════════════════════════════════
  // Bulk operations + undo/redo
  // ════════════════════════════════════════════════════

  describe('bulk operations + undo/redo', () => {
    it('bulk assign with undo restores original assignees', () => {
      const store = makeStore(3, { assigneeId: 'original' })
      const allIds = ids(store)

      let h = createHistory(store)

      // Bulk assign to new person
      const reassigned = bulkAssign(h.present, allIds, 'new-person')
      h = historyPush(h, reassigned)
      expect(Object.values(h.present).every((t) => t.assigneeId === 'new-person')).toBe(true)

      // Undo → back to original
      h = historyUndo(h)
      expect(Object.values(h.present).every((t) => t.assigneeId === 'original')).toBe(true)
    })

    it('complex multi-step with interleaved bulk ops', () => {
      const store = makeStore(5, { status: 'backlog' })
      const allIds = ids(store)

      let h = createHistory(store)

      // Step 1: Move all to todo
      const { store: s1 } = bulkMove(h.present, allIds, 'todo', DEFAULT_CONFIG)
      h = historyPush(h, s1)

      // Step 2: Assign first 2 to alice
      const s2 = bulkAssign(h.present, allIds.slice(0, 2), 'alice')
      h = historyPush(h, s2)

      // Step 3: Move alice's tickets to in-progress
      const aliceIds = allIds.slice(0, 2)
      const { store: s3 } = bulkMove(h.present, aliceIds, 'in-progress', DEFAULT_CONFIG)
      h = historyPush(h, s3)

      // Verify state
      expect(h.present[aliceIds[0]].status).toBe('in-progress')
      expect(h.present[allIds[2]].status).toBe('todo')

      // Undo step 3 → alice's tickets back to todo
      h = historyUndo(h)
      expect(h.present[aliceIds[0]].status).toBe('todo')

      // Undo step 2 → unassigned
      h = historyUndo(h)
      expect(h.present[aliceIds[0]].assigneeId).toBeNull()

      // Undo step 1 → back to backlog
      h = historyUndo(h)
      expect(Object.values(h.present).every((t) => t.status === 'backlog')).toBe(true)
    })
  })

  // ════════════════════════════════════════════════════
  // Performance: 100+ tickets
  // ════════════════════════════════════════════════════

  describe('performance: 100+ tickets', () => {
    it('creates and manages 200 tickets efficiently', () => {
      const start = performance.now()
      const store = makeStore(200)
      const createTime = performance.now() - start
      expect(Object.keys(store)).toHaveLength(200)
      expect(createTime).toBeLessThan(500)

      // Bulk move all
      const allIds = ids(store)
      const moveStart = performance.now()
      const { store: moved } = bulkMove(store, allIds, 'todo', DEFAULT_CONFIG)
      const moveTime = performance.now() - moveStart
      expect(Object.values(moved).every((t) => t.status === 'todo')).toBe(true)
      expect(moveTime).toBeLessThan(500)

      // Bulk assign all
      const assignStart = performance.now()
      const assigned = bulkAssign(moved, allIds, 'ironcraft')
      const assignTime = performance.now() - assignStart
      expect(Object.values(assigned).every((t) => t.assigneeId === 'ironcraft')).toBe(true)
      expect(assignTime).toBeLessThan(500)

      // History with 50 operations
      let h = createHistory(store)
      const historyStart = performance.now()
      for (let i = 0; i < 50; i++) {
        const next = updateTicket(h.present, allIds[i], { title: `Updated ${i}` })
        h = historyPush(h, next)
      }
      // Undo all 50
      for (let i = 0; i < 50; i++) {
        h = historyUndo(h)
      }
      const historyTime = performance.now() - historyStart
      expect(historyTime).toBeLessThan(2000)
      expect(h.present[allIds[0]].title).toBe('Ticket 0')
    })

    it('getTicketsByStatus with 300 tickets', () => {
      let store: KanbanStore = {}
      const statuses = ['backlog', 'todo', 'in-progress', 'review', 'done']
      for (let i = 0; i < 300; i++) {
        store = createTicket(store, {
          title: `T${i}`,
          description: '',
          status: statuses[i % 5],
          priority: 'medium',
          assigneeId: null,
          department: null,
          departmentId: null,
          topicId: null,
        })
      }

      const start = performance.now()
      for (const status of statuses) {
        const tickets = getTicketsByStatus(store, status)
        expect(tickets).toHaveLength(60) // 300 / 5
      }
      const queryTime = performance.now() - start
      expect(queryTime).toBeLessThan(200)
    })
  })

  // ════════════════════════════════════════════════════
  // Topic integration
  // ════════════════════════════════════════════════════

  describe('topic integration', () => {
    it('creates tickets with topicId and queries by status', () => {
      let store: KanbanStore = {}

      // Create tickets with topics
      store = createTicket(store, {
        title: 'Bug fix',
        description: '',
        status: 'backlog',
        priority: 'high',
        assigneeId: 'alice',
        department: 'dev',
        departmentId: 'dev',
        topicId: 'topic-bugs',
      })
      store = createTicket(store, {
        title: 'New feature',
        description: '',
        status: 'backlog',
        priority: 'medium',
        assigneeId: 'bob',
        department: 'dev',
        departmentId: 'dev',
        topicId: 'topic-features',
      })

      const backlog = getTicketsByStatus(store, 'backlog')
      expect(backlog).toHaveLength(2)

      const bugTicket = backlog.find((t) => t.topicId === 'topic-bugs')
      expect(bugTicket).toBeDefined()
      expect(bugTicket!.priority).toBe('high')

      const featureTicket = backlog.find((t) => t.topicId === 'topic-features')
      expect(featureTicket).toBeDefined()
      expect(featureTicket!.assigneeId).toBe('bob')
    })
  })
})
