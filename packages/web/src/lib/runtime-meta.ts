import type { BrainRoutingMeta, HermesRuntimeMeta, SessionRecord, SessionTransportMeta } from '@/lib/api'

export interface NormalizedHermesRuntimeMeta {
  hermesSessionId?: string
  profile?: string
  provider?: string
  model?: string
  honcho?: boolean
  mcp?: boolean
  fallbackExecutor?: string
  fallbackReason?: string
}

export interface NormalizedBrainRoutingMeta {
  requestedBrain: string
  actualExecutor: string
  fallbackUsed: boolean
  fallbackReason?: string
}

export function normalizeHermesRuntimeMeta(meta?: HermesRuntimeMeta | null): NormalizedHermesRuntimeMeta | null {
  if (!meta) return null

  const normalized: NormalizedHermesRuntimeMeta = {
    hermesSessionId: stringOrUndefined(meta.hermesSessionId),
    profile: stringOrUndefined(meta.profile ?? meta.activeProfile),
    provider: stringOrUndefined(meta.provider ?? meta.providerUsed),
    model: stringOrUndefined(meta.model ?? meta.modelUsed),
    honcho: booleanOrUndefined(meta.honcho ?? meta.honchoActive),
    mcp: booleanOrUndefined(meta.mcp),
    fallbackExecutor: stringOrUndefined(meta.fallbackExecutor),
    fallbackReason: stringOrUndefined(meta.fallbackReason),
  }

  return hasDefinedValue(normalized) ? normalized : null
}

export function normalizeBrainRoutingMeta(meta?: BrainRoutingMeta | null): NormalizedBrainRoutingMeta | null {
  if (!meta?.requestedBrain || !meta?.actualExecutor) return null

  return {
    requestedBrain: meta.requestedBrain,
    actualExecutor: meta.actualExecutor,
    fallbackUsed: Boolean(meta.fallbackUsed ?? (meta.requestedBrain !== meta.actualExecutor)),
    fallbackReason: stringOrUndefined(meta.fallbackReason),
  }
}

export function getSessionRuntimeMeta(session?: Pick<SessionRecord, 'transportMeta'> | null): {
  hermesRuntimeMeta: NormalizedHermesRuntimeMeta | null
  routingMeta: NormalizedBrainRoutingMeta | null
} {
  const transport = session?.transportMeta as SessionTransportMeta | null | undefined
  const hermesRuntimeMeta = normalizeHermesRuntimeMeta(
    transport?.hermesRuntimeMeta ?? transport?.hermesMeta ?? transport?.routingMeta?.hermesRuntimeMeta,
  )
  const routingMeta = normalizeBrainRoutingMeta(transport?.routingMeta)

  return { hermesRuntimeMeta, routingMeta }
}

export function getProviderModelLabel(meta?: Pick<NormalizedHermesRuntimeMeta, 'provider' | 'model'> | null): string | null {
  if (meta?.provider && meta?.model) return `${meta.provider} / ${meta.model}`
  return meta?.provider ?? meta?.model ?? null
}

export function getFallbackBannerText(
  hermesRuntimeMeta?: Pick<NormalizedHermesRuntimeMeta, 'fallbackExecutor' | 'fallbackReason'> | null,
  routingMeta?: Pick<NormalizedBrainRoutingMeta, 'actualExecutor' | 'fallbackUsed' | 'fallbackReason'> | null,
): string | null {
  const executor = hermesRuntimeMeta?.fallbackExecutor ?? (routingMeta?.fallbackUsed ? routingMeta.actualExecutor : undefined)
  const reason = hermesRuntimeMeta?.fallbackReason ?? routingMeta?.fallbackReason

  if (!executor) return null
  return reason ? `Fallback: ${executor} — ${reason}` : `Fallback: ${executor}`
}

export function formatBrainLabel(brain?: string | null): string {
  if (!brain) return 'Unknown'
  if (brain.toLowerCase() === 'codex') return 'Codex'
  if (brain.toLowerCase() === 'claude') return 'Claude'
  if (brain.toLowerCase() === 'gemini') return 'Gemini'
  if (brain.toLowerCase() === 'hermes') return 'Hermes'
  return brain.charAt(0).toUpperCase() + brain.slice(1)
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function hasDefinedValue(value: object): boolean {
  return Object.values(value).some((entry) => entry !== undefined)
}
