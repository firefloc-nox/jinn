'use client'

import type { KanbanTicket, TicketStatus, TicketPriority, WorkState, KanbanConfig } from './types'
import { DEFAULT_CONFIG } from './types'

export type KanbanStore = Record<string, KanbanTicket>

// ---------------------------------------------------------------------------
// History — undo / redo
// ---------------------------------------------------------------------------

export interface KanbanHistory {
  past: KanbanStore[]
  present: KanbanStore
  future: KanbanStore[]
}

export function createHistory(initial: KanbanStore): KanbanHistory {
  return { past: [], present: initial, future: [] }
}

/** Push a new state onto the history stack, clearing redo future. */
export function historyPush(h: KanbanHistory, next: KanbanStore): KanbanHistory {
  return { past: [...h.past, h.present], present: next, future: [] }
}

export function historyUndo(h: KanbanHistory): KanbanHistory {
  if (h.past.length === 0) return h
  const previous = h.past[h.past.length - 1]
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  }
}

export function historyRedo(h: KanbanHistory): KanbanHistory {
  if (h.future.length === 0) return h
  const next = h.future[0]
  return {
    past: [...h.past, h.present],
    present: next,
    future: h.future.slice(1),
  }
}

// ---------------------------------------------------------------------------
// Config — load from /api/kanban/config with DEFAULT_CONFIG fallback
// ---------------------------------------------------------------------------

export async function loadConfig(): Promise<KanbanConfig> {
  try {
    const res = await fetch('/api/kanban/config')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as KanbanConfig
  } catch {
    return DEFAULT_CONFIG
  }
}

// ---------------------------------------------------------------------------
// Transition validation
// ---------------------------------------------------------------------------

/** Returns true when moving `from → to` is permitted by the config.
 *  Same-column moves are always allowed.
 *  If no explicit rule exists the transition is permitted (permissive default). */
export function validateTransition(from: string, to: string, config: KanbanConfig): boolean {
  if (from === to) return true
  const rule = config.transitions.find((r) => r.from === from && r.to === to)
  return rule === undefined ? true : rule.allowed
}

/** Returns `{ allowed: true }` or `{ allowed: false, reason }` when the target
 *  column has a wipLimit and is already at capacity. */
export function validateWipLimit(
  store: KanbanStore,
  targetColumn: string,
  config: KanbanConfig,
): { allowed: boolean; reason?: string } {
  const col = config.columns.find((c) => c.id === targetColumn)
  if (!col?.wipLimit) return { allowed: true }
  const count = Object.values(store).filter((t) => t.status === targetColumn).length
  if (count >= col.wipLimit) {
    return {
      allowed: false,
      reason: `WIP limit exceeded (${count}/${col.wipLimit} in "${col.title}")`,
    }
  }
  return { allowed: true }
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'jinn-kanban'

const VALID_PRIORITIES = new Set<TicketPriority>(['low', 'medium', 'high'])
const VALID_WORK_STATES = new Set<WorkState>(['idle', 'starting', 'working', 'done', 'failed'])

/** Validate and sanitize a ticket loaded from localStorage. */
function sanitizeTicket(id: string, raw: Record<string, unknown>): KanbanTicket | null {
  if (typeof raw.title !== 'string' || !raw.title) return null

  // Status is now dynamic — accept any non-empty string, fallback to 'backlog'
  const status = typeof raw.status === 'string' && raw.status ? raw.status : 'backlog'
  const priority = (VALID_PRIORITIES.has(raw.priority as TicketPriority) ? raw.priority : 'medium') as TicketPriority
  const workState = (VALID_WORK_STATES.has(raw.workState as WorkState) ? raw.workState : 'idle') as WorkState

  return {
    id,
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : '',
    status,
    priority,
    assigneeId: typeof raw.assigneeId === 'string' ? raw.assigneeId : null,
    department: typeof raw.department === 'string' ? raw.department : null,
    departmentId: typeof raw.departmentId === 'string' ? raw.departmentId : null,
    topicId: typeof raw.topicId === 'string' ? raw.topicId : null,
    workState,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : (typeof raw.createdAt === 'number' ? raw.createdAt : 0),
  }
}

export function loadTickets(): KanbanStore {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>
    const store: KanbanStore = {}

    for (const id of Object.keys(parsed)) {
      const ticket = sanitizeTicket(id, parsed[id])
      if (!ticket) continue // Skip corrupted entries

      // Recover tickets stuck mid-work (e.g. page reload during streaming).
      // Reset them to todo/idle so they can be re-triggered.
      if (ticket.workState === 'working' || ticket.workState === 'starting') {
        ticket.status = 'todo'
        ticket.workState = 'idle'
      }

      store[id] = ticket
    }

    return store
  } catch {
    return {}
  }
}

export function saveTickets(store: KanbanStore): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch { /* storage full or unavailable */ }
}

// ---------------------------------------------------------------------------
// CRUD — pure functions (each returns a new store)
// ---------------------------------------------------------------------------

export function createTicket(
  store: KanbanStore,
  ticket: Omit<KanbanTicket, 'id' | 'createdAt' | 'updatedAt' | 'workState' | 'topicId'> & { department?: string | null; topicId?: string | null },
): KanbanStore {
  const id = crypto.randomUUID()
  const now = Date.now()
  return {
    ...store,
    [id]: {
      ...ticket,
      id,
      workState: 'idle',
      createdAt: now,
      updatedAt: now,
      departmentId: ticket.departmentId ?? null,
      topicId: ticket.topicId ?? null,
    },
  }
}

export function updateTicket(
  store: KanbanStore,
  id: string,
  updates: Partial<Omit<KanbanTicket, 'id' | 'createdAt'>>,
): KanbanStore {
  const existing = store[id]
  if (!existing) return store
  return {
    ...store,
    [id]: { ...existing, ...updates, updatedAt: Date.now() },
  }
}

export function moveTicket(
  store: KanbanStore,
  id: string,
  status: TicketStatus,
): KanbanStore {
  return updateTicket(store, id, { status })
}

export function deleteTicket(store: KanbanStore, id: string): KanbanStore {
  const next = { ...store }
  delete next[id]
  return next
}

export function getTicketsByStatus(
  store: KanbanStore,
  status: TicketStatus,
): KanbanTicket[] {
  return Object.values(store)
    .filter((t) => t.status === status)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/** Reassign multiple tickets to the same assignee in one operation. */
export function bulkAssign(
  store: KanbanStore,
  ids: string[],
  assigneeId: string | null,
): KanbanStore {
  let next = store
  for (const id of ids) {
    if (next[id]) next = updateTicket(next, id, { assigneeId })
  }
  return next
}

/** Move multiple tickets to a target column.
 *  Returns the updated store and the list of ids blocked by transition rules. */
export function bulkMove(
  store: KanbanStore,
  ids: string[],
  targetColumn: string,
  config: KanbanConfig,
): { store: KanbanStore; blocked: string[] } {
  let next = store
  const blocked: string[] = []

  for (const id of ids) {
    const ticket = next[id]
    if (!ticket) continue
    if (!validateTransition(ticket.status, targetColumn, config)) {
      blocked.push(id)
      continue
    }
    next = updateTicket(next, id, { status: targetColumn })
  }

  return { store: next, blocked }
}
