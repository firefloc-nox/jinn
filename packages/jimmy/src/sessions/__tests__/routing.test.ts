/**
 * Routing test — SessionManager hermes-first routing via FallbackPolicy.
 *
 * Strategy: mock all heavy dependencies (SQLite registry, logger, context, MCP, etc.)
 * and focus on the routing decision:
 *   - Hermes engine is selected by default (primary brain)
 *   - Fallback is triggered when Hermes is not registered
 *   - BrainRoutingMeta is written into transportMeta after engine.run()
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Engine, EngineResult, Connector, IncomingMessage, Session, JinnConfig } from "../../shared/types.js";

// ─── Mock all heavy module dependencies ──────────────────────────────────────

vi.mock("../registry.js", () => ({
  getSessionBySessionKey: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
  deleteSession: vi.fn(),
  getMessages: vi.fn(() => []),
  insertMessage: vi.fn(),
  accumulateSessionCost: vi.fn(),
}));

vi.mock("../callbacks.js", () => ({
  notifyParentSession: vi.fn(),
  notifyRateLimited: vi.fn(),
  notifyRateLimitResumed: vi.fn(),
  notifyDiscordChannel: vi.fn(),
}));

vi.mock("../context.js", () => ({
  buildContext: vi.fn(() => "mock system prompt"),
}));

vi.mock("../queue.js", () => {
  const mockEnqueue = vi.fn((_key: string, fn: () => Promise<void>) => fn());
  const mockIsRunning = vi.fn(() => false);
  function SessionQueue(this: any) {
    this.enqueue = mockEnqueue;
    this.isRunning = mockIsRunning;
  }
  return { SessionQueue };
});

vi.mock("../../shared/paths.js", () => ({
  JINN_HOME: "/mock/jinn",
}));

vi.mock("../../shared/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../shared/effort.js", () => ({
  resolveEffort: vi.fn(() => "medium"),
}));

vi.mock("../../shared/rateLimit.js", () => ({
  computeNextRetryDelayMs: vi.fn(() => 0),
  computeRateLimitDeadlineMs: vi.fn(() => 0),
  detectRateLimit: vi.fn(() => null),
  isDeadSessionError: vi.fn(() => false),
}));

vi.mock("../../shared/usageAwareness.js", () => ({
  getClaudeExpectedResetAt: vi.fn(() => null),
  isLikelyNearClaudeUsageLimit: vi.fn(() => false),
  recordClaudeRateLimit: vi.fn(),
}));

vi.mock("../../cron/jobs.js", () => ({
  loadJobs: vi.fn(() => []),
}));

vi.mock("../../cron/scheduler.js", () => ({
  setCronJobEnabled: vi.fn(),
  triggerCronJob: vi.fn(),
}));

vi.mock("../../gateway/budgets.js", () => ({
  checkBudget: vi.fn(() => "ok"),
}));

vi.mock("../../mcp/resolver.js", () => ({
  resolveMcpServers: vi.fn(() => ({ mcpServers: {} })),
  writeMcpConfigFile: vi.fn(() => "/tmp/mcp.json"),
  cleanupMcpConfigFile: vi.fn(),
}));

vi.mock("../../engines/capabilities.js", () => ({
  getCapabilities: vi.fn((name: string) => ({
    streaming: false,
    costTracking: false,
    mcpNative: name === "hermes",
    sessionResume: name === "hermes",
    interruptible: true,
  })),
}));

vi.mock("../../hermes/profile-mapper.js", () => ({
  mapEmployeeToHermesInput: vi.fn(() => ({})),
  hermesRunInputToOpts: vi.fn(() => ({})),
}));

// Dynamic imports inside runSession
vi.mock("../../gateway/org.js", () => ({
  scanOrg: vi.fn(() => ({ employees: {}, departments: {} })),
}));

vi.mock("../../gateway/org-hierarchy.js", () => ({
  resolveOrgHierarchy: vi.fn(() => ({ root: null, departments: [], warnings: [] })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { SessionManager } from "../manager.js";
import {
  getSessionBySessionKey,
  createSession,
  updateSession,
  insertMessage,
} from "../registry.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-001",
    engine: "hermes",
    engineSessionId: null,
    source: "api",
    sourceRef: "api:test",
    connector: null,
    sessionKey: "test-session-key",
    replyContext: { channel: "C123" },
    messageId: null,
    transportMeta: null,
    employee: null,
    model: null,
    title: null,
    parentSessionId: null,
    status: "idle",
    effortLevel: null,
    totalCost: 0,
    totalTurns: 0,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
    lastError: null,
    prompt: null,
    portalName: null,
    ...overrides,
  } as Session;
}

function makeIncomingMessage(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    text: "Hello Hermes",
    sessionKey: "test-session-key",
    source: "api",
    connector: "slack",
    channel: "C123",
    thread: null,
    user: "U001",
    replyContext: { channel: "C123" },
    messageId: "MSG001",
    transportMeta: {},
    attachments: [],
    ...overrides,
  } as IncomingMessage;
}

function makeConnector(): Connector {
  return {
    name: "slack",
    getCapabilities: vi.fn(() => ({
      reactions: false,
      threads: true,
      attachments: false,
      typing: false,
    })),
    replyMessage: vi.fn(() => Promise.resolve()),
    addReaction: vi.fn(() => Promise.resolve()),
    removeReaction: vi.fn(() => Promise.resolve()),
    reconstructTarget: vi.fn(() => ({ channel: "C123" })),
  } as unknown as Connector;
}

function makeEngineResult(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    sessionId: "hermes-sess-abc",
    result: "Hello from Hermes",
    durationMs: 500,
    numTurns: 1,
    hermesMeta: {
      hermesSessionId: "hermes-sess-abc",
      providerUsed: "anthropic",
      modelUsed: "claude-sonnet-4-5",
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<JinnConfig> = {}): JinnConfig {
  return {
    gateway: { port: 7777, host: "127.0.0.1" },
    engines: {
      default: "hermes",
      claude: { bin: "claude", model: "claude-sonnet-4-5" },
      codex: { bin: "codex", model: "gpt-4o" },
      hermes: { bin: "hermes", model: "claude-sonnet-4-5" },
    },
    connectors: {},
    logging: { file: false, stdout: true, level: "info" },
    ...overrides,
  } as JinnConfig;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SessionManager — Hermes-first routing", () => {
  let hermesRun: ReturnType<typeof vi.fn>;
  let claudeRun: ReturnType<typeof vi.fn>;
  let hermesEngine: Engine;
  let claudeEngine: Engine;
  let config: JinnConfig;
  let connector: Connector;

  beforeEach(() => {
    vi.clearAllMocks();

    hermesRun = vi.fn(() => Promise.resolve(makeEngineResult()));
    claudeRun = vi.fn(() => Promise.resolve(makeEngineResult({ sessionId: "claude-sess-xyz", result: "Hello from Claude" })));

    hermesEngine = { name: "hermes", run: hermesRun as unknown as Engine["run"] };
    claudeEngine = { name: "claude", run: claudeRun as unknown as Engine["run"] };

    config = makeConfig();
    connector = makeConnector();

    // Default: session doesn't exist yet → will be created
    vi.mocked(getSessionBySessionKey).mockReturnValue(undefined);
    vi.mocked(createSession).mockReturnValue(makeSession());
    vi.mocked(updateSession).mockImplementation((_id, changes) =>
      makeSession(changes as Partial<Session>),
    );
  });

  describe("normal session → routed via Hermes", () => {
    it("should call HermesEngine.run() when hermes is registered", async () => {
      const engines = new Map<string, Engine>([["hermes", hermesEngine], ["claude", claudeEngine]]);
      const manager = new SessionManager(config, engines);

      await manager.route(makeIncomingMessage(), connector);

      expect(hermesRun).toHaveBeenCalledOnce();
      expect(claudeRun).not.toHaveBeenCalled();
    });

    it("should pass correct prompt to engine.run()", async () => {
      const engines = new Map<string, Engine>([["hermes", hermesEngine]]);
      const manager = new SessionManager(config, engines);
      const msg = makeIncomingMessage({ text: "What is the capital of France?" });

      await manager.route(msg, connector);

      const runOpts = hermesRun.mock.calls[0][0];
      expect(runOpts.prompt).toBe("What is the capital of France?");
    });

    it("should insert user message before calling engine.run()", async () => {
      const engines = new Map<string, Engine>([["hermes", hermesEngine]]);
      const manager = new SessionManager(config, engines);

      await manager.route(makeIncomingMessage(), connector);

      expect(vi.mocked(insertMessage)).toHaveBeenCalledWith(
        expect.any(String),
        "user",
        expect.any(String),
      );
    });
  });

  describe("BrainRoutingMeta present in result", () => {
    it("should write routingMeta to transportMeta after engine.run()", async () => {
      const engines = new Map<string, Engine>([["hermes", hermesEngine], ["claude", claudeEngine]]);
      const manager = new SessionManager(config, engines);

      await manager.route(makeIncomingMessage(), connector);

      // updateSession should have been called with routingMeta
      const updateCalls = vi.mocked(updateSession).mock.calls;
      const metaCalls = updateCalls.filter(
        ([, changes]) =>
          changes &&
          typeof changes === "object" &&
          "transportMeta" in changes &&
          (changes as any).transportMeta?.routingMeta,
      );
      expect(metaCalls.length).toBeGreaterThan(0);

      const routingMeta = (metaCalls[0][1] as any).transportMeta.routingMeta;
      expect(routingMeta.requestedBrain).toBe("hermes");
      expect(routingMeta.actualExecutor).toBe("hermes");
      expect(routingMeta.fallbackUsed).toBe(false);
    });

    it("should write hermesMeta to transportMeta when Hermes engine runs", async () => {
      const engines = new Map<string, Engine>([["hermes", hermesEngine]]);
      const manager = new SessionManager(config, engines);

      await manager.route(makeIncomingMessage(), connector);

      const updateCalls = vi.mocked(updateSession).mock.calls;
      const metaCalls = updateCalls.filter(
        ([, changes]) =>
          changes &&
          typeof changes === "object" &&
          "transportMeta" in changes &&
          (changes as any).transportMeta?.hermesMeta,
      );
      expect(metaCalls.length).toBeGreaterThan(0);

      const hermesMeta = (metaCalls[0][1] as any).transportMeta.hermesMeta;
      expect(hermesMeta.hermesSessionId).toBe("hermes-sess-abc");
      expect(hermesMeta.providerUsed).toBe("anthropic");
    });
  });

  describe("HermesEngine.run() failure → fallback triggered", () => {
    it("should use claude when hermes is not registered in engines map", async () => {
      // Hermes not in engines — only claude available
      const session = makeSession({ engine: "hermes" }); // session wants hermes
      vi.mocked(getSessionBySessionKey).mockReturnValue(undefined);
      vi.mocked(createSession).mockReturnValue(session);
      vi.mocked(updateSession).mockReturnValue(session);

      const engines = new Map<string, Engine>([["claude", claudeEngine]]);
      const manager = new SessionManager(config, engines);

      await manager.route(makeIncomingMessage(), connector);

      // Claude should have been called as fallback
      expect(claudeRun).toHaveBeenCalledOnce();
      expect(hermesRun).not.toHaveBeenCalled();
    });

    it("should record fallbackUsed=true in routingMeta when fallback triggered", async () => {
      const session = makeSession({ engine: "hermes" });
      vi.mocked(createSession).mockReturnValue(session);
      vi.mocked(updateSession).mockReturnValue(session);

      // Only claude available — hermes not registered
      const engines = new Map<string, Engine>([["claude", claudeEngine]]);
      const manager = new SessionManager(config, engines);

      await manager.route(makeIncomingMessage(), connector);

      const updateCalls = vi.mocked(updateSession).mock.calls;
      const metaCalls = updateCalls.filter(
        ([, changes]) =>
          changes &&
          typeof changes === "object" &&
          "transportMeta" in changes &&
          (changes as any).transportMeta?.routingMeta,
      );
      expect(metaCalls.length).toBeGreaterThan(0);

      const routingMeta = (metaCalls[0][1] as any).transportMeta.routingMeta;
      expect(routingMeta.requestedBrain).toBe("hermes");
      expect(routingMeta.actualExecutor).toBe("claude");
      expect(routingMeta.fallbackUsed).toBe(true);
      expect(routingMeta.fallbackReason).toContain("hermes");
    });

    it("should use config.brain policy when set, overriding DEFAULT_FALLBACK_POLICY", async () => {
      const customBrainConfig: JinnConfig = makeConfig({
        brain: {
          primary: "claude",
          fallbacks: ["codex"],
          fallbackOnUnavailable: true,
          fallbackOnHardFailure: false,
        },
      });

      // Session wants claude (as declared primary in custom brain config)
      const session = makeSession({ engine: "claude" });
      vi.mocked(createSession).mockReturnValue(session);
      vi.mocked(updateSession).mockReturnValue(session);

      const engines = new Map<string, Engine>([["claude", claudeEngine]]);
      const manager = new SessionManager(customBrainConfig, engines);

      await manager.route(makeIncomingMessage(), connector);

      expect(claudeRun).toHaveBeenCalledOnce();
    });
  });

  describe("engine not found after fallback resolution", () => {
    it("should reply with error message when resolved engine is not in engines map", async () => {
      // Both hermes and claude listed in fallbacks but neither is registered
      const session = makeSession({ engine: "hermes" });
      vi.mocked(createSession).mockReturnValue(session);
      vi.mocked(updateSession).mockReturnValue(session);

      const engines = new Map<string, Engine>(); // empty — no engines registered
      const manager = new SessionManager(config, engines);

      await manager.route(makeIncomingMessage(), connector);

      // Should have replied with an error
      expect(vi.mocked(connector.replyMessage)).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("not available"),
      );
    });
  });
});
