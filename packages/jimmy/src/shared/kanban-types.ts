/**
 * Kanban types — shared between backend and frontend.
 *
 * The backend is the superset: it includes dispatcher config, column rules,
 * and auto-assign rules that the frontend may ignore.  The frontend types
 * (packages/web/src/lib/kanban/types.ts) are intentionally lighter.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Column
// ═══════════════════════════════════════════════════════════════════════════

export interface KanbanColumnRules {
  /** Block moves to this column when the ticket has no assignee. */
  requiresAssignee?: boolean;
  /** Column IDs that are forbidden as a destination from this column. */
  blockedTransitionsTo?: string[];
  /** Gateway event name that triggers auto-transition out of this column. */
  autoTransitionOn?: string;
}

export interface KanbanColumnDef {
  /** Unique slug, e.g. "backlog", "code-review". */
  id: string;
  /** Human-readable title, e.g. "Code Review". */
  title: string;
  /** Display order (0-based, no gaps). */
  order: number;
  /** Preprompt injected into agent context when working on a ticket in this column. */
  topic?: string;
  /** Hex color hint for the UI, e.g. "#6b7280". */
  color?: string;
  /** Max tickets allowed simultaneously (0 = unlimited). */
  wipLimit?: number;
  /** Optional column-level rules. */
  rules?: KanbanColumnRules;
}

// ═══════════════════════════════════════════════════════════════════════════
// Topic (contextual preprompt)
// ═══════════════════════════════════════════════════════════════════════════

export interface AutoAssignRule {
  condition: "department" | "tag" | "priority" | "keyword";
  /** Department name, tag string, priority level, or regex pattern. */
  value: string;
  /** Employee name or "department:<path>" for round-robin. */
  assignTo: string;
}

export interface KanbanTopic {
  /** UUID v4, auto-generated on creation. */
  id: string;
  /** Unique display name, e.g. "Bug Fix". */
  name: string;
  /** Rich description used as agent context / preprompt. */
  description: string;
  /** Badge hex color. */
  color: string;
  /** Free-form tags for filtering. */
  tags: string[];
  /** Employee name to auto-assign when this topic is selected. */
  defaultAssignee?: string | null;
  /** Default priority for tickets with this topic. */
  defaultPriority?: TicketPriority;
  /** Rules for automatic assignee resolution. */
  autoAssignRules?: AutoAssignRule[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Transition rules
// ═══════════════════════════════════════════════════════════════════════════

export interface TransitionRule {
  /** Source column ID, or "*" for any. */
  from: string;
  /** Target column ID, or "*" for any. */
  to: string;
  /** true = explicitly allowed, false = explicitly blocked. */
  allowed: boolean;
  /** Optional: only employees with this rank or above may perform this transition. */
  requiresRole?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dispatcher
// ═══════════════════════════════════════════════════════════════════════════

export interface DispatcherConfig {
  enabled: boolean;
  /** Column where new tickets land by default. */
  defaultColumn: string;
  /** Round-robin among department employees. */
  autoAssignByDepartment: boolean;
  /** Use topic.autoAssignRules for assignment. */
  autoAssignByTopic: boolean;
  /** Employee name when no rule matches. */
  fallbackAssignee?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Config root
// ═══════════════════════════════════════════════════════════════════════════

export interface KanbanConfig {
  version: "1.0";
  columns: KanbanColumnDef[];
  topics: KanbanTopic[];
  transitions: TransitionRule[];
  dispatcher?: DispatcherConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// Ticket
// ═══════════════════════════════════════════════════════════════════════════

export type TicketPriority = "low" | "medium" | "high";
export type WorkState = "idle" | "starting" | "working" | "done" | "failed";

export interface KanbanTicket {
  id: string;
  title: string;
  description: string;
  /** Dynamic — validated against config.columns[].id. */
  status: string;
  priority: TicketPriority;
  assigneeId: string | null;
  departmentId: string | null;
  /** Link to a KanbanTopic for contextual preprompt. */
  topicId?: string | null;
  workState: WorkState;
  createdAt: number;
  updatedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk operations
// ═══════════════════════════════════════════════════════════════════════════

export interface BulkTicketAction {
  ids: string[];
  assigneeId?: string;
  targetColumn?: string;
  topicId?: string;
}

export interface BulkResult {
  moved: number;
  blocked: Array<{ id: string; reason: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════
// API response helpers
// ═══════════════════════════════════════════════════════════════════════════

export interface TransitionValidation {
  valid: boolean;
  reason?: string;
}

export interface DispatchResult {
  assigneeId: string | null;
  column: string;
}

export interface ConfigSaveResult {
  ok: boolean;
  errors?: string[];
  warnings?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Default config — generated on first boot
// ═══════════════════════════════════════════════════════════════════════════

/** Legacy status aliases — maps old names to canonical column IDs */
export const STATUS_ALIASES: Record<string, string> = {
  'todo':        'backlog',
  'in-progress': 'dev',
  'in_progress': 'dev',
  'review':      'dev-review',
  'testing':     'test',
  'completed':   'done',
};

export const DEFAULT_KANBAN_CONFIG: KanbanConfig = {
  version: "1.0",
  columns: [
    {
      id: "backlog",
      title: "Backlog",
      order: 0,
      topic: "Unprocessed work waiting for triage and prioritization.",
      color: "#6b7280",
    },
    {
      id: "todo",
      title: "To Do",
      order: 1,
      topic: "Prioritized and ready for assignment. Check dependencies before starting.",
      color: "#3b82f6",
    },
    {
      id: "in-progress",
      title: "In Progress",
      order: 2,
      topic: "Actively being worked on. Ensure steady progress and communicate blockers.",
      color: "#f59e0b",
      wipLimit: 5,
      rules: { requiresAssignee: true },
    },
    {
      id: "review",
      title: "Review",
      order: 3,
      topic: "Awaiting peer review. Focus: code quality, security, performance.",
      color: "#8b5cf6",
      rules: { requiresAssignee: true },
    },
    {
      id: "done",
      title: "Done",
      order: 4,
      color: "#22c55e",
    },
  ],
  topics: [],
  transitions: [
    { from: "backlog", to: "done", allowed: false },
    { from: "backlog", to: "review", allowed: false },
    { from: "*", to: "*", allowed: true },
  ],
  dispatcher: {
    enabled: true,
    defaultColumn: "backlog",
    autoAssignByDepartment: true,
    autoAssignByTopic: true,
    fallbackAssignee: null,
  },
};
