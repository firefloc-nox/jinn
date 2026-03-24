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

    const controller = new AbortController();
    if (opts.sessionId) {
      this.liveControllers.set(opts.sessionId, controller);
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.systemPrompt) {
      messages.push({ role: "system", content: opts.systemPrompt });
    }
    messages.push({ role: "user", content: opts.prompt });

    let fullText = "";
    let error: string | undefined;

    try {
      const response = await fetch(`${this.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        error = `Local engine HTTP ${response.status}: ${body}`;
        logger.error(`[local] ${error}`);
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

          if (trimmed === "data: [DONE]") {
            // Stream finished
            continue;
          }

          if (trimmed.startsWith("data: ")) {
            const json = trimmed.slice(6);
            try {
              const chunk: SSEChunk = JSON.parse(json);
              const delta = chunk.choices?.[0]?.delta;
              // Some models (qwen3.5) put reasoning in a separate field
              if (delta?.reasoning_content) {
                // Skip reasoning tokens — only emit final content
              }
              if (delta?.content) {
                fullText += delta.content;
                opts.onStream?.({ type: "text", content: delta.content });
              }
            } catch {
              // Skip malformed JSON lines
              logger.warn(`[local] Skipping malformed SSE chunk: ${json.slice(0, 120)}`);
            }
          }
        }
      }

      // Strip control tokens from output (e.g. <|im_end|>, <|endoftext|>)
      fullText = fullText.replace(/<\|[a-z_]+\|>/g, "").trim();

      // Emit final snapshot
      if (opts.onStream) {
        opts.onStream({ type: "text_snapshot", content: fullText });
        opts.onStream({ type: "status", content: "done" });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        error = "Request aborted";
        logger.info(`[local] Session ${sessionId} aborted`);
      } else {
        error = err instanceof Error ? err.message : String(err);
        logger.error(`[local] Stream error: ${error}`);
        opts.onStream?.({ type: "error", content: error });
      }
    } finally {
      if (opts.sessionId) {
        this.liveControllers.delete(opts.sessionId);
      }
    }

    return {
      sessionId,
      result: fullText,
      cost: 0,
      durationMs: Date.now() - startMs,
      numTurns: 1,
      error,
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
