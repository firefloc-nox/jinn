# CLAUDE.md — Jinn Development Context

## Philosophy

**Jinn is a bus, not a brain.** Zero custom AI logic. All intelligence comes from the engines themselves. Jinn routes, connects, schedules — nothing more.

## Project

- **Fork**: `firefloc-nox/jinn` (origin) from `hristo2612/jinn` (upstream)
- **Current branch**: `feature/bus-not-brain-runtime-refactor`
- **Package manager**: pnpm 10.6.4
- **Build system**: Turborepo

## Architecture

```
jinn/
├── packages/jimmy/          # Backend daemon — npm: jinn-cli
│   └── src/
│       ├── engines/         # Runtime adapters
│       │   ├── hermes.ts           # Hermes CLI spawn + WebAPI fallback
│       │   ├── hermes-webapi.ts    # Native SSE transport (port 8642)
│       │   ├── claude.ts           # Claude Code CLI
│       │   ├── codex.ts            # OpenAI Codex SDK
│       │   ├── gemini.ts           # Google Gemini CLI
│       │   └── capabilities.ts     # Engine feature detection
│       │
│       ├── sessions/        # Session lifecycle
│       │   ├── manager.ts          # Create/run/route sessions
│       │   ├── fallback.ts         # Runtime resolution + fallback chain
│       │   ├── registry.ts         # SQLite persistence
│       │   ├── context.ts          # Context building
│       │   └── fork.ts             # Session forking
│       │
│       ├── connectors/      # External integrations
│       │   ├── slack/              # Thread-aware, reaction workflow
│       │   ├── discord/            # Bot integration
│       │   ├── telegram/           # Bot API
│       │   ├── whatsapp/           # QR auth, Baileys
│       │   ├── hermes/             # Hermes data connector
│       │   └── cron/               # Scheduled jobs connector
│       │
│       ├── gateway/         # HTTP API
│       │   ├── api.ts              # Route handlers + validation
│       │   ├── event-bus.ts        # SSE event distribution
│       │   └── files.ts            # File upload handling
│       │
│       ├── workflows/       # Visual automation (experimental)
│       │   ├── engine.ts           # Workflow executor
│       │   ├── runner.ts           # Step runner
│       │   ├── types.ts            # Node/trigger types
│       │   ├── nodes/              # 12 node implementations
│       │   │   ├── agent.ts        # Spawn AI agent
│       │   │   ├── condition.ts    # Branch on expression
│       │   │   ├── http.ts         # HTTP requests
│       │   │   ├── notify.ts       # Send notifications
│       │   │   ├── move-card.ts    # Kanban operations
│       │   │   ├── wait.ts         # Delay/approval
│       │   │   ├── set-var.ts      # Variable assignment
│       │   │   ├── transform.ts    # Data transformation
│       │   │   └── ...
│       │   └── triggers/           # Cron, webhook, kanban, manual
│       │
│       ├── cron/            # Background scheduler
│       ├── hermes/          # Hermes-specific integration
│       ├── mcp/             # MCP server connections
│       ├── boards/          # Kanban board system
│       └── shared/          # Types, paths, logger, utils
│
├── packages/web/            # Next.js dashboard — npm: @jinn/web
│   └── src/
│       ├── app/             # Pages
│       │   ├── chat/        # Main chat interface
│       │   ├── org/         # Organization chart
│       │   ├── workflows/   # Workflow editor
│       │   ├── kanban/      # Multi-board kanban
│       │   ├── cron/        # Job scheduler UI
│       │   ├── costs/       # Spend tracking
│       │   ├── hermes/      # Memory, sessions, skills
│       │   └── settings/    # Configuration
│       │
│       ├── components/      # React components
│       │   ├── chat/        # Chat UI, message rendering
│       │   ├── activity/    # Tool calls, thinking display
│       │   └── org-chart/   # Hierarchy visualization
│       │
│       └── hooks/           # React Query data hooks
│           ├── use-gateway.ts      # Session/message operations
│           ├── use-hermes.ts       # Hermes API integration
│           ├── use-employees.ts    # Org management
│           └── use-cron.ts         # Job scheduling
│
└── e2e/                     # Playwright E2E tests
```

## Key Types

```typescript
// Runtime identification
type RuntimeKind = "hermes" | "claude" | "codex" | "gemini" | (string & {});
type RuntimeRef = string;  // e.g., "hermes", "hermes:openrouter", "hermes:ollama"

// Fallback policy
interface FallbackPolicy {
  primary: RuntimeRef;
  fallbacks: RuntimeRef[];
  fallbackOnUnavailable: boolean;
  fallbackOnHardFailure: boolean;  // V2 — reserved
}

// Default: hermes → claude → codex → gemini
const DEFAULT_FALLBACK_POLICY: FallbackPolicy = {
  primary: "hermes",
  fallbacks: ["claude", "codex", "gemini"],
  fallbackOnUnavailable: true,
  fallbackOnHardFailure: true,
};

// Hermes hooks — augmentation before spawning any runtime
interface HermesHooks {
  enabled: boolean;
  memory?: boolean;
  skills?: boolean;
  mcp?: boolean;
}

// Workflow node types
enum NodeType {
  TRIGGER, AGENT, CONDITION, MOVE_CARD, NOTIFY,
  WAIT, CRON, DONE, ERROR, HTTP, SET_VAR, TRANSFORM, LOG
}

// Workflow triggers
enum TriggerType {
  manual, cron, webhook,
  kanban_card_added, kanban_card_moved, session_completed
}
```

## Hermes WebAPI Transport

Native SSE transport to Hermes (port 8642), faster than CLI spawn:

```typescript
// SSE events from Hermes WebAPI:
session.created      → { session_id, run_id, seq, title, model }
run.started          → { user_message: { id, role, content } }
message.started      → { message: { id, role } }
assistant.delta      → { message_id, delta }
tool.pending         → { tool_name, preview, args }
tool.started         → { tool_name, preview, args }
tool.completed       → { tool_name, tool_call_id, result_preview }
tool.failed          → { tool_name, tool_call_id, result_preview }
assistant.completed  → { message_id, content, completed, partial, interrupted }
run.completed        → { message_id, completed, partial, interrupted, api_calls }
error                → { message }
done                 → {} // sentinel
```

**Availability cache**: 30s TTL. Call `HermesWebAPITransport.invalidateAvailabilityCache()` after connection errors.

## Routing Config

New `routing` schema (preferred):
```yaml
routing:
  defaultRuntime: hermes
  fallbackRuntimes: [claude, codex, gemini]
```

Legacy `brain` schema (still supported):
```yaml
brain:
  primary: hermes
  fallbacks: [claude, codex, gemini]
```

## Development

```bash
pnpm install          # Install deps
pnpm build            # Build jimmy + web
pnpm dev              # Watch mode
pnpm test             # Unit tests (vitest)
pnpm test:e2e         # E2E tests (playwright)
pnpm typecheck        # Type check

pnpm start            # Clean + build + start daemon
pnpm stop             # Stop daemon
pnpm status           # Check status
```

## API Reference (Gateway :7778)

### Sessions
- `GET  /api/sessions` — List all sessions
- `GET  /api/sessions/:id` — Get session details
- `POST /api/sessions` — Create session + send message
- `POST /api/sessions/stub` — Create empty session (no message)
- `PUT  /api/sessions/:id` — Update session metadata
- `DELETE /api/sessions/:id` — Delete session
- `POST /api/sessions/bulk-delete` — Delete multiple sessions
- `POST /api/sessions/:id/messages` — Send message to session
- `POST /api/sessions/:id/interrupt` — Interrupt running session
- `POST /api/sessions/:id/fork` — Fork session
- `GET  /api/sessions/:id/messages` — Get message history
- `GET  /api/sessions/:id/events` — Get session events (tool calls, thinking)
- `GET  /api/sessions/interrupted` — List interrupted sessions
- `GET  /api/sessions/hermes-activity` — Get Hermes activity feed

### Cron Jobs
- `GET  /api/cron` — List all jobs
- `GET  /api/cron/:id` — Get job details
- `POST /api/cron` — Create job
- `PUT  /api/cron/:id` — Update job
- `DELETE /api/cron/:id` — Delete job
- `POST /api/cron/:id/run` — Trigger job manually

### Organization
- `GET  /api/org` — Get full org structure
- `GET  /api/org/employees/:name` — Get employee
- `POST /api/org/employees` — Create employee
- `PATCH /api/org/employees/:name` — Update employee
- `DELETE /api/org/employees/:name` — Delete employee
- `GET  /api/org/services` — List available runtimes
- `GET  /api/org/departments/:name/board` — Get department board
- `PUT  /api/org/departments/:name/board` — Update department board

### Hermes
- `GET  /api/hermes/profiles` — List Hermes profiles
- `GET  /api/hermes/profiles/:name` — Get profile
- `POST /api/hermes/profiles` — Create profile
- `PATCH /api/hermes/profiles/:name` — Update profile

### Skills
- `GET  /api/skills` — List skills
- `GET  /api/skills/:name` — Get skill content
- `DELETE /api/skills/:name` — Delete skill
- `GET  /api/skills/search` — Search skills
- `GET  /api/skills/manifest` — Get skills manifest
- `POST /api/skills/install` — Install skill from manifest

### Other
- `GET  /api/status` — Gateway status
- `GET  /api/instances` — List Jinn instances

## Git Workflow

- **`lain`** — Primary development branch
- **`main`** — Reserved for upstream syncs
- **Commits** — Conventional: `fix(scope):`, `feat(scope):`
- **Push** — Systematic after each commit

```bash
git fetch upstream
git merge upstream/main --no-edit
```

## Current Work

Uncommitted changes (27 insertions, 6 deletions):

| File | Change |
|------|--------|
| `engines/hermes.ts` | WebAPI empty result guardrail + `sess_` prefix filter for CLI resume |
| `gateway/api.ts` | Add `routing` to schema validation |
| `sessions/manager.ts` | Support new `routing` config alongside legacy `brain` |

## Conventions

- **TypeScript strict** — No `any` unless unavoidable
- **ESM only** — All imports use `.js` extension
- **No magic YAML** — Explicit configuration
- **Heterogeneous profiles** — Each runtime has its own config schema

## Pitfalls

1. **WebAPI session IDs** start with `sess_` — don't pass to CLI `--resume`
2. **Empty WebAPI results** happen silently — always check `result?.trim()`
3. **Turbo cache** can cause stale builds — `pnpm clean` if weird behavior
4. **Next.js static export** — `useSearchParams` needs Suspense boundary
5. **Hermes profile** not exposed in ChatRequest — pass via `source="jinn-<profile>"`

## Testing Patterns

### Unit Tests (vitest)

Located in `__tests__/` directories next to source files.

```typescript
// Pattern: mock shared/paths to use tmpdir, real fs
const { tmpHome, wfDir } = vi.hoisted(() => {
  const home = path.join(os.tmpdir(), `jinn-test-${process.pid}-${Date.now()}`)
  fs.mkdirSync(path.join(home, 'sessions'), { recursive: true })
  return { tmpHome: home, wfDir: path.join(home, 'workflows') }
})

vi.mock('../../shared/paths.js', () => ({
  JINN_HOME: tmpHome,
  SESSIONS_DB: path.join(tmpHome, 'sessions', 'registry.db'),
  // ... other paths
}))

// Pattern: mock external services
vi.mock('../../sessions/callbacks.js', () => ({
  notifyDiscordChannel: vi.fn()
}))
```

### E2E Tests (playwright)

Located in `e2e/`. Tests hit live APIs — no mocks.

```typescript
const JINN_API = 'http://127.0.0.1:7778'
const HERMES_API = 'http://127.0.0.1:8642'

test('session engine=hermes routed to WebAPI', async () => {
  const resp = await fetch(`${JINN_API}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'test', source: 'e2e' })
  })
  expect(resp.ok).toBe(true)
  const session = await resp.json()
  expect(session.engine).toBe('hermes')
})
```

### Test file locations

```
packages/jimmy/src/
├── connectors/{slack,telegram,whatsapp,hermes}/__tests__/
├── workflows/__tests__/
├── mcp/__tests__/
└── engines/__tests__/

packages/web/src/
├── components/chat/__tests__/
├── hooks/__tests__/
└── lib/__tests__/

e2e/
└── *.ts  # Live API integration tests
```

## Links

- Upstream: https://github.com/hristo2612/jinn
- Fork: https://github.com/firefloc-nox/jinn
