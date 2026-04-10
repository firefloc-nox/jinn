/**
 * Delegation Continuity E2E Tests
 */

import { test, expect } from '@playwright/test'
import {
  createSession,
  waitForSessionStatus,
  getSessionMessages,
  deleteSession,
  sendToSession,
} from './delegation-helpers'

const JINN_API = 'http://127.0.0.1:7778'
const createdSessions: string[] = []

test.afterAll(async () => {
  for (const id of createdSessions) {
    await deleteSession(id)
  }
})

test.describe('Delegation — Session Continuity', () => {

  test('first message creates a new session', async () => {
    const session = await createSession({
      message: 'Réponds: premier',
      source: `e2e-cont-${Date.now()}`,
    })
    createdSessions.push(session.id)

    expect(session.id).toBeDefined()
    expect(session.engine).toBe('hermes')

    const final = await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)
    expect(['idle', 'error']).toContain(final.status)
  })

  test('session has messages after completion', async () => {
    const session = await createSession({
      message: 'Réponds: messages-test',
    })
    createdSessions.push(session.id)

    await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)

    const messages = await getSessionMessages(session.id)
    expect(messages.length).toBeGreaterThanOrEqual(2)

    const userMsg = messages.find(m => m.role === 'user')
    const assistantMsg = messages.find(m => m.role === 'assistant')

    expect(userMsg).toBeDefined()
    expect(userMsg!.content).toContain('messages-test')
    expect(assistantMsg).toBeDefined()
  })

  test('session engineSessionId is set after completion', async () => {
    const session = await createSession({
      message: 'Réponds: engine-session-id',
    })
    createdSessions.push(session.id)

    const final = await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)

    if (final.status === 'idle') {
      expect(final.engineSessionId).toBeTruthy()
    }
  })

  test('POST /api/sessions/stub creates session without message', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions/stub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'hermes',
        source: 'e2e-stub',
      }),
    })

    expect([200, 201]).toContain(resp.status)
    const stub = await resp.json()
    createdSessions.push(stub.id)

    expect(stub).toHaveProperty('id')
    expect(stub.engine).toBe('hermes')
    expect(stub.status).toBe('idle')
  })

  test('send message to existing session via same source', async () => {
    const source = `e2e-cont-send-${Date.now()}`

    // Create first session
    const first = await createSession({
      message: 'Réponds: first-msg',
      source,
    })
    createdSessions.push(first.id)
    await waitForSessionStatus(first.id, ['idle', 'error'], 90_000)

    // Send second message with same source — reuses session
    const second = await createSession({
      message: 'Réponds: second-msg',
      source,
    })
    // Should reuse the same session
    expect(second.id).toBe(first.id)

    await waitForSessionStatus(second.id, ['idle', 'error'], 90_000)

    const messages = await getSessionMessages(second.id)
    expect(messages.length).toBeGreaterThanOrEqual(2)
  })

  test('DELETE /api/sessions/:id removes session', async () => {
    const session = await createSession({
      message: 'Réponds: delete-test',
    })
    await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)

    const delResp = await fetch(`${JINN_API}/api/sessions/${session.id}`, {
      method: 'DELETE',
    })
    expect(delResp.ok).toBe(true)
  })

  test('session list API returns sessions with expected shape', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions`)
    expect(resp.ok).toBe(true)

    const sessions = await resp.json()
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.length).toBeGreaterThan(0)

    const s = sessions[0]
    expect(s).toHaveProperty('id')
    expect(s).toHaveProperty('engine')
    expect(s).toHaveProperty('status')
    expect(s).toHaveProperty('createdAt')
  })
})
