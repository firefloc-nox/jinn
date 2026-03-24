// Kanban board types

export type TicketStatus = string

export type TicketPriority = 'low' | 'medium' | 'high'

export type WorkState = 'idle' | 'starting' | 'working' | 'done' | 'failed'

export interface KanbanTicket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  assigneeId: string | null // employee name from /api/org
  department: string | null // department for API persistence
  workState: WorkState
  createdAt: number
  updatedAt: number
  /** The department this ticket belongs to; null for tickets not yet saved to any department */
  departmentId: string | null
}

export interface KanbanColumn {
  id: string
  title: string
}

/** Default columns — overridden at runtime by config.yaml kanban.columns */
export const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'rd', title: 'R&D' },
  { id: 'rd-done', title: 'R&D Done' },
  { id: 'dev-ready', title: 'Dev Ready' },
  { id: 'dev', title: 'Dev' },
  { id: 'dev-review', title: 'Dev Review' },
  { id: 'test-ready', title: 'Test Ready' },
  { id: 'test', title: 'Test' },
  { id: 'test-passed', title: 'Test Passed' },
  { id: 'done', title: 'Done' },
  { id: 'blocked', title: 'Blocked' },
]

/**
 * Maps legacy/agent-created statuses to the correct pipeline column.
 * Agents may create tickets with old statuses (todo, in_progress, review, etc.)
 * that need to be mapped into the real pipeline.
 */
export const STATUS_ALIASES: Record<string, string> = {
  'todo': 'backlog',
  'to-do': 'backlog',
  'in-progress': 'dev',
  'in_progress': 'dev',
  'review': 'dev-review',
  'testing': 'test',
  'qa': 'test',
}

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'var(--system-green)',
  medium: 'var(--system-orange)',
  high: 'var(--system-red)',
}
