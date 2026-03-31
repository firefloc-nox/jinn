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
