# Jinn Roadmap

> This roadmap covers features that are **Jinn-specific** — things that go beyond what the upstream gateway already provides. Items marked `[experimental]` are implemented but not yet stable.

---

## 🚧 In Progress

### Workflow Engine _(experimental)_
The visual no-code workflow builder is functional but still evolving. Currently supported:
- Visual editor (React Flow) with drag-and-drop
- 12 node types: TRIGGER, AGENT, CONDITION, NOTIFY, MOVE_CARD, WAIT, HTTP, SET_VAR, TRANSFORM, LOG, DONE, WAIT_FOR_HUMAN
- 4 trigger types: manual, cron, webhook (HMAC), kanban events (card_added, card_moved)
- AI Workflow Assistant (chat-bubble that generates and explains workflows)
- FR/EN i18n
- Templates gallery (simple-agent, review-pipeline, cron-brief, discord-notify)

**Remaining work:**
- [ ] Workflow run history pagination
- [ ] Step-level retry and error handling
- [ ] Parallel branch execution (currently sequential only)
- [ ] Webhook inbound UI (manage registered webhooks from dashboard)
- [ ] Workflow versioning / rollback

---

## 📋 Planned — Jinn-Only Features

### 🎨 Kanban & Goals
- [x] Multi-board Kanban system (per-department + custom boards)
- [x] Card CRUD, drag-and-drop column moves
- [x] Kanban trigger for workflow engine
- [ ] Card assignment to employees (auto-dispatch on drop)
- [ ] Due dates and priority levels on cards
- [ ] Goals CRUD with progress tracking (backend ready, UI pending)

### 🏢 Org System
- [x] Hierarchical org (departments, ranks, managers)
- [x] New Agent wizard (3-step creation with Hermes profile)
- [x] Employee detail with Hermes profile inline edit
- [x] Cross-department service routing (request services from other departments)
- [x] COO persona from portal config
- [ ] Employee performance tracking (quality scores over time)
- [ ] Auto-promotion based on task track record
- [ ] Visual org chart (drag-and-drop reporting structure)

### 💰 Cost Analytics
- [x] `/costs` page — total spend, by-employee, by-department
- [x] Hermes session cost integration (reads `state.db`)
- [ ] Budget alerts (threshold notifications via connector)
- [ ] Cost forecasting (rolling 30-day projection)
- [ ] Per-employee budget caps with hard stops

### 🔌 Connectors
- [x] Discord bot connector
- [x] Slack (threads + reactions)
- [x] WhatsApp (Baileys, QR auth)
- [x] Telegram (polling + allowlist)
- [ ] iMessage (macOS AppleScript bridge)
- [ ] Email (IMAP/SMTP)
- [ ] Webhooks (generic inbound/outbound)

### 🧠 Hermes Integration _(Jinn-specific deepening)_
- [x] Hermes WebAPI transport (SSE, no CLI spawn for active sessions)
- [x] Hermes sessions/memory/skills views in dashboard
- [x] Per-employee Hermes profile wiring (`--profile`, `--toolsets`, `--skills`)
- [x] `hermesRuntimeMeta` badges (model, provider, honcho, profile)
- [x] Unified cron store (Hermes + Jinn-native jobs)
- [ ] Hermes hook integration (trigger workflows on tool_call, message events)
- [ ] Honcho memory UI (view/edit cross-session memory from dashboard)

### 🛠️ Platform
- [ ] REST API auth (API keys for remote access)
- [ ] Multi-user support (team access with roles)
- [ ] Docker image (one-command deployment)
- [ ] Plugin system (installable integrations: Stripe, Linear, GitHub)
- [ ] Skills marketplace UI (browse/install from dashboard)

---

## ✅ Shipped (this branch)

| Feature | Commit |
|---------|--------|
| Hermes-first engine routing + fallback chain | `feat: Jinn → Hermes-first refactor` |
| HermesEngine CLI spawn + WebAPI SSE transport | `feat(engine): HermesEngine WebAPI-first` |
| Hermes sessions/memory/skills pages | `feat(hermes): task1-4` |
| HermesDataConnector (health loop, cron watcher) | `feat(hermes): TASK 2-4` |
| Unified cron store (Hermes + Jinn-native) | `feat(cron): unified cron store` |
| Multi-board Kanban refactor | `feat(kanban): modular multi-board` |
| Costs page + Hermes cost integration | `feat(costs): add /costs page` |
| Workflow engine Phase 1 (engine, nodes, editor) | `feat(workflows): Ph1 backend + frontend` |
| Workflow triggers (cron, kanban, webhook) | `feat(workflows): cron/kanban/webhook triggers` |
| Workflow node types: HTTP, SET_VAR, TRANSFORM, LOG | `feat(workflows): add HTTP/SET_VAR/...` |
| No-code forms (visual condition builder, smart dropdowns) | `feat(workflows/editor): no-code forms` |
| Workflow Assistant AI chat bubble | `feat(workflows/editor): Workflow Assistant` |
| MCP resolver fix (search apiKey + gateway path) | `fix(mcp/resolver)` |
| Queue real-time updates (queue:updated WS events) | `fix(queue): emit queue:updated` |
| UI recovery after gateway restart (WS reconnect refetch) | `fix(ui): fix session stuck in queued/running` |

---

*Last updated: 2026-04-03*
