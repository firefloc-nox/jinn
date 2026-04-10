/**
 * Delegation Routing E2E Tests
 */

import { test, expect } from '@playwright/test'
import {
  createSession,
  waitForSessionStatus,
  getRoutingMeta,
  deleteSession,
  getRegisteredEngines,
  getEmployees,
} from './delegation-helpers'

const JINN_API = 'http://127.0.0.1:7778'
const createdSessions: string[] = []

test.afterAll(async () => {
  for (const id of createdSessions) {
    await deleteSession(id)
  }
})

test.describe('Delegation — Session Routing', () => {

  test('default session routes to hermes (primary brain)', async () => {
    const session = await createSession({ message: 'Réponds uniquement: e2e-routing-default' })
    createdSessions.push(session.id)

    expect(session.engine).toBe('hermes')

    const final = await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)
    expect(['idle', 'error']).toContain(final.status)

    const routing = getRoutingMeta(final)
    if (routing) {
      expect(routing.requestedBrain).toBe('hermes')
      expect(routing.actualExecutor).toBe('hermes')
      expect(routing.fallbackUsed).toBe(false)
    }
  })

  test('explicit engine override changes routing', async () => {
    const engines = await getRegisteredEngines()
    if (!engines.claude?.available) {
      test.skip()
      return
    }

    const session = await createSession({
      message: 'Réponds uniquement: e2e-routing-claude',
      engine: 'claude',
    })
    createdSessions.push(session.id)

    expect(session.engine).toBe('claude')

    const final = await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)
    const routing = getRoutingMeta(final)
    if (routing) {
      expect(routing.requestedBrain).toBe('claude')
      expect(routing.actualExecutor).toBe('claude')
      expect(routing.fallbackUsed).toBe(false)
    }
  })

  test('session with employeeRef routes via employee config', async () => {
    const employees = await getEmployees()
    if (employees.length === 0) {
      test.skip()
      return
    }

    const employeeWithRuntime = employees.find(e => e.runtimeRef)
    const targetEmployee = employeeWithRuntime ?? employees[0]

    const session = await createSession({
      message: 'Réponds uniquement: e2e-routing-employee',
      employeeRef: targetEmployee.name,
    })
    createdSessions.push(session.id)

    expect(session.id).toBeDefined()

    const final = await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)
    const routing = getRoutingMeta(final)
    if (routing && employeeWithRuntime?.runtimeRef) {
      expect(routing.requestedBrain).toBe(employeeWithRuntime.runtimeRef)
    }
  })

  test('routingMeta contains all expected fields', async () => {
    const session = await createSession({
      message: 'Réponds: e2e-routing-meta-fields',
    })
    createdSessions.push(session.id)

    const final = await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)
    const routing = getRoutingMeta(final)

    expect(routing).not.toBeNull()
    if (routing) {
      expect(routing).toHaveProperty('requestedBrain')
      expect(routing).toHaveProperty('actualExecutor')
      expect(routing).toHaveProperty('fallbackUsed')
      expect(typeof routing.fallbackUsed).toBe('boolean')
    }
  })

  test('session response contains required fields', async () => {
    const session = await createSession({
      message: 'Réponds: e2e-routing-fields',
    })
    createdSessions.push(session.id)

    expect(session).toHaveProperty('id')
    expect(session).toHaveProperty('engine')
    expect(session).toHaveProperty('status')
    expect(session).toHaveProperty('createdAt')
    expect(session).toHaveProperty('transportMeta')
  })
})

test.describe('Delegation — Engine Registration', () => {

  test('/api/status shows all engines registered', async () => {
    const engines = await getRegisteredEngines()

    expect(engines).toHaveProperty('hermes')
    expect(engines).toHaveProperty('claude')
    expect(engines).toHaveProperty('codex')
    expect(engines.hermes.available).toBe(true)
  })

  test('default brain is hermes', async () => {
    const resp = await fetch(`${JINN_API}/api/status`)
    const data = await resp.json()

    const brain = data.engines?.defaultBrain ?? data.engines?.default ?? data.brain?.primary
    expect(brain).toBe('hermes')
  })

  test('fallback policy is hermes → claude → codex', async () => {
    const resp = await fetch(`${JINN_API}/api/status`)
    const data = await resp.json()

    const fallback = data.fallbackPolicy ?? data.brain
    if (fallback) {
      expect(fallback.primary).toBe('hermes')
      const fallbacks = fallback.fallbacks ?? []
      expect(fallbacks).toContain('claude')
      expect(fallbacks).toContain('codex')
    }
  })
})
