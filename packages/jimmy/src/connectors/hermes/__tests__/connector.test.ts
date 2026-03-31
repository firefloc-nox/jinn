import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'

// Must be hoisted — vi.mock calls are hoisted to top of file by Vitest.
// HermesWebAPIClient is called with `new` inside HermesDataConnector constructor,
// so we need a class-based mock implementation.
const mockCheckHealth = vi.fn().mockResolvedValue(true)

vi.mock('../client.js', () => ({
  HermesWebAPIClient: vi.fn().mockImplementation(class {
    checkHealth = mockCheckHealth
  }),
  resolveHermesHome: vi.fn().mockReturnValue('/tmp/hermes-test'),
}))

vi.mock('node:fs')

import { HermesWebAPIClient } from '../client.js'
import { HermesDataConnector } from '../index.js'

// ---------------------------------------------------------------------------
// Mock watcher
// ---------------------------------------------------------------------------

const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  close: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HermesDataConnector lifecycle', () => {
  let connector: HermesDataConnector

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    // Restore mockReturnThis on watcher after clearAllMocks resets it
    vi.mocked(mockWatcher.on).mockReturnThis()

    // Default fs: file does not exist (safe default for cron watcher)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.watch).mockReturnValue(mockWatcher as unknown as ReturnType<typeof fs.watch>)

    // Default: API is healthy
    mockCheckHealth.mockResolvedValue(true)

    connector = new HermesDataConnector()
  })

  afterEach(async () => {
    if (connector) {
      await connector.stop()
    }
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  it('start() calls checkHealth and sets healthy=true when API is up', async () => {
    mockCheckHealth.mockResolvedValue(true)

    await connector.start()

    expect(mockCheckHealth).toHaveBeenCalledOnce()
    expect(connector.isHealthy()).toBe(true)
  })

  // -------------------------------------------------------------------------
  it('start() sets healthy=false when API is down', async () => {
    mockCheckHealth.mockResolvedValue(false)

    await connector.start()

    expect(connector.isHealthy()).toBe(false)
  })

  // -------------------------------------------------------------------------
  it('stop() clears healthTimer and cronWatcher', async () => {
    mockCheckHealth.mockResolvedValue(true)

    await connector.start()
    expect(connector.isHealthy()).toBe(true)

    await connector.stop()

    // After stop the connector should report itself as not healthy
    expect(connector.isHealthy()).toBe(false)
  })

  // -------------------------------------------------------------------------
  it('stop() is idempotent (call twice without error)', async () => {
    await connector.start()

    await expect(connector.stop()).resolves.not.toThrow()
    await expect(connector.stop()).resolves.not.toThrow()
  })

  // -------------------------------------------------------------------------
  it('getHealth() returns running when healthy', async () => {
    mockCheckHealth.mockResolvedValue(true)

    await connector.start()

    expect(connector.getHealth().status).toBe('running')
  })

  // -------------------------------------------------------------------------
  it('getHealth() returns error when unhealthy', async () => {
    mockCheckHealth.mockResolvedValue(false)

    await connector.start()

    const health = connector.getHealth()
    expect(health.status).toBe('error')
    expect(health.detail).toBe('Hermes WebAPI unreachable')
  })

  // -------------------------------------------------------------------------
  it('getClient() returns the HermesWebAPIClient instance', () => {
    const client = connector.getClient()

    expect(client).not.toBeNull()
    // client is an instance of the mocked class
    expect(client).toBeInstanceOf(vi.mocked(HermesWebAPIClient))
  })

  // -------------------------------------------------------------------------
  it('cron watcher: starts watching when file exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.watch).mockReturnValue(mockWatcher as unknown as ReturnType<typeof fs.watch>)

    await connector.start()

    expect(fs.watch).toHaveBeenCalledOnce()

    const watchedPath = vi.mocked(fs.watch).mock.calls[0]![0] as string
    expect(watchedPath).toMatch(/cron[/\\]jobs\.json$/)
  })

  // -------------------------------------------------------------------------
  it('cron watcher: schedules retry when file absent', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    await connector.start()

    // fs.watch must NOT have been called because the file doesn't exist
    expect(fs.watch).not.toHaveBeenCalled()
  })
})
