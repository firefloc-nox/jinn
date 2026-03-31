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

  // Hermes-first: engines.default is always "hermes" when not explicitly set.
  // The hermes block may be absent (user deleted it) but the default still points to hermes
  // so the fallback policy in sessions/fallback.ts can decide at runtime.
  if (!config.engines.default) {
    config.engines.default = "hermes";
  }

  // Ensure brain block exists with primary: hermes when absent from config file.
  if (!config.brain) {
    config.brain = {
      primary: "hermes",
      fallbacks: ["claude", "codex"],
      fallbackOnUnavailable: true,
      fallbackOnHardFailure: true,
    };
  } else if (!config.brain.primary) {
    config.brain.primary = "hermes";
  }

  // Provide a safe default for logging so missing section doesn't crash at runtime.
  if (!config.logging) {
    config.logging = { level: "info", file: false, stdout: true };
  }

  return config;
}
