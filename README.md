# 🧞✨ Jinn×Hermes

> **Personal experimental fork** of [Jinn](https://github.com/jinn-ai/jinn) — an AI gateway with deep Hermes integration.

⚠️ **This is a test fork for personal use.** It may contain experimental features, hardcoded paths, and breaking changes. Use the [upstream Jinn](https://github.com/jinn-ai/jinn) for production.

---

## What's Different?

This fork integrates **Hermes** deeply into Jinn — both as a runtime and as a context-enrichment middleware.

### 🔮 Hermes in Jinn: Two Roles

**1. Hermes as Runtime** — Hermes is a standalone agentique CLI (multi-provider, memory, skills, MCP). Jinn can spawn it like any other engine:

```yaml
# Employee config
runtime: hermes
hermesProvider: anthropic
hermesProfile: jinn
```

**2. Hermes as Context Middleware** — When `hermesHooks.enabled = true` on a NON-hermes runtime, Jinn enriches the prompt with Hermes data before spawning:

```yaml
# Employee config  
runtime: claude          # ← Claude Code executes
hermesHooks:
  enabled: true
  memory: true           # ← Inject Honcho memory
  skills: true           # ← Inject skills summary
```

Result: Claude Code receives enriched context (memory, skills) but **Claude Code executes**, not Hermes.

### 🧠 Bus-Not-Brain Philosophy

Jinn is a **bus, not a brain**. It orchestrates runtimes without reinventing their logic.

```
SESSION MANAGER
     │
     ├── Resolve runtimeRef (employee config or routing)
     ├── Apply fallback if runtime unavailable
     ├── IF hermesHooks.enabled AND runtime != "hermes"
     │   └── Inject enriched context via HermesContextService
     └── Spawn executor (hermes, claude, codex, gemini)
```

### 📊 Hermes Data Connector

Separate from the runtime, the **HermesDataConnector** exposes Hermes data via `/api/hermes/*`:

| Feature | Description |
|---------|-------------|
| **H · Sessions** | Browse past sessions with full transcripts |
| **H · Memory** | View and edit `MEMORY.md` / `USER.md` directly |
| **H · Honcho** | Deep integration with [Honcho](https://github.com/plastic-labs/honcho) vectorial memory |
| **H · Skills** | Browse, search, and manage reusable skill library |
| **H · Wiki** | Multi-wiki browser with tree view, search, and in-browser editing |

This is a **read-only data connector** — it doesn't intercept Jinn sessions.

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- [Hermes](https://github.com/anthropics/hermes) installed (`~/.hermes/`)
- PostgreSQL (for Honcho, optional)

### Installation

```bash
# Clone the fork
git clone https://github.com/YOUR_USERNAME/jinn-hermes.git
cd jinn-hermes

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your settings
# - ANTHROPIC_API_KEY (or use Hermes auth)
# - JINN_PORT (default: 7777)
# - HONCHO_URL (optional)

# Build
pnpm build

# Start
pnpm start
```

### First Run Setup

1. Open `http://localhost:7777` in your browser
2. The **Onboarding Wizard** will guide you through:
   - Engine selection (Hermes, Claude, Codex, Gemini)
   - Connector setup (Slack, Discord, Telegram)
   - Hermes profile configuration
   - Honcho connection (optional)

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JINN_PORT` | `7777` | Gateway HTTP/WebSocket port |
| `JINN_DATA_DIR` | `~/.jinn` | Data directory for sessions, logs |
| `HERMES_HOME` | `~/.hermes` | Hermes installation directory |
| `HERMES_WEBAPI_URL` | `http://127.0.0.1:8642` | Hermes WebAPI endpoint |
| `HONCHO_URL` | `http://127.0.0.1:8000` | Honcho server URL (optional) |
| `HONCHO_PEER_NAME` | `default` | Honcho peer/user identifier |

### Hermes Profile

Create a profile in `~/.hermes/profiles/jinn/config.yaml`:

```yaml
model: claude-sonnet-4-20250514
provider: anthropic
personality: assistant
tools:
  mcp:
    servers:
      jinn:
        command: npx
        args: ["-y", "@jinn/mcp-server"]
```

### Wiki Paths

Wikis are auto-discovered from:
- `~/wiki` (default)
- `~/wiki-*` (pattern match)
- Custom paths in `~/.hermes/config.yaml`:

```yaml
skills:
  config:
    wiki:
      path: ~/my-knowledge-base
```

---

## Features

### Core Jinn Features

- 🔌 **Multi-engine support** — Claude Code, Codex, Gemini CLI
- 📡 **Connectors** — Slack, Discord, Telegram, WhatsApp
- ⏰ **Cron scheduling** — Background tasks with hot-reload
- 🏢 **Organization system** — Departments, roles, task boards
- 🔄 **Workflows** — Visual workflow editor with conditions and loops

### Hermes Extensions (this fork)

- 📜 **Session Browser** — Full transcript history with search
- 🧠 **Memory Editor** — Edit MEMORY.md and USER.md in-browser
- 🗃️ **Honcho Integration** — Vectorial memory, peer profiles, dialectic queries
- 📚 **Skills Browser** — Browse, search, filter by category
- 📖 **Wiki Browser** — Multi-wiki support, tree/list view, edit mode
- 🎯 **Activity Panel** — Live tool calls, thinking, events stream

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         JINN GATEWAY                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    SESSION MANAGER                         │ │
│  │  • Resolve runtimeRef from employee/routing config         │ │
│  │  • Apply fallback chain if runtime unavailable             │ │
│  │  • Enrich context via HermesContextService (if hooks on)   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐            │
│         ▼                    ▼                    ▼            │
│  ┌─────────────┐  ┌──────────────────┐  ┌─────────────┐       │
│  │   HERMES    │  │  HERMES CONTEXT  │  │  EXECUTORS  │       │
│  │  EXECUTOR   │  │     SERVICE      │  │             │       │
│  │             │  │   (middleware)   │  │ ┌─────────┐ │       │
│  │ spawn:      │  │                  │  │ │ claude  │ │       │
│  │ hermes chat │  │ IF runtime !=    │  │ ├─────────┤ │       │
│  │             │  │ hermes AND       │  │ │ codex   │ │       │
│  │ Native:     │  │ hooks.enabled:   │  │ ├─────────┤ │       │
│  │ • memory    │  │                  │  │ │ gemini  │ │       │
│  │ • skills    │  │ → Honcho memory  │  │ └─────────┘ │       │
│  │ • MCP       │  │ → Skills summary │  │             │       │
│  │ • Honcho    │  │ → MCP tools      │  │ Receive     │       │
│  └─────────────┘  │                  │  │ enriched    │       │
│                   │ Prepend to       │  │ context     │       │
│                   │ system prompt    │  │             │       │
│                   └──────────────────┘  └─────────────┘       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              HERMES DATA CONNECTOR (read-only)             │ │
│  │  /api/hermes/* → Sessions · Memory · Skills · Wiki         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │           ORG SYSTEM · CONNECTORS · CRON                   │ │
│  │  Departments · Task Boards · Slack · Discord · Telegram    │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
                         HTTP/WS API
                               │
┌─────────────────────────────────────────────────────────────────┐
│                      WEB DASHBOARD                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐             │
│  │  Chat   │ │   Org   │ │  Cron   │ │ Workflows │             │
│  └─────────┘ └─────────┘ └─────────┘ └───────────┘             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────┐             │
│  │H·Session│ │H·Memory │ │H·Honcho │ │  H·Wiki   │  ← Hermes   │
│  └─────────┘ └─────────┘ └─────────┘ └───────────┘    data     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Development

```bash
# Dev mode with hot reload
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### Project Structure

```
packages/
├── jimmy/          # Gateway daemon (Node.js)
│   ├── connectors/ # Slack, Discord, Telegram, Hermes, Honcho
│   ├── engines/    # Claude, Codex, Gemini, Hermes runtime
│   ├── gateway/    # HTTP API routes
│   └── workflows/  # Workflow engine
├── web/            # Dashboard (Next.js)
│   └── app/
│       ├── chat/
│       ├── hermes/ # H · Sessions, Memory, Honcho, Skills, Wiki
│       └── ...
└── mcp-server/     # MCP server for tool integration
```

---

## Roadmap

- [ ] Onboarding wizard for first-time setup
- [ ] Wiki edit history / git integration
- [ ] Honcho collection browser
- [ ] Skills creation wizard
- [ ] Cross-wiki search
- [ ] Mobile-friendly responsive UI

---

## Credits

- [Jinn](https://github.com/jinn-ai/jinn) — Original project by the Jinn team
- [Hermes](https://github.com/anthropics/hermes) — Claude Code CLI wrapper
- [Honcho](https://github.com/plastic-labs/honcho) — Vectorial memory server
- [Andrej Karpathy's LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — Wiki pattern inspiration

---

## License

MIT — Same as upstream Jinn.

---

> *"No matter where you go, everyone is connected."* — Serial Experiments Lain
