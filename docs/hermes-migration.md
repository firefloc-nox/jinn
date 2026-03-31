# Hermes Migration Guide

## Overview

Jinn is now Hermes-first. Starting with the `feat/hermes-first-frontend-refactor` branch,
Hermes is the default brain for all sessions when installed. Legacy engines (Claude Code,
Codex, Gemini CLI) remain fully supported as fallback adapters — nothing is removed.

This guide explains what changed and how to migrate.

---

## What changed

### Engine architecture

Before the refactor, Jinn routed tasks to one of three engines: Claude Code, Codex, or
Gemini CLI, selected by `engines.default`. There was no primary/fallback concept — the
configured default was simply used, and if it was unavailable, the session failed.

After the refactor:

- `hermes` is the new default primary brain when installed
- A `FallbackPolicy` controls the primary + ordered fallback chain
- `resolveFallbackExecutor()` (in `sessions/fallback.ts`) determines the actual executor at session start
- Session metadata records both what was requested and what actually ran

Engine roles:

| Engine | Role |
|--------|------|
| **Hermes** | Primary brain — MCP-native, session-resumable, default when installed |
| Claude Code | Fallback #1 — streaming, cost tracking, Max subscription support |
| Codex | Fallback #2 — OpenAI GPT-based |
| Gemini CLI | Fallback #3 — Google Gemini |

### Configuration keys

**Before (legacy):**

```yaml
engines:
  default: claude   # or codex, or gemini
  claude:
    bin: claude
    model: opus
```

**After (Hermes-first):**

```yaml
# Optional — these are the defaults when omitted
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

sessions:
  fallbackEngines: [claude, codex, gemini]
```

Key fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `brain.primary` | string | `"hermes"` | Primary brain engine |
| `brain.fallbacks` | string[] | `["claude","codex","gemini"]` | Ordered fallback chain |
| `brain.fallbackOnUnavailable` | boolean | `true` | Fall back when primary not registered |
| `engines.hermes.bin` | string | `"hermes"` | Path/name of the Hermes CLI binary |
| `engines.hermes.model` | string | `"default"` | Model hint passed to Hermes |
| `sessions.fallbackEngines` | string[] | `["claude","codex","gemini"]` | Alias for `brain.fallbacks` at session level |

Legacy engine configs (`engines.claude`, `engines.codex`, `engines.gemini`) are
unchanged and still work as-is for fallback use.

### Hermes engine invocation

Hermes is invoked as a CLI subprocess:

```
hermes chat -q "<prompt>" --quiet --source tool --yolo [--model <m>] [--provider <p>] [--resume <id>]
```

Parsed from stdout:

- `session_id: <id>` → `EngineResult.sessionId` (enables session resume)
- `provider: <p>` → `HermesRuntimeMeta.providerUsed`
- `model: <m>` → `HermesRuntimeMeta.modelUsed`
- `honcho: active` → `HermesRuntimeMeta.honchoActive = true`

V1 limitations (documented in `engines/hermes.ts`):

- No NDJSON streaming — `onStream` is called once with the complete result
- No `--append-system-prompt` flag — system prompts are injected as `[SYSTEM]...[/SYSTEM]` prefix
- Cost not exposed via `--quiet` — `EngineResult.cost` is undefined

### Session metadata

Results now include two metadata objects:

**`hermesMeta`** (present when Hermes ran):

```ts
interface HermesRuntimeMeta {
  hermesSessionId?: string;  // native Hermes session ID
  activeProfile?: string;    // active Hermes profile
  providerUsed?: string;     // e.g. "anthropic", "openrouter"
  modelUsed?: string;        // e.g. "claude-sonnet-4-5"
  honchoActive?: boolean;    // whether Honcho memory was active
}
```

**`routingMeta`** (always present, written into `session.transportMeta`):

```ts
interface BrainRoutingMeta {
  requestedBrain: string;    // engine that was requested
  actualExecutor: string;    // engine that actually ran
  fallbackUsed: boolean;     // whether the primary was unavailable
  fallbackReason?: string;   // human-readable reason for fallback
}
```

Both are surfaced as badges in the web dashboard session views (Phase 4).

### MCP routing

Hermes manages its own MCP servers natively. When Hermes is the executor:

- `mcpConfigPath` is ignored — Hermes reads its own MCP config
- MCP tool calls are handled inside the Hermes process

When a legacy engine (Claude Code) is the executor (fallback path):

- `mcpConfigPath` is passed as `--mcp-config` to Claude Code as before
- Legacy MCP behavior is fully preserved

### Honcho memory

Honcho memory integration is handled inside Hermes. When active, it is surfaced
via `hermesRuntimeMeta.honchoActive = true` and shown as a badge in the session view.
No Jinn-side config is needed — Honcho is controlled by the Hermes profile.

---

## How to migrate

### Upgrade from pre-Hermes Jinn

1. Install Hermes CLI — follow the [Hermes installation guide](https://github.com/hristo2612/hermes)
   or ensure `hermes` is in your `PATH` (`hermes --version` should work)
2. Run `jinn setup` — the wizard auto-detects `hermes` and sets `engines.default: hermes`
3. Your existing `engines.claude`, `engines.codex`, `engines.gemini` config is untouched
   and will be used as fallbacks automatically
4. Start Jinn: `jinn start` — Hermes is now the primary brain

No breaking changes to existing config. Legacy engine sections are read as-is.

### Keep Claude as primary (legacy mode)

Set in `~/.jinn/config.yaml`:

```yaml
brain:
  primary: claude
  fallbacks: []
  fallbackOnUnavailable: false

engines:
  default: claude
```

This bypasses Hermes entirely and routes all sessions to Claude Code directly.

### Keep the old behavior without any brain config

If you have no `brain:` key and no `engines.hermes:` section, `loadConfig()` in
`shared/config.ts` will set `engines.default = "claude"` as before:

```ts
if (!config.engines.default) {
  config.engines.default = config.engines.hermes ? "hermes" : "claude";
}
```

So existing configs without a `hermes` engine block continue to use Claude unchanged.

### Configure per-employee Hermes profiles

In `org/<employee>.yaml`:

```yaml
name: backend-agent
engine: hermes
hermesProfile: coder        # named Hermes profile to activate
hermesProvider: anthropic   # provider override
model: claude-opus-4        # model hint
```

The `profile-mapper` in `sessions/profile-mapper.ts` translates these fields to
`EngineRunOpts` before `engine.run()` is called.

---

## Compatibility

| Feature | Status | Notes |
|---------|--------|-------|
| Claude Code engine | ✅ Retained | Fallback #1 |
| Codex engine | ✅ Retained | Fallback #2 |
| Gemini CLI engine | ✅ Retained | Fallback #3 |
| Dashboard / org / kanban | ✅ Unchanged | No changes to web UI structure |
| Cron jobs | ✅ Unchanged | `engine` field in cron config still works |
| Connectors (Slack, Discord, etc.) | ✅ Unchanged | No connector changes |
| MCP (Claude-native) | ✅ Still works | Used when Claude Code is the executor |
| MCP (Hermes-native) | ✅ New default | Hermes manages its own MCP stack |
| Honcho memory | ✅ Surfaced | Visible via `hermesRuntimeMeta.honchoActive` |
| Session resume | ✅ Improved | `hermesSessionId` enables native Hermes session resume |
| Streaming | ⚠️ V1 limitation | Hermes executor sends one delta (no live stream) |
| Cost tracking | ⚠️ V1 limitation | Cost not exposed by `hermes --quiet` |

---

## Implementation reference

| File | Role |
|------|------|
| `packages/jimmy/src/sessions/fallback.ts` | `FallbackPolicy`, `resolveFallbackExecutor()` |
| `packages/jimmy/src/sessions/manager.ts` | Session creation + routing |
| `packages/jimmy/src/sessions/profile-mapper.ts` | Employee → `EngineRunOpts` mapping |
| `packages/jimmy/src/engines/hermes.ts` | `HermesEngine` — CLI spawn + metadata parsing |
| `packages/jimmy/src/shared/types.ts` | `HermesRuntimeMeta`, `BrainRoutingMeta`, `FallbackPolicy` |
| `packages/jimmy/src/shared/config.ts` | `loadConfig()` — hermes-first default injection |
| `packages/web/src/` | Session view badges, settings UX (Phase 4) |
| `packages/jimmy/src/sessions/__tests__/` | 87 backend tests (fallback, capabilities, routing) |
