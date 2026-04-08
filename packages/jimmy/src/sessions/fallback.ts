import type { RuntimeRef, FallbackChainConfig, EngineResult } from "../shared/types.js";
import { detectRateLimit } from "../shared/rateLimit.js";

/**
 * Runtime fallback resolution.
 * Determines which native executor to use for a logical runtimeRef,
 * following the configured fallback chain when the requested runtime is unavailable.
 */

export interface FallbackPolicy {
  /** Primary runtimeRef — legacy alias kept under `brain.primary` during migration. */
  primary: RuntimeRef;
  /** Ordered fallback chain when the requested runtime is unavailable. */
  fallbacks: RuntimeRef[];
  /** Fall back to next runtime if the requested executor is not registered. */
  fallbackOnUnavailable: boolean;
  /** Fall back to next runtime if the requested runtime fails with a hard error. */
  // V2 — not yet consumed by resolveFallbackExecutor. Reserved for hard-failure retry logic.
  fallbackOnHardFailure: boolean;
}

export const DEFAULT_FALLBACK_POLICY: FallbackPolicy = {
  primary: "hermes",
  fallbacks: ["claude", "codex", "gemini"],
  fallbackOnUnavailable: true,
  // V2 — not yet consumed by resolveFallbackExecutor. Reserved for hard-failure retry logic.
  fallbackOnHardFailure: true,
};

export interface FallbackResult {
  /** Logical runtime requested by routing (can be `hermes:openrouter`, etc.). */
  runtimeRef: RuntimeRef;
  /** Native executor binary key that will actually execute the session. */
  executor: string;
  /** Whether the requested runtime was unavailable and a fallback was used. */
  fallbackUsed: boolean;
  /** Human-readable reason for using a fallback, if applicable. */
  fallbackReason?: string;
}

/**
 * Result of model-level fallback chain resolution.
 */
export interface ModelFallbackResult {
  /** The model to use for this attempt. */
  model: string;
  /** Index in the fallback chain (0 = primary/requested model). */
  index: number;
  /** Whether this is a fallback model (index > 0). */
  isFallback: boolean;
  /** Human-readable reason for using this model. */
  reason?: string;
}

/** Base native executor for a logical runtimeRef. `hermes:openrouter` -> `hermes`. */
export function getExecutorForRuntimeRef(runtimeRef: RuntimeRef): string {
  return String(runtimeRef).split(":")[0] || String(runtimeRef);
}

/**
 * Resolve which executor to use for a logical runtimeRef.
 *
 * Logic:
 * 1. If requested runtime's native executor is available → use it directly.
 * 2. If not available and fallbackOnUnavailable → iterate fallback runtimeRefs in order.
 * 3. If no fallback is available → return requested runtime's executor anyway (will fail later).
 */
export function resolveFallbackExecutor(
  requestedRuntime: RuntimeRef,
  availableEngines: Set<string>,
  policy: FallbackPolicy,
): FallbackResult {
  const requestedExecutor = getExecutorForRuntimeRef(requestedRuntime);

  if (availableEngines.has(requestedExecutor)) {
    return { runtimeRef: requestedRuntime, executor: requestedExecutor, fallbackUsed: false };
  }

  if (policy.fallbackOnUnavailable) {
    for (const fallbackRuntime of policy.fallbacks) {
      const fallbackExecutor = getExecutorForRuntimeRef(fallbackRuntime);
      if (fallbackRuntime !== requestedRuntime && availableEngines.has(fallbackExecutor)) {
        return {
          runtimeRef: fallbackRuntime,
          executor: fallbackExecutor,
          fallbackUsed: true,
          fallbackReason: `Runtime "${requestedRuntime}" not available; using "${fallbackRuntime}" via executor "${fallbackExecutor}"`,
        };
      }
    }
  }

  return {
    runtimeRef: requestedRuntime,
    executor: requestedExecutor,
    fallbackUsed: false,
    fallbackReason: `Runtime "${requestedRuntime}" not available and no fallback found`,
  };
}

// ─── Model-level Fallback Chain (OpenRouter-style) ─────────────────────────────

/**
 * Resolve the initial model from a fallback chain.
 * If the requested model is in the chain, start from that index.
 * Otherwise, start from the beginning of the chain.
 */
export function resolveInitialModel(
  requestedModel: string | undefined,
  fallbackChain: FallbackChainConfig | undefined,
): ModelFallbackResult {
  // No fallback chain configured — use the requested model as-is
  if (!fallbackChain || fallbackChain.models.length === 0) {
    return {
      model: requestedModel || "",
      index: 0,
      isFallback: false,
    };
  }

  // If a specific model is requested and it's in the chain, start from there
  if (requestedModel) {
    const idx = fallbackChain.models.indexOf(requestedModel);
    if (idx >= 0) {
      return {
        model: requestedModel,
        index: idx,
        isFallback: false,
      };
    }
    // Requested model is not in the chain — use it directly (no fallback)
    return {
      model: requestedModel,
      index: -1, // Not in chain
      isFallback: false,
    };
  }

  // No specific model requested — use the first model in the chain
  return {
    model: fallbackChain.models[0],
    index: 0,
    isFallback: false,
  };
}

/**
 * Check if a result indicates a rate limit error.
 */
export function isRateLimitError(result: EngineResult): boolean {
  const rateLimit = detectRateLimit(result);
  return rateLimit.limited;
}

/**
 * Check if a result indicates a transient/retryable error.
 */
export function isRetryableError(result: EngineResult): boolean {
  if (!result.error) return false;
  // Match common transient error patterns
  const transientPatterns = [
    /timeout/i,
    /connection.*refused/i,
    /network.*error/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /service.*unavailable/i,
    /502|503|504/,
    /overloaded/i,
  ];
  return transientPatterns.some(p => p.test(result.error!));
}

/**
 * Determine if we should try the next model in the fallback chain based on the result.
 */
export function shouldFallbackToNextModel(
  result: EngineResult,
  fallbackChain: FallbackChainConfig | undefined,
): boolean {
  if (!fallbackChain || fallbackChain.models.length === 0) {
    return false;
  }

  const retryOnRateLimit = fallbackChain.retryOnRateLimit ?? true;
  const retryOnError = fallbackChain.retryOnError ?? false;

  if (retryOnRateLimit && isRateLimitError(result)) {
    return true;
  }

  if (retryOnError && isRetryableError(result)) {
    return true;
  }

  return false;
}

/**
 * Get the next model in the fallback chain.
 * Returns undefined if there are no more models to try.
 */
export function getNextFallbackModel(
  currentIndex: number,
  fallbackChain: FallbackChainConfig | undefined,
  failureReason: string,
): ModelFallbackResult | undefined {
  if (!fallbackChain || fallbackChain.models.length === 0) {
    return undefined;
  }

  // currentIndex = -1 means the model was not in the chain
  if (currentIndex < 0) {
    return undefined;
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= fallbackChain.models.length) {
    return undefined;
  }

  const nextModel = fallbackChain.models[nextIndex];
  const previousModel = fallbackChain.models[currentIndex];

  return {
    model: nextModel,
    index: nextIndex,
    isFallback: true,
    reason: `Model "${previousModel}" failed (${failureReason}); falling back to "${nextModel}"`,
  };
}

/**
 * State tracker for model fallback chain during a session run.
 * Used to track which model was used and handle fallback progression.
 */
export class ModelFallbackChain {
  private chain: FallbackChainConfig | undefined;
  private currentIndex: number;
  private initialIndex: number;
  private requestedModel: string;
  private resolvedModel: string;
  private fallbackReasons: string[] = [];

  constructor(
    requestedModel: string | undefined,
    fallbackChain: FallbackChainConfig | undefined,
  ) {
    this.chain = fallbackChain;
    const initial = resolveInitialModel(requestedModel, fallbackChain);
    this.currentIndex = initial.index;
    this.initialIndex = initial.index;
    this.requestedModel = requestedModel || "";
    this.resolvedModel = initial.model;
  }

  /** Get the current model to use. */
  getCurrentModel(): string {
    return this.resolvedModel;
  }

  /** Get the originally requested model. */
  getRequestedModel(): string {
    return this.requestedModel;
  }

  /** Get the current index in the fallback chain (-1 if not in chain). */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /** Check if we're currently using a fallback model (advanced from initial position). */
  isUsingFallback(): boolean {
    return this.currentIndex > this.initialIndex;
  }

  /** Get all fallback reasons accumulated so far. */
  getFallbackReasons(): string[] {
    return [...this.fallbackReasons];
  }

  /**
   * Handle a result and potentially advance to the next model.
   * Returns true if fallback occurred and we should retry.
   */
  handleResult(result: EngineResult): boolean {
    if (!shouldFallbackToNextModel(result, this.chain)) {
      return false;
    }

    const failureReason = isRateLimitError(result)
      ? "rate limit"
      : result.error?.slice(0, 50) || "error";

    const next = getNextFallbackModel(this.currentIndex, this.chain, failureReason);
    if (!next) {
      return false;
    }

    this.fallbackReasons.push(next.reason || "");
    this.currentIndex = next.index;
    this.resolvedModel = next.model;
    return true;
  }

  /**
   * Get metadata about the model routing for transportMeta.
   */
  getRoutingMetadata(): {
    requestedModel: string;
    resolvedModel: string;
    modelFallbackUsed: boolean;
    modelFallbackIndex: number;
  } {
    return {
      requestedModel: this.requestedModel,
      resolvedModel: this.resolvedModel,
      modelFallbackUsed: this.isUsingFallback(),
      modelFallbackIndex: this.currentIndex,
    };
  }
}
