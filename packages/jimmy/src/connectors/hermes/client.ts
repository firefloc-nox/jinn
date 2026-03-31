/**
 * HermesWebAPIClient — HTTP client vers la WebAPI Hermes (port 8642).
 *
 * Utilise uniquement node:http — pas de fetch, pas d'axios.
 * Graceful degradation : chaque méthode rejette avec une erreur explicite
 * quand Hermes est indisponible ; l'appelant décide du fallback.
 */

import http from "node:http";
import os from "node:os";
import path from "node:path";

// ─────────────────────────── Types publics ────────────────────────────────

export interface HermesSession {
  id: string;
  source: string;
  model: string | null;
  parentSessionId: string | null;
  startedAt: number;
  endedAt: number | null;
  endReason: string | null;
  messageCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  title: string | null;
  systemPrompt?: string;
}

export interface HermesMessage {
  id: number;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolName: string | null;
  timestamp: number;
  reasoning?: string;
}

export interface HermesSessionList {
  items: HermesSession[];
  total: number;
}

export interface HermesSessionSearchResult {
  items: HermesSession[];
  total: number;
}

export interface HermesSessionCreate {
  model?: string;
  systemPrompt?: string;
  source?: string;
}

export interface HermesMemoryTarget {
  entries: string[];
  usage: string;
  entryCount: number;
}

export interface HermesMemory {
  memory: HermesMemoryTarget;
  user: HermesMemoryTarget;
}

export interface HermesSkill {
  name: string;
  description: string;
  category: string;
}

export interface HermesSkillList {
  skills: HermesSkill[];
  categories: Record<string, string[]>;
  count: number;
}

export interface HermesModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export interface HermesModelList {
  data: HermesModel[];
  object?: string;
}

export interface HermesSSEEvent {
  event: string;
  data: {
    session_id: string;
    run_id: string;
    seq: number;
    delta?: string;
    message_id?: string;
    title?: string;
    model?: string;
    end_reason?: string;
    output_tokens?: number;
    user_message?: { id: string; role: string; content: string };
    message?: string;
  };
}

export interface ChatStreamOpts {
  /** Si fourni, reprend une session Hermes existante plutôt que d'en créer une */
  hermesSessionId?: string;
}

// ─────────────────────────── Helpers internes ─────────────────────────────

/** Convertit un objet de session brut (snake_case) vers HermesSession (camelCase). */
function mapSession(raw: Record<string, unknown>): HermesSession {
  return {
    id: String(raw.id ?? ""),
    source: String(raw.source ?? ""),
    model: raw.model != null ? String(raw.model) : null,
    parentSessionId: raw.parent_session_id != null ? String(raw.parent_session_id) : null,
    startedAt: Number(raw.started_at ?? 0),
    endedAt: raw.ended_at != null ? Number(raw.ended_at) : null,
    endReason: raw.end_reason != null ? String(raw.end_reason) : null,
    messageCount: Number(raw.message_count ?? 0),
    toolCallCount: Number(raw.tool_call_count ?? 0),
    inputTokens: Number(raw.input_tokens ?? 0),
    outputTokens: Number(raw.output_tokens ?? 0),
    title: raw.title != null ? String(raw.title) : null,
    systemPrompt: raw.system_prompt != null ? String(raw.system_prompt) : undefined,
  };
}

/** Convertit un message brut vers HermesMessage. */
function mapMessage(raw: Record<string, unknown>): HermesMessage {
  const role = String(raw.role ?? "user");
  return {
    id: Number(raw.id ?? 0),
    sessionId: String(raw.session_id ?? ""),
    role: (role === "assistant" || role === "tool" ? role : "user") as HermesMessage["role"],
    content: raw.content != null ? String(raw.content) : null,
    toolName: raw.tool_name != null ? String(raw.tool_name) : null,
    timestamp: Number(raw.timestamp ?? 0),
    reasoning: raw.reasoning != null ? String(raw.reasoning) : undefined,
  };
}

// ─────────────────────────── HermesWebAPIClient ───────────────────────────

export class HermesWebAPIClient {
  private readonly baseUrl: string;
  private readonly hostname: string;
  private readonly port: number;
  healthy: boolean = false;

  constructor(port = 8642, host = "127.0.0.1") {
    this.hostname = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}`;
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────

  /** Effectue une requête HTTP et retourne le body parsé en JSON. */
  private request<T>(
    method: string,
    urlPath: string,
    body?: unknown,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const bodyStr = body != null ? JSON.stringify(body) : undefined;
      const options: http.RequestOptions = {
        hostname: this.hostname,
        port: this.port,
        path: urlPath,
        method,
        headers: {
          "Accept": "application/json",
          ...(bodyStr
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyStr),
              }
            : {}),
        },
      };

      const req = http.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode === 204 || raw.trim() === "") {
            resolve(undefined as unknown as T);
            return;
          }
          try {
            const parsed = JSON.parse(raw) as T;
            if (res.statusCode != null && res.statusCode >= 400) {
              const errMsg =
                (parsed as Record<string, unknown>)?.["error"] ??
                `HTTP ${res.statusCode}`;
              reject(new Error(String(errMsg)));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error(`Hermes API: invalid JSON response (status ${res.statusCode})`));
          }
        });
        res.on("error", reject);
      });

      req.on("error", reject);
      req.setTimeout(10_000, () => {
        req.destroy(new Error("Hermes API request timeout"));
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  // ── API methods ───────────────────────────────────────────────────────

  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.request<{ status: string }>("GET", "/health");
      this.healthy = res.status === "ok";
      return this.healthy;
    } catch {
      this.healthy = false;
      return false;
    }
  }

  async getSessions(opts?: {
    limit?: number;
    offset?: number;
    source?: string;
  }): Promise<HermesSessionList> {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.offset != null) params.set("offset", String(opts.offset));
    if (opts?.source) params.set("source", opts.source);
    const qs = params.toString();
    const raw = await this.request<{ items: Record<string, unknown>[]; total: number }>(
      "GET",
      `/api/sessions${qs ? `?${qs}` : ""}`,
    );
    return {
      items: (raw.items ?? []).map(mapSession),
      total: Number(raw.total ?? 0),
    };
  }

  async getSession(id: string): Promise<HermesSession> {
    const raw = await this.request<{ session: Record<string, unknown> }>(
      "GET",
      `/api/sessions/${encodeURIComponent(id)}`,
    );
    return mapSession(raw.session);
  }

  async getMessages(sessionId: string): Promise<HermesMessage[]> {
    const raw = await this.request<{ items: Record<string, unknown>[] }>(
      "GET",
      `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    return (raw.items ?? []).map(mapMessage);
  }

  async searchSessions(q: string, limit?: number): Promise<HermesSessionSearchResult> {
    const params = new URLSearchParams({ q });
    if (limit != null) params.set("limit", String(limit));
    const raw = await this.request<{ items: Record<string, unknown>[]; total: number }>(
      "GET",
      `/api/sessions/search?${params.toString()}`,
    );
    return {
      items: (raw.items ?? []).map(mapSession),
      total: Number(raw.total ?? 0),
    };
  }

  async createSession(data: HermesSessionCreate): Promise<HermesSession> {
    const raw = await this.request<{ session: Record<string, unknown> }>(
      "POST",
      "/api/sessions",
      data,
    );
    return mapSession(raw.session);
  }

  async deleteSession(id: string): Promise<void> {
    await this.request<void>("DELETE", `/api/sessions/${encodeURIComponent(id)}`);
  }

  async getMemory(): Promise<HermesMemory> {
    const raw = await this.request<{
      targets: Array<{
        target: string;
        entries: string[];
        usage: string;
        entry_count: number;
      }>;
    }>("GET", "/api/memory");

    const find = (target: string): HermesMemoryTarget => {
      const t = (raw.targets ?? []).find((x) => x.target === target);
      return {
        entries: t?.entries ?? [],
        usage: t?.usage ?? "",
        entryCount: t?.entry_count ?? 0,
      };
    };

    return {
      memory: find("memory"),
      user: find("user"),
    };
  }

  async updateMemory(
    target: "memory" | "user",
    action: "add" | "replace" | "remove",
    content: string,
    oldText?: string,
  ): Promise<void> {
    const body: Record<string, unknown> = { target, action, content };
    if (oldText != null) body.old_text = oldText;
    await this.request<void>("POST", "/api/memory", body);
  }

  async getSkills(): Promise<HermesSkillList> {
    const raw = await this.request<{
      skills: Array<{ name: string; description: string; category?: string }>;
      categories: Record<string, string[]>;
      count: number;
    }>("GET", "/api/skills");
    return {
      skills: (raw.skills ?? []).map((s) => ({
        name: s.name,
        description: s.description,
        category: s.category ?? "",
      })),
      categories: raw.categories ?? {},
      count: Number(raw.count ?? 0),
    };
  }

  async getModels(): Promise<HermesModelList> {
    const raw = await this.request<{ data: Array<{ id: string; object?: string; owned_by?: string }>; object?: string }>(
      "GET",
      "/v1/models",
    );
    return {
      data: (raw.data ?? []).map((m) => ({
        id: m.id,
        object: m.object,
        owned_by: m.owned_by,
      })),
      object: raw.object,
    };
  }

  /**
   * Ouvre un stream SSE vers Hermes pour une session donnée.
   *
   * Retourne un AsyncIterable d'événements SSE. L'itération se termine
   * quand le stream se ferme (run.ended, erreur réseau, ou déconnexion).
   *
   * IMPORTANT : utilise http.request() avec response chunked — pas de fetch.
   */
  async chatStream(
    sessionId: string,
    message: string,
    opts?: ChatStreamOpts,
  ): Promise<AsyncIterable<HermesSSEEvent>> {
    const body: Record<string, unknown> = { message };
    if (opts?.hermesSessionId) body.hermes_session_id = opts.hermesSessionId;

    const bodyStr = JSON.stringify(body);

    return new Promise<AsyncIterable<HermesSSEEvent>>((resolve, reject) => {
      const options: http.RequestOptions = {
        hostname: this.hostname,
        port: this.port,
        path: `/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
          "Accept": "text/event-stream",
        },
      };

      const req = http.request(options, (res) => {
        if (res.statusCode != null && res.statusCode >= 400) {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const msg = Buffer.concat(chunks).toString("utf-8");
            try {
              const parsed = JSON.parse(msg) as Record<string, unknown>;
              reject(new Error(String(parsed.error ?? `HTTP ${res.statusCode}`)));
            } catch {
              reject(new Error(`Hermes stream error: HTTP ${res.statusCode}`));
            }
          });
          return;
        }

        resolve(parseSSEStream(res));
      });

      req.on("error", reject);
      req.setTimeout(120_000, () => {
        req.destroy(new Error("Hermes stream timeout"));
      });

      req.write(bodyStr);
      req.end();
    });
  }
}

// ── SSE parser ─────────────────────────────────────────────────────────────

/**
 * Transforme un stream HTTP chunked en AsyncIterable d'événements SSE.
 *
 * Format SSE :
 *   event: <name>\n
 *   data: <json>\n
 *   \n
 */
async function* parseSSEStream(
  res: http.IncomingMessage,
): AsyncIterable<HermesSSEEvent> {
  let buffer = "";

  for await (const chunk of res as AsyncIterable<Buffer>) {
    buffer += chunk.toString("utf-8");

    // Traiter tous les blocs complets (délimités par \n\n)
    const blocks = buffer.split("\n\n");
    // Le dernier élément peut être incomplet — le remettre dans le buffer
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const lines = block.split("\n").filter((l) => l.trim() !== "");
      if (lines.length === 0) continue;

      let eventName = "message";
      let dataStr = "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataStr = line.slice(5).trim();
        }
      }

      if (!dataStr) continue;

      try {
        const data = JSON.parse(dataStr) as HermesSSEEvent["data"];
        yield { event: eventName, data };
      } catch {
        // Bloc SSE non-JSON (commentaire, keepalive) — ignorer
      }
    }
  }
}

// ── Hermes home ────────────────────────────────────────────────────────────

/**
 * Résout le répertoire Hermes home.
 * Utilise HERMES_HOME si défini, sinon ~/.hermes.
 */
export function resolveHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), ".hermes");
}
