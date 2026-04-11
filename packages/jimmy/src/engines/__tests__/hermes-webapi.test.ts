/**
 * Tests pour HermesWebAPITransport et runViaWebAPI.
 *
 * Pattern : mock http.request via vi.mock("node:http").
 * On injecte un faux IncomingMessage (EventEmitter) + faux ClientRequest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock http avant d'importer le module testé
vi.mock("node:http", () => ({
  default: { request: vi.fn() },
  request: vi.fn(),
}));

import http from "node:http";
const mockRequest = vi.mocked(http.request);

import { HermesWebAPITransport, runViaWebAPI } from "../hermes-webapi.js";
import type { EngineRunOpts } from "../../shared/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crée un faux ClientRequest (req) */
function createMockReq() {
  const req = new EventEmitter() as any;
  req.write = vi.fn();
  req.end = vi.fn();
  req.destroy = vi.fn();
  return req;
}

/** Crée un faux IncomingMessage (res) avec statusCode */
function createMockRes(statusCode = 200) {
  const res = new EventEmitter() as any;
  res.statusCode = statusCode;
  res.resume = vi.fn();
  return res;
}

/** Encode un chunk SSE OpenAI (data: JSON) */
function openaiChunk(id: string, content?: string, finishReason?: string | null, usage?: Record<string, number>): string {
  const delta: Record<string, unknown> = {};
  if (content !== undefined) delta.content = content;

  const choice: Record<string, unknown> = { index: 0, delta, finish_reason: finishReason ?? null };
  const obj: Record<string, unknown> = {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "hermes-agent",
    choices: [choice],
  };
  if (usage) obj.usage = usage;
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** Encode le sentinel [DONE] */
function doneLine(): string {
  return "data: [DONE]\n\n";
}

const BASE_OPTS: EngineRunOpts = {
  prompt: "Bonjour",
  cwd: "/tmp",
};

// ---------------------------------------------------------------------------
// Reset du cache de disponibilité avant chaque test
// ---------------------------------------------------------------------------
beforeEach(() => {
  HermesWebAPITransport.invalidateAvailabilityCache();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// isAvailable()
// ---------------------------------------------------------------------------
describe("HermesWebAPITransport.isAvailable()", () => {
  it("retourne true quand /health répond 200", async () => {
    const req = createMockReq();
    const res = createMockRes(200);
    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await transport.isAvailable();
    expect(result).toBe(true);
  });

  it("retourne false quand /health répond 500", async () => {
    const req = createMockReq();
    const res = createMockRes(500);
    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await transport.isAvailable();
    expect(result).toBe(false);
  });

  it("retourne false quand la connexion échoue (ECONNREFUSED)", async () => {
    const req = createMockReq();
    mockRequest.mockImplementationOnce((_opts: any, _cb: any) => {
      // Simule ECONNREFUSED après la prochaine tick
      setTimeout(() => req.emit("error", new Error("ECONNREFUSED")), 0);
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await transport.isAvailable();
    expect(result).toBe(false);
  });

  it("met en cache le résultat pendant 30s", async () => {
    const req = createMockReq();
    const res = createMockRes(200);
    mockRequest.mockImplementation((_opts: any, cb: any) => {
      cb(res);
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    await transport.isAvailable();
    await transport.isAvailable();
    await transport.isAvailable();

    // http.request appelé une seule fois grâce au cache
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("invalidateAvailabilityCache() force un nouveau health check", async () => {
    const req = createMockReq();
    const res = createMockRes(200);
    mockRequest.mockImplementation((_opts: any, cb: any) => {
      cb(res);
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    await transport.isAvailable();
    HermesWebAPITransport.invalidateAvailabilityCache();
    await transport.isAvailable();

    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// chat() — streaming SSE (OpenAI format)
// ---------------------------------------------------------------------------
describe("HermesWebAPITransport.chat()", () => {
  it("agrège les deltas content en résultat", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(
        openaiChunk("chatcmpl-abc", "Bonjour ") +
        openaiChunk("chatcmpl-abc", "monde!") +
        openaiChunk("chatcmpl-abc", undefined, "stop", { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 }) +
        doneLine(),
      ));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const messages = [{ role: "user" as const, content: "Bonjour" }];
    const result = await transport.chat(messages, {});
    expect(result.result).toBe("Bonjour monde!");
    expect(result.completed).toBe(true);
    expect(result.outputTokens).toBe(5);
    expect(result.chatcmplId).toBe("chatcmpl-abc");
  });

  it("appelle onStream pour chaque delta reçu", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(
        openaiChunk("chatcmpl-xyz", "Hello") +
        openaiChunk("chatcmpl-xyz", " World") +
        openaiChunk("chatcmpl-xyz", undefined, "stop") +
        doneLine(),
      ));
      res.emit("end");
      return req;
    });

    const deltas: string[] = [];
    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const messages = [{ role: "user" as const, content: "test" }];
    await transport.chat(messages, {
      onStream: (d) => deltas.push(d.content),
    });

    expect(deltas).toEqual(["Hello", " World"]);
  });

  it("gère les chunks SSE fragmentés (données coupées au milieu d'une ligne)", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      // Fragmenter le payload en 2 chunks
      const full = openaiChunk("chatcmpl-frag", "frag") +
        openaiChunk("chatcmpl-frag", undefined, "stop") +
        doneLine();
      const mid = Math.floor(full.length / 2);
      res.emit("data", Buffer.from(full.slice(0, mid)));
      res.emit("data", Buffer.from(full.slice(mid)));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const messages = [{ role: "user" as const, content: "test" }];
    const result = await transport.chat(messages, {});
    expect(result.result).toBe("frag");
  });

  it("rejette sur HTTP non-200", async () => {
    const req = createMockReq();
    const res = createMockRes(404);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from("Not Found"));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const messages = [{ role: "user" as const, content: "test" }];
    await expect(transport.chat(messages, {})).rejects.toThrow("HTTP 404");
  });

  it("gère le timeout SSE (300s)", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      // Simuler un timeout sur le req
      setTimeout(() => req.emit("timeout"), 0);
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const messages = [{ role: "user" as const, content: "test" }];
    await expect(transport.chat(messages, {})).rejects.toThrow("timed out");
  });
});

// ---------------------------------------------------------------------------
// runViaWebAPI() — fonction utilitaire de haut niveau
// ---------------------------------------------------------------------------
describe("runViaWebAPI()", () => {
  it("envoie les messages et retourne un EngineResult", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(
        openaiChunk("chatcmpl-run1", "OK") +
        openaiChunk("chatcmpl-run1", undefined, "stop", { prompt_tokens: 50, completion_tokens: 1, total_tokens: 51 }) +
        doneLine(),
      ));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await runViaWebAPI(transport, BASE_OPTS, Date.now());

    expect(result.sessionId).toBe("chatcmpl-run1");
    expect(result.result).toBe("OK");
    expect(result.hermesMeta?.hermesSessionId).toBe("chatcmpl-run1");
    // Single call — no session creation
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("inclut systemPrompt dans les messages", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    let capturedBody = "";
    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      req.write = vi.fn((data: string) => { capturedBody += data; });
      cb(res);
      res.emit("data", Buffer.from(
        openaiChunk("chatcmpl-sys", "reply") +
        openaiChunk("chatcmpl-sys", undefined, "stop") +
        doneLine(),
      ));
      res.emit("end");
      return req;
    });

    const opts: EngineRunOpts = {
      ...BASE_OPTS,
      systemPrompt: "You are a helpful assistant.",
    };
    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    await runViaWebAPI(transport, opts, Date.now());

    const parsed = JSON.parse(capturedBody);
    expect(parsed.messages).toHaveLength(2);
    expect(parsed.messages[0].role).toBe("system");
    expect(parsed.messages[0].content).toBe("You are a helpful assistant.");
    expect(parsed.messages[1].role).toBe("user");
    expect(parsed.stream).toBe(true);
    expect(parsed.model).toBe("hermes-agent");
  });

  it("inclut attachments dans le message user", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    let capturedBody = "";
    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      req.write = vi.fn((data: string) => { capturedBody += data; });
      cb(res);
      res.emit("data", Buffer.from(
        openaiChunk("chatcmpl-att", "done") +
        doneLine(),
      ));
      res.emit("end");
      return req;
    });

    const opts: EngineRunOpts = {
      ...BASE_OPTS,
      prompt: "Read this",
      attachments: ["/tmp/file1.txt", "/tmp/file2.md"],
    };
    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    await runViaWebAPI(transport, opts, Date.now());

    const parsed = JSON.parse(capturedBody);
    const userMsg = parsed.messages.find((m: any) => m.role === "user");
    expect(userMsg.content).toContain("file1.txt");
    expect(userMsg.content).toContain("file2.md");
  });

  it("préserve hermesProfile dans hermesMeta", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(
        openaiChunk("chatcmpl-prof", "ok") +
        doneLine(),
      ));
      res.emit("end");
      return req;
    });

    const opts: EngineRunOpts = { ...BASE_OPTS, hermesProfile: "my-agent" };
    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await runViaWebAPI(transport, opts, Date.now());

    expect(result.hermesMeta?.activeProfile).toBe("my-agent");
  });
});
