/**
 * Capability flags per engine.
 * Use these flags instead of branching on engine name strings.
 */
export interface EngineCapabilities {
  /** Supports NDJSON streaming output */
  streaming: boolean;
  /** Exposes cost per token */
  costTracking: boolean;
  /** Manages MCP internally (no mcpConfigPath needed) */
  mcpNative: boolean;
  /** Supports --resume sessionId for session continuity */
  sessionResume: boolean;
  /** Supports kill/interrupt via process signal */
  interruptible: boolean;
}

export const ENGINE_CAPABILITIES: Record<string, EngineCapabilities> = {
  hermes: { streaming: false, costTracking: false, mcpNative: true, sessionResume: true, interruptible: true },
  claude: { streaming: true, costTracking: true, mcpNative: false, sessionResume: false, interruptible: true },
  codex: { streaming: true, costTracking: false, mcpNative: false, sessionResume: false, interruptible: true },
  gemini: { streaming: false, costTracking: false, mcpNative: false, sessionResume: false, interruptible: true },
};

/**
 * Get capability flags for a given engine name.
 * Falls back to a fully-disabled capabilities object for unknown engines.
 */
export function getCapabilities(engineName: string): EngineCapabilities {
  return ENGINE_CAPABILITIES[engineName] ?? {
    streaming: false,
    costTracking: false,
    mcpNative: false,
    sessionResume: false,
    interruptible: false,
  };
}
