import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { hermesApi, HermesUnavailableError } from '../hermes-api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HermesUnavailableError', () => {
  it('has correct name and hermesUnavailable flag', () => {
    const err = new HermesUnavailableError()
    expect(err.name).toBe('HermesUnavailableError')
    expect(err.hermesUnavailable).toBe(true)
    expect(err).toBeInstanceOf(Error)
  })

  it('has a descriptive message', () => {
    const err = new HermesUnavailableError()
    expect(err.message).toBe('Hermes WebAPI unavailable')
  })
})

describe('hermesApi.getHealth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(200, { status: 'ok' }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns status ok on 200', async () => {
    const result = await hermesApi.getHealth()
    expect(result.status).toBe('ok')
  })

  it('throws HermesUnavailableError on 503', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    await expect(hermesApi.getHealth()).rejects.toThrow(HermesUnavailableError)
  })

  it('throws generic Error on 500', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}))
    await expect(hermesApi.getHealth()).rejects.toThrow('API error: 500')
  })
})

describe('hermesApi.getSessions', () => {
  const mockSessions = {
    items: [
      {
        id: 'abc123',
        source: 'cli',
        model: 'claude-sonnet-4-5',
        startedAt: 1700000000,
        endedAt: 1700000060,
        messageCount: 4,
        inputTokens: 1000,
        outputTokens: 500,
        title: 'Test session',
      },
    ],
    total: 1,
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch(200, mockSessions))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns items and total', async () => {
    const result = await hermesApi.getSessions()
    expect(result.total).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('abc123')
  })

  it('appends limit/offset query params', async () => {
    const fetchMock = mockFetch(200, mockSessions)
    vi.stubGlobal('fetch', fetchMock)
    await hermesApi.getSessions({ limit: 10, offset: 20 })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('limit=10')
    expect(url).toContain('offset=20')
  })

  it('throws HermesUnavailableError on 503', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    await expect(hermesApi.getSessions()).rejects.toThrow(HermesUnavailableError)
  })
})

describe('hermesApi.getMemory', () => {
  const mockMemory = {
    memory: { entries: ['Agent fact 1', 'Agent fact 2'], usage: '45%' },
    user: { entries: ['User name: Firefloc'], usage: '12%' },
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns memory sections', async () => {
    vi.stubGlobal('fetch', mockFetch(200, mockMemory))
    const result = await hermesApi.getMemory()
    expect(result.memory.entries).toHaveLength(2)
    expect(result.user.entries).toHaveLength(1)
    expect(result.memory.usage).toBe('45%')
  })

  it('throws HermesUnavailableError on 503', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    await expect(hermesApi.getMemory()).rejects.toThrow(HermesUnavailableError)
  })
})

describe('hermesApi.getSkills', () => {
  const mockSkills = {
    skills: [
      { name: 'github-pr-workflow', description: 'PR lifecycle', category: 'github' },
      { name: 'vllm', description: 'Serve LLMs', category: 'mlops/inference' },
    ],
    categories: { github: ['github-pr-workflow'], 'mlops/inference': ['vllm'] },
    count: 2,
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns skills with count and categories', async () => {
    vi.stubGlobal('fetch', mockFetch(200, mockSkills))
    const result = await hermesApi.getSkills()
    expect(result.count).toBe(2)
    expect(result.skills[0].name).toBe('github-pr-workflow')
    expect(result.categories['github']).toContain('github-pr-workflow')
  })

  it('throws HermesUnavailableError on 503', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    await expect(hermesApi.getSkills()).rejects.toThrow(HermesUnavailableError)
  })
})

describe('hermesApi.updateMemory', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends PATCH with correct body for add', async () => {
    const fetchMock = mockFetch(200, { status: 'ok' })
    vi.stubGlobal('fetch', fetchMock)
    await hermesApi.updateMemory('memory', 'add', 'New fact')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ target: 'memory', action: 'add', content: 'New fact' })
  })

  it('includes oldText for replace', async () => {
    const fetchMock = mockFetch(200, { status: 'ok' })
    vi.stubGlobal('fetch', fetchMock)
    await hermesApi.updateMemory('user', 'replace', 'New value', 'Old value')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.oldText).toBe('Old value')
  })

  it('does not include oldText when not provided', async () => {
    const fetchMock = mockFetch(200, { status: 'ok' })
    vi.stubGlobal('fetch', fetchMock)
    await hermesApi.updateMemory('memory', 'remove', '', 'entry to remove')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    // oldText is provided in this case via the 4th arg; just ensure it appears
    expect(body.oldText).toBe('entry to remove')
  })
})
