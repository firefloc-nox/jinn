/**
 * Delegation Fallback E2E Tests
 */

import { test, expect } from '@playwright/test'
import {
  createAndWait,
  getRoutingMeta,
  deleteSession,
  getRegisteredEngines,
} from './delegation-helpers'

const JINN_API = 'http://127.0.0.1:7778'
const createdSessions: string[] = []

test.afterAll(async () => {
  for (const id of createdSessions) {
    await deleteSession(id)
  }
})

test.describe('Delegation — Fallback Chain', () => {

  test('hermes is primary and available', async () => {
    const engines = await getRegisteredEngines()
    expect(engines.hermes).toBeDefined()
    expect(engines.hermes.available).toBe(true)
  })

  test('claude is in fallback chain', async () => {
    const engines = await getRegisteredEngines()
    expect(engines.claude).toBeDefined()
  })

  test('codex is in fallback chain', async () => {
    const engines = await getRegisteredEngines()
    expect(engines.codex).toBeDefined()
  })

  test('session routes to hermes when hermes is available (no fallback)', async () => {
    const session = await createAndWait({
      message: 'Réponds: fallback-no-trigger',
      timeoutMs: 90_000,
    })
    createdSessions.push(session.id)

    expect(['idle', 'error']).toContain(session.status)

    const routing = getRoutingMeta(session)
    if (routing) {
      expect(routing.actualExecutor).toBe('hermes')
      expect(routing.fallbackUsed).toBe(false)
    }
  })

  test('fallback policy from /api/status has correct structure', async () => {
    const resp = await fetch(`${JINN_API}/api/status`)
    const data = await resp.json()

    const policy = data.fallbackPolicy ?? data.brain
    expect(policy).toBeDefined()

    if (policy) {
      expect(policy.primary).toBe('hermes')
      expect(Array.isArray(policy.fallbacks)).toBe(true)
      expect(policy.fallbacks.length).toBeGreaterThan(0)
    }
  })

  test('explicit claude session has correct routingMeta', async () => {
    const engines = await getRegisteredEngines()
    if (!engines.claude?.available) {
      test.skip()
      return
    }

    const session = await createAndWait({
      message: 'Réponds: fallback-explicit-claude',
      engine: 'claude',
      timeoutMs: 90_000,
    })
    createdSessions.push(session.id)

    const routing = getRoutingMeta(session)
    if (routing) {
      expect(routing.requestedBrain).toBe('claude')
      expect(routing.actualExecutor).toBe('claude')
      expect(routing.fallbackUsed).toBe(false)
    }
  })

  test('fallbackReason present only when fallback used', async () => {
    const session = await createAndWait({
      message: 'Réponds: fallback-reason-check',
      timeoutMs: 90_000,
    })
    createdSessions.push(session.id)

    const routing = getRoutingMeta(session)
    if (routing) {
      if (routing.fallbackUsed) {
        expect(routing.fallbackReason).toBeTruthy()
      } else {
        expect(routing.fallbackReason).toBeFalsy()
      }
    }
  })
})

test.describe('Delegation — Engine Availability', () => {

  test('at least one engine is available', async () => {
    const engines = await getRegisteredEngines()
    const available = Object.entries(engines)
      .filter(([_, info]) => info.available)
      .map(([name]) => name)

    expect(available.length).toBeGreaterThanOrEqual(1)
    expect(available).toContain('hermes')
  })
})
