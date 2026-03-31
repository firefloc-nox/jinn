import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// better-sqlite3 ships as CJS — mock the default export (the constructor).
// Use vi.fn() directly; wiring happens in beforeEach via mockReturnValue so
// that `new Database(...)` is a real class-constructor call.
vi.mock('better-sqlite3', () => ({
  default: vi.fn(),
}))

import Database from 'better-sqlite3'
import { getHermesCostSummary } from '../costs.js'

// ---------------------------------------------------------------------------
// Shared mock state — rebuilt in beforeEach so tests are isolated
// ---------------------------------------------------------------------------

let mockStatement: { get: ReturnType<typeof vi.fn> }
let mockDb: {
  prepare: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getHermesCostSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockStatement = { get: vi.fn().mockReturnValue({ total: 0, count: 0 }) }
    mockDb = {
      prepare: vi.fn().mockReturnValue(mockStatement),
      close: vi.fn(),
    }

    // mockImplementation with function keyword — required for constructors in Vitest 4.x.
    vi.mocked(Database).mockImplementation(function () {
      return mockDb as unknown as Database.Database
    })
  })

  afterEach(() => {
    // Ensure HERMES_HOME env override is never leaked between tests
    delete process.env['HERMES_HOME']
  })

  // -------------------------------------------------------------------------
  it('returns available=false when Database throws (state.db missing)', () => {
    vi.mocked(Database).mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    const result = getHermesCostSummary()

    expect(result.available).toBe(false)
    expect(result.totalEstimatedCostUsd).toBe(0)
    expect(result.sessionCount).toBe(0)
  })

  // -------------------------------------------------------------------------
  it('returns cost data for month period', () => {
    mockStatement.get.mockReturnValue({ total: 12.5, count: 42 })

    const result = getHermesCostSummary('month')

    expect(result.available).toBe(true)
    expect(result.totalEstimatedCostUsd).toBe(12.5)
    expect(result.sessionCount).toBe(42)
  })

  // -------------------------------------------------------------------------
  it('returns cost data for week period', () => {
    mockStatement.get.mockReturnValue({ total: 7.0, count: 10 })

    const result = getHermesCostSummary('week')

    expect(result.available).toBe(true)
    expect(result.totalEstimatedCostUsd).toBe(7.0)
    expect(result.sessionCount).toBe(10)
  })

  // -------------------------------------------------------------------------
  it('returns cost data for day period', () => {
    mockStatement.get.mockReturnValue({ total: 1.25, count: 3 })

    const result = getHermesCostSummary('day')

    expect(result.available).toBe(true)
    expect(result.totalEstimatedCostUsd).toBe(1.25)
    expect(result.sessionCount).toBe(3)
  })

  // -------------------------------------------------------------------------
  it('uses correct cutoff for day period', () => {
    // Pin the current date so the cutoff is predictable
    const fixedDate = new Date('2025-06-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(fixedDate)

    mockStatement.get.mockReturnValue({ total: 0, count: 0 })

    getHermesCostSummary('day')

    vi.useRealTimers()

    const callArg = mockStatement.get.mock.calls[0]![0] as number

    // midnight LOCAL time on 2025-06-15 — implementation uses setHours(0,0,0,0)
    // which is local-timezone-dependent. We just verify it is a reasonable Unix ts.
    expect(callArg).toBeGreaterThan(0)
    // Should be within 24h window of the fixed date
    const fixedUnix = fixedDate.getTime() / 1000
    expect(callArg).toBeGreaterThan(fixedUnix - 86_400)
    expect(callArg).toBeLessThan(fixedUnix + 86_400)
  })

  // -------------------------------------------------------------------------
  it('uses correct cutoff for month period', () => {
    const fixedDate = new Date('2025-06-15T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(fixedDate)

    mockStatement.get.mockReturnValue({ total: 0, count: 0 })

    getHermesCostSummary('month')

    vi.useRealTimers()

    const callArg = mockStatement.get.mock.calls[0]![0] as number

    // Implementation: new Date(year, month, 1) → first day of current month, local time
    // Unix timestamp of 2025-06-01 will be approximately fixedDate - 14 days
    const fixedUnix = fixedDate.getTime() / 1000
    expect(callArg).toBeGreaterThan(0)
    expect(callArg).toBeLessThan(fixedUnix)
    // Must be within 32 days before the pinned date
    expect(callArg).toBeGreaterThan(fixedUnix - 32 * 86_400)
  })

  // -------------------------------------------------------------------------
  it('returns available=false if SQL query throws', () => {
    mockStatement.get.mockImplementation(() => {
      throw new Error('SQL error')
    })

    const result = getHermesCostSummary()

    expect(result.available).toBe(false)
  })

  // -------------------------------------------------------------------------
  it('closes the database even on error', () => {
    mockStatement.get.mockImplementation(() => {
      throw new Error('SQL error')
    })

    getHermesCostSummary()

    // close() should be called in the finally block regardless of error
    expect(mockDb.close).toHaveBeenCalledOnce()
  })

  // -------------------------------------------------------------------------
  it('uses HERMES_HOME env var for db path', () => {
    process.env['HERMES_HOME'] = '/custom/hermes'

    getHermesCostSummary()

    expect(Database).toHaveBeenCalledWith(
      '/custom/hermes/state.db',
      expect.objectContaining({ readonly: true }),
    )
  })
})
