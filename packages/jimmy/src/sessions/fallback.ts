/**
 * Hermes-first fallback resolution.
 * Determines which engine executor to use for a session,
 * following the configured fallback chain when the primary is unavailable.
 */

export interface FallbackPolicy {
  /** Primary brain engine name — default: 'hermes' */
  primary: string;
  /** Ordered fallback chain when primary is unavailable */
  fallbacks: string[];
  /** Fall back to next engine if primary is not registered */
  fallbackOnUnavailable: boolean;
  /** Fall back to next engine if primary fails with a hard error */
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
  /** The engine name that will actually execute the session */
  executor: string;
  /** Whether the primary brain was unavailable and a fallback was used */
  fallbackUsed: boolean;
  /** Human-readable reason for using a fallback, if applicable */
  fallbackReason?: string;
}

/**
 * Resolve which engine executor to use for a session.
 *
 * Logic:
 * 1. If requestedBrain is available → use it directly, no fallback.
 * 2. If not available and fallbackOnUnavailable → iterate policy.fallbacks in order.
 * 3. If no fallback is available → return requestedBrain anyway (will fail at runtime).
 */
export function resolveFallbackExecutor(
  requestedBrain: string,
  availableEngines: Set<string>,
  policy: FallbackPolicy,
): FallbackResult {
  // Primary is available — use it directly
  if (availableEngines.has(requestedBrain)) {
    return { executor: requestedBrain, fallbackUsed: false };
  }

  // Primary is unavailable — try fallbacks in order
  if (policy.fallbackOnUnavailable) {
    for (const fallback of policy.fallbacks) {
      if (fallback !== requestedBrain && availableEngines.has(fallback)) {
        return {
          executor: fallback,
          fallbackUsed: true,
          fallbackReason: `Primary engine "${requestedBrain}" not available; using "${fallback}" as fallback`,
        };
      }
    }
  }

  // No fallback available — return requestedBrain, will fail at engine.run() time
  return {
    executor: requestedBrain,
    fallbackUsed: false,
    fallbackReason: `Engine "${requestedBrain}" not available and no fallback found`,
  };
}
