import fs from "node:fs";
import yaml from "js-yaml";
import { CONFIG_PATH } from "./paths.js";
import type { JinnConfig } from "./types.js";

/**
 * Recursively resolve ${VAR} and $VAR env-var placeholders in parsed config.
 */
function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    const match = obj.match(/^\$\{(.+)\}$/);
    if (match) return process.env[match[1]] ?? obj;
    if (obj.startsWith("$") && !obj.startsWith("${")) {
      return process.env[obj.slice(1)] ?? obj;
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars);
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = resolveEnvVars(v);
    }
    return result;
  }
  return obj;
}

export function loadConfig(): JinnConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Jinn config not found at ${CONFIG_PATH}. Run "jinn setup" first.`
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const parsed = yaml.load(raw);
  return resolveEnvVars(parsed) as JinnConfig;
}
