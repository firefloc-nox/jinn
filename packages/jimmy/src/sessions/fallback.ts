import type { RuntimeRef } from "../shared/types.js";

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
