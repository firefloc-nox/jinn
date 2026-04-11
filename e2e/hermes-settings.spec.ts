/**
 * E2E tests for GET /api/hermes/providers and PATCH /api/hermes/profiles/:name
 * No mocks — real API calls against the live gateway.
 */

import { test, expect } from '@playwright/test'

const JINN_API = 'http://127.0.0.1:7778'

test.describe('Hermes Settings API', () => {
  test('GET /api/hermes/providers returns global config and profiles', async () => {
    const resp = await fetch(`${JINN_API}/api/hermes/providers`)
    expect(resp.ok).toBe(true)

    const body = await resp.json()

    // Accept both { data: { global, profiles } } and { global, profiles } shapes
    const data: Record<string, unknown> = body.data ?? body

    // data.global must have providers and customProviders arrays
    expect(data).toHaveProperty('global')
    const global = data.global as Record<string, unknown>
    expect(Array.isArray(global.providers)).toBe(true)
    expect(Array.isArray(global.customProviders)).toBe(true)

    // data.profiles must be a non-empty array
    expect(data).toHaveProperty('profiles')
    expect(Array.isArray(data.profiles)).toBe(true)
    expect((data.profiles as unknown[]).length).toBeGreaterThan(0)

    // each profile must have a name string
    for (const profile of data.profiles as Array<Record<string, unknown>>) {
      expect(typeof profile.name).toBe('string')
      expect((profile.name as string).length).toBeGreaterThan(0)
    }
  })

  test('profiles with employees show usedBy field', async () => {
    const resp = await fetch(`${JINN_API}/api/hermes/providers`)
    expect(resp.ok).toBe(true)

    const body = await resp.json()
    const data: Record<string, unknown> = body.data ?? body
    const profiles = data.profiles as Array<Record<string, unknown>>

    // At least one profile should have usedBy populated
    const profilesWithUsedBy = profiles.filter(
      p => Array.isArray(p.usedBy) && (p.usedBy as unknown[]).length > 0
    )
    expect(profilesWithUsedBy.length).toBeGreaterThan(0)
  })

  test('PATCH /api/hermes/profiles/:name updates config and reverts', async () => {
    const profileName = 'jinn-coo'

    // Helper: extract config object regardless of response shape
    const extractConfig = (p: Record<string, unknown>): Record<string, unknown> => {
      const profile = p.profile as Record<string, unknown> | undefined
      if (profile && typeof profile === 'object' && 'config' in profile) {
        return profile.config as Record<string, unknown>
      }
      if ('config' in p && typeof p.config === 'object') {
        return p.config as Record<string, unknown>
      }
      return p
    }

    // 1. Read current profile to capture original reasoning_effort
    const getResp = await fetch(`${JINN_API}/api/hermes/profiles/${profileName}`)
    expect(getResp.ok).toBe(true)
    const configBefore = extractConfig(await getResp.json())
    const originalValue: string =
      typeof configBefore.reasoning_effort === 'string'
        ? configBefore.reasoning_effort
        : 'medium'

    // 2. Patch to a different value
    const patchedValue = originalValue === 'high' ? 'medium' : 'high'
    const patchResp = await fetch(`${JINN_API}/api/hermes/profiles/${profileName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { reasoning_effort: patchedValue } }),
    })
    expect(patchResp.ok).toBe(true)

    // 3. Verify the change was applied
    const getAfterResp = await fetch(`${JINN_API}/api/hermes/profiles/${profileName}`)
    expect(getAfterResp.ok).toBe(true)
    const configAfter = extractConfig(await getAfterResp.json())
    expect(configAfter.reasoning_effort).toBe(patchedValue)

    // 4. Revert to original value
    const revertResp = await fetch(`${JINN_API}/api/hermes/profiles/${profileName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { reasoning_effort: originalValue } }),
    })
    expect(revertResp.ok).toBe(true)

    // 5. Confirm the revert landed
    const getFinalResp = await fetch(`${JINN_API}/api/hermes/profiles/${profileName}`)
    expect(getFinalResp.ok).toBe(true)
    const configFinal = extractConfig(await getFinalResp.json())
    expect(configFinal.reasoning_effort).toBe(originalValue)
  })
})
