/**
 * HermesWebAPITransport — transport HTTP vers Hermes WebAPI (port 8642).
 *
 * Remplace le spawn CLI pour le chat. Pas de parse stdout, pas de LACP_BYPASS,
 * streaming SSE natif via http.request Node.js.
 *
 * Protocole SSE Hermes WebAPI :
 *   event: session.created   → { session_id, run_id, seq, title, model }
 *   event: run.started       → { user_message: { id, role, content } }
 *   event: message.started   → { message: { id, role } }
 *   event: assistant.delta   → { message_id, delta }
 *   event: tool.pending      → { tool_name, preview, args }
 *   event: tool.started      → { tool_name, preview, args }
 *   event: tool.completed    → { tool_name, tool_call_id, result_preview }
 *   event: tool.failed       → { tool_name, tool_call_id, result_preview }
 *   event: assistant.completed → { message_id, content, completed, partial, interrupted }
 *   event: run.completed     → { message_id, completed, partial, interrupted, api_calls }
 *   event: error             → { message }
 *   event: done              → {} (sentinel de fin)
 *
 * Profile handling :
 *   ChatRequest n'expose pas de champ profile. On passe hermesProfile via
 *   source="jinn-<profile>" dans POST /api/sessions pour tracking.
 *   La session utilise le modèle/config du profil que la WebAPI a été démarrée avec.
 *
 * Fallback :
 *   isAvailable() checke GET /health. Résultat mis en cache 30s.
 *   Si WebAPI down → HermesEngine.run() revient au CLI spawn.
 */

import http from "node:http";
import type { EngineRunOpts, EngineResult, HermesRuntimeMeta } from "../shared/types.js";
import { logger } from "../shared/logger.js";

export interface WebAPIConfig {
  port: number;
  host: string;
}

interface CreateSessionOpts {
  model?: string;
  systemPrompt?: string;
  source?: string;
  title?: string;
}

interface StreamChatResult {
  result: string;
  hermesSessionId: string;
  meta: HermesRuntimeMeta;
  outputTokens: number;
  apiCalls: number;
  completed: boolean;
  interrupted: boolean;
}

interface ChatRequestBody {
  message: string;
  model?: string;
  system_message?: string;
  enabled_toolsets?: string[];
}

/** Cache du résultat isAvailable() — évite les health checks répétés */
let _availabilityCache: { value: boolean; expiresAt: number } | null = null;
const AVAILABILITY_CACHE_TTL_MS = 30_000;

export class HermesWebAPITransport {
  constructor(private config: WebAPIConfig) {}

  /**
   * Vérifie que la WebAPI répond sur GET /health.
   * Résultat mis en cache 30s pour éviter les checks fréquents.
   */
  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (_availabilityCache && _availabilityCache.expiresAt > now) {
      return _availabilityCache.value;
    }

    const value = await this._checkHealth();
    _availabilityCache = { value, expiresAt: now + AVAILABILITY_CACHE_TTL_MS };
    return value;
  }

  /** Invalide le cache de disponibilité (utile après une erreur de connexion). */
  static invalidateAvailabilityCache(): void {
    _availabilityCache = null;
  }

  private async _checkHealth(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const req = http.request(
        {
          hostname: this.config.host,
          port: this.config.port,
          path: "/health",
          method: "GET",
          timeout: 3_000,
        },
        (res) => {
          res.resume(); // drain body
          resolve(res.statusCode === 200);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  /**
   * Crée une session Hermes via POST /api/sessions.
   * Retourne l'hermesSessionId (format "sess_<hex>").
   * Passe hermesProfile via source="jinn-<profile>" pour tracking.
   */
  async createSession(opts: CreateSessionOpts): Promise<string> {
    const body = JSON.stringify({
      source: opts.source ?? "jinn",
      model: opts.model,
      system_prompt: opts.systemPrompt,
      title: opts.title,
    });

    return new Promise<string>((resolve, reject) => {
      const req = http.request(
        {
          hostname: this.config.host,
          port: this.config.port,
          path: "/api/sessions",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 10_000,
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk: Buffer) => {
            raw += chunk.toString();
          });
          res.on("end", () => {
            if (res.statusCode !== 201 && res.statusCode !== 200) {
              reject(new Error(`POST /api/sessions failed: HTTP ${res.statusCode} — ${raw.slice(0, 200)}`));
              return;
            }
            try {
              const parsed = JSON.parse(raw) as { session?: { id?: string }; id?: string };
              const sessionId = parsed.session?.id ?? (parsed as { id?: string }).id;
              if (!sessionId) {
                reject(new Error(`POST /api/sessions: missing session.id in response: ${raw.slice(0, 200)}`));
                return;
              }
              resolve(sessionId);
            } catch (err) {
              reject(new Error(`POST /api/sessions: invalid JSON response: ${raw.slice(0, 200)}`));
            }
          });
        },
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("POST /api/sessions timed out"));
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * Envoie un message et stream la réponse SSE.
   * Agrège les deltas en un résultat final.
   */
  async chat(
    hermesSessionId: string,
    message: string,
    opts: Pick<EngineRunOpts, "model" | "onStream" | "hermesToolsets">,
  ): Promise<StreamChatResult> {
    const bodyObj: ChatRequestBody = { message };
    if (opts.model) bodyObj.model = opts.model;
    if (opts.hermesToolsets) {
      bodyObj.enabled_toolsets = opts.hermesToolsets.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const body = JSON.stringify(bodyObj);
    const onDelta = opts.onStream;

    return new Promise<StreamChatResult>((resolve, reject) => {
      const req = http.request(
        {
          hostname: this.config.host,
          port: this.config.port,
          path: `/api/sessions/${hermesSessionId}/chat/stream`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Accept: "text/event-stream",
          },
          timeout: 300_000,
        },
        (res) => {
          if (res.statusCode !== 200) {
            let errBody = "";
            res.on("data", (chunk: Buffer) => { errBody += chunk.toString(); });
            res.on("end", () => {
              reject(new Error(`POST /chat/stream HTTP ${res.statusCode}: ${errBody.slice(0, 300)}`));
            });
            return;
          }

          let buffer = "";
          let result = "";
          let outputTokens = 0;
          let apiCalls = 0;
          let completed = false;
          let interrupted = false;
          let errorMsg = "";
          let done = false;

          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            // La dernière ligne peut être incomplète — la remettre dans le buffer
            buffer = lines.pop() ?? "";

            let currentEvent = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6)) as Record<string, unknown>;

                  switch (currentEvent) {
                    case "assistant.delta": {
                      const delta = data["delta"];
                      if (typeof delta === "string" && delta) {
                        result += delta;
                        onDelta?.({ type: "text", content: delta });
                      }
                      break;
                    }
                    case "run.completed":
                      apiCalls = typeof data["api_calls"] === "number" ? data["api_calls"] : 0;
                      completed = data["completed"] === true;
                      interrupted = data["interrupted"] === true;
                      break;
                    case "assistant.completed":
                      // outputTokens n'est pas dans cet event — sera dans run.ended si présent
                      break;
                    case "error": {
                      const msg = data["message"];
                      if (typeof msg === "string") errorMsg = msg;
                      break;
                    }
                    case "done":
                      done = true;
                      break;
                    default:
                      // tool.pending / tool.started / tool.completed / tool.failed / memory.updated / etc.
                      // Pas d'action nécessaire côté Jinn pour l'instant
                      break;
                  }
                  currentEvent = "";
                } catch {
                  // ligne malformée, skip
                }
              } else if (line === "") {
                // séparateur d'événement SSE — reset currentEvent
                currentEvent = "";
              }
            }
          });

          res.on("end", () => {
            if (errorMsg) {
              reject(new Error(`Hermes WebAPI error: ${errorMsg}`));
              return;
            }
            resolve({
              result,
              hermesSessionId,
              meta: {},
              outputTokens,
              apiCalls,
              completed,
              interrupted,
            });
          });

          res.on("error", reject);
        },
      );

      req.on("error", (err) => {
        // Invalide le cache si la connexion échoue
        HermesWebAPITransport.invalidateAvailabilityCache();
        reject(err);
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("SSE stream timed out (300s)"));
      });
      req.write(body);
      req.end();
    });
  }
}

/**
 * Lance un chat via WebAPI à partir des opts HermesEngine.
 * Gère la création de session si nécessaire.
 * Retourne un EngineResult compatible avec le contrat existant.
 */
export async function runViaWebAPI(
  transport: HermesWebAPITransport,
  opts: EngineRunOpts,
  startMs: number,
): Promise<EngineResult> {
  let hermesSessionId = opts.resumeSessionId;

  // Si le resumeSessionId est un ID CLI (pas "sess_"), créer une nouvelle session WebAPI
  const isWebAPISession = hermesSessionId?.startsWith("sess_");

  if (!hermesSessionId || !isWebAPISession) {
    // Source encode le profil pour tracking : "jinn-<profile>" ou "jinn"
    const source = opts.hermesProfile ? `jinn-${opts.hermesProfile}` : "jinn";

    logger.info(
      `[HermesEngine/WebAPI] Creating Hermes session` +
      ` (source=${source}, model=${opts.model || "default"})`,
    );

    hermesSessionId = await transport.createSession({
      model: opts.model,
      systemPrompt: opts.systemPrompt,
      source,
      title: undefined,
    });

    logger.info(`[HermesEngine/WebAPI] Created session: ${hermesSessionId}`);
  } else {
    logger.info(`[HermesEngine/WebAPI] Resuming session: ${hermesSessionId}`);
  }

  // Construire le prompt (même logique d'injection systemPrompt que CLI — mais ici systemPrompt
  // est passé à la session, pas préfixé. On injecte quand même systemPromptAddition si présente.)
  let prompt = opts.prompt;
  if (opts.attachments?.length) {
    prompt += "\n\nAttached files:\n" + opts.attachments.map((a) => `- ${a}`).join("\n");
  }
  if (opts.systemPromptAddition) {
    // systemPrompt principal déjà passé à createSession. On préfixe l'addition.
    prompt = `[CONTEXT]\n${opts.systemPromptAddition}\n[/CONTEXT]\n\n${prompt}`;
  }

  const streamResult = await transport.chat(hermesSessionId, prompt, {
    model: opts.model,
    onStream: opts.onStream,
    hermesToolsets: opts.hermesToolsets,
  });

  const durationMs = Date.now() - startMs;

  logger.info(
    `[HermesEngine/WebAPI] Run complete: session=${hermesSessionId}` +
    `, result_length=${streamResult.result.length}` +
    `, api_calls=${streamResult.apiCalls}` +
    `, completed=${streamResult.completed}` +
    `, interrupted=${streamResult.interrupted}`,
  );

  const hermesMeta: HermesRuntimeMeta = {
    hermesSessionId,
    activeProfile: opts.hermesProfile,
  };

  return {
    sessionId: hermesSessionId,
    result: streamResult.result,
    durationMs,
    numTurns: streamResult.apiCalls || 1,
    hermesMeta,
  };
}
