/**
 * Kanban Integration Tests — end-to-end workflows exercising
 * config → dispatch → bulk ops → migration → board I/O in sequence.
 *
 * Uses real filesystem (tmpDir) with mocked paths, no HTTP server needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("../../shared/paths.js", () => ({
  get KANBAN_CONFIG() {
    return path.join(tmpDir, "kanban.config.yaml");
  },
  get ORG_DIR() {
    return path.join(tmpDir, "org");
  },
}));

vi.mock("../../shared/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  reloadKanbanConfig,
  saveKanbanConfigSync,
  validateConfig,
  validateTransition,
  validateMove,
  resolveAssignee,
  dispatch,
  bulkMove,
  bulkAssign,
  migrateTicketStatus,
  loadAllBoards,
  persistBoards,
  countTicketsInColumn,
  invalidateConfigCache,
} from "../kanban-dispatcher.js";

import { DEFAULT_KANBAN_CONFIG } from "../../shared/kanban-types.js";
import type {
  KanbanConfig,
  KanbanTicket,
  BulkTicketAction,
} from "../../shared/kanban-types.js";
import type { Employee } from "../../shared/types.js";

// ─── Helpers ───

function makeTicket(overrides: Partial<KanbanTicket> = {}): KanbanTicket {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    title: "Test ticket",
    description: "A test",
    status: "todo",
    priority: "medium",
    assigneeId: null,
    departmentId: null,
    topicId: null,
    workState: "idle",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    name: "test-employee",
    displayName: "Test Employee",
    department: "test-dept",
    rank: "employee",
    engine: "claude",
    model: "sonnet",
    persona: "test",
    ...overrides,
  };
}

function writeBoardJson(deptPath: string, tickets: KanbanTicket[]) {
  const dir = path.join(tmpDir, "org", ...deptPath.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "board.json"), JSON.stringify(tickets, null, 2), "utf-8");
}

// ─── Setup ───

describe("kanban-integration", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-int-"));
    fs.mkdirSync(path.join(tmpDir, "org"), { recursive: true });
    invalidateConfigCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ════════════════════════════════════════════════════
  // E2E Workflow 1: Full ticket lifecycle
  // ════════════════════════════════════════════════════

  describe("full ticket lifecycle", () => {
    it("creates config → dispatches ticket → moves through columns → done", () => {
      // 1. Boot config
      const config = reloadKanbanConfig();
      expect(validateConfig(config)).toHaveLength(0);

      // 2. Create employees
      const employees = [
        makeEmployee({ name: "alice", department: "dev" }),
        makeEmployee({ name: "bob", department: "dev" }),
      ];

      // 3. Create a ticket and dispatch it
      const ticket = makeTicket({
        id: "lifecycle-001",
        title: "Fix crash on login",
        departmentId: "dev",
        priority: "high",
      });

      const result = dispatch(ticket, config, employees);
      expect(result.column).toBe("backlog");
      expect(result.assigneeId).toBeTruthy();

      // Apply dispatch result
      ticket.status = result.column;
      ticket.assigneeId = result.assigneeId;

      // 4. Move backlog → todo
      expect(validateMove(ticket, "todo", config).valid).toBe(true);
      ticket.status = "todo";

      // 5. Move todo → in-progress (requires assignee)
      expect(validateMove(ticket, "in-progress", config).valid).toBe(true);
      ticket.status = "in-progress";

      // 6. Move in-progress → review
      expect(validateMove(ticket, "review", config).valid).toBe(true);
      ticket.status = "review";

      // 7. Move review → done
      expect(validateMove(ticket, "done", config).valid).toBe(true);
      ticket.status = "done";

      // 8. Verify shortcut was blocked
      const shortcutTicket = makeTicket({ status: "backlog", assigneeId: "alice" });
      expect(validateMove(shortcutTicket, "done", config).valid).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════
  // E2E Workflow 2: Config → Save → Reload cycle
  // ════════════════════════════════════════════════════

  describe("config hot-reload cycle", () => {
    it("saves custom config → reloads → validates → transitions respect new rules", () => {
      // 1. Initial default config
      reloadKanbanConfig();

      // 2. Create custom config with 3 columns and strict transitions
      const customConfig: KanbanConfig = {
        version: "1.0",
        columns: [
          { id: "open", title: "Open", order: 0 },
          { id: "working", title: "Working", order: 1, rules: { requiresAssignee: true } },
          { id: "closed", title: "Closed", order: 2 },
        ],
        topics: [
          {
            id: "bug-topic",
            name: "Bug",
            description: "Fix reported bugs",
            color: "#ef4444",
            tags: ["bug"],
            defaultAssignee: "alice",
          },
        ],
        transitions: [
          { from: "open", to: "closed", allowed: false }, // must go through working
          { from: "*", to: "*", allowed: true },
        ],
      };

      // 3. Save and reload
      saveKanbanConfigSync(customConfig);
      invalidateConfigCache();
      const reloaded = reloadKanbanConfig();

      // 4. Validate
      expect(validateConfig(reloaded)).toHaveLength(0);
      expect(reloaded.columns).toHaveLength(3);
      expect(reloaded.topics).toHaveLength(1);

      // 5. Test new transition rules
      expect(validateTransition("open", "working", reloaded).valid).toBe(true);
      expect(validateTransition("open", "closed", reloaded).valid).toBe(false); // blocked
      expect(validateTransition("working", "closed", reloaded).valid).toBe(true);

      // 6. Test requiresAssignee on "working"
      const unassigned = makeTicket({ status: "open", assigneeId: null });
      expect(validateMove(unassigned, "working", reloaded).valid).toBe(false);

      const assigned = makeTicket({ status: "open", assigneeId: "alice" });
      expect(validateMove(assigned, "working", reloaded).valid).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════
  // E2E Workflow 3: Topic-based auto-assignment
  // ════════════════════════════════════════════════════

  describe("topic-based auto-assignment flow", () => {
    it("dispatches tickets to correct assignees based on topic rules", () => {
      const config: KanbanConfig = {
        ...DEFAULT_KANBAN_CONFIG,
        topics: [
          {
            id: "topic-bugs",
            name: "Bugs",
            description: "Bug fixes",
            color: "#ef4444",
            tags: ["bug"],
            defaultAssignee: "alice",
          },
          {
            id: "topic-features",
            name: "Features",
            description: "New features",
            color: "#22c55e",
            tags: ["feature"],
            autoAssignRules: [
              { condition: "priority", value: "high", assignTo: "charlie" },
            ],
          },
        ],
      };

      const employees = [
        makeEmployee({ name: "alice", department: "dev" }),
        makeEmployee({ name: "bob", department: "dev" }),
        makeEmployee({ name: "charlie", department: "dev" }),
      ];

      // Bug ticket → alice (defaultAssignee)
      const bugTicket = makeTicket({ topicId: "topic-bugs" });
      expect(resolveAssignee(bugTicket, config, employees)).toBe("alice");

      // High-priority feature → charlie (autoAssignRule)
      const featureTicket = makeTicket({
        topicId: "topic-features",
        priority: "high",
      });
      expect(resolveAssignee(featureTicket, config, employees)).toBe("charlie");

      // Low-priority feature → falls through to round-robin dept
      const lowFeature = makeTicket({
        topicId: "topic-features",
        priority: "low",
        departmentId: "dev",
        createdAt: 1000,
      });
      const assignee = resolveAssignee(lowFeature, config, employees);
      expect(employees.map((e) => e.name)).toContain(assignee);
    });
  });

  // ════════════════════════════════════════════════════
  // E2E Workflow 4: Bulk operations with atomic semantics
  // ════════════════════════════════════════════════════

  describe("bulk operations workflow", () => {
    it("bulk move succeeds when all transitions valid", () => {
      const config = reloadKanbanConfig();
      const tickets = [
        makeTicket({ id: "b-1", status: "todo", assigneeId: "alice" }),
        makeTicket({ id: "b-2", status: "todo", assigneeId: "bob" }),
        makeTicket({ id: "b-3", status: "todo", assigneeId: "charlie" }),
      ];

      const action: BulkTicketAction = {
        ids: ["b-1", "b-2", "b-3"],
        targetColumn: "in-progress",
      };

      const result = bulkMove(action, tickets, config);
      expect(result.moved).toBe(3);
      expect(result.blocked).toHaveLength(0);
      expect(tickets.every((t) => t.status === "in-progress")).toBe(true);
    });

    it("bulk move is atomic — one blocked ticket blocks all", () => {
      const config = reloadKanbanConfig();
      const tickets = [
        makeTicket({ id: "b-1", status: "todo", assigneeId: "alice" }),
        makeTicket({ id: "b-2", status: "backlog" }), // backlog → done is blocked
      ];

      const action: BulkTicketAction = {
        ids: ["b-1", "b-2"],
        targetColumn: "done",
      };

      const result = bulkMove(action, tickets, config);
      expect(result.moved).toBe(0);
      expect(result.blocked.length).toBeGreaterThan(0);
      // Original statuses preserved
      expect(tickets[0].status).toBe("todo");
      expect(tickets[1].status).toBe("backlog");
    });

    it("bulk assign + bulk move pipeline", () => {
      const config = reloadKanbanConfig();
      const tickets = [
        makeTicket({ id: "pipe-1", status: "todo" }),
        makeTicket({ id: "pipe-2", status: "todo" }),
      ];

      // Step 1: bulk assign
      const assignAction: BulkTicketAction = {
        ids: ["pipe-1", "pipe-2"],
        assigneeId: "ironcraft",
      };
      const assigned = bulkAssign(assignAction, tickets);
      expect(assigned).toBe(2);
      expect(tickets.every((t) => t.assigneeId === "ironcraft")).toBe(true);

      // Step 2: bulk move to in-progress (now possible because assignees set)
      const moveAction: BulkTicketAction = {
        ids: ["pipe-1", "pipe-2"],
        targetColumn: "in-progress",
      };
      const moveResult = bulkMove(moveAction, tickets, config);
      expect(moveResult.moved).toBe(2);
      expect(tickets.every((t) => t.status === "in-progress")).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════
  // E2E Workflow 5: Board I/O across departments
  // ════════════════════════════════════════════════════

  describe("board I/O across departments", () => {
    it("loads boards from multiple departments and persists changes", () => {
      // Setup department boards
      const devTickets = [
        makeTicket({ id: "dev-1", status: "todo", departmentId: "dev" }),
        makeTicket({ id: "dev-2", status: "in-progress", departmentId: "dev" }),
      ];
      const opsTickets = [
        makeTicket({ id: "ops-1", status: "backlog", departmentId: "ops" }),
      ];

      writeBoardJson("dev", devTickets);
      writeBoardJson("ops", opsTickets);

      // Load all
      const { boards, allTickets } = loadAllBoards();
      expect(Object.keys(boards)).toHaveLength(2);
      expect(allTickets).toHaveLength(3);

      // Modify a ticket
      const devBoard = boards["dev"];
      devBoard[0].status = "done";
      devBoard[0].updatedAt = Date.now();

      // Persist
      persistBoards(boards);

      // Reload and verify
      const reloaded = loadAllBoards();
      const updatedTicket = reloaded.allTickets.find((t) => t.id === "dev-1");
      expect(updatedTicket?.status).toBe("done");
    });

    it("countTicketsInColumn works across departments", () => {
      writeBoardJson("dev", [
        makeTicket({ id: "d1", status: "todo" }),
        makeTicket({ id: "d2", status: "todo" }),
      ]);
      writeBoardJson("ops", [
        makeTicket({ id: "o1", status: "todo" }),
        makeTicket({ id: "o2", status: "done" }),
      ]);

      expect(countTicketsInColumn("todo")).toBe(3);
      expect(countTicketsInColumn("done")).toBe(1);
      expect(countTicketsInColumn("backlog")).toBe(0);
    });

    it("handles nested department paths", () => {
      writeBoardJson("nexamon-studio/dev", [
        makeTicket({ id: "ns-1", status: "review" }),
      ]);
      writeBoardJson("nexamon-studio/design", [
        makeTicket({ id: "ns-2", status: "backlog" }),
      ]);

      const { boards, allTickets } = loadAllBoards();
      expect(allTickets).toHaveLength(2);
      expect(boards["nexamon-studio/dev"]).toHaveLength(1);
      expect(boards["nexamon-studio/design"]).toHaveLength(1);
    });
  });

  // ════════════════════════════════════════════════════
  // E2E Workflow 6: Migration from legacy statuses
  // ════════════════════════════════════════════════════

  describe("migration workflow", () => {
    it("migrates legacy board data to new column IDs", () => {
      const config = reloadKanbanConfig();

      // Simulate legacy board with old status names
      const legacyTickets = [
        makeTicket({ id: "leg-1", status: "in_progress" as any }),
        makeTicket({ id: "leg-2", status: "wip" as any }),
        makeTicket({ id: "leg-3", status: "rd" as any }),
        makeTicket({ id: "leg-4", status: "blocked" as any }),
        makeTicket({ id: "leg-5", status: "unknown_status" as any }),
        makeTicket({ id: "leg-6", status: "review" }), // already valid
      ];

      // Migrate each
      for (const ticket of legacyTickets) {
        ticket.status = migrateTicketStatus(ticket.status, config);
      }

      expect(legacyTickets[0].status).toBe("in-progress");
      expect(legacyTickets[1].status).toBe("in-progress");
      expect(legacyTickets[2].status).toBe("in-progress");
      expect(legacyTickets[3].status).toBe("todo");
      expect(legacyTickets[4].status).toBe("backlog"); // fallback to defaultColumn
      expect(legacyTickets[5].status).toBe("review"); // unchanged

      // All statuses should now be valid columns
      const validColumns = new Set(config.columns.map((c) => c.id));
      for (const ticket of legacyTickets) {
        expect(validColumns.has(ticket.status)).toBe(true);
      }
    });

    it("migrates with custom config columns", () => {
      const customConfig: KanbanConfig = {
        version: "1.0",
        columns: [
          { id: "new", title: "New", order: 0 },
          { id: "active", title: "Active", order: 1 },
          { id: "archived", title: "Archived", order: 2 },
        ],
        topics: [],
        transitions: [],
        dispatcher: { enabled: true, defaultColumn: "new", autoAssignByDepartment: false, autoAssignByTopic: false },
      };

      // Legacy status not in custom columns → falls to defaultColumn "new"
      expect(migrateTicketStatus("in_progress", customConfig)).toBe("new");
      expect(migrateTicketStatus("todo", customConfig)).toBe("new");
      // Exact match
      expect(migrateTicketStatus("active", customConfig)).toBe("active");
      expect(migrateTicketStatus("archived", customConfig)).toBe("archived");
    });
  });

  // ════════════════════════════════════════════════════
  // E2E Workflow 7: Config validation edge cases
  // ════════════════════════════════════════════════════

  describe("config validation edge cases", () => {
    it("validates a complex real-world config", () => {
      const config: KanbanConfig = {
        version: "1.0",
        columns: [
          { id: "intake", title: "Intake", order: 0 },
          { id: "triage", title: "Triage", order: 1 },
          { id: "dev", title: "Development", order: 2, wipLimit: 3, rules: { requiresAssignee: true } },
          { id: "qa", title: "QA", order: 3, rules: { requiresAssignee: true, blockedTransitionsTo: ["intake"] } },
          { id: "staging", title: "Staging", order: 4 },
          { id: "prod", title: "Production", order: 5 },
        ],
        topics: [
          { id: "t1", name: "Bug", description: "Bug fix", color: "#f00", tags: ["bug"] },
          { id: "t2", name: "Feature", description: "New feature", color: "#0f0", tags: ["feature"] },
          { id: "t3", name: "Hotfix", description: "Emergency fix", color: "#ff0", tags: ["hotfix"] },
        ],
        transitions: [
          { from: "intake", to: "prod", allowed: false },
          { from: "intake", to: "staging", allowed: false },
          { from: "*", to: "*", allowed: true },
        ],
        dispatcher: {
          enabled: true,
          defaultColumn: "intake",
          autoAssignByDepartment: true,
          autoAssignByTopic: true,
          fallbackAssignee: "ironcraft",
        },
      };

      const errors = validateConfig(config);
      expect(errors).toHaveLength(0);

      // Verify transitions
      expect(validateTransition("intake", "triage", config).valid).toBe(true);
      expect(validateTransition("intake", "prod", config).valid).toBe(false);
      expect(validateTransition("qa", "intake", config).valid).toBe(false); // blockedTransitionsTo

      // Verify dispatch
      const employees = [makeEmployee({ name: "ironcraft", department: "dev" })];
      const ticket = makeTicket({ departmentId: "dev" });
      const result = dispatch(ticket, config, employees);
      expect(result.column).toBe("intake");
    });
  });

  // ════════════════════════════════════════════════════
  // Performance: 100+ tickets
  // ════════════════════════════════════════════════════

  describe("performance: 100+ tickets", () => {
    it("handles bulk operations on 200 tickets efficiently", () => {
      const config = reloadKanbanConfig();
      // Remove WIP limit on in-progress for this performance test
      const ipCol = config.columns.find((c) => c.id === "in-progress");
      if (ipCol) ipCol.wipLimit = undefined;
      const tickets: KanbanTicket[] = [];

      // Create 200 tickets
      for (let i = 0; i < 200; i++) {
        tickets.push(
          makeTicket({
            id: `perf-${i}`,
            status: "todo",
            assigneeId: `employee-${i % 5}`,
            departmentId: "dev",
            priority: ["low", "medium", "high"][i % 3] as any,
          }),
        );
      }

      // Bulk move all to in-progress
      const start = performance.now();
      const moveAction: BulkTicketAction = {
        ids: tickets.map((t) => t.id),
        targetColumn: "in-progress",
      };
      const result = bulkMove(moveAction, tickets, config);
      const moveTime = performance.now() - start;

      expect(result.moved).toBe(200);
      expect(result.blocked).toHaveLength(0);
      expect(moveTime).toBeLessThan(500); // should be well under 500ms

      // Bulk assign all to ironcraft
      const assignStart = performance.now();
      const assignAction: BulkTicketAction = {
        ids: tickets.map((t) => t.id),
        assigneeId: "ironcraft",
      };
      const assigned = bulkAssign(assignAction, tickets);
      const assignTime = performance.now() - assignStart;

      expect(assigned).toBe(200);
      expect(assignTime).toBeLessThan(500);

      // Dispatch 200 tickets
      const employees = Array.from({ length: 10 }, (_, i) =>
        makeEmployee({ name: `emp-${i}`, department: "dev" }),
      );

      const dispatchStart = performance.now();
      for (const ticket of tickets) {
        dispatch(ticket, config, employees);
      }
      const dispatchTime = performance.now() - dispatchStart;
      expect(dispatchTime).toBeLessThan(1000);
    });

    it("handles 100+ tickets in board I/O", () => {
      const tickets: KanbanTicket[] = Array.from({ length: 150 }, (_, i) =>
        makeTicket({ id: `io-${i}`, status: "todo" }),
      );

      writeBoardJson("dev", tickets);

      const start = performance.now();
      const { boards, allTickets } = loadAllBoards();
      const loadTime = performance.now() - start;

      expect(allTickets).toHaveLength(150);
      expect(loadTime).toBeLessThan(500);

      // Persist back
      const persistStart = performance.now();
      persistBoards(boards);
      const persistTime = performance.now() - persistStart;
      expect(persistTime).toBeLessThan(500);
    });

    it("validates transitions for 500 operations", () => {
      const config = reloadKanbanConfig();
      const statuses = ["backlog", "todo", "in-progress", "review", "done"];

      const start = performance.now();
      for (let i = 0; i < 500; i++) {
        const from = statuses[i % statuses.length];
        const to = statuses[(i + 1) % statuses.length];
        validateTransition(from, to, config);
      }
      const validationTime = performance.now() - start;
      expect(validationTime).toBeLessThan(200);
    });
  });
});
