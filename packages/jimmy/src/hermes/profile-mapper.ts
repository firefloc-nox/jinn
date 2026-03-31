/**
 * Hermes profile mapper — translates Jinn Employee/session config into
 * HermesRunInput opts for HermesEngine.run().
 *
 * V1: maps employee engine, model, persona, MCP flags, profile, toolsets, and skills.
 */

import type { Employee } from "../shared/types.js";

/**
 * Runtime inputs passed to Hermes for a session.
 * Maps to EngineRunOpts fields: hermesProfile, hermesProvider, hermesToolsets, hermesSkills, model, systemPrompt additions.
 */
export interface HermesRunInput {
  /** Named Hermes profile to activate — passed as --profile to hermes chat */
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
  /** Comma-separated toolsets to enable — passed as --toolsets to hermes chat */
  toolsets?: string;
  /** Comma-separated skills to load — passed as --skills to hermes chat */
  skills?: string;
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

  // Profile: employee.hermesProfile → --profile
  if (employee.hermesProfile?.trim()) {
    input.profile = employee.hermesProfile.trim();
  }

  // Model: session override > employee model
  const model = overrides?.model ?? employee.model;
  if (model) {
    input.modelPolicy = model;
  }

  // Provider: explicit override > employee hermesProvider
  const provider = overrides?.provider ?? employee.hermesProvider;
  if (provider) {
    input.providerPolicy = provider;
  }

  // Toolsets: employee.hermesToolsets → --toolsets
  if (employee.hermesToolsets?.trim()) {
    input.toolsets = employee.hermesToolsets.trim();
  }

  // Skills: employee.hermesSkills → --skills
  if (employee.hermesSkills?.trim()) {
    input.skills = employee.hermesSkills.trim();
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
  hermesToolsets?: string;
  hermesSkills?: string;
  model?: string;
  systemPromptAddition?: string;
} {
  return {
    ...(input.profile ? { hermesProfile: input.profile } : {}),
    ...(input.providerPolicy ? { hermesProvider: input.providerPolicy } : {}),
    ...(input.toolsets ? { hermesToolsets: input.toolsets } : {}),
    ...(input.skills ? { hermesSkills: input.skills } : {}),
    ...(input.modelPolicy ? { model: input.modelPolicy } : {}),
    ...(input.systemAddition ? { systemPromptAddition: input.systemAddition } : {}),
  };
}
