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

/** Encode un ou plusieurs événements SSE en string. */
function sseEvent(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
// createSession()
// ---------------------------------------------------------------------------
describe("HermesWebAPITransport.createSession()", () => {
  it("retourne l'id de session depuis la réponse JSON", async () => {
    const req = createMockReq();
    const res = createMockRes(201);
    const responseBody = JSON.stringify({ session: { id: "sess_abc123" } });

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(responseBody));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const sessionId = await transport.createSession({ model: "claude-sonnet-4.6" });
    expect(sessionId).toBe("sess_abc123");
  });

  it("accepte aussi id au niveau racine (format alternatif)", async () => {
    const req = createMockReq();
    const res = createMockRes(200);
    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(JSON.stringify({ id: "sess_rootlevel" })));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const id = await transport.createSession({});
    expect(id).toBe("sess_rootlevel");
  });

  it("rejette si HTTP 500", async () => {
    const req = createMockReq();
    const res = createMockRes(500);
    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from("Internal Server Error"));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    await expect(transport.createSession({})).rejects.toThrow("HTTP 500");
  });
});

// ---------------------------------------------------------------------------
// chat() — streaming SSE
// ---------------------------------------------------------------------------
describe("HermesWebAPITransport.chat()", () => {
  it("agrège les deltas assistant.delta en résultat", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      // Émettre les events SSE
      res.emit("data", Buffer.from(sseEvent("session.created", { session_id: "sess_x", run_id: "run_1", seq: 1, title: "t", model: "m" })));
      res.emit("data", Buffer.from(sseEvent("assistant.delta", { session_id: "sess_x", run_id: "run_1", seq: 2, message_id: "msg_1", delta: "Bonjour " })));
      res.emit("data", Buffer.from(sseEvent("assistant.delta", { session_id: "sess_x", run_id: "run_1", seq: 3, message_id: "msg_1", delta: "monde!" })));
      res.emit("data", Buffer.from(sseEvent("run.completed", { session_id: "sess_x", run_id: "run_1", seq: 4, completed: true, api_calls: 2 })));
      res.emit("data", Buffer.from(sseEvent("done", {})));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await transport.chat("sess_x", "Bonjour", {});
    expect(result.result).toBe("Bonjour monde!");
    expect(result.completed).toBe(true);
    expect(result.apiCalls).toBe(2);
    expect(result.hermesSessionId).toBe("sess_x");
  });

  it("appelle onStream pour chaque delta reçu", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(
        sseEvent("assistant.delta", { delta: "Hello" }) +
        sseEvent("assistant.delta", { delta: " World" }) +
        sseEvent("done", {}),
      ));
      res.emit("end");
      return req;
    });

    const deltas: string[] = [];
    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    await transport.chat("sess_y", "test", {
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
      const full = sseEvent("assistant.delta", { delta: "frag" }) + sseEvent("done", {});
      const mid = Math.floor(full.length / 2);
      res.emit("data", Buffer.from(full.slice(0, mid)));
      res.emit("data", Buffer.from(full.slice(mid)));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await transport.chat("sess_z", "test", {});
    expect(result.result).toBe("frag");
  });

  it("rejette sur event error SSE", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(sseEvent("error", { message: "internal failure" })));
      res.emit("data", Buffer.from(sseEvent("done", {})));
      res.emit("end");
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    await expect(transport.chat("sess_err", "test", {})).rejects.toThrow("internal failure");
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
    await expect(transport.chat("sess_404", "test", {})).rejects.toThrow("HTTP 404");
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
    await expect(transport.chat("sess_timeout", "test", {})).rejects.toThrow("timed out");
  });
});

// ---------------------------------------------------------------------------
// runViaWebAPI() — fonction utilitaire de haut niveau
// ---------------------------------------------------------------------------
describe("runViaWebAPI()", () => {
  it("crée une session puis stream si pas de resumeSessionId", async () => {
    const req = createMockReq();
    const resCreate = createMockRes(201);
    const resStream = createMockRes(200);

    let callCount = 0;
    mockRequest.mockImplementation((_opts: any, cb: any) => {
      callCount++;
      if (callCount === 1) {
        // POST /api/sessions
        cb(resCreate);
        resCreate.emit("data", Buffer.from(JSON.stringify({ session: { id: "sess_new" } })));
        resCreate.emit("end");
      } else {
        // POST /chat/stream
        cb(resStream);
        resStream.emit("data", Buffer.from(
          sseEvent("assistant.delta", { delta: "OK" }) +
          sseEvent("run.completed", { completed: true, api_calls: 1 }) +
          sseEvent("done", {}),
        ));
        resStream.emit("end");
      }
      return req;
    });

    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await runViaWebAPI(transport, BASE_OPTS, Date.now());

    expect(result.sessionId).toBe("sess_new");
    expect(result.result).toBe("OK");
    expect(result.hermesMeta?.hermesSessionId).toBe("sess_new");
  });

  it("réutilise une session WebAPI existante (sess_*) sans en créer une nouvelle", async () => {
    const req = createMockReq();
    const res = createMockRes(200);

    mockRequest.mockImplementationOnce((_opts: any, cb: any) => {
      cb(res);
      res.emit("data", Buffer.from(
        sseEvent("assistant.delta", { delta: "resume" }) +
        sseEvent("done", {}),
      ));
      res.emit("end");
      return req;
    });

    const opts: EngineRunOpts = { ...BASE_OPTS, resumeSessionId: "sess_existing" };
    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await runViaWebAPI(transport, opts, Date.now());

    // Une seule requête — le chat/stream, pas de POST /api/sessions
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.sessionId).toBe("sess_existing");
    expect(result.result).toBe("resume");
  });

  it("crée une nouvelle session si resumeSessionId est un ID CLI (non-sess_*)", async () => {
    const req = createMockReq();
    const resCreate = createMockRes(201);
    const resStream = createMockRes(200);

    let callCount = 0;
    mockRequest.mockImplementation((_opts: any, cb: any) => {
      callCount++;
      if (callCount === 1) {
        cb(resCreate);
        resCreate.emit("data", Buffer.from(JSON.stringify({ session: { id: "sess_fresh" } })));
        resCreate.emit("end");
      } else {
        cb(resStream);
        resStream.emit("data", Buffer.from(sseEvent("done", {})));
        resStream.emit("end");
      }
      return req;
    });

    // ID format CLI (pas sess_*)
    const opts: EngineRunOpts = { ...BASE_OPTS, resumeSessionId: "20260331_123456_abc" };
    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    const result = await runViaWebAPI(transport, opts, Date.now());

    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(result.sessionId).toBe("sess_fresh");
  });

  it("encode hermesProfile dans source pour tracking", async () => {
    const req = createMockReq();
    const resCreate = createMockRes(201);
    const resStream = createMockRes(200);

    let capturedBody = "";
    let callCount = 0;
    mockRequest.mockImplementation((reqOpts: any, cb: any) => {
      callCount++;
      if (callCount === 1) {
        // Capturer le body de createSession
        req.write = vi.fn((data: string) => { capturedBody += data; });
        cb(resCreate);
        resCreate.emit("data", Buffer.from(JSON.stringify({ session: { id: "sess_prof" } })));
        resCreate.emit("end");
      } else {
        cb(resStream);
        resStream.emit("data", Buffer.from(sseEvent("done", {})));
        resStream.emit("end");
      }
      return req;
    });

    const opts: EngineRunOpts = { ...BASE_OPTS, hermesProfile: "my-agent" };
    const transport = new HermesWebAPITransport({ host: "127.0.0.1", port: 8642 });
    await runViaWebAPI(transport, opts, Date.now());

    expect(capturedBody).toContain("jinn-my-agent");
  });
});
