/**
 * Hermes profile filesystem helpers.
 *
 * Provides read/write access to a Hermes profile directory:
 *   ~/.hermes/profiles/<name>/
 *     config.yaml   — model, provider, reasoning_effort, max_turns, …
 *     SOUL.md       — identity / persona
 *     AGENT.md      — role, rules
 *     ROLE_SOUL.md  — optional role-specific soul override
 *
 * All operations are graceful when ~/.hermes/profiles/ is absent.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { logger } from "../shared/logger.js";

/** Base directory for all Hermes profiles. */
function hermesProfilesDir(): string {
  return path.join(process.env.HOME ?? os.homedir(), ".hermes", "profiles");
}

function profileDir(name: string): string {
  return path.join(hermesProfilesDir(), name);
}

/**
 * Fields from a profile's config.yaml that are surfaced via the API.
 * Only the keys we explicitly handle — the rest of the YAML is preserved on write.
 */
export interface HermesProfileConfig {
  model?: string;
  provider?: string;
  reasoning_effort?: string;
  max_turns?: number;
  /** Any other top-level config.yaml keys are preserved but not typed here. */
  [key: string]: unknown;
}

export interface HermesProfileData {
  name: string;
  exists: boolean;
  /** Parsed fields from config.yaml. Empty object when file is absent. */
  config: HermesProfileConfig;
  /** Contents of SOUL.md, or null when absent. */
  soul: string | null;
  /** Contents of AGENT.md, or null when absent. */
  agent: string | null;
  /** Contents of ROLE_SOUL.md, or null when absent. */
  role_soul: string | null;
}

/**
 * Read all data for a named Hermes profile.
 * Returns exists=false and empty fields when the profile directory is absent.
 */
export function readHermesProfile(name: string): HermesProfileData {
  const dir = profileDir(name);
  if (!fs.existsSync(dir)) {
    return { name, exists: false, config: {}, soul: null, agent: null, role_soul: null };
  }

  let config: HermesProfileConfig = {};
  const configPath = path.join(dir, "config.yaml");
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = yaml.load(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        config = parsed as HermesProfileConfig;
      }
    } catch (err) {
      logger.warn(`[profile-fs] Failed to parse config.yaml for profile "${name}": ${err}`);
    }
  }

  const readMd = (filename: string): string | null => {
    const p = path.join(dir, filename);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
  };

  return {
    name,
    exists: true,
    config,
    soul: readMd("SOUL.md"),
    agent: readMd("AGENT.md"),
    role_soul: readMd("ROLE_SOUL.md"),
  };
}

/**
 * Write a markdown file (SOUL.md / AGENT.md / ROLE_SOUL.md) inside a profile directory.
 * Creates the directory if absent.
 */
export function writeProfileFile(name: string, filename: string, content: string): void {
  const dir = profileDir(name);
  fs.mkdirSync(dir, { recursive: true });
  const allowed = ["SOUL.md", "AGENT.md", "ROLE_SOUL.md"];
  if (!allowed.includes(filename)) {
    throw new Error(`writeProfileFile: "${filename}" is not an allowed profile file`);
  }
  fs.writeFileSync(path.join(dir, filename), content, "utf-8");
  logger.info(`[profile-fs] Wrote ${filename} for profile "${name}"`);
}

/**
 * Patch a profile's config.yaml with the provided key-value pairs.
 * Only keys present in `patch` are updated; all other keys are preserved.
 * Creates config.yaml (and the profile dir) if absent.
 */
export function patchProfileConfig(name: string, patch: HermesProfileConfig): void {
  const dir = profileDir(name);
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, "config.yaml");

  let existing: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = yaml.load(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch (err) {
      logger.warn(`[profile-fs] Failed to read config.yaml for "${name}" before patch: ${err}`);
    }
  }

  const merged = { ...existing, ...patch };
  fs.writeFileSync(configPath, yaml.dump(merged, { lineWidth: -1 }), "utf-8");
  logger.info(`[profile-fs] Patched config.yaml for profile "${name}"`);
}

/**
 * Create a new profile by cloning an existing one.
 * If `cloneFrom` is not specified or its directory is absent, creates an empty directory.
 * No-ops if the target already exists (returns false in that case).
 */
export function createProfile(name: string, cloneFrom?: string): boolean {
  const targetDir = profileDir(name);
  if (fs.existsSync(targetDir)) {
    logger.warn(`[profile-fs] createProfile: profile "${name}" already exists`);
    return false;
  }

  if (cloneFrom) {
    const sourceDir = profileDir(cloneFrom);
    if (fs.existsSync(sourceDir)) {
      fs.cpSync(sourceDir, targetDir, { recursive: true });
      logger.info(`[profile-fs] Cloned profile: ${cloneFrom} → ${name}`);
      return true;
    }
    logger.warn(`[profile-fs] createProfile: source profile "${cloneFrom}" not found — creating empty`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  logger.info(`[profile-fs] Created empty profile directory: ${name}`);
  return true;
}

/**
 * Delete a profile directory (rm -rf).
 * Returns true if deleted, false if not found.
 */
export function deleteProfile(name: string): boolean {
  const dir = profileDir(name);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  logger.info(`[profile-fs] Deleted profile: ${name}`);
  return true;
}

// ─── Hermes global config reading ────────────────────────────────────────────

function hermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(process.env.HOME ?? os.homedir(), ".hermes");
}

/** Provider entry from Hermes config.yaml. */
export interface HermesProviderInfo {
  name: string;
  type: "builtin" | "custom";
  base_url?: string;
  has_key: boolean;
}

/** Summary of a profile's model/provider config for the settings UI. */
export interface HermesProfileSummary {
  name: string;
  model?: string;
  provider?: string;
  base_url?: string;
  reasoning_effort?: string;
  max_turns?: number;
  /** Which employee(s) use this profile, if any. */
  usedBy?: string[];
}

/**
 * Read the main Hermes config (~/.hermes/config.yaml) and extract
 * providers, custom_providers, and the default model/provider.
 */
export function readHermesGlobalConfig(): {
  defaultModel?: string;
  defaultProvider?: string;
  defaultBaseUrl?: string;
  providers: HermesProviderInfo[];
  customProviders: HermesProviderInfo[];
} {
  const configPath = path.join(hermesHome(), "config.yaml");
  if (!fs.existsSync(configPath)) {
    return { providers: [], customProviders: [] };
  }

  let raw: Record<string, unknown> = {};
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const parsed = yaml.load(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    }
  } catch (err) {
    logger.warn(`[profile-fs] Failed to read Hermes global config: ${err}`);
    return { providers: [], customProviders: [] };
  }

  // Extract default model config
  const modelBlock = raw.model as Record<string, unknown> | string | undefined;
  let defaultModel: string | undefined;
  let defaultProvider: string | undefined;
  let defaultBaseUrl: string | undefined;
  if (typeof modelBlock === "string") {
    defaultModel = modelBlock;
  } else if (modelBlock && typeof modelBlock === "object") {
    defaultModel = (modelBlock.default ?? modelBlock.model) as string | undefined;
    defaultProvider = modelBlock.provider as string | undefined;
    defaultBaseUrl = modelBlock.base_url as string | undefined;
  }

  // Extract named providers from `providers:` block
  const providers: HermesProviderInfo[] = [];
  const providersBlock = raw.providers as Record<string, unknown> | undefined;
  if (providersBlock && typeof providersBlock === "object") {
    for (const [key, val] of Object.entries(providersBlock)) {
      if (val && typeof val === "object") {
        const p = val as Record<string, unknown>;
        providers.push({
          name: (p.name as string) ?? key,
          type: "builtin",
          base_url: p.api as string | undefined,
          has_key: !!(p.api_key as string),
        });
      }
    }
  }

  // Extract custom_providers
  const customProviders: HermesProviderInfo[] = [];
  const customBlock = raw.custom_providers as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(customBlock)) {
    for (const entry of customBlock) {
      if (entry && typeof entry === "object") {
        customProviders.push({
          name: (entry.name as string) ?? "unknown",
          type: "custom",
          base_url: entry.base_url as string | undefined,
          has_key: !!(entry.api_key as string),
        });
      }
    }
  }

  // Add well-known providers from env vars
  const envProviders: Array<{ name: string; envKey: string }> = [
    { name: "anthropic", envKey: "ANTHROPIC_API_KEY" },
    { name: "openrouter", envKey: "OPENROUTER_API_KEY" },
    { name: "openai", envKey: "OPENAI_API_KEY" },
    { name: "nous", envKey: "NOUS_API_KEY" },
  ];

  for (const ep of envProviders) {
    if (!providers.some(p => p.name === ep.name) && !customProviders.some(p => p.name === ep.name)) {
      const hasKey = !!process.env[ep.envKey];
      providers.push({ name: ep.name, type: "builtin", has_key: hasKey });
    }
  }

  return { defaultModel, defaultProvider, defaultBaseUrl, providers, customProviders };
}

/**
 * Get all profiles with their model/provider summary for the settings UI.
 */
export function listProfileSummaries(): HermesProfileSummary[] {
  const names = listProfiles();
  return names.map(name => {
    const data = readHermesProfile(name);
    const cfg = data.config;

    // Handle model block that can be string or object
    let model: string | undefined;
    let provider: string | undefined;
    let base_url: string | undefined;

    const modelField = cfg.model;
    if (typeof modelField === "string") {
      model = modelField;
    } else if (modelField && typeof modelField === "object") {
      const m = modelField as Record<string, unknown>;
      model = (m.default ?? m.model) as string | undefined;
      provider = m.provider as string | undefined;
      base_url = m.base_url as string | undefined;
    }

    if (!provider && cfg.provider) provider = cfg.provider as string;

    return {
      name,
      model,
      provider,
      base_url,
      reasoning_effort: cfg.reasoning_effort as string | undefined,
      max_turns: cfg.max_turns != null ? Number(cfg.max_turns) : undefined,
    };
  });
}

/**
 * List all available Hermes profile names.
 * Returns empty array when ~/.hermes/profiles/ is absent.
 */
export function listProfiles(): string[] {
  const base = hermesProfilesDir();
  if (!fs.existsSync(base)) return [];
  try {
    return fs.readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}
