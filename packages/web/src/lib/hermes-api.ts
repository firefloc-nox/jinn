// hermes-api.ts — client wrapper for /api/hermes/* routes
// 503 → throws { hermesUnavailable: true } for graceful degradation

const BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : `http://127.0.0.1:${process.env.JINN_PORT ?? "7778"}`

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HermesSession {
  id: string
  source: string
  model: string | null
  startedAt: number
  endedAt: number | null
  messageCount: number
  inputTokens: number
  outputTokens: number
  title: string | null
}

export interface HermesMessage {
  id: string
  role: "user" | "assistant" | "tool" | "system"
  content: string
  timestamp: number
  reasoning?: string | null
}

export interface HermesMemorySection {
  entries: string[]
  usage: string
}

export interface HermesMemory {
  memory: HermesMemorySection
  user: HermesMemorySection
}

export interface HermesSkill {
  name: string
  description: string
  category: string
}

export interface HermesCronJob {
  id: string
  name: string
  schedule: string
  enabled: boolean
  prompt: string
  deliver: string
}

export interface HermesModel {
  id: string
  name: string
  provider: string
  contextLength?: number
}

export type HermesStatus = "connected" | "disconnected" | "loading"

export class HermesUnavailableError extends Error {
  readonly hermesUnavailable = true
  constructor() {
    super("Hermes WebAPI unavailable")
    this.name = "HermesUnavailableError"
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function hermesGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (res.status === 503) throw new HermesUnavailableError()
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

async function hermesPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (res.status === 503) throw new HermesUnavailableError()
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const hermesApi = {
  /** Returns { status: "ok" } or throws HermesUnavailableError */
  getHealth: () => hermesGet<{ status: string }>("/api/hermes/health"),

  getSessions: (opts?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams()
    if (opts?.limit != null) params.set("limit", String(opts.limit))
    if (opts?.offset != null) params.set("offset", String(opts.offset))
    const qs = params.toString()
    return hermesGet<{ items: HermesSession[]; total: number }>(
      `/api/hermes/sessions${qs ? `?${qs}` : ""}`
    )
  },

  getSession: (id: string) =>
    hermesGet<HermesSession & { systemPrompt?: string }>(`/api/hermes/sessions/${id}`),

  getMessages: (sessionId: string) =>
    hermesGet<HermesMessage[]>(`/api/hermes/sessions/${sessionId}/messages`),

  searchSessions: (q: string) =>
    hermesGet<{ items: HermesSession[]; total: number }>(
      `/api/hermes/sessions/search?q=${encodeURIComponent(q)}`
    ),

  getMemory: () => hermesGet<HermesMemory>("/api/hermes/memory"),

  updateMemory: (
    target: "memory" | "user",
    action: "add" | "replace" | "remove",
    content: string,
    oldText?: string
  ) =>
    hermesPatch<{ status: string }>("/api/hermes/memory", {
      target,
      action,
      content,
      ...(oldText != null ? { oldText } : {}),
    }),

  getSkills: () =>
    hermesGet<{ skills: HermesSkill[]; categories: Record<string, string[]>; count: number }>(
      "/api/hermes/skills"
    ),

  getCron: () => hermesGet<HermesCronJob[]>("/api/hermes/cron"),

  getModels: () => hermesGet<{ models: HermesModel[] }>("/api/hermes/models"),

  /** Hermes provider & profile management */
  getProviders: () => hermesGet<HermesProvidersResponse>("/api/hermes/providers"),

  /** Update a profile's model/provider config */
  updateProfileConfig: (name: string, config: Record<string, unknown>) =>
    hermesPatch<HermesProfileDetail>(`/api/hermes/profiles/${encodeURIComponent(name)}`, { config }),
}

// ---------------------------------------------------------------------------
// Provider types
// ---------------------------------------------------------------------------

export interface HermesProviderInfo {
  name: string
  type: "builtin" | "custom"
  base_url?: string
  has_key: boolean
}

export interface HermesProfileSummary {
  name: string
  model?: string
  provider?: string
  base_url?: string
  reasoning_effort?: string
  max_turns?: number
  usedBy?: string[]
}

export interface HermesProvidersResponse {
  global: {
    defaultModel?: string
    defaultProvider?: string
    defaultBaseUrl?: string
    providers: HermesProviderInfo[]
    customProviders: HermesProviderInfo[]
  }
  profiles: HermesProfileSummary[]
}

export interface HermesProfileDetail {
  name: string
  exists: boolean
  config: Record<string, unknown>
  soul: string | null
  agent: string | null
  role_soul: string | null
}
