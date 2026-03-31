import { describe, expect, it } from 'vitest'

import {
  getFallbackBannerText,
  getProviderModelLabel,
  normalizeBrainRoutingMeta,
  normalizeHermesRuntimeMeta,
} from '../runtime-meta'

describe('runtime-meta helpers', () => {
  it('normalizes Hermes metadata from current backend field names', () => {
    const meta = normalizeHermesRuntimeMeta({
      activeProfile: 'ops',
      providerUsed: 'anthropic',
      modelUsed: 'claude-sonnet-4-5',
      honchoActive: true,
      hermesSessionId: 'hs_123',
    })

    expect(meta?.profile).toBe('ops')
    expect(meta?.provider).toBe('anthropic')
    expect(meta?.model).toBe('claude-sonnet-4-5')
    expect(meta?.honcho).toBe(true)
    expect(meta?.hermesSessionId).toBe('hs_123')
  })

  it('normalizes Hermes metadata from compatibility field names', () => {
    const meta = normalizeHermesRuntimeMeta({
      profile: 'research',
      provider: 'openrouter',
      model: 'gpt-5.4',
      honcho: false,
      fallbackExecutor: 'claude',
      fallbackReason: 'Primary engine unavailable',
    })

    expect(meta?.profile).toBe('research')
    expect(meta?.provider).toBe('openrouter')
    expect(meta?.model).toBe('gpt-5.4')
    expect(meta?.honcho).toBe(false)
    expect(meta?.fallbackExecutor).toBe('claude')
    expect(meta?.fallbackReason).toBe('Primary engine unavailable')
  })

  it('normalizes brain routing metadata from transport meta', () => {
    const routing = normalizeBrainRoutingMeta({
      requestedBrain: 'hermes',
      actualExecutor: 'codex',
      fallbackUsed: true,
      fallbackReason: 'Primary engine "hermes" not available; using "codex" as fallback',
    })

    expect(routing?.requestedBrain).toBe('hermes')
    expect(routing?.actualExecutor).toBe('codex')
    expect(routing?.fallbackReason).toContain('codex')
  })

  it('builds provider/model labels cleanly', () => {
    expect(getProviderModelLabel({ provider: 'anthropic', model: 'claude-sonnet-4-5' })).toBe('anthropic / claude-sonnet-4-5')
    expect(getProviderModelLabel({ provider: 'anthropic' })).toBe('anthropic')
    expect(getProviderModelLabel({ model: 'gpt-5.4' })).toBe('gpt-5.4')
  })

  it('builds fallback banner text from explicit fallback executor', () => {
    const text = getFallbackBannerText(
      { fallbackExecutor: 'claude', fallbackReason: 'Hermes binary missing' },
      null,
    )

    expect(text).toBe('Fallback: claude — Hermes binary missing')
  })

  it('builds fallback banner text from routing metadata when Hermes metadata has no explicit fallback executor', () => {
    const text = getFallbackBannerText(
      {},
      {
        actualExecutor: 'gemini',
        fallbackUsed: true,
        fallbackReason: 'Primary engine unavailable',
      },
    )

    expect(text).toBe('Fallback: gemini — Primary engine unavailable')
  })
})
