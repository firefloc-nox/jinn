/**
 * HermesEngine — invoke Hermes as the primary brain via CLI spawn.
 *
 * Invocation contract (V1, non-streaming):
 *   hermes chat -q "<prompt>" --quiet --source tool --yolo [--model <m>] [--provider <p>] [--profile <p>] [--resume <id>] [--toolsets <t>] [--skills <s>] [--pass-session-id]
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
import { existsSync } from "node:fs";
import type { InterruptibleEngine, EngineRunOpts, EngineResult, HermesRuntimeMeta } from "../shared/types.js";
import { logger } from "../shared/logger.js";
import { HermesWebAPITransport, runViaWebAPI } from "./hermes-webapi.js";

/** Configuration du transport WebAPI — overridable via env vars. */
const WEBAPI_CONFIG = {
  host: process.env.HERMES_WEBAPI_HOST ?? "127.0.0.1",
  port: Number(process.env.HERMES_WEBAPI_PORT ?? "8642"),
};

/**
 * Resolve the model to pass to hermes CLI.
 * - If no model, returns undefined (hermes uses its own default).
 * - If already fully qualified ("anthropic/claude-sonnet-4.6", "openai/gpt-4o"), pass through.
 * - If a bare Claude short-name ("sonnet", "opus", "haiku", "sonnet-4", "opus-4"),
 *   prefix with "anthropic/claude-" to avoid invalid model errors in hermes.
 */
function resolveHermesModel(model?: string): string | undefined {
  if (!model) return undefined;
  if (model.includes("/")) return model;
  const claudeShortNames = new Set(["sonnet", "opus", "haiku", "sonnet-4", "opus-4"]);
  if (claudeShortNames.has(model.toLowerCase())) {
    return `anthropic/claude-${model}`;
  }
  return model;
}

/**
 * Resolve the absolute path of a binary, falling back to the name itself.
 * Special case: "hermes" is resolved to hermes.native when the LACP wrapper
 * is detected, to avoid LACP intercepting the spawn in non-interactive mode.
 */
function resolveBin(name: string): string {
  try {
    // For hermes: prefer hermes.native (sibling of the LACP wrapper) to bypass
    // LACP TTY detection that would otherwise delegate to claude CLI.
    if (name === "hermes" || name.endsWith("/hermes")) {
      const wrapperPath = execFileSync("which", ["hermes"], { encoding: "utf8" }).trim();
      const nativePath = wrapperPath.replace(/hermes$/, "hermes.native");
      if (existsSync(nativePath)) return nativePath;
    }
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
    const startMs = Date.now();

    // 1. Essayer le transport WebAPI (Hermes port 8642) en priorité.
    //    isAvailable() est mis en cache 30s — pas de health check à chaque run.
    const webapi = new HermesWebAPITransport(WEBAPI_CONFIG);
    if (await webapi.isAvailable()) {
      logger.info(
        `[HermesEngine] WebAPI available at ${WEBAPI_CONFIG.host}:${WEBAPI_CONFIG.port} — using HTTP transport`,
      );
      try {
        const webResult = await runViaWebAPI(webapi, opts, startMs);
        // Guardrail: some providers/endpoints can yield an empty WebAPI assistant result
        // even though the HTTP transport itself succeeded. Treat that as a transport failure
        // and fall back to the proven CLI path so Jinn does not silently swallow replies.
        if (!webResult.result?.trim()) {
          HermesWebAPITransport.invalidateAvailabilityCache();
          logger.warn(
            `[HermesEngine] WebAPI returned empty result — falling back to CLI spawn`,
          );
        } else {
          return webResult;
        }
      } catch (err) {
        // Si le transport WebAPI échoue en cours d'exécution, invalider le cache
        // et passer au fallback CLI pour ne pas perdre la requête.
        HermesWebAPITransport.invalidateAvailabilityCache();
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[HermesEngine] WebAPI transport failed: ${errMsg} — falling back to CLI spawn`,
        );
      }
    } else {
      logger.info(
        `[HermesEngine] WebAPI unavailable at ${WEBAPI_CONFIG.host}:${WEBAPI_CONFIG.port} — falling back to CLI spawn`,
      );
    }

    // 2. Fallback CLI spawn (comportement V1 d'origine).
    return this.runViaCLI(opts, startMs);
  }

  /** Exécute le chat via CLI spawn (fallback V1). */
  private async runViaCLI(opts: EngineRunOpts, startMs = Date.now()): Promise<EngineResult> {
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

    const resolvedModel = resolveHermesModel(opts.model);
    if (resolvedModel) args.push("--model", resolvedModel);
    if (opts.hermesProvider) args.push("--provider", opts.hermesProvider);
    const cliResumeSessionId = opts.resumeSessionId?.startsWith("sess_") ? undefined : opts.resumeSessionId;
    if (opts.hermesProfile) args.push("--profile", opts.hermesProfile);
    if (opts.hermesToolsets) args.push("--toolsets", opts.hermesToolsets);
    if (opts.hermesSkills) args.push("--skills", opts.hermesSkills);
    if (opts.hermesPassSessionId) args.push("--pass-session-id");
    if (cliResumeSessionId) args.push("--resume", cliResumeSessionId);

    logger.info(
      `[HermesEngine/CLI] Starting: ${bin} chat -q [prompt] --quiet --source tool --yolo` +
      ` --model ${resolvedModel || "default"}` +
      ` (resume: ${cliResumeSessionId || "none"})` +
      (opts.hermesProvider ? ` --provider ${opts.hermesProvider}` : "") +
      (opts.hermesProfile ? ` --profile ${opts.hermesProfile}` : "") +
      (opts.hermesToolsets ? ` --toolsets ${opts.hermesToolsets}` : "") +
      (opts.hermesSkills ? ` --skills ${opts.hermesSkills}` : ""),
    );

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
  // Strip Rich/box-drawing lines produced by the response box when --quiet doesn't suppress them
  // (e.g. "╭─ ✦ Lain ───╮", "│ ...", "╰───╯", "\r" only lines)
  const BOX_LINE_RE = /^[\s\r]*[╭╰│╮╯─┤├]|^\s*$/;
  const cleanLines = resultLines.filter(l => !BOX_LINE_RE.test(l));
  const result = cleanLines.join("\n").trim();

  return { result, sessionId, hermesMeta: meta };
}
