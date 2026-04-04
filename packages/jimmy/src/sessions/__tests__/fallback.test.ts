import { describe, it, expect } from "vitest";
import {
  resolveFallbackExecutor,
  DEFAULT_FALLBACK_POLICY,
  type FallbackPolicy,
} from "../fallback.js";

describe("DEFAULT_FALLBACK_POLICY", () => {
  it("should have primary='hermes'", () => {
    expect(DEFAULT_FALLBACK_POLICY.primary).toBe("hermes");
  });

  it("should include claude, codex, gemini in fallbacks", () => {
    expect(DEFAULT_FALLBACK_POLICY.fallbacks).toContain("claude");
    expect(DEFAULT_FALLBACK_POLICY.fallbacks).toContain("codex");
    expect(DEFAULT_FALLBACK_POLICY.fallbacks).toContain("gemini");
  });

  it("should have fallbackOnUnavailable=true", () => {
    expect(DEFAULT_FALLBACK_POLICY.fallbackOnUnavailable).toBe(true);
  });

  it("should have fallbackOnHardFailure=true (reserved for V2)", () => {
    expect(DEFAULT_FALLBACK_POLICY.fallbackOnHardFailure).toBe(true);
  });
});

describe("resolveFallbackExecutor", () => {
  const policy: FallbackPolicy = {
    primary: "hermes",
    fallbacks: ["claude", "codex"],
    fallbackOnUnavailable: true,
    fallbackOnHardFailure: true,
  };

  describe("Hermes success path", () => {
    it("should return hermes when primary=hermes and hermes is available", () => {
      const available = new Set(["hermes", "claude", "codex"]);
      const result = resolveFallbackExecutor("hermes", available, policy);

      expect(result.runtimeRef).toBe("hermes");
      expect(result.executor).toBe("hermes");
      expect(result.fallbackUsed).toBe(false);
      expect(result.fallbackReason).toBeUndefined();
    });

    it("should resolve hermes:openrouter to hermes when hermes executor is available", () => {
      const available = new Set(["hermes", "claude", "codex"]);
      const result = resolveFallbackExecutor("hermes:openrouter", available, policy);

      expect(result.runtimeRef).toBe("hermes:openrouter");
      expect(result.executor).toBe("hermes");
      expect(result.fallbackUsed).toBe(false);
      expect(result.fallbackReason).toBeUndefined();
    });

    it("should not set fallbackReason when primary is used", () => {
      const available = new Set(["hermes"]);
      const result = resolveFallbackExecutor("hermes", available, policy);

      expect(result.fallbackReason).toBeUndefined();
    });
  });

  describe("Hermes hard fail → Claude fallback", () => {
    it("should return claude when hermes is unavailable and claude is in fallbacks", () => {
      const available = new Set(["claude", "codex"]); // hermes not registered
      const result = resolveFallbackExecutor("hermes", available, policy);

      expect(result.executor).toBe("claude");
      expect(result.fallbackUsed).toBe(true);
      expect(result.fallbackReason).toContain("hermes");
      expect(result.fallbackReason).toContain("claude");
    });

    it("should set fallbackReason explaining why fallback was used", () => {
      const available = new Set(["claude"]);
      const result = resolveFallbackExecutor("hermes", available, policy);

      expect(result.fallbackReason).toMatch(/Runtime \"hermes\" not available/);
      expect(result.fallbackReason).toMatch(/using \"claude\"/);
    });
  });

  describe("Hermes hard fail → Codex fallback", () => {
    it("should return codex when hermes AND claude are unavailable", () => {
      const available = new Set(["codex"]); // hermes and claude not registered
      const result = resolveFallbackExecutor("hermes", available, policy);

      expect(result.executor).toBe("codex");
      expect(result.fallbackUsed).toBe(true);
    });

    it("should skip non-available engines in fallback chain", () => {
      const policyWithLongChain: FallbackPolicy = {
        primary: "hermes",
        fallbacks: ["claude", "gemini", "codex"],
        fallbackOnUnavailable: true,
        fallbackOnHardFailure: true,
      };
      // Only codex available
      const available = new Set(["codex"]);
      const result = resolveFallbackExecutor("hermes", available, policyWithLongChain);

      expect(result.executor).toBe("codex");
      expect(result.fallbackUsed).toBe(true);
    });
  });

  describe("No fallback configured", () => {
    it("should return requestedBrain when fallbacks=[] and primary unavailable", () => {
      const emptyPolicy: FallbackPolicy = {
        primary: "hermes",
        fallbacks: [],
        fallbackOnUnavailable: true,
        fallbackOnHardFailure: true,
      };
      const available = new Set(["claude"]); // hermes not registered
      const result = resolveFallbackExecutor("hermes", available, emptyPolicy);

      // No fallback found — returns requestedBrain (will fail at engine.run() time)
      expect(result.executor).toBe("hermes");
      expect(result.fallbackUsed).toBe(false);
      expect(result.fallbackReason).toContain("no fallback found");
    });

    it("should return requestedBrain when fallbackOnUnavailable=false", () => {
      const noFallbackPolicy: FallbackPolicy = {
        primary: "hermes",
        fallbacks: ["claude", "codex"],
        fallbackOnUnavailable: false,
        fallbackOnHardFailure: false,
      };
      const available = new Set(["claude", "codex"]); // hermes not registered
      const result = resolveFallbackExecutor("hermes", available, noFallbackPolicy);

      expect(result.executor).toBe("hermes");
      expect(result.fallbackUsed).toBe(false);
    });
  });

  describe("fallback chain ordering", () => {
    it("should prefer the first available engine in fallbacks order", () => {
      const available = new Set(["codex", "claude"]); // both available, hermes not
      const result = resolveFallbackExecutor("hermes", available, policy);

      // claude is first in policy.fallbacks = ["claude", "codex"]
      expect(result.executor).toBe("claude");
    });

    it("should not use primary as its own fallback", () => {
      const selfPolicy: FallbackPolicy = {
        primary: "hermes",
        fallbacks: ["hermes", "claude"], // hermes listed as fallback (degenerate case)
        fallbackOnUnavailable: true,
        fallbackOnHardFailure: true,
      };
      const available = new Set(["claude"]); // hermes not in available
      const result = resolveFallbackExecutor("hermes", available, selfPolicy);

      // Should skip "hermes" in fallbacks (it's the requestedBrain and not available)
      expect(result.executor).toBe("claude");
    });
  });

  describe("non-hermes primary", () => {
    it("should work for non-hermes primary — direct use when available", () => {
      const claudePolicy: FallbackPolicy = {
        primary: "claude",
        fallbacks: ["codex"],
        fallbackOnUnavailable: true,
        fallbackOnHardFailure: false,
      };
      const available = new Set(["claude", "codex"]);
      const result = resolveFallbackExecutor("claude", available, claudePolicy);

      expect(result.executor).toBe("claude");
      expect(result.fallbackUsed).toBe(false);
    });
  });
});
