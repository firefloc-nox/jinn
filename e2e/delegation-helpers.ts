/**
 * Shared helpers for delegation E2E tests.
 * No mocks — real API calls against the live gateway.
 */

const JINN_API = 'http://127.0.0.1:7778'

export interface SessionResponse {
  id: string
  engine: string
  status: string
  engineSessionId: string | null
  transportMeta: Record<string, unknown> | null
  employee: string | null
  model: string | null
  lastError: string | null
  createdAt: string
  lastActivity: string
  [key: string]: unknown
}

export interface RoutingMeta {
  requestedBrain: string
  requestedRuntime: string
  resolvedRuntimeRef: string
  actualExecutor: string
  fallbackUsed: boolean
  fallbackReason?: string
}

/**
 * Wait for a session to reach idle/error status.
 * Polls /api/sessions/:id every 2s up to timeout.
 */
export async function waitForSessionStatus(
  sessionId: string,
  targetStatuses: string[] = ['idle', 'error'],
  timeoutMs = 30_000,
): Promise<SessionResponse> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const resp = await fetch(`${JINN_API}/api/sessions/${sessionId}`)
    if (resp.ok) {
      const session = await resp.json()
      if (targetStatuses.includes(session.status)) {
        return session
      }
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`Session ${sessionId} did not reach ${targetStatuses.join('|')} within ${timeoutMs}ms`)
}

/**
 * Create a session via POST /api/sessions and return the response.
 */
export async function createSession(opts: {
  message?: string
  source?: string
  employeeRef?: string
  engine?: string
  model?: string
}): Promise<SessionResponse> {
  const resp = await fetch(`${JINN_API}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message ?? 'Réponds uniquement: ok',
      source: opts.source ?? 'e2e-delegation',
      ...(opts.employeeRef ? { employeeRef: opts.employeeRef } : {}),
      ...(opts.engine ? { engine: opts.engine } : {}),
      ...(opts.model ? { model: opts.model } : {}),
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Failed to create session: ${resp.status} ${text}`)
  }
  return resp.json()
}

/**
 * Create a session and wait for it to complete.
 * Returns the final session state.
 */
export async function createAndWait(opts: {
  message?: string
  source?: string
  employeeRef?: string
  engine?: string
  model?: string
  timeoutMs?: number
}): Promise<SessionResponse> {
  const session = await createSession(opts)
  return waitForSessionStatus(session.id, ['idle', 'error'], opts.timeoutMs)
}

/**
 * Extract routingMeta from a session's transportMeta.
 */
export function getRoutingMeta(session: SessionResponse): RoutingMeta | null {
  const meta = session.transportMeta
  if (!meta || typeof meta !== 'object') return null
  const routingMeta = (meta as Record<string, unknown>).routingMeta
  if (!routingMeta || typeof routingMeta !== 'object') return null
  return routingMeta as RoutingMeta
}

/**
 * Get session messages via API.
 * Messages are embedded in GET /api/sessions/:id response.
 */
export async function getSessionMessages(sessionId: string): Promise<Array<{ role: string; content: string }>> {
  const resp = await fetch(`${JINN_API}/api/sessions/${sessionId}`)
  if (!resp.ok) return []
  const data = await resp.json()
  return data.messages ?? []
}

/**
 * Delete a session for cleanup.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${JINN_API}/api/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {})
}

/**
 * Send a message to an existing session.
 * Uses POST /api/sessions with source matching the session's sourceRef.
 * NOTE: There is no POST /api/sessions/:id/messages endpoint.
 */
export async function sendToSession(sessionId: string, message: string): Promise<SessionResponse> {
  // Get the session to find its sourceRef
  const resp = await fetch(`${JINN_API}/api/sessions/${sessionId}`)
  const session = await resp.json()
  const source = session.sourceRef ?? session.source ?? `session-${sessionId}`

  const sendResp = await fetch(`${JINN_API}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, source }),
  })
  return sendResp.json()
}

/**
 * Get current registered engines from /api/status.
 */
export async function getRegisteredEngines(): Promise<Record<string, { available: boolean; model?: string }>> {
  const resp = await fetch(`${JINN_API}/api/status`)
  const data = await resp.json()
  return data.engines?.registered ?? {}
}

/**
 * Get employees list from org API.
 */
export async function getEmployees(): Promise<Array<{ name: string; runtimeRef?: string; engine?: string }>> {
  const resp = await fetch(`${JINN_API}/api/org/employees`)
  if (!resp.ok) return []
  const data = await resp.json()
  return Array.isArray(data) ? data : data.employees ?? []
}
