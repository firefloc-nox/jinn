# Changelog

## [Unreleased] — lain branch

### ✨ Features — Workflow Engine _(experimental)_
- **Visual workflow editor** — React Flow based, drag-and-drop nodes with live preview
- **12 node types** — TRIGGER, AGENT, CONDITION, NOTIFY, MOVE_CARD, WAIT, HTTP, SET_VAR, TRANSFORM, LOG, DONE, WAIT_FOR_HUMAN
- **4 trigger types** — manual, cron (node-cron), webhook (HMAC signature), kanban events (card_added, card_moved)
- **Workflow AI Assistant** — chat bubble that generates runnable workflows from natural language
- **Templates gallery** — simple-agent, review-pipeline, cron-brief, discord-notify
- **No-code forms** — visual condition builder, smart dropdowns, presets, help tooltips for all node types
- **FR/EN i18n** — full translation coverage for workflow module
- **Workflow run history** — per-run status, step logs, live execution view
- **Discord mode** — send/notify nodes with Discord-specific templates
- **Mode Registry** — extensible mode system for domain-specific node palettes

### ✨ Features — Hermes Integration
- **WebAPI-first transport** — SSE streaming directly to Hermes port 8642, no CLI spawn for active sessions
- **Hermes sessions page** — list, search, filter by source, stats bar, CSV export
- **Hermes memory page** — inline edit, diff-preview delete, import/export MEMORY.md, auto-save
- **Hermes skills page** — category grid, search, skill detail modal
- **HermesActivityWidget** — last 5 sessions widget in dashboard
- **Per-employee profile wiring** — `--profile`, `--toolsets`, `--skills`, `--provider` all effective
- **hermesRuntimeMeta badges** — model, provider, honcho status, profile surfaced in session views
- **Unified cron store** — Hermes jobs + Jinn-native jobs in single API (`~/.hermes/cron/jobs.json`)
- **COO persona** — `portal.hermesProfile` wires identity for all Jinn gateway sessions
- **LACP bypass** — `hermes.native` resolution bypasses LACP TTY wrapper in non-interactive spawns

### ✨ Features — Org System
- **Hermes profile section** — view and edit Hermes profile inline in employee detail
- **New Agent wizard** — 3-step modal: name, engine, Hermes profile (create + auto-scaffold)
- **Cross-department service routing** — request services from other departments inline
- **COO from portal config** — synthetic COO employee from `portal.hermesProfile`
- **Employee CRUD** — POST/DELETE/PATCH for full employee lifecycle from dashboard
- **Hermes profile filesystem CRUD** — `GET/PATCH/POST/DELETE /api/hermes/profiles/:name`

### ✨ Features — Kanban & Boards
- **Multi-board Kanban** — per-department boards + custom boards, isolated state per board
- **Boards REST API** — full CRUD for boards, columns, cards + drag-and-drop reorder
- **Gateway event bus** — `board:card_moved` and `board:card_added` events for workflow triggers

### ✨ Features — Cost Analytics
- **`/costs` page** — total spend summary + by-employee + by-department breakdowns
- **Hermes cost integration** — reads `state.db` directly (readonly, graceful degradation)
- **Budget enforcement** — per-employee budget caps in config

### 🔧 Fixes
- **MCP resolver** — fixed corrupted `apiKey` resolution for `mcp.search`; fixed `gateway-server.js` path (was producing `dist/dist` double)
- **Queue real-time updates** — `queue:updated` WS events now emitted when task starts and completes (UI no longer stuck on "queued")
- **Session recovery after restart** — WS reconnect forces session list refetch; `queue:updated` invalidates React Query cache
- **Employee YAML engine resolution** — `POST /api/sessions` now reads engine/model from employee YAML correctly
- **Hermes WebAPI SSE** — `currentEvent` now persists across SSE chunk boundaries (fixed fragmentation bug)
- **Workflow editor** — fixed edge source/target alignment, position undefined guard, useSearchParams SSR wrapping

### 🧪 Tests Added
- MCP resolver (17 tests) — search apiKey, gateway path, browser/fetch, employee permissions
- Workflow engine (73 tests) — engine, registry, nodes, runner
- HermesEngine WebAPI transport — isAvailable, createSession, SSE chat, runViaWebAPI
- E2E suite — smoke UI + API/Hermes consistency + engine routing

## [0.7.0] - 2026-03-19

### ✨ Features — Project Phoenix
- **Chat tabs** — Cmd+W close, Cmd+Shift+[/] switch, draft persistence, status indicators
- **Command palette** — cmdk-powered Cmd+K with actions, recents, sessions, skills search
- **Breadcrumb navigation** — context-aware breadcrumbs on all pages
- **ChatPane extraction** — reusable chat component decoupled from page
- **Enhanced sidebar** — expandable employee groups, pin/unpin, context menu, hover actions
- **React Query data layer** — query key factory, hooks for all resources, WS→cache invalidation bridge

### 🔧 Improvements
- **Tailwind migration** — 640→120 inline styles (81% reduction), shadcn token system
- **Header consolidation** — single 40px tab bar replaces 3 stacked headers on chat
- **Mobile UX** — more menu in top header, clean tab bar, responsive sidebar
- **Session state sync** — tabs and selected session stay in sync
- **Instant tab switching** — no scroll flash, useLayoutEffect for immediate scroll

### 🏗️ Infrastructure
- Goals CRUD API + SQLite table (backend, for future use)
- Cost aggregation API + budget enforcement system
- Mock engine for E2E tests
- Vitest setup (api + web), Playwright config, GitHub Actions CI workflow

### 🧹 Cleanup
- Removed: split view, goals/costs pages (no backend yet), 14 unused shadcn components
- Fixed: dual-fetch anti-pattern in sidebar, session delete via mutations
- Net: 81 files changed, +5,608 / -8,723 lines

## [0.3.0] - 2026-03-10

### 🔧 Improvements
- Codex engine now runs with `--dangerously-bypass-approvals-and-sandbox` — prevents Jimmy-managed Codex sessions from being constrained by CLI sandbox/approval defaults

## [0.2.0] - 2026-03-10

### ✨ Features
- Connector abstraction layer — connectors declare capabilities (threading, reactions, edits, attachments) and health status
- `replyMessage()` vs `sendMessage()` split — proper thread-aware message routing
- CronConnector — cron jobs are now message sources routed through SessionManager (unified flow)
- Slack config options — `shareSessionInChannel`, `allowFrom` whitelist, `ignoreOldMessagesOnBoot`
- Transport state tracking — new `transportState` field + queue depth visibility
- In-chat slash commands — `/cron list|run|enable|disable`, `/model <name>`, `/doctor`
- Runtime cron control — trigger/enable/disable jobs without restart
- Web UI: Slack settings toggles for new config options
- Web UI: Transport visibility — connector name, queue depth, transport state badges

### 🔧 Improvements
- Unified message routing — all sources flow through `SessionManager.route()` with uniform `IncomingMessage`
- Cron runner simplified — ~35% code reduction by delegating to SessionManager
- Capability-aware decorations — reactions/edits conditional on connector capabilities
- Config token masking — Slack tokens masked in `GET /api/config`
- Session queue monitoring — `getPendingCount()` and `getTransportState()`

### 🏗️ Infrastructure
- Build pipeline — web UI bundled into gateway dist
- Test suite — threads, queue, and registry tests using Node.js native test runner
- DB migration — auto-adds connector/transport columns, backfills from legacy fields

### 💥 Breaking Changes
- `Connector` interface expanded with new required methods: `replyMessage()`, `getCapabilities()`, `getHealth()`, `reconstructTarget()`
- `IncomingMessage` and `Session` types have new required fields
- `GET /api/connectors` response shape changed from `string[]` to objects with capabilities
- `startScheduler()` now takes `SessionManager` instead of engine map
- `sendMessage()` no longer posts to threads — use `replyMessage()`

## [0.1.1] - 2026-03-09

### 🐛 Bug Fixes
- Remove `@jinn/web` workspace dependency from published package — was causing `unsupported URL type "workspace:"` error on `npm i -g jinn-cli` (web UI is embedded as static files during build, not a runtime dependency)

### 🔧 Improvements
- Claude engine now runs with `--dangerously-skip-permissions` — prevents sessions from hanging on tool approval prompts in headless mode

## [0.1.0] - 2026-03-09

First release of the Jinn AI gateway platform.

### ✨ Core Platform
- Gateway server with HTTP REST API + WebSocket real-time events
- Session manager with context builder (32K char budget, progressive trimming)
- SQLite session registry with WAL mode
- Per-session serial execution queue
- File watchers for hot-reload (config, cron, org, skills)
- Daemon lifecycle management (start/stop/status as background process)
- Multi-instance support with dynamic home directory resolution

### ✨ Engines
- Claude Code CLI engine wrapper (spawn, JSON streaming, session resume)
- Codex SDK engine wrapper (in-process, streaming)
- Model/effort level passthrough and configuration

### ✨ CLI
- `jinn setup` — bootstrap ~/.jinn/ from templates
- `jinn start` / `stop` / `status` — daemon management
- `jinn create` / `list` / `remove` — instance management
- `jinn nuke` — permanent instance deletion with safety prompts
- `jinn migrate` — AI-assisted template migrations
- `jinn skills` — skill discovery + skills.sh integration
- `--port` flag for custom port binding

### ✨ Connectors
- Slack connector (Socket Mode via @slack/bolt)
- Thread/DM/channel source-ref mapping
- Reaction workflow (👀 → ✅/❌)
- Message splitting for long responses
- Attachment download support

### ✨ Organization System
- Employee personas (YAML) with departments, ranks, engine assignment
- Org scanner with @mention routing
- Department boards for inter-agent task tracking
- Rich employee identity + generic connector context
- Dynamic COO naming via onboarding

### ✨ Skills System
- Markdown-based skill playbooks (SKILL.md with YAML frontmatter)
- 10 built-in skills: management, cron-manager, skill-creator, self-heal, onboarding, migrate, sync, status, new, find-and-install
- Skill symlink syncing to .claude/skills/ and .agents/skills/
- skills.sh marketplace integration
- Skills directory watcher with WebSocket change events

### ✨ Cron System
- node-cron scheduler with hot-reloadable jobs.json
- Run logging to JSONL files
- Delegation pattern (cron → COO → employee → review → deliver)
- Optional delivery to connectors

### ✨ Web UI
- Full Next.js 15 static dashboard
- Chat interface with voice recording, file attachments, rich markdown
- Session browser with detail view
- Org map (React Flow) with grid/feed views + employee detail panels
- Kanban board with drag-drop, tickets, employee assignment
- Cron visualizations — weekly schedule heatmap, pipeline grid
- Cost dashboard with charts, anomaly detection, WoW comparison
- Activity console with log browser + floating live stream widget
- Global search (Cmd+K)
- Settings page + onboarding wizard
- 5-theme CSS system with accent color support
- shadcn/ui components

### ✨ Session Context
- Rich context injection (identity, CLAUDE.md, config, org, skills, cron, connectors, API reference)
- Local environment awareness
- Lazy onboarding (stub session)

### 🏗️ Infrastructure
- pnpm + Turborepo monorepo
- TypeScript throughout
- Web UI bundled into CLI package
- CI workflow (GitHub Actions)
- README, CONTRIBUTING guide, LICENSE
