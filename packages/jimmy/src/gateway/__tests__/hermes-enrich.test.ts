/**
 * Tests unitaires pour enrichWithHermesData() — api.ts
 *
 * Vérifie les deux shapes de transportMeta acceptées par la fonction :
 *   1. transportMeta.hermesMeta.hermesSessionId  (HermesEngine direct write)
 *   2. transportMeta.routingMeta.hermesRuntimeMeta.hermesSessionId  (routing meta shape)
 *
 * Stratégie : mock HermesDataConnector + HermesWebAPIClient.getSession()
 * sans réseau ni filesystem.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "../../shared/types.js";
import type { HermesSession } from "../../connectors/hermes/client.js";

// ── Mock du module connectors/hermes/index.js ─────────────────────────────────

vi.mock("../../connectors/hermes/index.js", () => ({
  HermesDataConnector: vi.fn(),
}));

// ── Import de la fonction testée (après le mock) ──────────────────────────────

const { enrichWithHermesData } = await import("../api.js");

// ── Factories ─────────────────────────────────────────────────────────────────

/** Session Jinn minimale — seuls les champs utiles à enrichWithHermesData sont requis. */
function makeSession(transportMeta: Record<string, unknown> | null = null): Session {
  return {
    id: "sess-1",
    engine: "hermes",
    engineSessionId: null,
    source: "web",
    sourceRef: "",
    connector: null,
    sessionKey: "key-1",
    replyContext: null,
    messageId: null,
    transportMeta: transportMeta as Session["transportMeta"],
    employee: null,
    model: null,
    title: null,
    parentSessionId: null,
    status: "idle",
    effortLevel: null,
    totalCost: 0,
    totalTurns: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActivity: "2026-01-01T00:00:00.000Z",
    lastError: null,
  };
}

/** Réponse HermesSession minimale retournée par getSession() */
const HERMES_SESSION_STUB: HermesSession = {
  id: "hermes-session-abc",
  source: "cli",
  model: "claude-sonnet-4",
  parentSessionId: null,
  startedAt: 1700000000.0,
  endedAt: 1700001000.0,
  endReason: "stop",
  messageCount: 4,
  toolCallCount: 2,
  inputTokens: 800,
  outputTokens: 200,
  title: "Test session",
};

/** Crée un HermesDataConnector mocké avec getSession() configuré. */
function makeConnector(
  getSessionImpl: () => Promise<HermesSession> = () => Promise.resolve(HERMES_SESSION_STUB),
) {
  const mockClient = {
    getSession: vi.fn(getSessionImpl),
  };
  return {
    isHealthy: vi.fn(() => true),
    getClient: vi.fn(() => mockClient),
    _mockClient: mockClient,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("enrichWithHermesData()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Shape 1 : hermesMeta.hermesSessionId ──────────────────────────────────

  describe("shape hermesMeta.hermesSessionId", () => {
    it("enrichit la session avec les données Hermes", async () => {
      const connector = makeConnector();
      const session = makeSession({
        hermesMeta: { hermesSessionId: "hermes-session-abc" },
      });

      const result = await enrichWithHermesData(session, connector as any);

      expect(result.hermesData).toBeDefined();
      expect(result.hermesData?.hermesSessionId).toBe("hermes-session-abc");
      expect(result.hermesData?.model).toBe("claude-sonnet-4");
      expect(result.hermesData?.inputTokens).toBe(800);
      expect(result.hermesData?.outputTokens).toBe(200);
      expect(result.hermesData?.toolCallCount).toBe(2);
      expect(result.hermesData?.messageCount).toBe(4);
      expect(result.hermesData?.startedAt).toBe(1700000000.0);
      expect(result.hermesData?.endedAt).toBe(1700001000.0);

      expect(connector._mockClient.getSession).toHaveBeenCalledWith("hermes-session-abc");
    });

    it("ne modifie pas les autres champs de la session", async () => {
      const connector = makeConnector();
      const session = makeSession({
        hermesMeta: { hermesSessionId: "hermes-session-abc" },
      });

      const result = await enrichWithHermesData(session, connector as any);

      expect(result.id).toBe(session.id);
      expect(result.engine).toBe(session.engine);
      expect(result.transportMeta).toStrictEqual(session.transportMeta);
    });
  });

  // ── Shape 2 : routingMeta.hermesRuntimeMeta.hermesSessionId ──────────────

  describe("shape routingMeta.hermesRuntimeMeta.hermesSessionId", () => {
    it("enrichit la session depuis routingMeta", async () => {
      const connector = makeConnector();
      const session = makeSession({
        routingMeta: {
          hermesRuntimeMeta: { hermesSessionId: "hermes-session-abc" },
          engine: "hermes",
        },
      });

      const result = await enrichWithHermesData(session, connector as any);

      expect(result.hermesData).toBeDefined();
      expect(result.hermesData?.hermesSessionId).toBe("hermes-session-abc");
      expect(connector._mockClient.getSession).toHaveBeenCalledWith("hermes-session-abc");
    });
  });

  // ── Shape 1 prioritaire sur Shape 2 ──────────────────────────────────────

  it("préfère hermesMeta quand les deux shapes sont présentes", async () => {
    const connector = makeConnector();
    const session = makeSession({
      hermesMeta: { hermesSessionId: "from-hermes-meta" },
      routingMeta: {
        hermesRuntimeMeta: { hermesSessionId: "from-routing-meta" },
      },
    });

    await enrichWithHermesData(session, connector as any);

    expect(connector._mockClient.getSession).toHaveBeenCalledWith("from-hermes-meta");
  });

  // ── Dégradation gracieuse ─────────────────────────────────────────────────

  describe("graceful degradation", () => {
    it("retourne la session inchangée si transportMeta est null", async () => {
      const connector = makeConnector();
      const session = makeSession(null);

      const result = await enrichWithHermesData(session, connector as any);

      expect(result.hermesData).toBeUndefined();
      expect(connector._mockClient.getSession).not.toHaveBeenCalled();
    });

    it("retourne la session inchangée si aucun hermesSessionId trouvé", async () => {
      const connector = makeConnector();
      const session = makeSession({ someOtherKey: "value" });

      const result = await enrichWithHermesData(session, connector as any);

      expect(result.hermesData).toBeUndefined();
      expect(connector._mockClient.getSession).not.toHaveBeenCalled();
    });

    it("retourne la session inchangée si connector est null", async () => {
      const session = makeSession({
        hermesMeta: { hermesSessionId: "hermes-session-abc" },
      });

      const result = await enrichWithHermesData(session, null);

      expect(result.hermesData).toBeUndefined();
    });

    it("retourne la session inchangée si connector.isHealthy() est false", async () => {
      const connector = makeConnector();
      connector.isHealthy.mockReturnValue(false);
      const session = makeSession({
        hermesMeta: { hermesSessionId: "hermes-session-abc" },
      });

      const result = await enrichWithHermesData(session, connector as any);

      expect(result.hermesData).toBeUndefined();
      expect(connector._mockClient.getSession).not.toHaveBeenCalled();
    });

    it("retourne la session inchangée si getSession() lève une erreur", async () => {
      const connector = makeConnector(() => Promise.reject(new Error("Hermes down")));
      const session = makeSession({
        hermesMeta: { hermesSessionId: "hermes-session-abc" },
      });

      const result = await enrichWithHermesData(session, connector as any);

      expect(result.hermesData).toBeUndefined();
    });
  });
});
