import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

vi.mock("../shared/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { readHermesGlobalConfig, listProfileSummaries } from "../profile-fs.js";

let tmpHome: string;

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-providers-test-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

// ─── readHermesGlobalConfig ───────────────────────────────────────────────────

describe("readHermesGlobalConfig", () => {
  it("returns empty providers when config.yaml is missing", () => {
    vi.stubEnv("HERMES_HOME", path.join(tmpHome, ".hermes"));

    const result = readHermesGlobalConfig();

    expect(result.defaultModel).toBeUndefined();
    expect(result.defaultProvider).toBeUndefined();
    expect(result.providers).toEqual(expect.any(Array));
    expect(result.customProviders).toEqual([]);
  });

  it("extracts default model from string format (model: 'some-model')", () => {
    const hermesDir = path.join(tmpHome, ".hermes");
    fs.mkdirSync(hermesDir, { recursive: true });
    fs.writeFileSync(
      path.join(hermesDir, "config.yaml"),
      'model: "claude-sonnet-4-5"\n',
      "utf-8",
    );
    vi.stubEnv("HERMES_HOME", hermesDir);

    const result = readHermesGlobalConfig();

    expect(result.defaultModel).toBe("claude-sonnet-4-5");
    expect(result.defaultProvider).toBeUndefined();
  });

  it("extracts default model from dict format (model: { default, provider, base_url })", () => {
    const hermesDir = path.join(tmpHome, ".hermes");
    fs.mkdirSync(hermesDir, { recursive: true });
    fs.writeFileSync(
      path.join(hermesDir, "config.yaml"),
      [
        "model:",
        '  default: "gpt-4o"',
        '  provider: "openrouter"',
        '  base_url: "https://openrouter.ai/api/v1"',
      ].join("\n") + "\n",
      "utf-8",
    );
    vi.stubEnv("HERMES_HOME", hermesDir);

    const result = readHermesGlobalConfig();

    expect(result.defaultModel).toBe("gpt-4o");
    expect(result.defaultProvider).toBe("openrouter");
    expect(result.defaultBaseUrl).toBe("https://openrouter.ai/api/v1");
  });

  it("extracts custom_providers from config.yaml", () => {
    const hermesDir = path.join(tmpHome, ".hermes");
    fs.mkdirSync(hermesDir, { recursive: true });
    fs.writeFileSync(
      path.join(hermesDir, "config.yaml"),
      [
        "custom_providers:",
        "  - name: my-local",
        '    base_url: "http://localhost:1234/v1"',
        '    api_key: "sk-local"',
        "  - name: corp-proxy",
        '    base_url: "https://proxy.corp.com/v1"',
      ].join("\n") + "\n",
      "utf-8",
    );
    vi.stubEnv("HERMES_HOME", hermesDir);

    const result = readHermesGlobalConfig();

    expect(result.customProviders).toHaveLength(2);
    expect(result.customProviders[0]).toMatchObject({
      name: "my-local",
      type: "custom",
      base_url: "http://localhost:1234/v1",
      has_key: true,
    });
    expect(result.customProviders[1]).toMatchObject({
      name: "corp-proxy",
      type: "custom",
      base_url: "https://proxy.corp.com/v1",
      has_key: false,
    });
  });
});

// ─── listProfileSummaries ─────────────────────────────────────────────────────

describe("listProfileSummaries", () => {
  it("returns empty array when no profiles exist", () => {
    // hermesProfilesDir uses HOME, not HERMES_HOME
    vi.stubEnv("HOME", tmpHome);

    const result = listProfileSummaries();

    expect(result).toEqual([]);
  });

  it("reads model string format from profile config.yaml", () => {
    vi.stubEnv("HOME", tmpHome);
    const profileDir = path.join(tmpHome, ".hermes", "profiles", "my-agent");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      path.join(profileDir, "config.yaml"),
      'model: "claude-opus-4"\n',
      "utf-8",
    );

    const result = listProfileSummaries();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "my-agent",
      model: "claude-opus-4",
    });
  });

  it("reads model dict format from profile config.yaml", () => {
    vi.stubEnv("HOME", tmpHome);
    const profileDir = path.join(tmpHome, ".hermes", "profiles", "openrouter-agent");
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(
      path.join(profileDir, "config.yaml"),
      [
        "model:",
        '  default: "meta-llama/llama-3.1-70b-instruct"',
        '  provider: "openrouter"',
        '  base_url: "https://openrouter.ai/api/v1"',
      ].join("\n") + "\n",
      "utf-8",
    );

    const result = listProfileSummaries();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "openrouter-agent",
      model: "meta-llama/llama-3.1-70b-instruct",
      provider: "openrouter",
      base_url: "https://openrouter.ai/api/v1",
    });
  });
});
