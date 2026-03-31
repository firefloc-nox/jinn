import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { SessionList } from '../session-list'

vi.mock('@/app/settings-provider', () => ({
  useSettings: () => ({ settings: { portalName: 'Jinn' } }),
}))

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    api: {
      ...actual.api,
      deleteSession: vi.fn(),
    },
  }
})

describe('SessionList', () => {
  it('renders Hermes runtime badges for sessions with transport metadata', () => {
    render(
      <SessionList
        sessions={[
          {
            id: 's-hermes',
            engine: 'hermes',
            source: 'web',
            connector: null,
            sessionKey: 's-hermes',
            employee: 'Ops',
            title: 'Hermes Session',
            status: 'running',
            transportState: 'running',
            lastActivity: new Date().toISOString(),
            engineSessionId: null,
            sourceRef: 'web:s-hermes',
            replyContext: null,
            messageId: null,
            model: null,
            parentSessionId: null,
            createdAt: new Date().toISOString(),
            lastError: null,
            transportMeta: {
              hermesRuntimeMeta: {
                profile: 'ops',
                provider: 'anthropic',
                model: 'claude-sonnet-4-5',
                honcho: true,
                mcp: true,
              },
              routingMeta: {
                requestedBrain: 'hermes',
                actualExecutor: 'hermes',
              },
            },
          },
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('Hermes Session')).toBeTruthy()
    expect(screen.getByText('Hermes')).toBeTruthy()
    expect(screen.getByText('Profile ops')).toBeTruthy()
    expect(screen.getByText('anthropic / claude-sonnet-4-5')).toBeTruthy()
    expect(screen.getByText('MCP')).toBeTruthy()
    expect(screen.getByText('Honcho')).toBeTruthy()
  })

  it('keeps existing cards quiet when Hermes metadata is absent', () => {
    render(
      <SessionList
        sessions={[
          {
            id: 's1',
            engine: 'claude',
            source: 'web',
            connector: null,
            sessionKey: 's1',
            employee: null,
            title: 'General Chat',
            status: 'idle',
            lastActivity: new Date().toISOString(),
            engineSessionId: null,
            sourceRef: 'web:s1',
            replyContext: null,
            messageId: null,
            model: null,
            parentSessionId: null,
            createdAt: new Date().toISOString(),
            lastError: null,
          },
        ]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('General Chat')).toBeTruthy()
    expect(screen.queryByText('Claude')).toBeNull()
    expect(screen.queryByText(/Fallback/)).toBeNull()
  })
})
