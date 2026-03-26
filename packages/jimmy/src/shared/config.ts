import fs from "node:fs";
import yaml from "js-yaml";
import { CONFIG_PATH } from "./paths.js";
import type { JinnConfig } from "./types.js";

const LOGGING_DEFAULTS = { file: true, stdout: true, level: "info" } as const;

export function loadConfig(): JinnConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Jinn config not found at ${CONFIG_PATH}. Run "jinn setup" first.`
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const config = yaml.load(raw) as JinnConfig;

  // Graceful defaults for v2 configs missing the logging section
  config.logging = { ...LOGGING_DEFAULTS, ...config.logging };

  return config;
}
