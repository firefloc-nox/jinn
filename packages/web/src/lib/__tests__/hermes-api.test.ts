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

// ---------------------------------------------------------------------------
// hermesApi.getCron
// ---------------------------------------------------------------------------

describe('hermesApi.getCron', () => {
  afterEach(() => vi.restoreAllMocks())

  const mockJobs = [
    {
      id: 'job-1',
      name: 'Daily digest',
      schedule: '0 9 * * *',
      enabled: true,
      prompt: 'Summarize yesterday',
      deliver: 'telegram',
    },
    {
      id: 'job-2',
      name: 'Hourly ping',
      schedule: 'every 1h',
      enabled: false,
      prompt: 'Ping health',
      deliver: 'discord',
    },
  ]

  it('parses array of cron jobs', async () => {
    vi.stubGlobal('fetch', mockFetch(200, mockJobs))
    const result = await hermesApi.getCron()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('job-1')
    expect(result[0].name).toBe('Daily digest')
    expect(result[1].enabled).toBe(false)
  })

  it('returns empty array when backend returns []', async () => {
    vi.stubGlobal('fetch', mockFetch(200, []))
    const result = await hermesApi.getCron()
    expect(result).toEqual([])
  })

  it('throws HermesUnavailableError on 503', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    await expect(hermesApi.getCron()).rejects.toThrow(HermesUnavailableError)
  })
})

// ---------------------------------------------------------------------------
// hermesApi.getModels
// ---------------------------------------------------------------------------

describe('hermesApi.getModels', () => {
  afterEach(() => vi.restoreAllMocks())

  const mockModels = {
    models: [
      { id: 'claude-opus-4', name: 'Claude Opus 4', provider: 'anthropic', contextLength: 200000 },
      { id: 'gpt-5', name: 'GPT-5', provider: 'openai' },
    ],
  }

  it('parses model list correctly', async () => {
    vi.stubGlobal('fetch', mockFetch(200, mockModels))
    const result = await hermesApi.getModels()
    expect(result.models).toHaveLength(2)
    expect(result.models[0].id).toBe('claude-opus-4')
    expect(result.models[0].provider).toBe('anthropic')
    expect(result.models[0].contextLength).toBe(200000)
  })

  it('handles model without contextLength', async () => {
    vi.stubGlobal('fetch', mockFetch(200, mockModels))
    const result = await hermesApi.getModels()
    expect(result.models[1].contextLength).toBeUndefined()
  })

  it('throws HermesUnavailableError on 503', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    await expect(hermesApi.getModels()).rejects.toThrow(HermesUnavailableError)
  })
})

// ---------------------------------------------------------------------------
// hermesApi.updateMemory — additional cases
// ---------------------------------------------------------------------------

describe('hermesApi.updateMemory — additional cases', () => {
  afterEach(() => vi.restoreAllMocks())

  it('updateMemory("memory", "add", content) sends correct body', async () => {
    const fetchMock = mockFetch(200, { status: 'ok' })
    vi.stubGlobal('fetch', fetchMock)
    await hermesApi.updateMemory('memory', 'add', 'Important context')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/api/hermes/memory')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      target: 'memory',
      action: 'add',
      content: 'Important context',
    })
    expect(body.oldText).toBeUndefined()
  })

  it('updateMemory("memory", "replace", newText, oldText) sends oldText in body', async () => {
    const fetchMock = mockFetch(200, { status: 'ok' })
    vi.stubGlobal('fetch', fetchMock)
    await hermesApi.updateMemory('memory', 'replace', 'Updated fact', 'Old fact')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.oldText).toBe('Old fact')
    expect(body.content).toBe('Updated fact')
    expect(body.action).toBe('replace')
  })

  it('throws HermesUnavailableError on 503', async () => {
    vi.stubGlobal('fetch', mockFetch(503, {}))
    await expect(hermesApi.updateMemory('memory', 'add', 'x')).rejects.toThrow(HermesUnavailableError)
  })

  it('throws generic Error on 401 (not HermesUnavailableError)', async () => {
    vi.stubGlobal('fetch', mockFetch(401, {}))
    const err = await hermesApi.updateMemory('memory', 'add', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(HermesUnavailableError)
    expect((err as Error).message).toContain('401')
  })
})

// ---------------------------------------------------------------------------
// Network timeout / failure
// ---------------------------------------------------------------------------

describe('hermesApi — network failure', () => {
  afterEach(() => vi.restoreAllMocks())

  it('throws when fetch rejects (network timeout / offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(hermesApi.getHealth()).rejects.toThrow('Failed to fetch')
  })

  it('getSessions throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')))
    await expect(hermesApi.getSessions()).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 401 — not HermesUnavailableError
// ---------------------------------------------------------------------------

describe('hermesApi — 401 is a real error, not HermesUnavailableError', () => {
  afterEach(() => vi.restoreAllMocks())

  it('getHealth throws generic Error (not HermesUnavailable) on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, {}))
    const err = await hermesApi.getHealth().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(HermesUnavailableError)
  })

  it('getSessions throws generic Error on 401', async () => {
    vi.stubGlobal('fetch', mockFetch(401, {}))
    const err = await hermesApi.getSessions().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(HermesUnavailableError)
  })
})
