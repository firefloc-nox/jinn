import { randomUUID } from "node:crypto";
import type {
  InterruptibleEngine,
  EngineRunOpts,
  EngineResult,
  StreamDelta,
} from "../shared/types.js";
import { logger } from "../shared/logger.js";

/**
 * LocalEngine — hits an OpenAI-compatible API (e.g. LM Studio, llama.cpp / llama-server).
 *
 * Limitations:
 * - No tool_use / function calling support
 * - No thinking blocks
 * - Cost is always 0 (local inference, no billing)
 * - No native multi-turn session resumption — context is rebuilt from
 *   the system prompt + conversation history passed in `prompt`
 */

export interface LocalEngineConfig {
  url: string;
  model: string;
}

interface SSEChoice {
  delta?: { content?: string; reasoning_content?: string; role?: string };
  finish_reason?: string | null;
}

interface SSEChunk {
  id?: string;
  choices?: SSEChoice[];
}

/** Thrown when the SSE stream contains an error event (e.g. "Model unloaded.") */
class ServerStreamError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = "ServerStreamError";
    this.retryable = retryable;
  }
}

export class LocalEngine implements InterruptibleEngine {
  name = "local" as const;

  private url: string;
  private model: string;
  private liveControllers = new Map<string, AbortController>();

  constructor(config: LocalEngineConfig) {
    this.url = config.url.replace(/\/+$/, "");
    this.model = config.model;
  }

  async run(opts: EngineRunOpts): Promise<EngineResult> {
    const startMs = Date.now();
    const sessionId = opts.resumeSessionId || opts.sessionId || randomUUID();
    const model = opts.model || this.model;

    const controller = new AbortController();
    if (opts.sessionId) {
      this.liveControllers.set(opts.sessionId, controller);
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.systemPrompt) {
      messages.push({ role: "system", content: opts.systemPrompt });
    }
    messages.push({ role: "user", content: opts.prompt });

    // Retry logic for JIT model loading — LM Studio/Ollama may terminate
    // the first SSE connection while loading the model into memory.
    const MAX_RETRIES = 3;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (controller.signal.aborted) break;

      let fullText = "";
      let reasoningText = "";
      let error: string | undefined;

      try {
        if (attempt > 0) {
          const delayMs = 5000 * Math.pow(2, attempt - 1); // 5s, 10s, 20s — exponential backoff
          logger.info(`[local] Retry ${attempt}/${MAX_RETRIES} for session ${sessionId} (model JIT loading, waiting ${delayMs / 1000}s)`);
          opts.onStream?.({ type: "status", content: "Waiting for model to load..." });
          await new Promise((r) => setTimeout(r, delayMs));
        }

        // Timeout after 5 minutes to avoid hanging on unresponsive servers
        const timeoutSignal = AbortSignal.timeout(300_000);
        const combinedSignal = AbortSignal.any([controller.signal, timeoutSignal]);

        const response = await fetch(`${this.url}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
          }),
          signal: combinedSignal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          error = `Local engine HTTP ${response.status}: ${body}`;
          logger.error(`[local] ${error}`);
          // Retryable errors during model JIT loading:
          // - 404: LM Studio returns this when server API is momentarily unavailable
          // - 500-503: server errors while model is loading
          // - 400 "Model unloaded": LM Studio returns this when model was evicted
          const isRetryable = response.status === 404
            || (response.status >= 500 && response.status <= 503)
            || (response.status === 400 && body.includes("unloaded"));
          if (attempt < MAX_RETRIES && isRetryable) {
            lastError = error;
            continue;
          }
          opts.onStream?.({ type: "error", content: error });
          return {
            sessionId,
            result: "",
            cost: 0,
            durationMs: Date.now() - startMs,
            numTurns: 1,
            error,
          };
        }

        if (!response.body) {
          error = "Local engine returned no body";
          logger.error(`[local] ${error}`);
          return { sessionId, result: "", cost: 0, durationMs: Date.now() - startMs, numTurns: 1, error };
        }

        // Parse SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sseEventType = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last (possibly incomplete) line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(":")) continue;

            // Track SSE event type (e.g. "event: error")
            if (trimmed.startsWith("event:")) {
              sseEventType = trimmed.slice(6).trim();
              continue;
            }

            if (trimmed === "data: [DONE]") {
              sseEventType = "";
              continue;
            }

            if (trimmed.startsWith("data: ")) {
              const jsonStr = trimmed.slice(6);
              try {
                const parsed = JSON.parse(jsonStr);

                // Detect server-side error events (e.g. LM Studio "Model unloaded.")
                if (sseEventType === "error" || parsed.error) {
                  const errMsg = parsed.error?.message || parsed.message || "Unknown server error";
                  const retryable = /unloaded|loading|not found|not loaded/i.test(errMsg);
                  throw new ServerStreamError(errMsg, retryable);
                }

                const chunk = parsed as SSEChunk;
                const delta = chunk.choices?.[0]?.delta;
                // Collect reasoning tokens separately — some models (vibethinker)
                // put the entire response in reasoning_content with no content field.
                if (delta?.reasoning_content) {
                  reasoningText += delta.reasoning_content;
                }
                if (delta?.content) {
                  fullText += delta.content;
                  opts.onStream?.({ type: "text", content: delta.content });
                }
              } catch (parseErr) {
                if (parseErr instanceof ServerStreamError) throw parseErr;
                // Skip malformed JSON lines
                logger.warn(`[local] Skipping malformed SSE chunk: ${jsonStr.slice(0, 120)}`);
              }
              sseEventType = "";
            }
          }
        }

        // Process any remaining data in the buffer after stream ends
        if (buffer.trim() && buffer.trim().startsWith("data: ") && buffer.trim() !== "data: [DONE]") {
          const jsonStr = buffer.trim().slice(6);
          try {
            const parsed = JSON.parse(jsonStr) as SSEChunk;
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.reasoning_content) reasoningText += delta.reasoning_content;
            if (delta?.content) {
              fullText += delta.content;
              opts.onStream?.({ type: "text", content: delta.content });
            }
          } catch {
            // Skip malformed trailing data
          }
        }

        // If no content was emitted but we have reasoning, use it as the response.
        // Models like vibethinker put everything in reasoning_content.
        if (!fullText.trim() && reasoningText.trim()) {
          fullText = reasoningText;
          opts.onStream?.({ type: "text", content: fullText });
          logger.info(`[local] No content field — using reasoning_content as response (${reasoningText.length} chars)`);
        }

        // Strip control tokens from output (e.g. <|im_end|>, <|endoftext|>)
        fullText = fullText.replace(/<\|[a-zA-Z0-9_]+\|>/g, "").trim();

        // Empty response with no error = model not ready (JIT loading returned empty stream)
        if (!fullText && attempt < MAX_RETRIES) {
          logger.warn(`[local] Empty response (attempt ${attempt + 1}/${MAX_RETRIES + 1}), likely model still loading — retrying`);
          lastError = "Empty response from local model";
          continue;
        }

        // Emit final snapshot
        if (opts.onStream) {
          opts.onStream({ type: "text_snapshot", content: fullText });
          opts.onStream({ type: "status", content: "done" });
        }

        if (opts.sessionId) {
          this.liveControllers.delete(opts.sessionId);
        }

        return {
          sessionId,
          result: fullText,
          cost: 0,
          durationMs: Date.now() - startMs,
          numTurns: 1,
        };
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          error = "Request aborted";
          logger.info(`[local] Session ${sessionId} aborted`);
          lastError = error;
          break; // Don't retry user-initiated aborts
        }

        // Server-side SSE error (e.g. "Model unloaded.")
        if (err instanceof ServerStreamError) {
          error = err.message;
          if (attempt < MAX_RETRIES && err.retryable) {
            logger.warn(`[local] Server error: "${error}" (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — retrying`);
            lastError = error;
            continue;
          }
          logger.error(`[local] Server error: ${error}`);
          opts.onStream?.({ type: "error", content: error });
          lastError = error;
          break;
        }

        error = err instanceof Error ? err.message : String(err);

        // "terminated" / connection errors = JIT model loading — retryable
        if (attempt < MAX_RETRIES && (error === "terminated" || error.includes("ECONNRESET") || error.includes("ECONNREFUSED") || error.includes("socket hang up"))) {
          logger.warn(`[local] Stream terminated (attempt ${attempt + 1}/${MAX_RETRIES + 1}), likely JIT model loading — retrying`);
          lastError = error;
          continue;
        }

        logger.error(`[local] Stream error: ${error}`);
        opts.onStream?.({ type: "error", content: error });
        lastError = error;
        break;
      }
    }

    // All retries exhausted
    if (opts.sessionId) {
      this.liveControllers.delete(opts.sessionId);
    }

    return {
      sessionId,
      result: "",
      cost: 0,
      durationMs: Date.now() - startMs,
      numTurns: 1,
      error: lastError,
    };
  }

  kill(sessionId: string, reason?: string): void {
    const controller = this.liveControllers.get(sessionId);
    if (controller) {
      logger.info(`[local] Killing session ${sessionId}${reason ? `: ${reason}` : ""}`);
      controller.abort();
      this.liveControllers.delete(sessionId);
    }
  }

  isAlive(sessionId: string): boolean {
    return this.liveControllers.has(sessionId);
  }

  killAll(): void {
    for (const [sessionId, controller] of this.liveControllers) {
      logger.info(`[local] Killing session ${sessionId} (shutdown)`);
      controller.abort();
    }
    this.liveControllers.clear();
  }
}
