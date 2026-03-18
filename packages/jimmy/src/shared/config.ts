import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { CONFIG_PATH, JINN_HOME } from "./paths.js";
import type { JinnConfig } from "./types.js";

/**
 * Load .env file from JINN_HOME or project root into process.env.
 * Does not override existing env vars.
 */
function loadDotenv(): void {
  const candidates = [
    path.join(JINN_HOME, ".env"),
    path.resolve(".env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Expand ${VAR_NAME} references in a YAML string using process.env.
 */
function expandEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (_match, varName) => {
    return process.env[varName] ?? "";
  });
}

export function loadConfig(): JinnConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Jinn config not found at ${CONFIG_PATH}. Run "jinn setup" first.`
    );
  }
  loadDotenv();
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return yaml.load(expandEnvVars(raw)) as JinnConfig;
}
