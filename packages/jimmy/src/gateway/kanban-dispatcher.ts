/**
 * Kanban Dispatcher — core service for config management, transition validation,
 * auto-assignment, bulk operations, and ticket migration.
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { KANBAN_CONFIG, ORG_DIR } from "../shared/paths.js";
import { logger } from "../shared/logger.js";
import type {
  KanbanConfig,
  KanbanColumnDef,
  KanbanTopic,
  KanbanTicket,
  TransitionRule,
  TransitionValidation,
  DispatchResult,
  BulkTicketAction,
  BulkResult,
  AutoAssignRule,
  ConfigSaveResult,
  TicketPriority,
} from "../shared/kanban-types.js";
import { DEFAULT_KANBAN_CONFIG } from "../shared/kanban-types.js";
import type { Employee } from "../shared/types.js";

// ═══════════════════════════════════════════════════════════════════════════
// YAML handling — uses js-yaml (same as the rest of the codebase)
// ═══════════════════════════════════════════════════════════════════════════

import yaml from "js-yaml";

/** No-op — kept for backward compat with server.ts init call. */
export async function ensureYamlLoaded(): Promise<void> {
  // js-yaml is a sync module, nothing to await
}

// ═══════════════════════════════════════════════════════════════════════════
// Config loading & saving
// ═══════════════════════════════════════════════════════════════════════════

/** In-memory cached config, reloaded by watcher or on demand. */
let cachedConfig: KanbanConfig | null = null;

export function loadKanbanConfig(): KanbanConfig {
  if (cachedConfig) return cachedConfig;
  return reloadKanbanConfig();
}

export function reloadKanbanConfig(): KanbanConfig {
  if (!fs.existsSync(KANBAN_CONFIG)) {
    logger.info("Kanban config not found, generating default...");
    saveKanbanConfigSync(DEFAULT_KANBAN_CONFIG);
    cachedConfig = DEFAULT_KANBAN_CONFIG;
    return DEFAULT_KANBAN_CONFIG;
  }

  try {
    const raw = fs.readFileSync(KANBAN_CONFIG, "utf-8");
    const parsed = yaml.load(raw) as KanbanConfig;

    // Ensure required fields
    if (!parsed.columns) parsed.columns = DEFAULT_KANBAN_CONFIG.columns;
    if (!parsed.topics) parsed.topics = [];
    if (!parsed.transitions) parsed.transitions = DEFAULT_KANBAN_CONFIG.transitions;
    if (!parsed.version) parsed.version = "1.0";

    cachedConfig = parsed;
    return parsed;
  } catch (err) {
    logger.error(`Failed to parse kanban.config.yaml, using default: ${err instanceof Error ? err.message : err}`);
    cachedConfig = DEFAULT_KANBAN_CONFIG;
    return DEFAULT_KANBAN_CONFIG;
  }
}

export function saveKanbanConfigSync(config: KanbanConfig): void {
  fs.writeFileSync(KANBAN_CONFIG, yaml.dump(config), "utf-8");
  cachedConfig = config;
}

export async function saveKanbanConfig(config: KanbanConfig): Promise<void> {
  await fsPromises.writeFile(KANBAN_CONFIG, yaml.dump(config), "utf-8");
  cachedConfig = config;
}

/** Called by watcher when kanban.config.yaml changes on disk. */
export function invalidateConfigCache(): void {
  cachedConfig = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Config validation
// ═══════════════════════════════════════════════════════════════════════════

export function validateConfig(config: KanbanConfig): string[] {
  const errors: string[] = [];

  if (config.version !== "1.0") {
    errors.push(`version must be '1.0', got '${config.version}'`);
  }

  if (!Array.isArray(config.columns) || config.columns.length === 0) {
    errors.push("columns must be a non-empty array");
    return errors; // can't validate further
  }

  // Column ID uniqueness & order uniqueness
  const colIds = new Set<string>();
  const orders = new Set<number>();
  for (const col of config.columns) {
    if (!col.id || typeof col.id !== "string") {
      errors.push("each column must have a non-empty string id");
      continue;
    }
    if (colIds.has(col.id)) errors.push(`duplicate column id: '${col.id}'`);
    colIds.add(col.id);

    if (typeof col.order !== "number") {
      errors.push(`column '${col.id}': order must be a number`);
    } else if (orders.has(col.order)) {
      errors.push(`duplicate order value: ${col.order}`);
    } else {
      orders.add(col.order);
    }

    if (col.wipLimit !== undefined && (typeof col.wipLimit !== "number" || col.wipLimit < 0)) {
      errors.push(`column '${col.id}': wipLimit must be >= 0`);
    }
  }

  // Transition refs
  for (const t of config.transitions ?? []) {
    if (t.from !== "*" && !colIds.has(t.from)) {
      errors.push(`transition.from '${t.from}' is not a valid column id`);
    }
    if (t.to !== "*" && !colIds.has(t.to)) {
      errors.push(`transition.to '${t.to}' is not a valid column id`);
    }
  }

  // Topic name uniqueness & description validation
  const topicNames = new Set<string>();
  for (const topic of config.topics ?? []) {
    if (!topic.name) {
      errors.push("each topic must have a non-empty name");
      continue;
    }
    if (topicNames.has(topic.name)) {
      errors.push(`duplicate topic name: '${topic.name}'`);
    }
    topicNames.add(topic.name);

    if (topic.description) {
      const descErr = validateTopicDescription(topic.description);
      if (descErr) {
        errors.push(`topic '${topic.name}': ${descErr}`);
      }
    }
  }

  // Dispatcher refs
  if (config.dispatcher) {
    if (config.dispatcher.defaultColumn && !colIds.has(config.dispatcher.defaultColumn)) {
      errors.push(`dispatcher.defaultColumn '${config.dispatcher.defaultColumn}' is not a valid column id`);
    }
  }

  return errors;
}

// ═══════════════════════════════════════════════════════════════════════════
// Transition validation
// ═══════════════════════════════════════════════════════════════════════════

export function validateTransition(
  from: string,
  to: string,
  config: KanbanConfig,
): TransitionValidation {
  // Same-column is always valid
  if (from === to) return { valid: true };

  // 1. Check column-level blockedTransitionsTo
  const fromCol = config.columns.find((c) => c.id === from);
  if (fromCol?.rules?.blockedTransitionsTo?.includes(to)) {
    return { valid: false, reason: `Column '${from}' blocks transitions to '${to}'` };
  }

  // 2. Check explicit transition rules (most specific first)
  const exact = config.transitions.find((t) => t.from === from && t.to === to);
  if (exact) {
    return exact.allowed
      ? { valid: true }
      : { valid: false, reason: `Transition ${from} → ${to} is explicitly blocked` };
  }

  // 3. Check wildcard: from → *
  const fromWild = config.transitions.find((t) => t.from === from && t.to === "*");
  if (fromWild) {
    return fromWild.allowed
      ? { valid: true }
      : { valid: false, reason: `All transitions from '${from}' are blocked` };
  }

  // 4. Check wildcard: * → to
  const toWild = config.transitions.find((t) => t.from === "*" && t.to === to);
  if (toWild) {
    return toWild.allowed
      ? { valid: true }
      : { valid: false, reason: `All transitions to '${to}' are blocked` };
  }

  // 5. Check catch-all: * → *
  const catchAll = config.transitions.find((t) => t.from === "*" && t.to === "*");
  if (catchAll) {
    return catchAll.allowed
      ? { valid: true }
      : { valid: false, reason: "All transitions are blocked by default" };
  }

  // 6. No rule → permissive default
  return { valid: true };
}

/**
 * Full move validation including requiresAssignee check.
 */
export function validateMove(
  ticket: KanbanTicket,
  targetColumn: string,
  config: KanbanConfig,
): TransitionValidation {
  const transResult = validateTransition(ticket.status, targetColumn, config);
  if (!transResult.valid) return transResult;

  // Check requiresAssignee on target column
  const targetCol = config.columns.find((c) => c.id === targetColumn);
  if (targetCol?.rules?.requiresAssignee && !ticket.assigneeId) {
    return {
      valid: false,
      reason: `Column '${targetColumn}' requires an assignee`,
    };
  }

  return { valid: true };
}

/**
 * Validate WIP limit for a target column.
 * Returns null if OK, or a reason string if the limit would be exceeded.
 *
 * @param targetColumn - column ID to move into
 * @param allTickets - all tickets across all boards
 * @param movingIds - IDs of tickets being moved into targetColumn
 * @param config - kanban config with column definitions
 */
export function validateWipLimit(
  targetColumn: string,
  allTickets: KanbanTicket[],
  movingIds: string[],
  config: KanbanConfig,
): string | null {
  const colDef = config.columns.find((c) => c.id === targetColumn);
  if (!colDef?.wipLimit || colDef.wipLimit <= 0) return null;

  const currentCount = allTickets.filter((t) => t.status === targetColumn).length;
  // Only count tickets that are actually entering the column (not already there)
  const enteringCount = movingIds.filter((id) => {
    const ticket = allTickets.find((t) => t.id === id);
    return ticket && ticket.status !== targetColumn;
  }).length;

  const newTotal = currentCount + enteringCount;
  if (newTotal > colDef.wipLimit) {
    return `WIP limit exceeded for '${colDef.title}': ${currentCount} current + ${enteringCount} incoming = ${newTotal}, limit is ${colDef.wipLimit}`;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Assignee resolution
// ═══════════════════════════════════════════════════════════════════════════

function evaluateRule(
  rule: AutoAssignRule,
  ticket: KanbanTicket,
  _employees: Employee[],
): string | null {
  switch (rule.condition) {
    case "department":
      if (ticket.departmentId === rule.value) return rule.assignTo;
      break;
    case "priority":
      if (ticket.priority === rule.value) return rule.assignTo;
      break;
    case "keyword": {
      const text = `${ticket.title} ${ticket.description}`;
      if (new RegExp(rule.value, "i").test(text)) return rule.assignTo;
      break;
    }
    case "tag":
      // Tags are matched against the topic's tags (resolved at call site)
      break;
  }
  return null;
}

export function resolveAssignee(
  ticket: KanbanTicket,
  config: KanbanConfig,
  employees: Employee[],
): string | null {
  if (!config.dispatcher?.enabled) return null;

  // Priority 1: topic.defaultAssignee
  if (ticket.topicId && config.dispatcher.autoAssignByTopic) {
    const topic = config.topics.find((t) => t.id === ticket.topicId);
    if (topic?.defaultAssignee) return topic.defaultAssignee;

    // Priority 2: topic.autoAssignRules
    if (topic?.autoAssignRules) {
      for (const rule of topic.autoAssignRules) {
        const match = evaluateRule(rule, ticket, employees);
        if (match) return match;
      }
    }
  }

  // Priority 3: round-robin by department
  if (config.dispatcher.autoAssignByDepartment && ticket.departmentId) {
    const deptEmployees = employees.filter(
      (e) => e.department === ticket.departmentId || e.orgPath === ticket.departmentId,
    );
    if (deptEmployees.length > 0) {
      const idx = ticket.createdAt % deptEmployees.length;
      return deptEmployees[idx].name;
    }
  }

  // Priority 4: fallback
  return config.dispatcher.fallbackAssignee ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Dispatch (assign + place)
// ═══════════════════════════════════════════════════════════════════════════

export function dispatch(
  ticket: KanbanTicket,
  config: KanbanConfig,
  employees: Employee[],
): DispatchResult {
  const column = config.dispatcher?.defaultColumn ?? config.columns[0]?.id ?? "backlog";
  const assigneeId = resolveAssignee(ticket, config, employees);
  return { assigneeId, column };
}

// ═══════════════════════════════════════════════════════════════════════════
// Bulk operations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Atomic bulk move — if ANY ticket is blocked, NONE are moved.
 */
export function bulkMove(
  action: BulkTicketAction,
  tickets: KanbanTicket[],
  config: KanbanConfig,
): BulkResult {
  if (!action.targetColumn) return { moved: 0, blocked: [] };

  const blocked: Array<{ id: string; reason: string }> = [];

  // Phase 1: validate ALL
  for (const id of action.ids) {
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket) {
      blocked.push({ id, reason: "Ticket not found" });
      continue;
    }
    const validation = validateMove(ticket, action.targetColumn, config);
    if (!validation.valid) {
      blocked.push({ id, reason: validation.reason! });
    }
  }

  // Atomic: if any blocked, return early
  if (blocked.length > 0) return { moved: 0, blocked };

  // Phase 1b: validate WIP limit on target column
  const wipReason = validateWipLimit(action.targetColumn!, tickets, action.ids, config);
  if (wipReason) {
    return { moved: 0, blocked: [{ id: "__wip_limit__", reason: wipReason }] };
  }

  // Phase 2: apply
  const now = Date.now();
  let moved = 0;
  for (const id of action.ids) {
    const ticket = tickets.find((t) => t.id === id);
    if (ticket) {
      ticket.status = action.targetColumn!;
      ticket.updatedAt = now;
      moved++;
    }
  }

  return { moved, blocked: [] };
}

/**
 * Bulk assign — always succeeds (no validation needed for assignee changes).
 */
export function bulkAssign(
  action: BulkTicketAction,
  tickets: KanbanTicket[],
): number {
  const now = Date.now();
  let updated = 0;

  for (const id of action.ids) {
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket) continue;

    let changed = false;
    if (action.assigneeId !== undefined) {
      ticket.assigneeId = action.assigneeId;
      changed = true;
    }
    if (action.topicId !== undefined) {
      ticket.topicId = action.topicId;
      changed = true;
    }
    if (changed) {
      ticket.updatedAt = now;
      updated++;
    }
  }

  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════
// Board I/O — read/write board.json across all departments
// ═══════════════════════════════════════════════════════════════════════════

export interface BoardMap {
  /** department path → array of tickets */
  [deptPath: string]: KanbanTicket[];
}

/**
 * Recursively scan org/ for board.json files and load all tickets.
 */
export function loadAllBoards(): { boards: BoardMap; allTickets: KanbanTicket[] } {
  const boards: BoardMap = {};
  const allTickets: KanbanTicket[] = [];

  function scan(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Check for board.json in this directory
    const boardFile = path.join(dir, "board.json");
    if (fs.existsSync(boardFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(boardFile, "utf-8"));
        if (Array.isArray(raw)) {
          const tickets = raw as KanbanTicket[];
          boards[prefix] = tickets;
          allTickets.push(...tickets);
        }
      } catch {
        logger.warn(`Failed to parse ${boardFile}`);
      }
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const subPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        scan(path.join(dir, entry.name), subPath);
      }
    }
  }

  scan(ORG_DIR, "");
  return { boards, allTickets };
}

/**
 * Persist modified boards back to their respective board.json files.
 */
export function persistBoards(boards: BoardMap): void {
  for (const [deptPath, tickets] of Object.entries(boards)) {
    const boardFile = path.resolve(path.join(ORG_DIR, deptPath, "board.json"));
    // Path traversal check
    if (!boardFile.startsWith(path.resolve(ORG_DIR) + path.sep)) continue;
    fs.writeFileSync(boardFile, JSON.stringify(tickets, null, 2), "utf-8");
  }
}

/**
 * Count tickets with a specific status across all boards.
 */
export function countTicketsInColumn(columnId: string): number {
  const { allTickets } = loadAllBoards();
  return allTickets.filter((t) => t.status === columnId).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// Migration
// ═══════════════════════════════════════════════════════════════════════════

const LEGACY_STATUS_MAP: Record<string, string> = {
  in_progress: "in-progress",
  rd: "in-progress",
  wip: "in-progress",
  blocked: "todo",
};

/**
 * Map a legacy or unknown status to a valid column ID.
 */
export function migrateTicketStatus(status: string, config: KanbanConfig): string {
  // Exact match
  if (config.columns.some((c) => c.id === status)) return status;
  // Legacy mapping
  const mapped = LEGACY_STATUS_MAP[status];
  if (mapped && config.columns.some((c) => c.id === mapped)) return mapped;
  // Fallback
  return config.dispatcher?.defaultColumn ?? config.columns[0]?.id ?? "backlog";
}

// ═══════════════════════════════════════════════════════════════════════════
// Topic & column context helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Max allowed length for topic descriptions. */
const TOPIC_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Sanitize a topic description:
 * - Strip HTML tags to prevent XSS / prompt injection
 * - Truncate to max length
 */
export function sanitizeTopicDescription(description: string): string {
  // Strip HTML/XML tags
  const stripped = description.replace(/<[^>]*>/g, "");
  // Truncate
  return stripped.length > TOPIC_DESCRIPTION_MAX_LENGTH
    ? stripped.slice(0, TOPIC_DESCRIPTION_MAX_LENGTH)
    : stripped;
}

/**
 * Validate a topic description for storage. Returns an error string or null if valid.
 */
export function validateTopicDescription(description: string): string | null {
  if (typeof description !== "string") return "description must be a string";
  if (description.length > TOPIC_DESCRIPTION_MAX_LENGTH) {
    return `description exceeds max length (${description.length}/${TOPIC_DESCRIPTION_MAX_LENGTH})`;
  }
  if (/<[^>]*>/.test(description)) {
    return "description must not contain HTML tags";
  }
  return null;
}

export function getTopicContext(topicId: string, config: KanbanConfig): string | null {
  const raw = config.topics.find((t) => t.id === topicId)?.description ?? null;
  return raw !== null ? sanitizeTopicDescription(raw) : null;
}

export function getColumnTopic(columnId: string, config: KanbanConfig): string | null {
  return config.columns.find((c) => c.id === columnId)?.topic ?? null;
}
