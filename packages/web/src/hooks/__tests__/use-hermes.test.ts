import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

// ---------------------------------------------------------------------------
// Mock hermesApi — must come before importing the hook
// ---------------------------------------------------------------------------

vi.mock('@/lib/hermes-api', () => {
  const HermesUnavailableError = class extends Error {
    readonly hermesUnavailable = true
    constructor() {
      super('Hermes WebAPI unavailable')
      this.name = 'HermesUnavailableError'
    }
  }

  return {
    HermesUnavailableError,
    hermesApi: {
      getHealth: vi.fn(),
      getSessions: vi.fn(),
      getMemory: vi.fn(),
      updateMemory: vi.fn(),
      getSkills: vi.fn(),
      getCron: vi.fn(),
      getModels: vi.fn(),
      getSession: vi.fn(),
      getMessages: vi.fn(),
      searchSessions: vi.fn(),
    },
  }
})

import {
  useHermesStatus,
  useHermesSessions,
  useHermesMemory,
  useHermesSkills,
} from '../use-hermes'
import { hermesApi, HermesUnavailableError } from '@/lib/hermes-api'

const mockApi = hermesApi as unknown as {
  getHealth: ReturnType<typeof vi.fn>
  getSessions: ReturnType<typeof vi.fn>
  getMemory: ReturnType<typeof vi.fn>
  updateMemory: ReturnType<typeof vi.fn>
  getSkills: ReturnType<typeof vi.fn>
}

// ---------------------------------------------------------------------------
// Wrapper — fresh QueryClient per test
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return {
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children),
    qc,
  }
}

// ---------------------------------------------------------------------------
// useHermesStatus
// ---------------------------------------------------------------------------

describe('useHermesStatus', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns "loading" before query resolves', async () => {
    // Never resolves during this check
    mockApi.getHealth.mockReturnValue(new Promise(() => {}))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesStatus(), { wrapper })
    // Immediately after mount, should be loading
    expect(result.current).toBe('loading')
  })

  it('returns "connected" when /api/hermes/health returns { status: "ok" }', async () => {
    mockApi.getHealth.mockResolvedValue({ status: 'ok' })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesStatus(), { wrapper })
    await waitFor(() => expect(result.current).toBe('connected'))
  })

  it('returns "disconnected" when API throws HermesUnavailableError (503)', async () => {
    mockApi.getHealth.mockRejectedValue(new HermesUnavailableError())
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesStatus(), { wrapper })
    await waitFor(() => expect(result.current).toBe('disconnected'))
  })

  it('returns "disconnected" when health status is not "ok"', async () => {
    mockApi.getHealth.mockResolvedValue({ status: 'degraded' })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesStatus(), { wrapper })
    await waitFor(() => expect(result.current).toBe('disconnected'))
  })
})

// ---------------------------------------------------------------------------
// useHermesSessions
// ---------------------------------------------------------------------------

describe('useHermesSessions', () => {
  afterEach(() => vi.restoreAllMocks())

  const mockItems = [
    {
      id: 'sess-1',
      source: 'cli',
      model: 'claude-sonnet-4-5',
      startedAt: 1700000000,
      endedAt: 1700000060,
      messageCount: 4,
      inputTokens: 1000,
      outputTokens: 500,
      title: 'Test session',
    },
    {
      id: 'sess-2',
      source: 'telegram',
      model: null,
      startedAt: 1700001000,
      endedAt: null,
      messageCount: 2,
      inputTokens: 200,
      outputTokens: 100,
      title: null,
    },
  ]

  it('returns items and total when query succeeds', async () => {
    mockApi.getSessions.mockResolvedValue({ items: mockItems, total: 2 })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesSessions(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toHaveLength(2)
    expect(result.current.sessions[0].id).toBe('sess-1')
    expect(result.current.total).toBe(2)
    expect(result.current.unavailable).toBe(false)
  })

  it('starts with loading=true', () => {
    mockApi.getSessions.mockReturnValue(new Promise(() => {}))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesSessions(), { wrapper })
    expect(result.current.loading).toBe(true)
  })

  it('returns empty sessions and unavailable=true on 503', async () => {
    mockApi.getSessions.mockRejectedValue(new HermesUnavailableError())
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesSessions(), { wrapper })
    await waitFor(() => expect(result.current.unavailable).toBe(true))
    expect(result.current.sessions).toEqual([])
    expect(result.current.total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// useHermesMemory
// ---------------------------------------------------------------------------

describe('useHermesMemory', () => {
  afterEach(() => vi.restoreAllMocks())

  const mockMemory = {
    memory: {
      entries: ['Agent fact 1', 'Agent fact 2', 'Agent fact 3'],
      usage: '45%',
    },
    user: {
      entries: ['User name: Firefloc', 'Prefers French'],
      usage: '12%',
    },
  }

  it('parses memory and user entries correctly', async () => {
    mockApi.getMemory.mockResolvedValue(mockMemory)
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesMemory(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.memory?.memory.entries).toHaveLength(3)
    expect(result.current.memory?.user.entries).toHaveLength(2)
    expect(result.current.memory?.memory.entries[0]).toBe('Agent fact 1')
    expect(result.current.memory?.user.entries[1]).toBe('Prefers French')
  })

  it('returns memory=null and unavailable=true on 503', async () => {
    mockApi.getMemory.mockRejectedValue(new HermesUnavailableError())
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesMemory(), { wrapper })
    await waitFor(() => expect(result.current.unavailable).toBe(true))
    expect(result.current.memory).toBeNull()
  })

  it('update() calls hermesApi.updateMemory with correct params', async () => {
    mockApi.getMemory.mockResolvedValue(mockMemory)
    mockApi.updateMemory.mockResolvedValue({ status: 'ok' })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesMemory(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await result.current.update('memory', 'add', 'New fact')
    expect(mockApi.updateMemory).toHaveBeenCalledWith('memory', 'add', 'New fact', undefined)
  })

  it('update() with replace passes oldText correctly', async () => {
    mockApi.getMemory.mockResolvedValue(mockMemory)
    mockApi.updateMemory.mockResolvedValue({ status: 'ok' })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesMemory(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await result.current.update('user', 'replace', 'New name', 'Old name')
    expect(mockApi.updateMemory).toHaveBeenCalledWith('user', 'replace', 'New name', 'Old name')
  })

  it('update() with remove passes empty content and oldText', async () => {
    mockApi.getMemory.mockResolvedValue(mockMemory)
    mockApi.updateMemory.mockResolvedValue({ status: 'ok' })
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesMemory(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))

    await result.current.update('memory', 'remove', '', 'Agent fact 1')
    expect(mockApi.updateMemory).toHaveBeenCalledWith('memory', 'remove', '', 'Agent fact 1')
  })
})

// ---------------------------------------------------------------------------
// useHermesSkills
// ---------------------------------------------------------------------------

describe('useHermesSkills', () => {
  afterEach(() => vi.restoreAllMocks())

  const mockSkills = {
    skills: [
      { name: 'github-pr-workflow', description: 'PR lifecycle', category: 'github' },
      { name: 'vllm', description: 'Serve LLMs', category: 'mlops/inference' },
      { name: 'whisper', description: 'Speech recognition', category: 'mlops/models' },
    ],
    categories: {
      github: ['github-pr-workflow'],
      'mlops/inference': ['vllm'],
      'mlops/models': ['whisper'],
    },
    count: 3,
  }

  it('returns count and categories when query succeeds', async () => {
    mockApi.getSkills.mockResolvedValue(mockSkills)
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesSkills(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.count).toBe(3)
    expect(result.current.skills).toHaveLength(3)
    expect(Object.keys(result.current.categories)).toHaveLength(3)
    expect(result.current.categories['github']).toContain('github-pr-workflow')
  })

  it('returns zero count and empty arrays on 503', async () => {
    mockApi.getSkills.mockRejectedValue(new HermesUnavailableError())
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useHermesSkills(), { wrapper })
    await waitFor(() => expect(result.current.unavailable).toBe(true))
    expect(result.current.count).toBe(0)
    expect(result.current.skills).toEqual([])
    expect(result.current.categories).toEqual({})
  })
})
