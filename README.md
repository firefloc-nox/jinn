# 🧞✨ Jinn×Hermes

> **Personal experimental fork** of [Jinn](https://github.com/jinn-ai/jinn) — an AI gateway with deep Hermes integration.

⚠️ **This is a test fork for personal use.** It may contain experimental features, hardcoded paths, and breaking changes. Use the [upstream Jinn](https://github.com/jinn-ai/jinn) for production.

---

## What's Different?

This fork extends Jinn with **Hermes-first** features, treating Claude Code (via Hermes) as the primary runtime rather than just one of many engines.

### 🔮 Hermes Integration

| Feature | Description |
|---------|-------------|
| **H · Sessions** | Browse past Hermes sessions with full transcripts |
| **H · Memory** | View and edit `MEMORY.md` / `USER.md` directly |
| **H · Honcho** | Deep integration with [Honcho](https://github.com/plastic-labs/honcho) vectorial memory |
| **H · Skills** | Browse, search, and manage Hermes skills library |
| **H · Wiki** | Multi-wiki browser with tree view, search, and in-browser editing |

### 🧠 Bus-Not-Brain Philosophy

Jinn is a **bus, not a brain**. It doesn't reinvent AI logic — it connects battle-tested CLIs (Claude Code, Codex, Gemini) to the outside world. When you select Hermes as your engine, you get:

- Full Claude Code capabilities (tools, file editing, multi-step reasoning)
- Hermes memory injection (skills, user profile, session context)
- Native MCP server support
- Honcho long-term memory

If you don't want Hermes, select `claude` or `codex` directly — you'll get vanilla engine behavior.

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
┌─────────────────────────────────────────────────────────┐
│                    JINN GATEWAY                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Hermes    │  │   Claude    │  │   Codex     │     │
│  │  (primary)  │  │   (direct)  │  │   (direct)  │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│  ┌──────┴────────────────┴────────────────┴──────┐     │
│  │              Session Manager                   │     │
│  │    (routing, queue, cron, org system)         │     │
│  └──────┬────────────────┬────────────────┬──────┘     │
│         │                │                │             │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐     │
│  │    Slack    │  │   Discord   │  │  Telegram   │     │
│  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────┘
         │
         │ HTTP/WS
         ▼
┌─────────────────────────────────────────────────────────┐
│                    WEB DASHBOARD                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  Chat   │ │   Org   │ │  Cron   │ │ Workflows│       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │Sessions │ │ Memory  │ │ Honcho  │ │  Wiki   │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
└─────────────────────────────────────────────────────────┘
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
