import { describe, it, expect, beforeEach } from "vitest";
import { getCapabilities, ENGINE_CAPABILITIES, type EngineCapabilities } from "../capabilities.js";

describe("ENGINE_CAPABILITIES registry", () => {
  it("should define capabilities for hermes", () => {
    expect(ENGINE_CAPABILITIES.hermes).toBeDefined();
  });

  it("should define capabilities for claude", () => {
    expect(ENGINE_CAPABILITIES.claude).toBeDefined();
  });

  it("should define capabilities for codex", () => {
    expect(ENGINE_CAPABILITIES.codex).toBeDefined();
  });

  it("should define capabilities for gemini", () => {
    expect(ENGINE_CAPABILITIES.gemini).toBeDefined();
  });
});

describe("HermesEngine capabilities", () => {
  let caps: EngineCapabilities;

  beforeEach(() => {
    caps = getCapabilities("hermes");
  });

  it("should have mcpNative=true — Hermes manages MCP internally", () => {
    expect(caps.mcpNative).toBe(true);
  });

  it("should have sessionResume=true — supports --resume flag", () => {
    expect(caps.sessionResume).toBe(true);
  });

  it("should have interruptible=true — supports SIGTERM/SIGKILL", () => {
    expect(caps.interruptible).toBe(true);
  });

  it("should have streaming=false — V1: no NDJSON stream mode", () => {
    expect(caps.streaming).toBe(false);
  });

  it("should have costTracking=false — V1: not exposed by hermes --quiet", () => {
    expect(caps.costTracking).toBe(false);
  });
});

describe("Claude capabilities", () => {
  let caps: EngineCapabilities;

  beforeEach(() => {
    caps = getCapabilities("claude");
  });

  it("should have streaming=true", () => {
    expect(caps.streaming).toBe(true);
  });

  it("should have costTracking=true", () => {
    expect(caps.costTracking).toBe(true);
  });

  it("should have mcpNative=false — Jinn manages MCP config file", () => {
    expect(caps.mcpNative).toBe(false);
  });

  it("should have sessionResume=false", () => {
    expect(caps.sessionResume).toBe(false);
  });

  it("should have interruptible=true", () => {
    expect(caps.interruptible).toBe(true);
  });
});

describe("Codex capabilities", () => {
  let caps: EngineCapabilities;

  beforeEach(() => {
    caps = getCapabilities("codex");
  });

  it("should have streaming=true", () => {
    expect(caps.streaming).toBe(true);
  });

  it("should have costTracking=false", () => {
    expect(caps.costTracking).toBe(false);
  });

  it("should have mcpNative=false", () => {
    expect(caps.mcpNative).toBe(false);
  });

  it("should have sessionResume=false", () => {
    expect(caps.sessionResume).toBe(false);
  });

  it("should have interruptible=true", () => {
    expect(caps.interruptible).toBe(true);
  });
});

describe("Gemini capabilities", () => {
  let caps: EngineCapabilities;

  beforeEach(() => {
    caps = getCapabilities("gemini");
  });

  it("should have streaming=false", () => {
    expect(caps.streaming).toBe(false);
  });

  it("should have costTracking=false", () => {
    expect(caps.costTracking).toBe(false);
  });

  it("should have mcpNative=false", () => {
    expect(caps.mcpNative).toBe(false);
  });

  it("should have sessionResume=false", () => {
    expect(caps.sessionResume).toBe(false);
  });

  it("should have interruptible=true", () => {
    expect(caps.interruptible).toBe(true);
  });
});

describe("getCapabilities — legacy engine distinctions", () => {
  it("only hermes has mcpNative=true", () => {
    const legacyEngines = ["claude", "codex", "gemini"];
    for (const name of legacyEngines) {
      expect(getCapabilities(name).mcpNative).toBe(false);
    }
  });

  it("only hermes has sessionResume=true", () => {
    const legacyEngines = ["claude", "codex", "gemini"];
    for (const name of legacyEngines) {
      expect(getCapabilities(name).sessionResume).toBe(false);
    }
  });

  it("only claude has costTracking=true", () => {
    const others = ["hermes", "codex", "gemini"];
    for (const name of others) {
      expect(getCapabilities(name).costTracking).toBe(false);
    }
    expect(getCapabilities("claude").costTracking).toBe(true);
  });
});

describe("getCapabilities — unknown engine fallback", () => {
  it("should return all-false capabilities for unknown engine", () => {
    const caps = getCapabilities("unknown-engine-xyz");

    expect(caps.streaming).toBe(false);
    expect(caps.costTracking).toBe(false);
    expect(caps.mcpNative).toBe(false);
    expect(caps.sessionResume).toBe(false);
    expect(caps.interruptible).toBe(false);
  });

  it("should not throw for empty string engine name", () => {
    expect(() => getCapabilities("")).not.toThrow();
  });

  it("should return false for all flags on empty string engine", () => {
    const caps = getCapabilities("");
    expect(caps.mcpNative).toBe(false);
    expect(caps.sessionResume).toBe(false);
  });
});
