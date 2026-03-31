import fs from "node:fs";
import yaml from "js-yaml";
import { CONFIG_PATH } from "./paths.js";
import type { JinnConfig } from "./types.js";

export function loadConfig(): JinnConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Jinn config not found at ${CONFIG_PATH}. Run "jinn setup" first.`
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const config = yaml.load(raw) as JinnConfig;

  // Hermes-first default: if no brain/defaultEngine is set, prefer hermes when available.
  // Falls back to claude if hermes is not configured.
  if (!config.engines.default) {
    config.engines.default = config.engines.hermes ? "hermes" : "claude";
  }

  // Provide a safe default for logging so missing section doesn't crash at runtime.
  if (!config.logging) {
    config.logging = { level: "info", file: false, stdout: true };
  }

  return config;
}
