/**
 * Delegation Queue E2E Tests
 */

import { test, expect } from '@playwright/test'
import {
  createSession,
  waitForSessionStatus,
  getSessionMessages,
  deleteSession,
} from './delegation-helpers'

const JINN_API = 'http://127.0.0.1:7778'
const createdSessions: string[] = []

test.afterAll(async () => {
  for (const id of createdSessions) {
    await deleteSession(id)
  }
})

test.describe('Delegation — Queue Behavior', () => {

  test('messages to same session are eventually processed', async () => {
    const session = await createSession({
      message: 'Réponds: queue-msg-1',
      source: 'e2e-queue',
    })
    createdSessions.push(session.id)

    // Wait for first message to complete
    await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)

    // Send second message to same session (should reuse)
    const sendResp = await fetch(`${JINN_API}/api/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Réponds: queue-msg-2' }),
    })
    expect(sendResp.ok).toBe(true)

    // Wait for second message
    await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)

    const messages = await getSessionMessages(session.id)
    const userMessages = messages.filter(m => m.role === 'user')
    expect(userMessages.length).toBeGreaterThanOrEqual(2)
  })

  test('session list shows sessions', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions`)
    expect(resp.ok).toBe(true)

    const sessions = await resp.json()
    expect(Array.isArray(sessions)).toBe(true)
    if (sessions.length > 0) {
      expect(sessions[0]).toHaveProperty('id')
      expect(sessions[0]).toHaveProperty('status')
    }
  })
})

test.describe('Delegation — Message Ordering', () => {

  test('messages appear in chronological order', async () => {
    const session = await createSession({
      message: 'Réponds: order-1',
      source: 'e2e-order',
    })
    createdSessions.push(session.id)

    await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)

    const messages = await getSessionMessages(session.id)
    expect(messages.length).toBeGreaterThanOrEqual(2)

    const firstUser = messages.findIndex(m => m.role === 'user')
    const firstAssistant = messages.findIndex(m => m.role === 'assistant')

    expect(firstUser).toBeGreaterThanOrEqual(0)
    expect(firstAssistant).toBeGreaterThanOrEqual(0)
    expect(firstUser).toBeLessThan(firstAssistant)
  })
})
