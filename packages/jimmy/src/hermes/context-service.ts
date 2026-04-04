/**
 * Hermes Context Service
 *
 * Provides Hermes as a context-enrichment layer for non-Hermes runtimes.
 * When an employee has hermesHooks.enabled = true and the resolved runtime
 * is NOT "hermes", this service enriches the session context with:
 *
 *   - Honcho memory entries  (if hermesHooks.memory = true)
 *   - MCP tool definitions    (if hermesHooks.mcp = true)
 *   - Skill files content     (if hermesHooks.skills = true)
 *
 * The enriched context is returned as a string that gets prepended to the
 * system prompt before the actual runtime (claude, codex, gemini) is spawned.
 *
 * Hermes remains a pure runtime executor for runtimeRef.startsWith("hermes").
 * This service makes Hermes useful as a middleware layer without turning it
 * into a universal proxy.
 */

import type { Employee, HermesHooks } from "../shared/types.js";
import { resolveMcpServers } from "../mcp/resolver.js";
import { logger } from "../shared/logger.js";
import { SKILLS_DIR } from "../shared/paths.js";

export interface HermesContextResult {
  /** Prepend this to the system prompt when enriching for non-Hermes runtimes */
  enrichedContext: string;
  /** Which hooks were successfully applied */
  hooksApplied: string[];
  /** Errors encountered (logged, non-fatal) */
  errors: string[];
}

interface HermesMemoryEntry {
  content: string;
  timestamp?: string;
}

/**
 * Fetch Honcho memory entries for a given employee via Hermes HTTP API.
 * Returns empty array on failure (non-fatal — memory is optional).
 */
async function fetchHonchoMemory(employeeName: string): Promise<HermesMemoryEntry[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const baseUrl = process.env.HERMES_WEBAPI_URL ?? "http://127.0.0.1:9377";
    const url = `${baseUrl}/api/memory?employee=${encodeURIComponent(employeeName)}&limit=20`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as { entries?: HermesMemoryEntry[] };
    return data.entries ?? [];
  } catch {
    // Non-fatal: memory is optional enrichment
    return [];
  }
}

/**
 * Build a readable summary of available MCP tools from resolved servers.
 */
function buildMcpToolsSummary(mcpServers: Record<string, import("../shared/types.js").McpServerConfig>): string {
  const servers = Object.entries(mcpServers);
  if (servers.length === 0) return "";

  const lines = ["## Available MCP Tools", ""];
  for (const [name, cfg] of servers) {
    if ("command" in cfg) {
      lines.push(`- **${name}**: \`${cfg.command} ${(cfg.args ?? []).join(" ")}\``);
    } else if ("url" in cfg) {
      lines.push(`- **${name}**: \`${cfg.type === "sse" ? "sse " : ""}${cfg.url}\``);
    }
  }
  return lines.join("\n");
}

/**
 * Scan and summarize available skill files from ~/.jinn/skills/.
 */
async function buildSkillsSummary(): Promise<string> {
  try {
    const { existsSync, readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    if (!existsSync(SKILLS_DIR)) {
      return "";
    }

    const entries = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter(
      (d) => d.isDirectory() && !d.name.startsWith("."),
    );

    if (entries.length === 0) return "";

    const lines = ["## Available Skills", ""];
    for (const entry of entries) {
      const skillDir = join(SKILLS_DIR, entry.name);
      const readmePath = join(skillDir, "SKILL.md");

      let description = "(no description)";
      try {
        const content = readFileSync(readmePath, "utf-8");
        const match = content.match(/^#\s+(.+)/m);
        if (match) description = match[1];
      } catch { /* no readme is fine */ }

      lines.push(`- **${entry.name}**: ${description}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/**
 * Build Hermes-enriched context for a non-Hermes runtime session.
 *
 * This is the core function of the context-service.
 * It respects hermesHooks.enabled, memory, skills, and mcp flags.
 *
 * Returns the enriched context string and metadata about what was applied.
 * Failures are logged but never throw — hooks are best-effort enrichment.
 */
export async function buildHermesEnrichedContext(
  employee: Employee,
  userMessage: string,
  opts: {
    config: import("../shared/types.js").JinnConfig;
  },
): Promise<HermesContextResult> {
  const hooks = employee.hermesHooks;
  if (!hooks?.enabled) {
    return { enrichedContext: "", hooksApplied: [], errors: [] };
  }

  const result: HermesContextResult = {
    enrichedContext: "",
    hooksApplied: [],
    errors: [],
  };

  const sections: string[] = [];
  sections.push(
    "## Hermes Context Enrichment",
    "",
    `Employee: ${employee.displayName || employee.name}`,
    `This session uses Hermes hooks for context enrichment.`,
    "",
  );

  // ── Honcho memory ────────────────────────────────────────────────
  if (hooks.memory) {
    try {
      const entries = await fetchHonchoMemory(employee.name);
      if (entries.length > 0) {
        sections.push("## Relevant Memory", "");
        for (const entry of entries.slice(0, 10)) {
          sections.push(`- ${entry.content}`);
        }
        sections.push("");
        result.hooksApplied.push("memory");
      }
    } catch (err) {
      const msg = `Hermes memory hook failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.warn(msg);
      result.errors.push(msg);
    }
  }

  // ── MCP tools ────────────────────────────────────────────────────
  if (hooks.mcp) {
    try {
      const { mcpServers } = resolveMcpServers(opts.config.mcp, employee);
      const summary = buildMcpToolsSummary(mcpServers);
      if (summary) {
        sections.push(summary, "");
        result.hooksApplied.push("mcp");
      }
    } catch (err) {
      const msg = `Hermes MCP hook failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.warn(msg);
      result.errors.push(msg);
    }
  }

  // ── Skills ───────────────────────────────────────────────────────
  if (hooks.skills) {
    try {
      const summary = await buildSkillsSummary();
      if (summary) {
        sections.push(summary, "");
        result.hooksApplied.push("skills");
      }
    } catch (err) {
      const msg = `Hermes skills hook failed: ${err instanceof Error ? err.message : String(err)}`;
      logger.warn(msg);
      result.errors.push(msg);
    }
  }

  if (sections.length <= 2) {
    // Nothing to add — no hooks succeeded
    return result;
  }

  result.enrichedContext = sections.join("\n");

  if (result.errors.length > 0) {
    logger.info(
      `Hermes context enrichment for ${employee.name}: applied [${result.hooksApplied.join(", ") || "none"}], errors [${result.errors.join(", ")}]`,
    );
  } else {
    logger.info(
      `Hermes context enrichment for ${employee.name}: applied [${result.hooksApplied.join(", ")}]`,
    );
  }

  return result;
}
