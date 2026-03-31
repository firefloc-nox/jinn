import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock the hook before importing the component
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-hermes', () => ({
  useHermesSessions: vi.fn(),
}))

import { useHermesSessions } from '@/hooks/use-hermes'
import { HermesActivityWidget } from '../hermes-activity'

const mockSessions = useHermesSessions as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = Math.floor(Date.now() / 1000)

function makeSession(overrides: Partial<{
  id: string
  source: string
  model: string | null
  startedAt: number
  endedAt: number | null
  messageCount: number
  inputTokens: number
  outputTokens: number
  title: string | null
}> = {}) {
  return {
    id: 'sess-default',
    source: 'cli',
    model: 'claude-sonnet-4-5',
    startedAt: now - 7200, // 2h ago
    endedAt: now - 7100,
    messageCount: 4,
    inputTokens: 1000,
    outputTokens: 500,
    title: null,
    ...overrides,
  }
}

const fiveSessions = [
  makeSession({ id: 's1', title: 'Session Alpha', source: 'cli', startedAt: now - 7200 }),
  makeSession({ id: 's2', title: 'Session Beta', source: 'discord', startedAt: now - 300 }),
  makeSession({ id: 's3', title: 'Session Gamma', source: 'telegram', startedAt: now - 60 }),
  makeSession({ id: 's4', title: 'Session Delta', source: 'jinn', startedAt: now - 10 }),
  makeSession({ id: 's5', title: 'Session Epsilon', source: 'cli', startedAt: now - 3600 }),
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HermesActivityWidget', () => {
  it('renders 5 session titles when 5 sessions are provided', () => {
    mockSessions.mockReturnValue({ sessions: fiveSessions, loading: false, unavailable: false, total: 5 })
    render(<HermesActivityWidget />)
    expect(screen.getByText('Session Alpha')).toBeDefined()
    expect(screen.getByText('Session Beta')).toBeDefined()
    expect(screen.getByText('Session Gamma')).toBeDefined()
    expect(screen.getByText('Session Delta')).toBeDefined()
    expect(screen.getByText('Session Epsilon')).toBeDefined()
  })

  it('renders source pills for each session', () => {
    mockSessions.mockReturnValue({ sessions: fiveSessions, loading: false, unavailable: false, total: 5 })
    render(<HermesActivityWidget />)
    // At least one "cli" pill visible
    const clipills = screen.getAllByText('cli')
    expect(clipills.length).toBeGreaterThanOrEqual(1)
  })

  it('returns null (renders nothing) when hermesUnavailable=true', () => {
    mockSessions.mockReturnValue({ sessions: [], loading: false, unavailable: true, total: 0 })
    const { container } = render(<HermesActivityWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('shows "View all" link pointing to /hermes/sessions', () => {
    mockSessions.mockReturnValue({ sessions: fiveSessions, loading: false, unavailable: false, total: 5 })
    render(<HermesActivityWidget />)
    const link = screen.getByText('View all').closest('a')
    expect(link).toBeDefined()
    expect(link?.getAttribute('href')).toBe('/hermes/sessions')
  })

  it('shows "Hermes Activity" section header', () => {
    mockSessions.mockReturnValue({ sessions: fiveSessions, loading: false, unavailable: false, total: 5 })
    render(<HermesActivityWidget />)
    expect(screen.getByText('Hermes Activity')).toBeDefined()
  })

  it('shows loading state when loading=true', () => {
    mockSessions.mockReturnValue({ sessions: [], loading: true, unavailable: false, total: 0 })
    render(<HermesActivityWidget />)
    expect(screen.getByText('Loading…')).toBeDefined()
  })

  it('shows empty state when sessions is empty and not loading', () => {
    mockSessions.mockReturnValue({ sessions: [], loading: false, unavailable: false, total: 0 })
    render(<HermesActivityWidget />)
    expect(screen.getByText('No recent sessions')).toBeDefined()
  })

  it('formats startedAt ~2h ago as "2h ago"', () => {
    const session = makeSession({ id: 's1', title: 'Alpha', startedAt: now - 7200 })
    mockSessions.mockReturnValue({ sessions: [session], loading: false, unavailable: false, total: 1 })
    render(<HermesActivityWidget />)
    expect(screen.getByText('2h ago')).toBeDefined()
  })

  it('formats startedAt ~5m ago as "5m ago"', () => {
    const session = makeSession({ id: 's2', title: 'Beta', startedAt: now - 300 })
    mockSessions.mockReturnValue({ sessions: [session], loading: false, unavailable: false, total: 1 })
    render(<HermesActivityWidget />)
    expect(screen.getByText('5m ago')).toBeDefined()
  })

  it('uses session id slice as fallback title when title is null', () => {
    const session = makeSession({ id: 'abc12345', title: null })
    mockSessions.mockReturnValue({ sessions: [session], loading: false, unavailable: false, total: 1 })
    render(<HermesActivityWidget />)
    expect(screen.getByText('Session abc12345')).toBeDefined()
  })
})
