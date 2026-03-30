/**
 * Hermes profile mapper — translates Jinn Employee/session config into
 * HermesRunInput opts for HermesEngine.run().
 *
 * V1: maps employee engine, model, persona, and MCP flags.
 * V2 plan: support named Hermes profiles via --profile flag when available upstream.
 */

import type { Employee } from "../shared/types.js";

/**
 * Runtime inputs passed to Hermes for a session.
 * Maps to EngineRunOpts fields: hermesProfile, hermesProvider, model, systemPrompt additions.
 */
export interface HermesRunInput {
  /** Named Hermes profile to activate (V2 — reserved, not yet a CLI flag) */
  profile?: string;
  /** Additional system prompt text appended to the base context (persona, employee instructions) */
  systemAddition?: string;
  /** Provider policy — e.g. "anthropic", "openrouter" */
  providerPolicy?: string;
  /** Model override — e.g. "claude-sonnet-4-5", "gpt-4o" */
  modelPolicy?: string;
  /** Fallback engine overrides for this session */
  fallbackOverride?: string[];
  /** Whether MCP tools should be passed to Hermes (Hermes manages MCP natively) */
  mcpEnabled?: boolean;
  /** Whether Honcho memory integration is enabled for this session */
  honchoEnabled?: boolean;
}

/**
 * Map a Jinn Employee (and optional session overrides) to Hermes runtime inputs.
 *
 * Rules:
 * - employee.engine "hermes" → map model/provider from employee config
 * - employee.persona → systemAddition (appended to Hermes context)
 * - employee.mcp → mcpEnabled
 * - model override from session takes precedence over employee model
 */
export function mapEmployeeToHermesInput(
  employee: Employee,
  overrides?: {
    model?: string;
    provider?: string;
    mcpEnabled?: boolean;
    honchoEnabled?: boolean;
  },
): HermesRunInput {
  const input: HermesRunInput = {};

  // Persona → system addition
  if (employee.persona?.trim()) {
    input.systemAddition = employee.persona.trim();
  }

  // Model: session override > employee model
  const model = overrides?.model ?? employee.model;
  if (model) {
    input.modelPolicy = model;
  }

  // Provider: explicit override only
  if (overrides?.provider) {
    input.providerPolicy = overrides.provider;
  }

  // MCP: explicit override > employee mcp flag
  const mcpEnabled = overrides?.mcpEnabled ?? (employee.mcp !== false && employee.mcp !== undefined);
  if (mcpEnabled) {
    input.mcpEnabled = true;
  }

  // Honcho: explicit override
  if (overrides?.honchoEnabled !== undefined) {
    input.honchoEnabled = overrides.honchoEnabled;
  }

  return input;
}

/**
 * Build the effective EngineRunOpts additions from a HermesRunInput.
 * Merges profile mapper output into the shape expected by HermesEngine.run().
 */
export function hermesRunInputToOpts(input: HermesRunInput): {
  hermesProfile?: string;
  hermesProvider?: string;
  model?: string;
  systemPromptAddition?: string;
} {
  return {
    ...(input.profile ? { hermesProfile: input.profile } : {}),
    ...(input.providerPolicy ? { hermesProvider: input.providerPolicy } : {}),
    ...(input.modelPolicy ? { model: input.modelPolicy } : {}),
    ...(input.systemAddition ? { systemPromptAddition: input.systemAddition } : {}),
  };
}
