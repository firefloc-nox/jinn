import { describe, expect, it } from 'vitest'

import {
  getAvailableBrains,
  getBrainConfigSnapshot,
  moveFallbackBrain,
} from '../brain-settings'

describe('brain-settings helpers', () => {
  it('derives available brains from status and config without duplicates', () => {
    const available = getAvailableBrains(
      {
        defaultBrain: 'hermes',
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
        brain: { primary: 'hermes', fallbacks: ['claude', 'codex'] },
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
})
