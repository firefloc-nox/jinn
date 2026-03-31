import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { SessionDetail } from '../session-detail'

vi.mock('@/app/settings-provider', () => ({
  useSettings: () => ({ settings: { portalName: 'Jinn' } }),
}))

vi.mock('@/hooks/use-sessions', () => ({
  useResetSession: () => vi.fn(),
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      getSessionChildren: vi.fn().mockImplementation(() => new Promise(() => {})),
    },
  }
})

const baseSession = {
  id: 'session-1',
  engine: 'hermes',
  engineSessionId: null,
  source: 'web',
  sourceRef: 'web:session-1',
  connector: null,
  sessionKey: 'session-1',
  replyContext: null,
  messageId: null,
  employee: null,
  model: null,
  title: 'Hermes detail',
  parentSessionId: null,
  status: 'idle' as const,
  createdAt: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  lastError: null,
}

describe('SessionDetail', () => {
  it('shows the fallback banner when Hermes runtime metadata reports a fallback executor', () => {
    render(
      <SessionDetail
        session={{
          ...baseSession,
          transportMeta: {
            hermesRuntimeMeta: {
              fallbackExecutor: 'claude',
              fallbackReason: 'Hermes binary missing',
            },
            routingMeta: {
              requestedBrain: 'hermes',
              actualExecutor: 'claude',
              fallbackUsed: true,
            },
          },
        }}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Fallback: claude — Hermes binary missing')).toBeTruthy()
  })

  it('does not show the fallback banner when no fallback metadata is present', () => {
    render(
      <SessionDetail
        session={{
          ...baseSession,
          transportMeta: {
            hermesRuntimeMeta: {
              profile: 'ops',
              provider: 'anthropic',
              model: 'claude-sonnet-4-5',
            },
            routingMeta: {
              requestedBrain: 'hermes',
              actualExecutor: 'hermes',
              fallbackUsed: false,
            },
          },
        }}
        onClose={vi.fn()}
      />,
    )

    expect(screen.queryByText(/^Fallback:/)).toBeNull()
  })
})
