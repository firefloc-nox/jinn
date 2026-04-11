/**
 * Unit tests for createSession() model field persistence.
 *
 * Verifies that the model field is correctly stored in SQLite and
 * retrieved via getSession() — covering the fix for POST /api/sessions
 * and POST /api/sessions/stub not passing model to createSession().
 */

import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted: define tmp paths before the hoisted vi.mock calls run ─────────
const { tmpHome } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _os = require('node:os') as typeof os
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _path = require('node:path') as typeof path
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _fs = require('node:fs') as typeof fs

  const home = _path.join(_os.tmpdir(), `jinn-session-model-test-${process.pid}-${Date.now()}`)
  _fs.mkdirSync(_path.join(home, 'sessions'), { recursive: true })
  return { tmpHome: home }
})

// ── Mock shared/paths.js so SESSIONS_DB → our tmpDir ─────────────────────────
vi.mock('../../shared/paths.js', () => ({
  JINN_HOME: tmpHome,
  SESSIONS_DB: path.join(tmpHome, 'sessions', 'registry.db'),
  CONFIG_PATH: path.join(tmpHome, 'config.yaml'),
  CRON_JOBS: path.join(tmpHome, 'cron', 'jobs.json'),
  CRON_RUNS: path.join(tmpHome, 'cron', 'runs'),
  ORG_DIR: path.join(tmpHome, 'org'),
  SKILLS_DIR: path.join(tmpHome, 'skills'),
  DOCS_DIR: path.join(tmpHome, 'docs'),
  LOGS_DIR: path.join(tmpHome, 'logs'),
  TMP_DIR: path.join(tmpHome, 'tmp'),
  MODELS_DIR: path.join(tmpHome, 'models'),
  STT_MODELS_DIR: path.join(tmpHome, 'models', 'whisper'),
  PID_FILE: path.join(tmpHome, 'gateway.pid'),
  CLAUDE_SKILLS_DIR: path.join(tmpHome, '.claude', 'skills'),
  AGENTS_SKILLS_DIR: path.join(tmpHome, '.agents', 'skills'),
  TEMPLATE_DIR: path.join(tmpHome, 'template'),
  FILES_DIR: path.join(tmpHome, 'files'),
  MIGRATIONS_DIR: path.join(tmpHome, 'migrations'),
  TEMPLATE_MIGRATIONS_DIR: path.join(tmpHome, 'template', 'migrations'),
  INSTANCES_REGISTRY: path.join(os.homedir(), '.jinn', 'instances.json'),
  WORKFLOWS_DIR: path.join(tmpHome, 'workflows', 'definitions'),
  BOARDS_DIR: path.join(tmpHome, 'boards'),
}))

// ── Mock logger to suppress output ───────────────────────────────────────────
vi.mock('../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ── Import after mocks ────────────────────────────────────────────────────────
import { createSession, getSession, initDb } from '../../sessions/registry.js'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createSession() — model field persistence', () => {
  beforeEach(() => {
    // Re-initialise the DB for each test (module-level singleton is reused)
    initDb()
  })

  it('persists model when provided', () => {
    const session = createSession({
      engine: 'hermes',
      source: 'web',
      sourceRef: `web:${Date.now()}`,
      connector: 'web',
      model: 'xiaomi/mimo-v2-pro',
    })

    expect(session.model).toBe('xiaomi/mimo-v2-pro')

    const retrieved = getSession(session.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.model).toBe('xiaomi/mimo-v2-pro')
  })

  it('stores null when model is not provided', () => {
    const session = createSession({
      engine: 'hermes',
      source: 'web',
      sourceRef: `web:${Date.now()}`,
      connector: 'web',
    })

    expect(session.model).toBeNull()

    const retrieved = getSession(session.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.model).toBeNull()
  })
})
