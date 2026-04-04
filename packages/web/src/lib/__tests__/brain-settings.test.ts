import { describe, expect, it } from 'vitest'

import {
  getAvailableBrains,
  getBrainConfigSnapshot,
  moveFallbackBrain,
  sanitizeConfigForSave,
} from '../brain-settings'

describe('brain-settings helpers', () => {
  it('derives available brains from status and config without duplicates', () => {
    const available = getAvailableBrains(
      {
        defaultBrain: 'hermes',
        fallbackPolicy: { primary: 'hermes', fallbacks: ['claude', 'gemini'] },
        registeredEngines: ['hermes', 'claude', 'codex'],
        engines: {
          registered: {
            hermes: { available: true },
            claude: { available: true },
            gemini: { available: true },
          },
        },
      },
      {
        engines: {
          default: 'claude',
          claude: { bin: 'claude', model: 'opus' },
          codex: { bin: 'codex', model: 'gpt-5.4' },
          hermes: { bin: 'hermes', model: 'gpt-5.4' },
        },
      },
    )

    expect(available).toEqual(['hermes', 'claude', 'codex', 'gemini'])
  })

  it('builds a stable brain config snapshot and excludes the primary from fallbacks', () => {
    const snapshot = getBrainConfigSnapshot(
      {
        routing: { defaultRuntime: 'hermes', fallbackRuntimes: ['claude', 'codex'] },
        brain: { primary: 'claude', fallbacks: ['gemini'] },
        sessions: { fallbackEngines: ['codex', 'gemini'] },
        engines: {
          default: 'claude',
          claude: { bin: 'claude', model: 'opus' },
          codex: { bin: 'codex', model: 'gpt-5.4' },
          hermes: { bin: 'hermes', model: 'gpt-5.4' },
        },
      },
      {
        defaultBrain: 'hermes',
        fallbackPolicy: { primary: 'hermes', fallbacks: ['claude', 'codex', 'gemini'] },
      },
      ['hermes', 'claude', 'codex', 'gemini'],
    )

    expect(snapshot.primary).toBe('hermes')
    expect(snapshot.fallbacks).toEqual(['claude', 'codex'])
  })

  it('moves fallback brains up and down without mutating the input', () => {
    const original = ['claude', 'codex', 'gemini']

    expect(moveFallbackBrain(original, 'codex', 'up')).toEqual(['codex', 'claude', 'gemini'])
    expect(moveFallbackBrain(original, 'codex', 'down')).toEqual(['claude', 'gemini', 'codex'])
    expect(original).toEqual(['claude', 'codex', 'gemini'])
  })

  it('sanitizes config for save while preserving routing selections on supported keys', () => {
    const sanitized = sanitizeConfigForSave({
      routing: { defaultRuntime: 'hermes', fallbackRuntimes: ['claude', 'codex'] },
      brain: { primary: 'codex', fallbacks: ['gemini'] },
      engines: {
        default: 'claude',
        claude: { bin: 'claude', model: 'opus' },
        codex: { bin: 'codex', model: 'gpt-5.4' },
        hermes: { bin: 'hermes', model: 'gpt-5.4', perEmployeeProfileSelection: true, mcpEnabled: true },
      },
      sessions: {},
      mcp: {},
    })

    expect('brain' in sanitized).toBe(false)
    expect(sanitized.routing?.defaultRuntime).toBe('hermes')
    expect(sanitized.routing?.fallbackRuntimes).toEqual(['claude', 'codex'])
    expect(sanitized.engines?.default).toBe('hermes')
    expect(sanitized.sessions?.fallbackEngines).toEqual(['claude', 'codex'])
    expect((sanitized.engines?.hermes as any)?.perEmployeeProfileSelection).toBe(true)
    expect((sanitized.engines?.hermes as any)?.mcpEnabled).toBe(true)
  })

  it('prefers the status API default brain when config has no explicit brain block', () => {
    const snapshot = getBrainConfigSnapshot(
      {
        engines: {
          default: 'claude',
          claude: { bin: 'claude', model: 'opus' },
          hermes: { bin: 'hermes', model: 'gpt-5.4' },
        },
      },
      {
        defaultBrain: 'hermes',
        fallbackPolicy: { primary: 'hermes', fallbacks: ['claude', 'codex'] },
      },
      ['hermes', 'claude', 'codex'],
    )

    expect(snapshot).toEqual({
      primary: 'hermes',
      fallbacks: ['claude', 'codex'],
    })
  })

  it('does not invent unsupported save fields when no brain overrides are present', () => {
    const sanitized = sanitizeConfigForSave({
      engines: {
        default: 'claude',
        claude: { bin: 'claude', model: 'opus' },
        hermes: { bin: 'hermes', model: 'gpt-5.4' },
      },
      sessions: {
        fallbackEngines: ['claude'],
      },
      mcp: {
        enabled: true,
      },
    })

    expect(sanitized).toEqual({
      engines: {
        default: 'claude',
        claude: { bin: 'claude', model: 'opus' },
        hermes: { bin: 'hermes', model: 'gpt-5.4' },
      },
      sessions: {
        fallbackEngines: ['claude'],
      },
      mcp: {
        enabled: true,
      },
    })
    expect('brain' in sanitized).toBe(false)
  })
})
