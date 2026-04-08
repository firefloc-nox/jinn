/**
 * Model Fallback Chain tests — OpenRouter-style model-level fallback.
 *
 * Tests the model fallback chain functionality that allows trying
 * multiple models in sequence when one hits rate limits or errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EngineResult, FallbackChainConfig } from "../../shared/types.js";

// Mock the rateLimit module before imports
vi.mock("../../shared/rateLimit.js", () => ({
  detectRateLimit: vi.fn((result: EngineResult) => {
    if (result.rateLimit?.status === "rejected") {
      return { limited: true, resetsAt: result.rateLimit.resetsAt };
    }
    if (result.error && /rate.?limit|429/i.test(result.error)) {
      return { limited: true };
    }
    return { limited: false };
  }),
}));

import {
  resolveInitialModel,
  isRateLimitError,
  isRetryableError,
  shouldFallbackToNextModel,
  getNextFallbackModel,
  ModelFallbackChain,
} from "../fallback.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEngineResult(overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    sessionId: "test-session",
    result: "Hello",
    durationMs: 100,
    numTurns: 1,
    ...overrides,
  };
}

function makeRateLimitResult(): EngineResult {
  return makeEngineResult({
    result: "",
    error: "Rate limit exceeded",
    rateLimit: {
      status: "rejected",
      resetsAt: Math.floor(Date.now() / 1000) + 3600,
    },
  });
}

function makeTransientErrorResult(): EngineResult {
  return makeEngineResult({
    result: "",
    error: "Connection timeout: ETIMEDOUT",
  });
}

const FALLBACK_CHAIN: FallbackChainConfig = {
  models: ["anthropic/claude-sonnet-4", "openai/gpt-4o", "anthropic/claude-haiku"],
  retryOnRateLimit: true,
  retryOnError: false,
};

const FALLBACK_CHAIN_WITH_ERROR_RETRY: FallbackChainConfig = {
  models: ["anthropic/claude-sonnet-4", "openai/gpt-4o"],
  retryOnRateLimit: true,
  retryOnError: true,
};

// ─── resolveInitialModel ──────────────────────────────────────────────────────

describe("resolveInitialModel", () => {
  it("should return empty model when no chain and no request", () => {
    const result = resolveInitialModel(undefined, undefined);
    expect(result.model).toBe("");
    expect(result.index).toBe(0);
    expect(result.isFallback).toBe(false);
  });

  it("should return requested model when no chain configured", () => {
    const result = resolveInitialModel("anthropic/claude-opus", undefined);
    expect(result.model).toBe("anthropic/claude-opus");
    expect(result.index).toBe(0);
    expect(result.isFallback).toBe(false);
  });

  it("should return first model in chain when no model requested", () => {
    const result = resolveInitialModel(undefined, FALLBACK_CHAIN);
    expect(result.model).toBe("anthropic/claude-sonnet-4");
    expect(result.index).toBe(0);
    expect(result.isFallback).toBe(false);
  });

  it("should use requested model and its index when model is in chain", () => {
    const result = resolveInitialModel("openai/gpt-4o", FALLBACK_CHAIN);
    expect(result.model).toBe("openai/gpt-4o");
    expect(result.index).toBe(1);
    expect(result.isFallback).toBe(false);
  });

  it("should return -1 index when requested model is not in chain", () => {
    const result = resolveInitialModel("anthropic/claude-opus", FALLBACK_CHAIN);
    expect(result.model).toBe("anthropic/claude-opus");
    expect(result.index).toBe(-1);
    expect(result.isFallback).toBe(false);
  });

  it("should handle empty chain array", () => {
    const emptyChain: FallbackChainConfig = { models: [] };
    const result = resolveInitialModel("test-model", emptyChain);
    expect(result.model).toBe("test-model");
    expect(result.index).toBe(0);
  });
});

// ─── isRateLimitError ─────────────────────────────────────────────────────────

describe("isRateLimitError", () => {
  it("should detect rate limit from rateLimit.status", () => {
    const result = makeRateLimitResult();
    expect(isRateLimitError(result)).toBe(true);
  });

  it("should detect rate limit from error message", () => {
    const result = makeEngineResult({
      error: "Error: 429 Too Many Requests",
    });
    expect(isRateLimitError(result)).toBe(true);
  });

  it("should return false for successful result", () => {
    const result = makeEngineResult();
    expect(isRateLimitError(result)).toBe(false);
  });

  it("should return false for non-rate-limit errors", () => {
    const result = makeEngineResult({
      error: "Invalid model name",
    });
    expect(isRateLimitError(result)).toBe(false);
  });
});

// ─── isRetryableError ─────────────────────────────────────────────────────────

describe("isRetryableError", () => {
  it("should detect timeout errors", () => {
    const result = makeEngineResult({ error: "Connection timeout" });
    expect(isRetryableError(result)).toBe(true);
  });

  it("should detect connection refused", () => {
    const result = makeEngineResult({ error: "Connection refused" });
    expect(isRetryableError(result)).toBe(true);
  });

  it("should detect ECONNRESET", () => {
    const result = makeEngineResult({ error: "Error: ECONNRESET" });
    expect(isRetryableError(result)).toBe(true);
  });

  it("should detect 503 errors", () => {
    const result = makeEngineResult({ error: "HTTP 503 Service Unavailable" });
    expect(isRetryableError(result)).toBe(true);
  });

  it("should detect overloaded", () => {
    const result = makeEngineResult({ error: "Server overloaded" });
    expect(isRetryableError(result)).toBe(true);
  });

  it("should return false for no error", () => {
    const result = makeEngineResult();
    expect(isRetryableError(result)).toBe(false);
  });

  it("should return false for non-transient errors", () => {
    const result = makeEngineResult({ error: "Invalid API key" });
    expect(isRetryableError(result)).toBe(false);
  });
});

// ─── shouldFallbackToNextModel ────────────────────────────────────────────────

describe("shouldFallbackToNextModel", () => {
  it("should return false when no chain configured", () => {
    const result = makeRateLimitResult();
    expect(shouldFallbackToNextModel(result, undefined)).toBe(false);
  });

  it("should return false for successful result", () => {
    const result = makeEngineResult();
    expect(shouldFallbackToNextModel(result, FALLBACK_CHAIN)).toBe(false);
  });

  it("should return true for rate limit when retryOnRateLimit is true", () => {
    const result = makeRateLimitResult();
    expect(shouldFallbackToNextModel(result, FALLBACK_CHAIN)).toBe(true);
  });

  it("should return false for rate limit when retryOnRateLimit is false", () => {
    const chain: FallbackChainConfig = {
      models: ["a", "b"],
      retryOnRateLimit: false,
    };
    const result = makeRateLimitResult();
    expect(shouldFallbackToNextModel(result, chain)).toBe(false);
  });

  it("should return false for transient error when retryOnError is false", () => {
    const result = makeTransientErrorResult();
    expect(shouldFallbackToNextModel(result, FALLBACK_CHAIN)).toBe(false);
  });

  it("should return true for transient error when retryOnError is true", () => {
    const result = makeTransientErrorResult();
    expect(shouldFallbackToNextModel(result, FALLBACK_CHAIN_WITH_ERROR_RETRY)).toBe(true);
  });
});

// ─── getNextFallbackModel ─────────────────────────────────────────────────────

describe("getNextFallbackModel", () => {
  it("should return undefined when no chain configured", () => {
    const result = getNextFallbackModel(0, undefined, "rate limit");
    expect(result).toBeUndefined();
  });

  it("should return undefined when currentIndex is -1 (not in chain)", () => {
    const result = getNextFallbackModel(-1, FALLBACK_CHAIN, "rate limit");
    expect(result).toBeUndefined();
  });

  it("should return undefined when at last model in chain", () => {
    const result = getNextFallbackModel(2, FALLBACK_CHAIN, "rate limit");
    expect(result).toBeUndefined();
  });

  it("should return next model with correct metadata", () => {
    const result = getNextFallbackModel(0, FALLBACK_CHAIN, "rate limit");
    expect(result).toBeDefined();
    expect(result!.model).toBe("openai/gpt-4o");
    expect(result!.index).toBe(1);
    expect(result!.isFallback).toBe(true);
    expect(result!.reason).toContain("claude-sonnet-4");
    expect(result!.reason).toContain("gpt-4o");
    expect(result!.reason).toContain("rate limit");
  });

  it("should advance through chain correctly", () => {
    const first = getNextFallbackModel(0, FALLBACK_CHAIN, "rate limit");
    expect(first!.model).toBe("openai/gpt-4o");

    const second = getNextFallbackModel(1, FALLBACK_CHAIN, "rate limit");
    expect(second!.model).toBe("anthropic/claude-haiku");

    const third = getNextFallbackModel(2, FALLBACK_CHAIN, "rate limit");
    expect(third).toBeUndefined();
  });
});

// ─── ModelFallbackChain class ─────────────────────────────────────────────────

describe("ModelFallbackChain", () => {
  describe("initialization", () => {
    it("should start with first model when none requested", () => {
      const chain = new ModelFallbackChain(undefined, FALLBACK_CHAIN);
      expect(chain.getCurrentModel()).toBe("anthropic/claude-sonnet-4");
      expect(chain.getCurrentIndex()).toBe(0);
      expect(chain.isUsingFallback()).toBe(false);
    });

    it("should start with requested model when in chain", () => {
      const chain = new ModelFallbackChain("openai/gpt-4o", FALLBACK_CHAIN);
      expect(chain.getCurrentModel()).toBe("openai/gpt-4o");
      expect(chain.getCurrentIndex()).toBe(1);
      expect(chain.isUsingFallback()).toBe(false);
    });

    it("should use requested model when not in chain", () => {
      const chain = new ModelFallbackChain("anthropic/claude-opus", FALLBACK_CHAIN);
      expect(chain.getCurrentModel()).toBe("anthropic/claude-opus");
      expect(chain.getCurrentIndex()).toBe(-1);
      expect(chain.isUsingFallback()).toBe(false);
    });
  });

  describe("handleResult", () => {
    it("should return false for successful result", () => {
      const chain = new ModelFallbackChain(undefined, FALLBACK_CHAIN);
      const shouldRetry = chain.handleResult(makeEngineResult());
      expect(shouldRetry).toBe(false);
      expect(chain.getCurrentModel()).toBe("anthropic/claude-sonnet-4");
    });

    it("should advance to next model on rate limit", () => {
      const chain = new ModelFallbackChain(undefined, FALLBACK_CHAIN);
      const shouldRetry = chain.handleResult(makeRateLimitResult());
      expect(shouldRetry).toBe(true);
      expect(chain.getCurrentModel()).toBe("openai/gpt-4o");
      expect(chain.getCurrentIndex()).toBe(1);
      expect(chain.isUsingFallback()).toBe(true);
    });

    it("should not fallback when model is not in chain", () => {
      const chain = new ModelFallbackChain("custom-model", FALLBACK_CHAIN);
      const shouldRetry = chain.handleResult(makeRateLimitResult());
      expect(shouldRetry).toBe(false);
      expect(chain.getCurrentModel()).toBe("custom-model");
    });

    it("should exhaust chain and return false at end", () => {
      const chain = new ModelFallbackChain(undefined, FALLBACK_CHAIN);
      
      // First fallback
      expect(chain.handleResult(makeRateLimitResult())).toBe(true);
      expect(chain.getCurrentModel()).toBe("openai/gpt-4o");
      
      // Second fallback
      expect(chain.handleResult(makeRateLimitResult())).toBe(true);
      expect(chain.getCurrentModel()).toBe("anthropic/claude-haiku");
      
      // Chain exhausted
      expect(chain.handleResult(makeRateLimitResult())).toBe(false);
      expect(chain.getCurrentModel()).toBe("anthropic/claude-haiku");
    });

    it("should accumulate fallback reasons", () => {
      const chain = new ModelFallbackChain(undefined, FALLBACK_CHAIN);
      chain.handleResult(makeRateLimitResult());
      chain.handleResult(makeRateLimitResult());
      
      const reasons = chain.getFallbackReasons();
      expect(reasons).toHaveLength(2);
      expect(reasons[0]).toContain("claude-sonnet-4");
      expect(reasons[1]).toContain("gpt-4o");
    });
  });

  describe("getRoutingMetadata", () => {
    it("should return correct metadata without fallback", () => {
      const chain = new ModelFallbackChain("anthropic/claude-sonnet-4", FALLBACK_CHAIN);
      chain.handleResult(makeEngineResult()); // success
      
      const meta = chain.getRoutingMetadata();
      expect(meta.requestedModel).toBe("anthropic/claude-sonnet-4");
      expect(meta.resolvedModel).toBe("anthropic/claude-sonnet-4");
      expect(meta.modelFallbackUsed).toBe(false);
      expect(meta.modelFallbackIndex).toBe(0);
    });

    it("should return correct metadata after fallback", () => {
      const chain = new ModelFallbackChain("anthropic/claude-sonnet-4", FALLBACK_CHAIN);
      chain.handleResult(makeRateLimitResult()); // triggers fallback
      
      const meta = chain.getRoutingMetadata();
      expect(meta.requestedModel).toBe("anthropic/claude-sonnet-4");
      expect(meta.resolvedModel).toBe("openai/gpt-4o");
      expect(meta.modelFallbackUsed).toBe(true);
      expect(meta.modelFallbackIndex).toBe(1);
    });

    it("should preserve requested model through multiple fallbacks", () => {
      const chain = new ModelFallbackChain("anthropic/claude-sonnet-4", FALLBACK_CHAIN);
      chain.handleResult(makeRateLimitResult());
      chain.handleResult(makeRateLimitResult());
      
      const meta = chain.getRoutingMetadata();
      expect(meta.requestedModel).toBe("anthropic/claude-sonnet-4");
      expect(meta.resolvedModel).toBe("anthropic/claude-haiku");
      expect(meta.modelFallbackIndex).toBe(2);
    });
  });
});

// ─── Integration scenarios ────────────────────────────────────────────────────

describe("Model Fallback Chain — Integration Scenarios", () => {
  it("should handle full fallback chain scenario", () => {
    const chain = new ModelFallbackChain(undefined, FALLBACK_CHAIN);
    
    // Primary model rate limited
    expect(chain.handleResult(makeRateLimitResult())).toBe(true);
    expect(chain.getCurrentModel()).toBe("openai/gpt-4o");
    
    // Second model also rate limited
    expect(chain.handleResult(makeRateLimitResult())).toBe(true);
    expect(chain.getCurrentModel()).toBe("anthropic/claude-haiku");
    
    // Third model succeeds
    expect(chain.handleResult(makeEngineResult())).toBe(false);
    expect(chain.getCurrentModel()).toBe("anthropic/claude-haiku");
    expect(chain.isUsingFallback()).toBe(true);
  });

  it("should not fallback on transient errors with default config", () => {
    const chain = new ModelFallbackChain(undefined, FALLBACK_CHAIN);
    const shouldRetry = chain.handleResult(makeTransientErrorResult());
    expect(shouldRetry).toBe(false);
    expect(chain.getCurrentModel()).toBe("anthropic/claude-sonnet-4");
  });

  it("should fallback on transient errors when configured", () => {
    const chain = new ModelFallbackChain(undefined, FALLBACK_CHAIN_WITH_ERROR_RETRY);
    const shouldRetry = chain.handleResult(makeTransientErrorResult());
    expect(shouldRetry).toBe(true);
    expect(chain.getCurrentModel()).toBe("openai/gpt-4o");
  });

  it("should work with single model chain", () => {
    const singleChain: FallbackChainConfig = {
      models: ["only-model"],
      retryOnRateLimit: true,
    };
    const chain = new ModelFallbackChain(undefined, singleChain);
    
    // Rate limit hit but no fallback available
    const shouldRetry = chain.handleResult(makeRateLimitResult());
    expect(shouldRetry).toBe(false);
    expect(chain.getCurrentModel()).toBe("only-model");
  });
});
