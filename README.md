# 🧞✨ Jinn×Hermes

> **Personal experimental fork** of [Jinn](https://github.com/jinn-ai/jinn) — an AI gateway with deep Hermes integration.

⚠️ **This is a test fork for personal use.** It may contain experimental features, hardcoded paths, and breaking changes. Use the [upstream Jinn](https://github.com/jinn-ai/jinn) for production.

---

## What's Different?

This fork extends Jinn with a **Hermes feature layer** — additional capabilities that enhance any engine, not a replacement for them.

### 🔮 Hermes Feature Layer

Hermes is **not a Claude Code wrapper**. It's an **extension layer for Jinn** that adds:

| Feature | Description |
|---------|-------------|
| **H · Sessions** | Browse past sessions with full transcripts |
| **H · Memory** | View and edit `MEMORY.md` / `USER.md` directly |
| **H · Honcho** | Deep integration with [Honcho](https://github.com/plastic-labs/honcho) vectorial memory |
| **H · Skills** | Browse, search, and manage reusable skill library |
| **H · Wiki** | Multi-wiki browser with tree view, search, and in-browser editing |

### 🧠 Bus-Not-Brain Philosophy

Jinn is a **bus, not a brain**. It orchestrates engines — Claude Code, Codex, Gemini, Ollama — without reinventing their logic.

```
JINN (bus)
├── Engines: Claude Code, Codex, Gemini, Ollama (directly invocable)
├── Hermes Layer: memory, skills, Honcho, wiki (extends Jinn features)
├── Org System: departments, agents, task boards
└── Connectors: Slack, Discord, Telegram, Cron
```

**Claude Code is invocable directly by Jinn** through the org system. Hermes features are available regardless of which engine you use — they extend Jinn itself, not any specific engine.

If you don't want Hermes features, don't use them. The core Jinn functionality works independently.

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
│  │                    ENGINE LAYER                            │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │  Claude  │ │  Codex   │ │  Gemini  │ │  Ollama  │     │ │
│  │  │   Code   │ │   SDK    │ │   CLI    │ │  local   │     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              HERMES FEATURE LAYER (optional)               │ │
│  │  Memory · Skills · Honcho · Wiki · Session History         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │           SESSION MANAGER + ORG SYSTEM                     │ │
│  │  Routing · Queue · Cron · Departments · Task Boards        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                    CONNECTORS                              │ │
│  │  Slack · Discord · Telegram · WhatsApp · Webhooks          │ │
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
│  │Sessions │ │ Memory  │ │ Honcho  │ │   Wiki    │  ← Hermes   │
│  └─────────┘ └─────────┘ └─────────┘ └───────────┘    features │
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
