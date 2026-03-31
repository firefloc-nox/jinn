import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'

// ---------------------------------------------------------------------------
// Mocks — factories may only contain vi.fn() and literal values (they're
// hoisted before class/const declarations in the module scope).
// ---------------------------------------------------------------------------

vi.mock('../client.js', () => ({
  HermesWebAPIClient: vi.fn(),
  resolveHermesHome: vi.fn().mockReturnValue('/tmp/hermes-test'),
}))

vi.mock('node:fs')

import { HermesWebAPIClient } from '../client.js'
import { HermesDataConnector } from '../index.js'

// ---------------------------------------------------------------------------
// Shared mock state (created AFTER imports so vi.mock has already been applied)
// ---------------------------------------------------------------------------

// This object is the instance that `new HermesWebAPIClient()` will return.
// Wired in beforeEach via mockImplementation using a regular `function`.
const mockCheckHealth = vi.fn().mockResolvedValue(true)
const mockClientInstance = { checkHealth: mockCheckHealth }

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

    // Restore mockReturnThis on watcher.on after clearAllMocks
    mockWatcher.on.mockReturnThis()

    // Default fs: file does not exist (safe default for cron watcher)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.watch).mockReturnValue(mockWatcher as unknown as ReturnType<typeof fs.watch>)

    // Wire HermesWebAPIClient constructor to return our controlled instance.
    // MUST use a regular `function` (not arrow) so it can be called with `new`.
    vi.mocked(HermesWebAPIClient).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      function () { return mockClientInstance } as unknown as typeof HermesWebAPIClient,
    )

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
    expect(client).toBe(mockClientInstance)
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
