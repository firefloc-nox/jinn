import fs from "node:fs";
import yaml from "js-yaml";
import { CONFIG_PATH } from "./paths.js";
import type { JimmyConfig } from "./types.js";

export function loadConfig(): JimmyConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Jimmy config not found at ${CONFIG_PATH}. Run "jimmy setup" first.`
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return yaml.load(raw) as JimmyConfig;
}
