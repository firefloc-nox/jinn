/**
 * Tests unitaires pour HermesWebAPIClient.
 *
 * Stratégie : mock node:http pour contrôler les réponses sans réseau réel.
 * Les tests couvrent :
 *  - checkHealth → graceful degradation quand Hermes est down
 *  - getSessions → mapping snake_case → camelCase
 *  - getSession → parsing du champ session
 *  - getMemory → mapping targets
 *  - parseSSEStream → parsing des événements SSE
 *  - conversions de timestamps Unix float
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// ── Mock node:http ────────────────────────────────────────────────────────────

const mockRequest = vi.fn();
const mockReq = {
  on: vi.fn(),
  write: vi.fn(),
  end: vi.fn(),
  setTimeout: vi.fn(),
  destroy: vi.fn(),
};

vi.mock("node:http", () => ({
  default: {
    request: mockRequest,
  },
}));

// ── Helpers pour simuler une réponse HTTP ─────────────────────────────────────

/**
 * Crée un faux objet IncomingMessage à partir d'un body JSON et d'un statusCode.
 */
function makeResponse(body: unknown, statusCode = 200): EventEmitter & { statusCode: number } {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;

  // Émettre les données asynchronement pour simuler une vraie réponse
  setTimeout(() => {
    res.emit("data", Buffer.from(JSON.stringify(body)));
    res.emit("end");
  }, 0);

  return res;
}

/**
 * Configure mockRequest pour retourner une réponse donnée.
 */
function mockHttpResponse(body: unknown, statusCode = 200): void {
  mockRequest.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
    callback(makeResponse(body, statusCode));
    return mockReq;
  });
}

/**
 * Configure mockRequest pour simuler une erreur réseau.
 */
function mockHttpError(message: string): void {
  mockRequest.mockImplementation((_opts: unknown, _callback: unknown) => {
    setTimeout(() => {
      (mockReq.on.mock.calls as unknown[][])
        .filter((args) => args[0] === "error")
        .forEach((args) => (args[1] as (err: Error) => void)(new Error(message)));
    }, 0);
    return mockReq;
  });
}

// ── Import après les mocks ────────────────────────────────────────────────────

const { HermesWebAPIClient } = await import("../client.js");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("HermesWebAPIClient", () => {
  let client: InstanceType<typeof HermesWebAPIClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq.on.mockReturnThis();
    client = new HermesWebAPIClient(8642, "127.0.0.1");
  });

  // ── checkHealth ─────────────────────────────────────────────────────────────

  describe("checkHealth", () => {
    it("retourne true quand Hermes répond {status: 'ok'}", async () => {
      mockHttpResponse({ status: "ok" });
      const result = await client.checkHealth();
      expect(result).toBe(true);
      expect(client.healthy).toBe(true);
    });

    it("retourne false et ne lève pas d'erreur quand Hermes est down (erreur réseau)", async () => {
      mockHttpError("ECONNREFUSED");
      const result = await client.checkHealth();
      expect(result).toBe(false);
      expect(client.healthy).toBe(false);
    });

    it("retourne false quand le status n'est pas 'ok'", async () => {
      mockHttpResponse({ status: "degraded" });
      const result = await client.checkHealth();
      expect(result).toBe(false);
    });
  });

  // ── getSessions ─────────────────────────────────────────────────────────────

  describe("getSessions", () => {
    it("mappe snake_case → camelCase correctement", async () => {
      const rawSession = {
        id: "20260331_125200_695b3c",
        source: "cli",
        model: "claude-sonnet-4-6",
        parent_session_id: null,
        started_at: 1774954323.385511,
        ended_at: 1774954692.80996,
        end_reason: "cli_close",
        message_count: 39,
        tool_call_count: 15,
        input_tokens: 29,
        output_tokens: 2002,
        title: null,
        system_prompt: "You are Lain",
      };

      mockHttpResponse({ items: [rawSession], total: 1 });
      const result = await client.getSessions();

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);

      const s = result.items[0];
      expect(s.id).toBe("20260331_125200_695b3c");
      expect(s.source).toBe("cli");
      expect(s.model).toBe("claude-sonnet-4-6");
      expect(s.parentSessionId).toBeNull();
      // Timestamps Unix float préservés tels quels
      expect(s.startedAt).toBeCloseTo(1774954323.385511);
      expect(s.endedAt).toBeCloseTo(1774954692.80996);
      expect(s.endReason).toBe("cli_close");
      expect(s.messageCount).toBe(39);
      expect(s.toolCallCount).toBe(15);
      expect(s.inputTokens).toBe(29);
      expect(s.outputTokens).toBe(2002);
      expect(s.title).toBeNull();
      expect(s.systemPrompt).toBe("You are Lain");
    });

    it("passe les query params limit/offset/source dans l'URL", async () => {
      mockHttpResponse({ items: [], total: 0 });
      await client.getSessions({ limit: 10, offset: 5, source: "cli" });

      const callPath = (mockRequest.mock.calls[0][0] as { path: string }).path;
      expect(callPath).toContain("limit=10");
      expect(callPath).toContain("offset=5");
      expect(callPath).toContain("source=cli");
    });

    it("lève une erreur quand Hermes retourne un code 4xx", async () => {
      mockHttpResponse({ error: "Internal error" }, 500);
      await expect(client.getSessions()).rejects.toThrow("Internal error");
    });
  });

  // ── getSession ──────────────────────────────────────────────────────────────

  describe("getSession", () => {
    it("retourne la session depuis le champ 'session'", async () => {
      mockHttpResponse({
        session: {
          id: "abc123",
          source: "web",
          model: null,
          parent_session_id: null,
          started_at: 1700000000,
          ended_at: null,
          end_reason: null,
          message_count: 5,
          tool_call_count: 0,
          input_tokens: 100,
          output_tokens: 200,
          title: "Test session",
        },
      });

      const s = await client.getSession("abc123");
      expect(s.id).toBe("abc123");
      expect(s.title).toBe("Test session");
      expect(s.endedAt).toBeNull();
    });
  });

  // ── getMemory ───────────────────────────────────────────────────────────────

  describe("getMemory", () => {
    it("mappe les deux targets correctement", async () => {
      mockHttpResponse({
        targets: [
          {
            target: "memory",
            entries: ["entry1", "entry2"],
            usage: "100% — 2475/2200 chars",
            entry_count: 2,
          },
          {
            target: "user",
            entries: ["user fact 1"],
            usage: "99% — 1371/1375 chars",
            entry_count: 1,
          },
        ],
      });

      const mem = await client.getMemory();
      expect(mem.memory.entries).toEqual(["entry1", "entry2"]);
      expect(mem.memory.entryCount).toBe(2);
      expect(mem.memory.usage).toBe("100% — 2475/2200 chars");
      expect(mem.user.entries).toEqual(["user fact 1"]);
      expect(mem.user.entryCount).toBe(1);
    });

    it("retourne des targets vides si absentes de la réponse", async () => {
      mockHttpResponse({ targets: [] });
      const mem = await client.getMemory();
      expect(mem.memory.entries).toEqual([]);
      expect(mem.user.entries).toEqual([]);
    });
  });

  // ── getModels ───────────────────────────────────────────────────────────────

  describe("getModels", () => {
    it("retourne la liste des modèles depuis /v1/models", async () => {
      mockHttpResponse({
        object: "list",
        data: [
          { id: "claude-sonnet-4-6", object: "model", owned_by: "anthropic" },
          { id: "claude-opus-4", object: "model", owned_by: "anthropic" },
        ],
      });

      const models = await client.getModels();
      expect(models.data).toHaveLength(2);
      expect(models.data[0].id).toBe("claude-sonnet-4-6");
      expect(models.object).toBe("list");
    });
  });

  // ── Graceful degradation ────────────────────────────────────────────────────

  describe("graceful degradation", () => {
    it("getSessions lève une erreur explicite quand Hermes est down", async () => {
      mockHttpError("ECONNREFUSED 127.0.0.1:8642");
      await expect(client.getSessions()).rejects.toThrow("ECONNREFUSED");
    });

    it("getMemory lève une erreur explicite quand Hermes est down", async () => {
      mockHttpError("connect ECONNREFUSED");
      await expect(client.getMemory()).rejects.toThrow("connect ECONNREFUSED");
    });

    it("checkHealth ne lève jamais d'erreur même sur ECONNREFUSED", async () => {
      mockHttpError("ECONNREFUSED");
      await expect(client.checkHealth()).resolves.toBe(false);
    });
  });

  // ── Conversion timestamps ───────────────────────────────────────────────────

  describe("conversion timestamps Unix float", () => {
    it("préserve la précision du timestamp Unix float started_at", async () => {
      const ts = 1774954323.385511;
      mockHttpResponse({
        items: [{
          id: "x",
          source: "cli",
          model: null,
          parent_session_id: null,
          started_at: ts,
          ended_at: null,
          end_reason: null,
          message_count: 0,
          tool_call_count: 0,
          input_tokens: 0,
          output_tokens: 0,
          title: null,
        }],
        total: 1,
      });

      const result = await client.getSessions();
      expect(result.items[0].startedAt).toBeCloseTo(ts, 3);
    });

    it("retourne null pour ended_at quand session en cours", async () => {
      mockHttpResponse({
        session: {
          id: "running",
          source: "cli",
          model: null,
          parent_session_id: null,
          started_at: 1700000000,
          ended_at: null,
          end_reason: null,
          message_count: 1,
          tool_call_count: 0,
          input_tokens: 10,
          output_tokens: 20,
          title: null,
        },
      });

      const s = await client.getSession("running");
      expect(s.endedAt).toBeNull();
    });
  });
});

// ── Tests SSE parser ──────────────────────────────────────────────────────────

describe("SSE parsing (via chatStream mock)", () => {
  /**
   * On teste le parsing SSE en créant un faux stream de chunks
   * qui simule ce que Hermes envoie réellement.
   */
  it("parse correctement un bloc SSE complet", async () => {
    const sseData = [
      'event: session.created\n',
      'data: {"session_id":"sid1","run_id":"run1","seq":0,"title":null,"model":"claude-sonnet-4-6"}\n',
      '\n',
      'event: assistant.delta\n',
      'data: {"session_id":"sid1","run_id":"run1","seq":1,"message_id":"msg1","delta":"Hello"}\n',
      '\n',
      'event: run.ended\n',
      'data: {"session_id":"sid1","run_id":"run1","seq":2,"end_reason":"stop","output_tokens":5}\n',
      '\n',
    ];

    // Simuler un IncomingMessage qui émet les chunks SSE
    const fakeStream = new EventEmitter() as EventEmitter & {
      statusCode: number;
      [Symbol.asyncIterator](): AsyncIterator<Buffer>;
    };
    fakeStream.statusCode = 200;
    fakeStream[Symbol.asyncIterator] = async function* () {
      for (const chunk of sseData) {
        yield Buffer.from(chunk);
      }
    };

    mockRequest.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
      // Appeler callback avec la fausse réponse SSE
      callback(fakeStream);
      return {
        on: vi.fn().mockReturnThis(),
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: vi.fn(),
        destroy: vi.fn(),
      };
    });

    const { HermesWebAPIClient: Client } = await import("../client.js");
    const c = new Client(8642, "127.0.0.1");
    // Forcer healthy pour éviter le 503
    (c as unknown as { healthy: boolean }).healthy = true;

    const stream = await c.chatStream("test-session", "Hello");
    const events: Array<{ event: string; data: unknown }> = [];

    for await (const evt of stream) {
      events.push(evt);
    }

    expect(events).toHaveLength(3);
    expect(events[0].event).toBe("session.created");
    expect((events[0].data as Record<string, unknown>).session_id).toBe("sid1");
    expect(events[1].event).toBe("assistant.delta");
    expect((events[1].data as Record<string, unknown>).delta).toBe("Hello");
    expect(events[2].event).toBe("run.ended");
    expect((events[2].data as Record<string, unknown>).end_reason).toBe("stop");
  });

  it("ignore les blocs SSE vides et les commentaires", async () => {
    const sseData = [
      ': keepalive\n\n',
      '\n',
      'event: assistant.delta\n',
      'data: {"session_id":"s","run_id":"r","seq":0,"delta":"Hi"}\n',
      '\n',
    ];

    const fakeStream = new EventEmitter() as EventEmitter & {
      statusCode: number;
      [Symbol.asyncIterator](): AsyncIterator<Buffer>;
    };
    fakeStream.statusCode = 200;
    fakeStream[Symbol.asyncIterator] = async function* () {
      for (const chunk of sseData) {
        yield Buffer.from(chunk);
      }
    };

    mockRequest.mockImplementation((_opts: unknown, callback: (res: unknown) => void) => {
      callback(fakeStream);
      return {
        on: vi.fn().mockReturnThis(),
        write: vi.fn(),
        end: vi.fn(),
        setTimeout: vi.fn(),
        destroy: vi.fn(),
      };
    });

    const { HermesWebAPIClient: Client } = await import("../client.js");
    const c = new Client(8642, "127.0.0.1");

    const stream = await c.chatStream("session", "msg");
    const events: unknown[] = [];
    for await (const evt of stream) {
      events.push(evt);
    }

    // Seul le delta valide doit passer
    expect(events).toHaveLength(1);
    expect((events[0] as { event: string }).event).toBe("assistant.delta");
  });
});
