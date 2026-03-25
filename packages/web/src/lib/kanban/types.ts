// Kanban board types

export type TicketStatus = string // Dynamic — driven by KanbanConfig.columns

export type TicketPriority = 'low' | 'medium' | 'high'

export type WorkState = 'idle' | 'starting' | 'working' | 'done' | 'failed'

export interface KanbanTicket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  assigneeId: string | null  // employee name from /api/org
  department: string | null  // department for API persistence
  /** The department this ticket belongs to; null for tickets not yet saved to any department */
  departmentId: string | null
  topicId: string | null     // topic this ticket belongs to
  workState: WorkState
  createdAt: number
  updatedAt: number
}

// Column definition — driven by KanbanConfig, not hardcoded
export interface KanbanColumn {
  id: string
  title: string
  order: number
  wipLimit?: number
  color?: string
}

// Topic: groups tickets semantically and provides context for agents
export interface KanbanTopic {
  id: string
  name: string
  description: string
  color: string
  tags: string[]
  defaultAssignee?: string | null
  defaultPriority?: TicketPriority
}

// Explicit rule for a column-to-column transition
export interface TransitionRule {
  from: string
  to: string
  allowed: boolean
}

// Full board configuration — loaded from /api/kanban/config
export interface KanbanConfig {
  columns: KanbanColumn[]
  topics: KanbanTopic[]
  transitions: TransitionRule[]
}

// Default config — used as fallback when API is unavailable
export const DEFAULT_CONFIG: KanbanConfig = {
  columns: [
    { id: 'backlog',     title: 'Backlog',     order: 0 },
    { id: 'todo',        title: 'To Do',        order: 1 },
    { id: 'in-progress', title: 'In Progress',  order: 2 },
    { id: 'review',      title: 'Review',       order: 3 },
    { id: 'done',        title: 'Done',         order: 4 },
  ],
  topics: [],
  transitions: [
    // Allowed forward/back paths
    { from: 'backlog',     to: 'todo',        allowed: true  },
    { from: 'backlog',     to: 'in-progress', allowed: true  },
    { from: 'todo',        to: 'backlog',     allowed: true  },
    { from: 'todo',        to: 'in-progress', allowed: true  },
    { from: 'in-progress', to: 'todo',        allowed: true  },
    { from: 'in-progress', to: 'review',      allowed: true  },
    { from: 'review',      to: 'in-progress', allowed: true  },
    { from: 'review',      to: 'done',        allowed: true  },
    { from: 'done',        to: 'review',      allowed: true  },
    // Blocked shortcuts (skip steps)
    { from: 'backlog',     to: 'done',        allowed: false },
    { from: 'backlog',     to: 'review',      allowed: false },
    { from: 'todo',        to: 'done',        allowed: false },
    { from: 'todo',        to: 'review',      allowed: false },
  ],
}

// Backward-compat alias — components not yet migrated to dynamic config
export const COLUMNS: KanbanColumn[] = DEFAULT_CONFIG.columns

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low:    'var(--system-green)',
  medium: 'var(--system-orange)',
  high:   'var(--system-red)',
}
