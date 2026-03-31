import type { StatusResponse } from '@/lib/api'

interface EngineConfigShape {
  bin?: string
  model?: string
  [key: string]: unknown
}

interface BrainSettingsConfig {
  brain?: {
    primary?: string
    fallbacks?: string[]
    [key: string]: unknown
  }
  sessions?: {
    fallbackEngines?: string[]
    [key: string]: unknown
  }
  engines?: {
    default?: string
    claude?: EngineConfigShape
    codex?: EngineConfigShape
    gemini?: EngineConfigShape
    hermes?: EngineConfigShape
    [key: string]: unknown
  }
}

const PREFERRED_BRAIN_ORDER = ['hermes', 'claude', 'codex', 'gemini']

export function getAvailableBrains(status?: StatusResponse | null, config?: BrainSettingsConfig | null): string[] {
  const values = [
    status?.defaultBrain,
    ...(status?.registeredEngines ?? []),
    ...Object.keys(status?.engines?.registered ?? {}),
    ...Object.entries(config?.engines ?? {})
      .filter(([key, value]) => key !== 'default' && Boolean(value))
      .map(([key]) => key),
  ]

  const unique = Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))

  return unique.sort((left, right) => compareBrains(left, right))
}

export function getBrainConfigSnapshot(
  config: BrainSettingsConfig | null | undefined,
  status: StatusResponse | null | undefined,
  availableBrains: string[],
): { primary: string; fallbacks: string[] } {
  const primary =
    config?.brain?.primary ??
    status?.defaultBrain ??
    status?.brain?.primary ??
    config?.engines?.default ??
    availableBrains[0] ??
    'hermes'

  const configuredFallbacks =
    config?.brain?.fallbacks ??
    status?.fallbackPolicy?.fallbacks ??
    status?.brain?.fallbacks ??
    config?.sessions?.fallbackEngines ??
    availableBrains.filter((brain) => brain !== primary)

  const fallbacks = Array.from(
    new Set(configuredFallbacks.filter((brain): brain is string => typeof brain === 'string' && brain !== primary && availableBrains.includes(brain))),
  )

  return { primary, fallbacks }
}

export function moveFallbackBrain(fallbacks: string[], brain: string, direction: 'up' | 'down'): string[] {
  const next = [...fallbacks]
  const index = next.indexOf(brain)
  if (index === -1) return next

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= next.length) return next

  ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
  return next
}

function compareBrains(left: string, right: string): number {
  const leftIndex = PREFERRED_BRAIN_ORDER.indexOf(left)
  const rightIndex = PREFERRED_BRAIN_ORDER.indexOf(right)

  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
  if (leftIndex >= 0) return -1
  if (rightIndex >= 0) return 1
  return left.localeCompare(right)
}
