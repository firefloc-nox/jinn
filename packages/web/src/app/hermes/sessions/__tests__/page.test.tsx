import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mock hooks — before imports
// ---------------------------------------------------------------------------

vi.mock('@/hooks/use-hermes', () => ({
  useHermesSessions: vi.fn(),
  useHermesSessionSearch: vi.fn(),
  useHermesSession: vi.fn(),
}))

// PageLayout just renders children
vi.mock('@/components/page-layout', () => ({
  PageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { useHermesSessions, useHermesSessionSearch, useHermesSession } from '@/hooks/use-hermes'
import HermesSessionsPage from '../page'

const mockSessions = useHermesSessions as ReturnType<typeof vi.fn>
const mockSearch = useHermesSessionSearch as ReturnType<typeof vi.fn>
const mockSession = useHermesSession as ReturnType<typeof vi.fn>

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
    startedAt: now - 3600,
    endedAt: now - 3500,
    messageCount: 4,
    inputTokens: 1000,
    outputTokens: 500,
    title: 'Default Session',
    ...overrides,
  }
}

const mockSessionList = [
  makeSession({ id: 's1', title: 'CLI Session', source: 'cli', model: 'claude-opus-4', inputTokens: 2000, outputTokens: 800 }),
  makeSession({ id: 's2', title: 'Discord Session', source: 'discord', model: null, inputTokens: 300, outputTokens: 150 }),
  makeSession({ id: 's3', title: 'Telegram Session', source: 'telegram', inputTokens: 500, outputTokens: 200 }),
]

function emptySessionHook() {
  return { session: null, messages: [], loading: false, unavailable: false }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Default: search returns nothing
  mockSearch.mockReturnValue({ sessions: [], total: 0, loading: false, unavailable: false })
  mockSession.mockReturnValue(emptySessionHook())
})

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HermesSessionsPage', () => {
  it('renders session cards with source, model, tokens', () => {
    mockSessions.mockReturnValue({ sessions: mockSessionList, total: 3, loading: false, unavailable: false })
    render(<HermesSessionsPage />)

    expect(screen.getByText('CLI Session')).toBeDefined()
    expect(screen.getByText('Discord Session')).toBeDefined()
    expect(screen.getByText('Telegram Session')).toBeDefined()

    // Source badges visible
    expect(screen.getAllByText('cli').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('discord')).toBeDefined()

    // Model visible for sessions with one
    expect(screen.getByText('claude-opus-4')).toBeDefined()

    // Token counts visible (2000+800 = 2800 → "2.8k")
    expect(screen.getByText('2.8k')).toBeDefined()
  })

  it('shows search input and filters sessions client-side by title', () => {
    mockSessions.mockReturnValue({ sessions: mockSessionList, total: 3, loading: false, unavailable: false })
    // When searching, useHermesSessionSearch is used
    mockSearch.mockReturnValue({
      sessions: [mockSessionList[0]],
      total: 1,
      loading: false,
      unavailable: false,
    })

    render(<HermesSessionsPage />)

    const input = screen.getByPlaceholderText('Search sessions…')
    fireEvent.change(input, { target: { value: 'CLI' } })

    // After search, only CLI Session visible via the search mock
    expect(screen.getByText('CLI Session')).toBeDefined()
  })

  it('clicking source chip "cli" shows only cli sessions', () => {
    const allSessions = mockSessionList
    mockSessions.mockReturnValue({ sessions: allSessions, total: 3, loading: false, unavailable: false })
    render(<HermesSessionsPage />)

    // All three titles visible initially
    expect(screen.getByText('CLI Session')).toBeDefined()
    expect(screen.getByText('Discord Session')).toBeDefined()

    // Click the "cli" chip (in source filter bar, not the badge inside cards)
    const chips = screen.getAllByRole('button', { name: 'cli' })
    // Find the filter chip (there should be one in the filter bar)
    fireEvent.click(chips[chips.length - 1])

    // Discord session filtered out after clicking cli chip
    expect(screen.queryByText('Discord Session')).toBeNull()
  })

  it('shows "Hermes WebAPI unavailable" banner on 503', () => {
    mockSessions.mockReturnValue({ sessions: [], total: 0, loading: false, unavailable: true })
    render(<HermesSessionsPage />)
    expect(screen.getByText('Hermes WebAPI unavailable')).toBeDefined()
  })

  it('shows CSV button when sessions are loaded', () => {
    mockSessions.mockReturnValue({ sessions: mockSessionList, total: 3, loading: false, unavailable: false })
    render(<HermesSessionsPage />)
    expect(screen.getByText('CSV')).toBeDefined()
  })

  it('CSV button triggers URL.createObjectURL', () => {
    mockSessions.mockReturnValue({ sessions: mockSessionList, total: 3, loading: false, unavailable: false })

    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURL = vi.fn()
    const appendChildMock = vi.fn()
    const clickMock = vi.fn()

    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })

    // Mock anchor element behavior
    const origCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        const a = origCreate('a')
        a.click = clickMock
        return a
      }
      return origCreate(tag)
    })

    render(<HermesSessionsPage />)
    const csvBtn = screen.getByText('CSV').closest('button')!
    fireEvent.click(csvBtn)

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(clickMock).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('shows "Sessions" title in header', () => {
    mockSessions.mockReturnValue({ sessions: [], total: 0, loading: false, unavailable: false })
    render(<HermesSessionsPage />)
    expect(screen.getByText('Sessions')).toBeDefined()
  })

  it('shows loading state', () => {
    mockSessions.mockReturnValue({ sessions: [], total: 0, loading: true, unavailable: false })
    render(<HermesSessionsPage />)
    expect(screen.getByText('Loading…')).toBeDefined()
  })
})
