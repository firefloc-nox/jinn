/**
 * HermesEngine — invoke Hermes as the primary brain via CLI spawn.
 *
 * Invocation contract (V1, non-streaming):
 *   hermes chat -q "<prompt>" --quiet --source tool --yolo [--model <m>] [--provider <p>] [--resume <id>]
 *
 * stdout format:
 *   <response text, potentially multiline>
 *
 *   session_id: 20260330_224512_a1b2c3
 *
 * Parsing:
 *   - Last non-empty line matching /^session_id: (.+)$/ -> EngineResult.sessionId
 *   - Everything before that line -> EngineResult.result
 *   - Exit code 0 -> success, non-zero -> error
 *   - stderr -> EngineResult.error on non-zero exit
 *
 * System prompt (V1 — prefix injection):
 *   Hermes has no --append-system-prompt equivalent in V1.
 *   When opts.systemPrompt is provided, it is prepended to the prompt as:
 *     [SYSTEM]\n{systemPrompt}\n[/SYSTEM]\n\n{prompt}
 *   This is pragmatic and documented as a V1 limitation.
 *   V1.1 plan: add --append-system-prompt to hermes CLI upstream.
 *
 * Streaming (V1):
 *   No NDJSON stream mode available in hermes CLI. onStream is called once
 *   with the complete result as a single "text" delta when the process exits.
 *   V2: wire streaming when hermes adds --json NDJSON mode.
 *
 * Cost (V1):
 *   Not exposed by hermes --quiet. EngineResult.cost is undefined.
 *
 * MCP:
 *   Hermes manages its own MCP servers natively. mcpConfigPath is ignored.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { InterruptibleEngine, EngineRunOpts, EngineResult } from "../shared/types.js";
import { logger } from "../shared/logger.js";

interface LiveProcess {
  proc: ChildProcess;
  terminationReason: string | null;
}

/** Regex to extract session_id from the last line of hermes --quiet output */
const SESSION_ID_RE = /^session_id:\s*(.+)$/;

export class HermesEngine implements InterruptibleEngine {
  name = "hermes" as const;
  private liveProcesses = new Map<string, LiveProcess>();

  kill(sessionId: string, reason = "Interrupted"): void {
    const live = this.liveProcesses.get(sessionId);
    if (!live) return;

    live.terminationReason = reason;
    logger.info(`Killing Hermes process for session ${sessionId} (reason: ${reason})`);
    this.signalProcess(live.proc, "SIGTERM");
    setTimeout(() => {
      if (live.proc.exitCode === null) {
        this.signalProcess(live.proc, "SIGKILL");
      }
    }, 2000);
  }

  killAll(): void {
    for (const sessionId of this.liveProcesses.keys()) {
      this.kill(sessionId, "Interrupted: gateway shutting down");
    }
  }

  isAlive(sessionId: string): boolean {
    const live = this.liveProcesses.get(sessionId);
    return !!live && !live.proc.killed && live.proc.exitCode === null;
  }

  async run(opts: EngineRunOpts): Promise<EngineResult> {
    const bin = opts.bin || "hermes";

    // Build the prompt — inject systemPrompt as prefix (V1 workaround)
    let prompt = opts.prompt;
    if (opts.attachments?.length) {
      prompt += "\n\nAttached files:\n" + opts.attachments.map((a) => `- ${a}`).join("\n");
    }
    if (opts.systemPrompt) {
      prompt = `[SYSTEM]\n${opts.systemPrompt}\n[/SYSTEM]\n\n${prompt}`;
    }

    // Build args
    const args: string[] = [
      "chat",
      "-q", prompt,
      "--quiet",
      "--source", "tool",
      "--yolo",
    ];

    if (opts.model) args.push("--model", opts.model);
    if (opts.hermesProvider) args.push("--provider", opts.hermesProvider);
    if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);

    // hermesProfile is V2 — not yet wired as a CLI flag
    // opts.hermesProfile: reserved for future `--profile` flag

    logger.info(
      `Hermes engine starting: ${bin} chat -q [prompt] --quiet --source tool --yolo` +
      ` --model ${opts.model || "default"}` +
      ` (resume: ${opts.resumeSessionId || "none"})` +
      (opts.hermesProvider ? ` --provider ${opts.hermesProvider}` : ""),
    );

    const startMs = Date.now();

    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, {
        cwd: opts.cwd,
        // Inherit env — Hermes reads ANTHROPIC_API_KEY, OPENROUTER_API_KEY, etc. from environment
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });

      const jinnSessionId = opts.sessionId;
      if (jinnSessionId) {
        this.liveProcesses.set(jinnSessionId, { proc, terminationReason: null });
      }

      let stdout = "";
      let stderr = "";
      let settled = false;

      const STDERR_MAX = 10 * 1024;

      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });

      proc.stderr.on("data", (d: Buffer) => {
        const chunk = d.toString();
        stderr += chunk;
        if (stderr.length > STDERR_MAX) {
          stderr = stderr.slice(stderr.length - STDERR_MAX);
        }
        for (const line of chunk.trim().split("\n").filter(Boolean)) {
          logger.debug(`[hermes stderr] ${line}`);
        }
      });

      proc.on("close", (code) => {
        if (settled) return;
        settled = true;

        const durationMs = Date.now() - startMs;

        const terminationReason = jinnSessionId
          ? (this.liveProcesses.get(jinnSessionId)?.terminationReason ?? null)
          : null;
        if (jinnSessionId) {
          this.liveProcesses.delete(jinnSessionId);
        }

        logger.info(`Hermes engine exited with code ${code} in ${durationMs}ms`);

        // Process was intentionally killed
        if (terminationReason) {
          resolve({
            sessionId: opts.resumeSessionId || "",
            result: "",
            error: terminationReason,
            durationMs,
          });
          return;
        }

        if (code === 0) {
          const { result, sessionId } = parseHermesOutput(stdout, opts.resumeSessionId);
          logger.info(`Hermes result: session_id=${sessionId || "none"}, result_length=${result.length}`);

          // V1 streaming: emit a single text delta with the full result
          if (opts.onStream && result) {
            opts.onStream({ type: "text", content: result });
          }

          resolve({ sessionId, result, durationMs, numTurns: 1 });
          return;
        }

        // Non-zero exit
        if (stderr.trim()) {
          logger.error(`Hermes stderr (exit code ${code}):\n${stderr}`);
        }

        const errMsg = `Hermes exited with code ${code}${stderr.trim() ? `: ${stderr.slice(0, 500)}` : " (no stderr output)"}`;
        logger.error(errMsg);
        opts.onStream?.({ type: "error", content: errMsg });

        resolve({
          sessionId: opts.resumeSessionId || "",
          result: "",
          error: errMsg,
          durationMs,
        });
      });

      proc.on("error", (err) => {
        if (settled) return;
        settled = true;
        if (jinnSessionId) {
          this.liveProcesses.delete(jinnSessionId);
        }
        const errMsg = `Failed to spawn Hermes CLI: ${err.message}`;
        logger.error(errMsg);
        opts.onStream?.({ type: "error", content: errMsg });
        reject(new Error(errMsg));
      });
    });
  }

  private signalProcess(proc: ChildProcess, signal: NodeJS.Signals): void {
    try {
      if (proc.pid && process.platform !== "win32") {
        process.kill(-proc.pid, signal);
      } else {
        proc.kill(signal);
      }
    } catch {
      try {
        proc.kill(signal);
      } catch {
        // Process already dead — ignore
      }
    }
  }
}

/**
 * Parse Hermes --quiet stdout into result text and session_id.
 *
 * Expected format:
 *   <response text>
 *
 *   session_id: 20260330_224512_a1b2c3
 *
 * Returns:
 *   result — everything before the session_id line (trimmed)
 *   sessionId — extracted session ID, or fallbackSessionId if not found
 */
export function parseHermesOutput(
  stdout: string,
  fallbackSessionId?: string,
): { result: string; sessionId: string } {
  const lines = stdout.split("\n");
  let sessionId = fallbackSessionId || "";
  let sessionLineIndex = -1;

  // Scan from the end for the session_id line
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const match = trimmed.match(SESSION_ID_RE);
    if (match) {
      sessionId = match[1].trim();
      sessionLineIndex = i;
      break;
    }
    // First non-empty line from end that is not session_id — stop scanning
    break;
  }

  const resultLines = sessionLineIndex >= 0 ? lines.slice(0, sessionLineIndex) : lines;
  const result = resultLines.join("\n").trim();

  return { result, sessionId };
}
