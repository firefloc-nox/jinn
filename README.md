# 🧞 Jinn

Lightweight AI gateway daemon orchestrating Claude Code, Codex, and Gemini CLI.

> **⚠️ Fork Notice:** This is an experimental fork of [Jinn](https://github.com/hristo2612/jinn) with deep Hermes integration. See [Fork Extensions](#-fork-extensions-jinnhermes) below.

<p align="center">
  <img src="assets/jinn-showcase.gif" alt="Jinn Web Dashboard" width="800" />
</p>

## What is Jinn?

Jinn is an open-source AI gateway that wraps the Claude Code CLI, Codex SDK,
and Gemini CLI behind a unified daemon process. It routes tasks to AI engines,
manages connectors like Slack, and schedules background work via cron. Jinn is
a bus, not a brain.

## 💡 Why Jinn?

Most AI agent frameworks reinvent the wheel — custom tool-calling loops, brittle context management, hand-rolled retry logic. Then they charge you per API call on top.

**Jinn takes a different approach.** It wraps battle-tested professional CLI tools (Claude Code, Codex, Gemini CLI) and adds only what they're missing: routing, scheduling, connectors, and an org system.

### 🔑 Works with your Anthropic Max subscription

Because Jinn uses **Claude Code CLI under the hood** — Anthropic's own first-party tool — it works with the [$200/mo Max subscription](https://www.anthropic.com/pricing). No per-token API billing. No surprise $500 invoices. Flat rate, unlimited usage.

Other frameworks can't do this. Anthropic [banned third-party tools from using Max subscription OAuth tokens](https://docs.anthropic.com/en/docs/claude-code/bedrock-vertex#max-plan) in January 2026. Since Jinn delegates to the official CLI, it's fully supported.

### 🧞 Jinn vs OpenClaw

| | Jinn | OpenClaw |
|---|---|---|
| **Architecture** | Wraps professional CLIs (Claude Code, Codex, Gemini) | Custom agentic loop |
| **Max subscription** | ✅ Works (uses official Claude Code CLI) | ❌ Banned since Jan 2026 |
| **Typical cost** | $200/mo flat (Max) or pay-per-use | $300–750/mo API bills ([reported by users](https://www.reddit.com/r/OpenClaw/)) |
| **Security** | Inherits Claude Code's security model | 512 vulnerabilities found by CrowdStrike |
| **Memory & context** | Handled natively by Claude Code | Custom implementation with [known context-drop bugs](https://github.com/openclaw/openclaw/issues/5429) |
| **Cron scheduling** | ✅ Built-in, hot-reloadable | ❌ [Fires in wrong agent context](https://github.com/openclaw/openclaw/issues/16053) |
| **Slack integration** | ✅ Thread-aware, reaction workflow | ❌ [Drops agent-to-agent messages](https://github.com/openclaw/openclaw/issues/15836) |
| **Multi-agent org** | Departments, ranks, managers, boards | Flat agent list |
| **Self-modification** | Agents can edit their own config at runtime | Limited |

### 🧠 The "bus, not brain" philosophy

Jinn adds **zero custom AI logic**. No prompt engineering layer. No opinions on how agents should think. All intelligence comes from the engines themselves — Claude Code already handles tool use, file editing, multi-step reasoning, and memory. Jinn just connects it to the outside world.

When Claude Code gets better, Jinn gets better — automatically.

## ✨ Features

- 🔌 **Triple engine support** — Claude Code CLI + Codex SDK + Gemini CLI
- 💬 **Connectors** — Slack (threads + reactions), WhatsApp (QR auth), Discord (bot)
- 📎 **File attachments** — drag & drop files into web chat, passed through to engines
- 📱 **Mobile-responsive** — collapsible sidebar and mobile-friendly dashboard
- ⏰ **Cron scheduling** — hot-reloadable background jobs
- 👥 **AI org system** — departments, ranks, managers, employees, task boards
- 🌐 **Web dashboard** — chat, org map, kanban, cost tracking, cron visualizer
- 🔄 **Hot-reload** — change config, cron, or org files without restarting
- 🛠️ **Self-modification** — agents can edit their own config, skills, and org at runtime
- 📦 **Skills system** — reusable markdown playbooks that engines follow natively
- 🏢 **Multi-instance** — run multiple isolated Jinn instances side by side
- 🔗 **MCP support** — connect to any MCP server

## 🚀 Quick Start

```bash
npm install -g jinn-cli
jinn setup
jinn start
```

Or install via Homebrew:

```bash
brew tap hristo2612/jinn https://github.com/hristo2612/jinn
brew install jinn
jinn setup
jinn start
```

Then open [http://localhost:7777](http://localhost:7777).

## 🏗️ Architecture

```
                              +----------------+
                              |   jinn CLI     |
                              +-------+--------+
                                      |
                              +-------v--------+
                              |    Gateway     |
                              |    Daemon      |
                              +--+--+--+--+---+
                                 |  |  |  |
             +-------------------+  |  |  +-------------------+
             |                      |  |                      |
    +--------v--------+    +-------v-------+    +------------v----+
    |  Session Mgr    |    |  Connectors   |    |     Web UI      |
    |  + Fallback     |    | Slack|WA|DC   |    | localhost:7777  |
    +--------+--------+    +---------------+    +-----------------+
             |
    +--------v-------------------------------------------+
    |                    ENGINES                         |
    |  +----------+  +----------+  +--------+  +------+  |
    |  | Hermes   |  | Claude   |  | Codex  |  |Gemini|  |
    |  | (native  |  | Code     |  | SDK    |  | CLI  |  |
    |  | memory,  |  +----------+  +--------+  +------+  |
    |  | skills,  |       ▲                              |
    |  | MCP)     |       │ hermesHooks?                 |
    |  +----------+       │                              |
    |       │      +------+-------+                      |
    |       │      | HermesContext|  (enrich prompts     |
    |       │      | Service      |   for non-hermes)    |
    |       │      +--------------+                      |
    +----------------------------------------------------+
             |                      |
    +--------v--------+    +-------v-------+
    |     Cron        |    |    Org        |
    |   Scheduler     |    |   System      |
    +-----------------+    +---------------+
             |
    +--------v-------------------------------------------+
    |              HERMES DATA CONNECTOR                 |
    |  /api/hermes/* → Sessions | Memory | Skills | Wiki |
    +----------------------------------------------------+
```

The CLI sends commands to the gateway daemon. The daemon dispatches work to AI
engines via the Session Manager, which handles routing and fallbacks.

**Hermes** is both an engine (with native memory, skills, MCP) and a context
enrichment service (injecting memory/skills into other engines via hermesHooks).

The **Hermes Data Connector** exposes read-only access to Hermes data for the
web dashboard (sessions, memory, skills, wiki).

## 🧠 Hermes-first engine

Starting with the Hermes-first refactor, **Hermes is the default brain** when available.

| Engine | Role |
|--------|------|
| **Hermes** | Primary brain — MCP-native, session-resumable, default when installed |
| Claude Code | Fallback #1 — streaming, cost tracking, Max subscription support |
| Codex | Fallback #2 — OpenAI GPT-based |
| Gemini CLI | Fallback #3 — Google Gemini |

### How it works

1. `jinn setup` detects if `hermes` is in your PATH (`hermes --version`)
2. If found, it sets `engines.default: hermes` in `~/.jinn/config.yaml`
3. The session manager routes all new sessions to Hermes by default
4. If Hermes is unavailable, the fallback chain is tried in order: `claude → codex → gemini`
5. Session metadata tracks `requestedBrain`, `actualExecutor`, and `fallbackUsed`

### Config example with Hermes

```yaml
# Primary brain + fallback policy (optional — defaults to hermes-first)
brain:
  primary: hermes
  fallbacks: [claude, codex, gemini]
  fallbackOnUnavailable: true

engines:
  default: hermes
  hermes:
    bin: hermes
    model: default
  claude:
    bin: claude
    model: opus
  codex:
    bin: codex
    model: gpt-5.4

sessions:
  # Ordered fallback chain used when the primary engine is unavailable
  fallbackEngines: [claude, codex, gemini]
```

### Per-employee Hermes profiles

Employees can be configured with Hermes-specific overrides in `org/*.yaml`:

```yaml
name: backend-agent
engine: hermes
hermesProfile: coder        # activate a named Hermes profile
hermesProvider: anthropic   # provider override (e.g. openrouter)
model: claude-opus-4        # model hint passed to Hermes
```

## ⚙️ Configuration

Jinn reads its configuration from `~/.jinn/config.yaml`. An example:

```yaml
gateway:
  port: 7777

engines:
  claude:
    enabled: true
  codex:
    enabled: false

connectors:
  slack:
    enabled: true
    app_token: xapp-...
    bot_token: xoxb-...

cron:
  jobs:
    - name: daily-review
      schedule: "0 9 * * *"
      task: "Review open PRs"

org:
  agents:
    - name: reviewer
      role: code-review
```

## 📁 Project Structure

```
jinn/
  packages/
    jimmy/          # Core gateway daemon + CLI
    web/            # Web dashboard (frontend)
  turbo.json        # Turborepo build configuration
  pnpm-workspace.yaml
  tsconfig.base.json
```

## 🧑‍💻 Development

```bash
git clone https://github.com/hristo2612/jinn.git
cd jinn
pnpm install
pnpm setup   # one-time: builds all packages and creates ~/.jinn
pnpm dev     # starts gateway + Next.js dev server with hot reload
```

Open [http://localhost:3000](http://localhost:3000) to use the web dashboard.

### Available Scripts

| Command            | Description                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `pnpm setup`       | Build all packages and initialize `~/.jinn` (one-time)              |
| `pnpm dev`         | Start gateway (`:7777`) + Next.js dev server (`:3000`) with hot reload |
| `pnpm start`       | Production-style clean build + start gateway on `:7777`             |
| `pnpm stop`        | Stop the running gateway daemon                                     |
| `pnpm status`      | Check if the gateway daemon is running                              |
| `pnpm build`       | Build all packages                                                  |
| `pnpm typecheck`   | Run TypeScript type checking                                        |
| `pnpm lint`        | Lint all packages                                                   |
| `pnpm clean`       | Clean build artifacts                                               |

---

# 🔮 Fork Extensions (Jinn×Hermes)

This section documents features specific to this experimental fork.

## Hermes Integration: Two Roles

### 1. Hermes as Runtime

Hermes is a standalone agentique CLI (multi-provider, memory, skills, MCP). Jinn spawns it like any other engine:

```yaml
# Employee config
runtime: hermes
hermesProvider: anthropic
hermesProfile: jinn
```

### 2. Hermes as Context Middleware

When `hermesHooks.enabled = true` on a NON-hermes runtime, Jinn enriches the prompt with Hermes data before spawning:

```yaml
# Employee config  
runtime: claude          # ← Claude Code executes
hermesHooks:
  enabled: true
  memory: true           # ← Inject Honcho memory
  skills: true           # ← Inject skills summary
```

Result: Claude Code receives enriched context (memory, skills) but **Claude Code executes**, not Hermes.

## Hermes Data Connector

The **HermesDataConnector** exposes Hermes data via `/api/hermes/*`:

| Feature | Description |
|---------|-------------|
| **H · Sessions** | Browse past sessions with full transcripts |
| **H · Memory** | View and edit `MEMORY.md` / `USER.md` directly |
| **H · Honcho** | Deep integration with [Honcho](https://github.com/plastic-labs/honcho) vectorial memory |
| **H · Skills** | Browse, search, and manage reusable skill library |
| **H · Wiki** | Multi-wiki browser with tree view, search, and in-browser editing |

This is a **read-only data connector** — it doesn't intercept Jinn sessions.

## Fork-Specific Setup

### Prerequisites

- Node.js 20+ and pnpm 9+
- [Hermes CLI](https://github.com/anthropics/hermes) installed and configured (`~/.hermes/`)
- (Optional) [Honcho](https://github.com/plastic-labs/honcho) for vectorial memory

### Installation

```bash
# Clone this fork
git clone https://github.com/firefloc-nox/jinn.git
cd jinn
git checkout lain

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Initialize Jinn config (creates ~/.jinn/)
pnpm setup

# Start in dev mode (gateway :7777 + Next.js :3000)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the web dashboard.

### Configuration

Edit `~/.jinn/config.yaml` to configure Hermes integration:

```yaml
engines:
  default: hermes
  hermes:
    bin: hermes
    # Optional: specify provider/profile
    provider: anthropic
    profile: jinn

# Optional: Honcho vectorial memory
honcho:
  enabled: true
  url: http://127.0.0.1:8000
  peerName: firefloc
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `7777` | Gateway HTTP/WebSocket port |
| `HERMES_HOME` | `~/.hermes` | Hermes installation directory |
| `HONCHO_URL` | — | Honcho server URL (enables integration) |
| `HONCHO_PEER_NAME` | `default` | Honcho peer/user identifier |

---

## 🗺️ Roadmap

### Core Jinn
- [x] Discord bot integration
- [x] WhatsApp connector
- [x] Telegram connector
- [x] Gemini CLI engine
- [x] Engine fallback chains
- [ ] iMessage connector (macOS)
- [ ] Local models (Ollama)
- [ ] Plugin system
- [ ] Docker image

### Fork Extensions
- [x] Hermes as runtime
- [x] Hermes context middleware
- [x] Hermes data connector (sessions, memory, skills)
- [x] Wiki browser (multi-wiki)
- [x] Honcho integration
- [ ] Onboarding wizard
- [ ] Wiki edit history
- [ ] Cross-wiki search

---

## 📄 License

[MIT](LICENSE)

## 🙏 Acknowledgments

- [Jinn](https://github.com/hristo2612/jinn) — Original project by Hristo Gueorguiev
- [ClawPort UI](https://github.com/JohnRiceML/clawport-ui) — Dashboard components by John Rice
- [Hermes](https://github.com/anthropics/hermes) — Claude Code CLI wrapper
- [Honcho](https://github.com/plastic-labs/honcho) — Vectorial memory server

---

> *"No matter where you go, everyone is connected."* — Serial Experiments Lain
