/**
 * HermesWebAPITransport — transport HTTP vers Hermes WebAPI (port 8642).
 *
 * Utilise le protocole OpenAI-compatible exposé par le serveur Hermes :
 *   GET  /health              → { status: "ok" }
 *   GET  /v1/models           → OpenAI models list
 *   POST /v1/chat/completions → OpenAI chat completions (stream: true)
 *
 * Streaming SSE format (OpenAI standard) :
 *   data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"text"},"finish_reason":null}]}
 *   data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{...}}
 *   data: [DONE]
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

interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  stream: boolean;
}

interface StreamChatResult {
  result: string;
  chatcmplId: string;
  meta: HermesRuntimeMeta;
  outputTokens: number;
  completed: boolean;
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
   * Envoie une requête chat completions en streaming et agrège la réponse.
   * Utilise POST /v1/chat/completions avec stream: true (format OpenAI).
   */
  async chat(
    messages: ChatCompletionMessage[],
    opts: Pick<EngineRunOpts, "model" | "onStream">,
  ): Promise<StreamChatResult> {
    const bodyObj: ChatCompletionRequest = {
      model: opts.model ?? "hermes-agent",
      messages,
      stream: true,
    };

    const body = JSON.stringify(bodyObj);
    const onDelta = opts.onStream;

    return new Promise<StreamChatResult>((resolve, reject) => {
      const req = http.request(
        {
          hostname: this.config.host,
          port: this.config.port,
          path: "/v1/chat/completions",
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
              reject(new Error(`POST /v1/chat/completions HTTP ${res.statusCode}: ${errBody.slice(0, 300)}`));
            });
            return;
          }

          let buffer = "";
          let result = "";
          let outputTokens = 0;
          let chatcmplId = "";
          let completed = false;

          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            // La dernière ligne peut être incomplète — la remettre dans le buffer
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data: ")) continue;

              const payload = trimmed.slice(6);

              // Sentinel de fin
              if (payload === "[DONE]") {
                completed = true;
                continue;
              }

              try {
                const data = JSON.parse(payload) as Record<string, unknown>;

                // Capture chatcmpl ID
                if (typeof data["id"] === "string" && !chatcmplId) {
                  chatcmplId = data["id"] as string;
                }

                // Extract choices
                const choices = data["choices"] as Array<Record<string, unknown>> | undefined;
                if (choices && choices.length > 0) {
                  const choice = choices[0]!;
                  const delta = choice["delta"] as Record<string, unknown> | undefined;

                  if (delta) {
                    const content = delta["content"];
                    if (typeof content === "string" && content) {
                      result += content;
                      onDelta?.({ type: "text", content });
                    }
                  }

                  if (choice["finish_reason"] === "stop") {
                    completed = true;
                  }
                }

                // Extract usage from last chunk
                const usage = data["usage"] as Record<string, unknown> | undefined;
                if (usage) {
                  const completionTokens = usage["completion_tokens"];
                  if (typeof completionTokens === "number") {
                    outputTokens = completionTokens;
                  }
                }
              } catch {
                // ligne malformée, skip
              }
            }
          });

          res.on("end", () => {
            // Process any remaining buffered line (e.g., final [DONE] without trailing newlines)
            if (buffer.trim()) {
              const remaining = buffer.trim();
              if (remaining.startsWith("data: ")) {
                const payload = remaining.slice(6);
                if (payload === "[DONE]") {
                  completed = true;
                } else {
                  try {
                    const data = JSON.parse(payload) as Record<string, unknown>;
                    const choices = data["choices"] as Array<Record<string, unknown>> | undefined;
                    if (choices?.[0]) {
                      const delta = choices[0]["delta"] as Record<string, unknown> | undefined;
                      if (typeof delta?.["content"] === "string" && delta["content"]) {
                        result += delta["content"];
                        onDelta?.({ type: "text", content: delta["content"] as string });
                      }
                      if (choices[0]["finish_reason"] === "stop") {
                        completed = true;
                      }
                    }
                  } catch { /* malformed — skip */ }
                }
              }
            }
            resolve({
              result,
              chatcmplId,
              meta: {},
              outputTokens,
              completed,
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
 * Utilise POST /v1/chat/completions (OpenAI-compatible, stateless).
 * Retourne un EngineResult compatible avec le contrat existant.
 */
export async function runViaWebAPI(
  transport: HermesWebAPITransport,
  opts: EngineRunOpts,
  startMs: number,
): Promise<EngineResult> {
  // Build messages array
  const messages: ChatCompletionMessage[] = [];

  // System prompt
  if (opts.systemPrompt) {
    let systemContent = opts.systemPrompt;
    if (opts.systemPromptAddition) {
      systemContent += `\n\n${opts.systemPromptAddition}`;
    }
    messages.push({ role: "system", content: systemContent });
  } else if (opts.systemPromptAddition) {
    messages.push({ role: "system", content: opts.systemPromptAddition });
  }

  // User message
  let userContent = opts.prompt;
  if (opts.attachments?.length) {
    userContent += "\n\nAttached files:\n" + opts.attachments.map((a) => `- ${a}`).join("\n");
  }
  messages.push({ role: "user", content: userContent });

  logger.info(
    `[HermesEngine/WebAPI] Sending chat completions request` +
    ` (model=${opts.model || "hermes-agent"}, messages=${messages.length})`,
  );

  const streamResult = await transport.chat(messages, {
    model: opts.model,
    onStream: opts.onStream,
  });

  const durationMs = Date.now() - startMs;

  // Use chatcmpl ID as session identifier, or generate a synthetic one
  const hermesSessionId = streamResult.chatcmplId || `webapi_${Date.now()}`;

  logger.info(
    `[HermesEngine/WebAPI] Run complete: id=${hermesSessionId}` +
    `, result_length=${streamResult.result.length}` +
    `, output_tokens=${streamResult.outputTokens}` +
    `, completed=${streamResult.completed}`,
  );

  const hermesMeta: HermesRuntimeMeta = {
    hermesSessionId,
    activeProfile: opts.hermesProfile,
  };

  return {
    sessionId: hermesSessionId,
    result: streamResult.result,
    durationMs,
    numTurns: 1,
    hermesMeta,
  };
}
