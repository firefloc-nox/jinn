import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKanban } from './use-kanban'
import { DEFAULT_CONFIG, type KanbanConfig } from '@/lib/kanban/types'
import type { KanbanStore } from '@/lib/kanban/store'

// ---------------------------------------------------------------------------
// localStorage mock (jsdom's implementation lacks .clear() in this env)
// ---------------------------------------------------------------------------
function makeLocalStorageMock() {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
}

// ---------------------------------------------------------------------------
// Mock fetch + API
// ---------------------------------------------------------------------------

const CONFIG_LOCKED: KanbanConfig = {
  ...DEFAULT_CONFIG,
  transitions: [
    { from: 'backlog', to: 'todo',        allowed: true  },
    { from: 'todo',    to: 'in-progress', allowed: true  },
    { from: 'in-progress', to: 'review',  allowed: true  },
    { from: 'review',  to: 'done',        allowed: true  },
    // All other transitions blocked
    { from: 'backlog', to: 'done',        allowed: false },
    { from: 'backlog', to: 'in-progress', allowed: false },
    { from: 'backlog', to: 'review',      allowed: false },
    { from: 'todo',    to: 'done',        allowed: false },
    { from: 'todo',    to: 'review',      allowed: false },
  ],
}

function mockFetch(cfg: KanbanConfig = DEFAULT_CONFIG) {
  return vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/api/kanban/config') && (!opts || opts.method === 'GET' || !opts.method)) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(cfg),
      })
    }
    // All other calls succeed silently
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, moved: [], blocked: [] }),
    })
  })
}

const EMPTY_EMPLOYEES: [] = []
const EMPTY_DEPARTMENTS: string[] = []

function mkOpts(deps: string[] = EMPTY_DEPARTMENTS) {
  return { employees: EMPTY_EMPLOYEES, departments: deps }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstId(store: KanbanStore): string {
  return Object.keys(store)[0]
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

describe('useKanban — config loading', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
    vi.stubGlobal('fetch', mockFetch(DEFAULT_CONFIG))
    vi.stubGlobal('crypto', { randomUUID: () => `test-${Math.random().toString(36).slice(2)}` })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('starts with DEFAULT_CONFIG and loads from API', async () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    // Initially DEFAULT_CONFIG
    expect(result.current.config.columns).toHaveLength(5)

    // After fetch resolves
    await act(async () => { await Promise.resolve() })
    expect(result.current.config.columns).toHaveLength(5)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/kanban/config'))
  })

  it('falls back to DEFAULT_CONFIG when API returns non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }))
    const { result } = renderHook(() => useKanban(mkOpts()))
    await act(async () => { await Promise.resolve() })
    expect(result.current.config).toEqual(DEFAULT_CONFIG)
  })
})

// ---------------------------------------------------------------------------
// initializeFromApi
// ---------------------------------------------------------------------------

describe('useKanban — initializeFromApi', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
    vi.stubGlobal('fetch', mockFetch())
    vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random()}` })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('replaces the present store and resets history', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    const initial: KanbanStore = {
      'ticket-1': {
        id: 'ticket-1', title: 'Alpha', description: '', status: 'backlog',
        priority: 'medium', assigneeId: null, department: null, departmentId: null,
        topicId: null, workState: 'idle', createdAt: 1000, updatedAt: 1000,
      },
    }

    act(() => { result.current.initializeFromApi(initial) })

    expect(result.current.tickets['ticket-1'].title).toBe('Alpha')
    // History should be clean after init
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Create + undo/redo
// ---------------------------------------------------------------------------

describe('useKanban — create + undo/redo', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
    vi.stubGlobal('fetch', mockFetch())
    vi.stubGlobal('crypto', { randomUUID: () => `id-${Date.now()}-${Math.random()}` })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('creates a ticket and adds it to present', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    act(() => {
      result.current.handleCreateTicket({
        title: 'My Ticket',
        description: '',
        priority: 'high',
        assigneeId: null,
      })
    })

    const ids = Object.keys(result.current.tickets)
    expect(ids).toHaveLength(1)
    expect(result.current.tickets[ids[0]].title).toBe('My Ticket')
    expect(result.current.canUndo).toBe(true)
  })

  it('undo removes the created ticket', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    act(() => {
      result.current.handleCreateTicket({ title: 'To-undo', description: '', priority: 'low', assigneeId: null })
    })
    expect(Object.keys(result.current.tickets)).toHaveLength(1)

    act(() => { result.current.undo() })
    expect(Object.keys(result.current.tickets)).toHaveLength(0)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })

  it('redo re-applies the creation', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    act(() => {
      result.current.handleCreateTicket({ title: 'Redo me', description: '', priority: 'medium', assigneeId: null })
    })
    act(() => { result.current.undo() })
    act(() => { result.current.redo() })

    expect(Object.keys(result.current.tickets)).toHaveLength(1)
    expect(result.current.canRedo).toBe(false)
  })

  it('new action after undo clears redo stack', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    act(() => {
      result.current.handleCreateTicket({ title: 'A', description: '', priority: 'low', assigneeId: null })
    })
    act(() => { result.current.undo() })
    act(() => {
      result.current.handleCreateTicket({ title: 'B', description: '', priority: 'low', assigneeId: null })
    })

    expect(result.current.canRedo).toBe(false)
    expect(Object.values(result.current.tickets)[0].title).toBe('B')
  })
})

// ---------------------------------------------------------------------------
// validateTransition / handleMoveTicket
// ---------------------------------------------------------------------------

describe('useKanban — move with transition validation', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
    vi.stubGlobal('fetch', mockFetch(CONFIG_LOCKED))
    vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random()}` })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('allows a permitted move and updates status', async () => {
    const { result } = renderHook(() => useKanban(mkOpts()))
    await act(async () => { await Promise.resolve() }) // wait for config load

    act(() => {
      result.current.handleCreateTicket({ title: 'T', description: '', priority: 'medium', assigneeId: null })
    })

    const id = firstId(result.current.tickets)
    // status starts at first column (backlog)
    expect(result.current.tickets[id].status).toBe('backlog')

    act(() => { result.current.handleMoveTicket(id, 'todo') })
    expect(result.current.tickets[id].status).toBe('todo')
  })

  it('blocks a forbidden move (backlog → done)', async () => {
    const { result } = renderHook(() => useKanban(mkOpts()))
    await act(async () => { await Promise.resolve() })

    act(() => {
      result.current.handleCreateTicket({ title: 'T', description: '', priority: 'medium', assigneeId: null })
    })

    const id = firstId(result.current.tickets)
    const blocked = act(() => result.current.handleMoveTicket(id, 'done'))
    expect(result.current.tickets[id].status).toBe('backlog') // unchanged
    void blocked // move returns false but we only care about state
  })
})

// ---------------------------------------------------------------------------
// bulkAssign
// ---------------------------------------------------------------------------

describe('useKanban — bulkAssign', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
    vi.stubGlobal('fetch', mockFetch())
    vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random()}` })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('assigns multiple tickets and adds to undo history', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    act(() => {
      result.current.handleCreateTicket({ title: 'A', description: '', priority: 'low', assigneeId: null })
      result.current.handleCreateTicket({ title: 'B', description: '', priority: 'low', assigneeId: null })
    })

    const [id1, id2] = Object.keys(result.current.tickets)
    act(() => { result.current.handleBulkAssign([id1, id2], 'alice') })

    expect(result.current.tickets[id1].assigneeId).toBe('alice')
    expect(result.current.tickets[id2].assigneeId).toBe('alice')
    expect(result.current.canUndo).toBe(true)
  })

  it('undo restores previous assignees', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    act(() => {
      result.current.handleCreateTicket({ title: 'A', description: '', priority: 'low', assigneeId: null })
    })
    const [id] = Object.keys(result.current.tickets)

    act(() => { result.current.handleBulkAssign([id], 'bob') })
    expect(result.current.tickets[id].assigneeId).toBe('bob')

    act(() => { result.current.undo() })
    expect(result.current.tickets[id].assigneeId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// bulkMove
// ---------------------------------------------------------------------------

describe('useKanban — bulkMove', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
    vi.stubGlobal('fetch', mockFetch(CONFIG_LOCKED))
    vi.stubGlobal('crypto', { randomUUID: () => `id-${Math.random()}` })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('moves allowed tickets and returns blocked ids', async () => {
    const { result } = renderHook(() => useKanban(mkOpts()))
    await act(async () => { await Promise.resolve() }) // load config

    // Create 2 backlog tickets
    act(() => {
      result.current.handleCreateTicket({ title: 'A', description: '', priority: 'medium', assigneeId: null })
      result.current.handleCreateTicket({ title: 'B', description: '', priority: 'medium', assigneeId: null })
    })
    const ids = Object.keys(result.current.tickets)

    // todo is allowed from backlog in CONFIG_LOCKED
    let blocked: string[] = []
    act(() => { blocked = result.current.handleBulkMove(ids, 'todo') })

    expect(blocked).toHaveLength(0)
    expect(result.current.tickets[ids[0]].status).toBe('todo')
    expect(result.current.tickets[ids[1]].status).toBe('todo')
  })

  it('blocks forbidden moves and returns their ids', async () => {
    const { result } = renderHook(() => useKanban(mkOpts()))
    await act(async () => { await Promise.resolve() })

    act(() => {
      result.current.handleCreateTicket({ title: 'X', description: '', priority: 'high', assigneeId: null })
    })
    const [id] = Object.keys(result.current.tickets)

    let blocked: string[] = []
    act(() => { blocked = result.current.handleBulkMove([id], 'done') })

    expect(blocked).toContain(id)
    expect(result.current.tickets[id].status).toBe('backlog')
  })
})

// ---------------------------------------------------------------------------
// Performance: 100+ tickets
// ---------------------------------------------------------------------------

describe('useKanban — performance', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeLocalStorageMock())
    vi.stubGlobal('fetch', mockFetch())
    let counter = 0
    vi.stubGlobal('crypto', { randomUUID: () => `perf-${counter++}` })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('handles 100 ticket creates without blocking (< 500ms)', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))
    const start = performance.now()

    act(() => {
      for (let i = 0; i < 100; i++) {
        result.current.handleCreateTicket({
          title: `Ticket ${i}`,
          description: `Description for ticket ${i}`,
          priority: (['low', 'medium', 'high'] as const)[i % 3],
          assigneeId: null,
        })
      }
    })

    const elapsed = performance.now() - start
    expect(Object.keys(result.current.tickets)).toHaveLength(100)
    expect(elapsed).toBeLessThan(500)
    console.log(`[perf] 100 creates: ${elapsed.toFixed(1)}ms`)
  })

  it('bulk-moves 100 tickets (< 100ms)', async () => {
    const { result } = renderHook(() => useKanban(mkOpts()))
    await act(async () => { await Promise.resolve() })

    act(() => {
      for (let i = 0; i < 100; i++) {
        result.current.handleCreateTicket({ title: `T${i}`, description: '', priority: 'medium', assigneeId: null })
      }
    })

    const ids = Object.keys(result.current.tickets)
    expect(ids).toHaveLength(100)

    const start = performance.now()
    act(() => { result.current.handleBulkMove(ids, 'todo') })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(100)
    expect(result.current.tickets[ids[0]].status).toBe('todo')
    console.log(`[perf] bulk-move 100 tickets: ${elapsed.toFixed(1)}ms`)
  })

  it('undo after 100 creates restores empty state (< 100ms)', () => {
    const { result } = renderHook(() => useKanban(mkOpts()))

    act(() => {
      for (let i = 0; i < 100; i++) {
        result.current.handleCreateTicket({ title: `T${i}`, description: '', priority: 'low', assigneeId: null })
      }
    })

    const start = performance.now()
    act(() => {
      // Undo all 100 creates
      for (let i = 0; i < 100; i++) result.current.undo()
    })
    const elapsed = performance.now() - start

    expect(Object.keys(result.current.tickets)).toHaveLength(0)
    expect(elapsed).toBeLessThan(100)
    console.log(`[perf] undo 100 creates: ${elapsed.toFixed(1)}ms`)
  })
})
