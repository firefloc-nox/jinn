/**
 * Delegation Error Handling E2E Tests
 */

import { test, expect } from '@playwright/test'
import {
  createSession,
  createAndWait,
  waitForSessionStatus,
  deleteSession,
} from './delegation-helpers'

const JINN_API = 'http://127.0.0.1:7778'

test.describe('Delegation — Error Handling', () => {

  test('invalid engine falls back or errors gracefully', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'test',
        engine: 'nonexistent-engine',
        source: 'e2e-error',
      }),
    })

    if (resp.ok) {
      const session = await resp.json()
      await waitForSessionStatus(session.id, ['idle', 'error'], 90_000)
      await deleteSession(session.id)
    } else {
      expect([400, 422, 500]).toContain(resp.status)
    }
  })

  test('empty message body is handled gracefully', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '',
        source: 'e2e-empty',
      }),
    })

    if (resp.ok) {
      const session = await resp.json()
      await deleteSession(session.id)
      expect(session.id).toBeDefined()
    } else {
      expect([400, 422]).toContain(resp.status)
    }
  })

  test('malformed request returns 4xx', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json-at-all{{{',
    })

    expect(resp.status).toBeGreaterThanOrEqual(400)
    expect(resp.status).toBeLessThan(500)
  })

  test('GET /api/sessions/nonexistent returns 404 or empty', async () => {
    const resp = await fetch(`${JINN_API}/api/sessions/nonexistent-id-12345`)
    expect(resp.status).toBeLessThan(500)
  })

  test('session cleanup via bulk-delete works', async () => {
    const session = await createAndWait({
      message: 'Réponds: bulk-delete-test',
      source: 'e2e-bulk-delete',
      timeoutMs: 90_000,
    })

    const resp = await fetch(`${JINN_API}/api/sessions/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [session.id] }),
    })

    expect(resp.ok).toBe(true)
  })

  test('POST /api/sessions/:id/interrupt returns non-404', async () => {
    const session = await createSession({
      message: 'Écris un essai de 500 mots sur l\'intelligence artificielle',
      source: 'e2e-interrupt',
    })

    const resp = await fetch(`${JINN_API}/api/sessions/${session.id}/interrupt`, {
      method: 'POST',
    })

    expect(resp.status).not.toBe(404)

    // Give it a moment to settle
    await new Promise(r => setTimeout(r, 3000))
    await deleteSession(session.id)
  })
})
