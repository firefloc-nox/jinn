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

  const configuredDefaultRuntime: NonNullable<JinnConfig["routing"]>["defaultRuntime"] =
    config.routing?.defaultRuntime
    ?? config.brain?.primary
    ?? config.engines.default
    ?? (config.engines.hermes ? "hermes" : "claude");

  if (!config.routing) {
    config.routing = {
      defaultRuntime: configuredDefaultRuntime,
      fallbackRuntimes: config.brain?.fallbacks ?? config.sessions?.fallbackEngines ?? [],
    };
  } else {
    config.routing.defaultRuntime ??= configuredDefaultRuntime;
    config.routing.fallbackRuntimes ??= config.brain?.fallbacks ?? config.sessions?.fallbackEngines ?? [];
  }

  const defaultRuntime = config.routing.defaultRuntime ?? configuredDefaultRuntime;
  config.routing.defaultRuntime = defaultRuntime;

  // Legacy compatibility: keep engines.default and brain.primary populated during migration.
  config.engines.default = config.engines.default || defaultRuntime;
  if (!config.brain) {
    config.brain = {
      primary: defaultRuntime,
      fallbacks: config.routing.fallbackRuntimes ?? [],
      fallbackOnUnavailable: true,
      fallbackOnHardFailure: true,
    };
  } else {
    config.brain.primary ||= defaultRuntime;
    config.brain.fallbacks ||= config.routing.fallbackRuntimes ?? [];
  }

  // Provide a safe default for logging so missing section doesn't crash at runtime.
  if (!config.logging) {
    config.logging = { level: "info", file: false, stdout: true };
  }

  return config;
}
