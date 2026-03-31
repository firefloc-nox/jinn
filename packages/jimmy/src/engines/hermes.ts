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

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import type { InterruptibleEngine, EngineRunOpts, EngineResult, HermesRuntimeMeta } from "../shared/types.js";
import { logger } from "../shared/logger.js";

/**
 * Resolve the absolute path of a binary, falling back to the name itself.
 * Uses `which` on Unix so that Node child_process can find it regardless
 * of the inherited PATH.
 */
function resolveBin(name: string): string {
  try {
    return execFileSync("which", [name], { encoding: "utf8" }).trim();
  } catch {
    return name;
  }
}

interface LiveProcess {
  proc: ChildProcess;
  terminationReason: string | null;
}

/** Regex to extract session_id from the last line of hermes --quiet output */
const SESSION_ID_RE = /^session_id:\s*(.+)$/;
/** Regex to extract provider from hermes output: "provider: anthropic" */
const PROVIDER_RE = /^provider:\s*(.+)$/;
/** Regex to extract model from hermes output: "model: claude-sonnet-4-5" */
const MODEL_RE = /^model:\s*(.+)$/;
/** Regex to detect honcho active from hermes output: "honcho: active" */
const HONCHO_RE = /^honcho:\s*active$/i;

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
    const bin = opts.bin ? resolveBin(opts.bin) : resolveBin("hermes");

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
        // Inherit env + ensure PATH contains common local bin dirs so hermes sub-processes
        // (skills, tools) can resolve their own dependencies.
        // LACP_BYPASS=1: the hermes binary is a LACP wrapper that detects TTY absence and
        // falls back to the claude CLI in non-interactive mode. Bypass forces direct execution
        // of hermes.native regardless of TTY state.
        env: {
          ...process.env,
          LACP_BYPASS: "1",  // bypass LACP wrapper in non-interactive spawn mode
          PATH: [
            process.env.PATH,
            `${process.env.HOME}/.local/bin`,
            "/usr/local/bin",
            "/opt/homebrew/bin",
          ]
            .filter(Boolean)
            .join(":"),
        },
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
          const { result, sessionId, hermesMeta } = parseHermesOutput(stdout, opts.resumeSessionId, opts.hermesProfile);
          logger.info(`Hermes result: session_id=${sessionId || "none"}, result_length=${result.length}`);

          // V1 streaming: emit a single text delta with the full result
          if (opts.onStream && result) {
            opts.onStream({ type: "text", content: result });
          }

          resolve({ sessionId, result, durationMs, numTurns: 1, hermesMeta });
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
  activeProfile?: string,
): { result: string; sessionId: string; hermesMeta: HermesRuntimeMeta } {
  const lines = stdout.split("\n");
  let sessionId = fallbackSessionId || "";
  let sessionLineIndex = -1;
  const meta: HermesRuntimeMeta = {};

  if (activeProfile) meta.activeProfile = activeProfile;

  // Scan from the end for metadata lines (session_id, provider, model, honcho)
  // These are emitted after the response text in --quiet mode
  const metaLineIndices = new Set<number>();
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const sessionMatch = trimmed.match(SESSION_ID_RE);
    if (sessionMatch) {
      sessionId = sessionMatch[1].trim();
      meta.hermesSessionId = sessionId;
      metaLineIndices.add(i);
      continue;
    }
    const providerMatch = trimmed.match(PROVIDER_RE);
    if (providerMatch) {
      meta.providerUsed = providerMatch[1].trim();
      metaLineIndices.add(i);
      continue;
    }
    const modelMatch = trimmed.match(MODEL_RE);
    if (modelMatch) {
      meta.modelUsed = modelMatch[1].trim();
      metaLineIndices.add(i);
      continue;
    }
    if (HONCHO_RE.test(trimmed)) {
      meta.honchoActive = true;
      metaLineIndices.add(i);
      continue;
    }
    // First non-meta, non-empty line from end — stop scanning
    break;
  }

  // sessionLineIndex = last meta line found (for slicing result)
  if (metaLineIndices.size > 0) {
    sessionLineIndex = Math.min(...metaLineIndices);
  }

  const resultLines = sessionLineIndex >= 0 ? lines.slice(0, sessionLineIndex) : lines;
  const result = resultLines.join("\n").trim();

  return { result, sessionId, hermesMeta: meta };
}
