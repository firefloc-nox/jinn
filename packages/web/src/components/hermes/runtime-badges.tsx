import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatBrainLabel, getProviderModelLabel, type NormalizedHermesRuntimeMeta } from '@/lib/runtime-meta'

const brainStyles: Record<string, string> = {
  hermes: 'border-transparent bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]',
  claude: 'border-transparent bg-[color-mix(in_srgb,var(--system-orange)_18%,transparent)] text-[var(--system-orange)]',
  codex: 'border-transparent bg-[color-mix(in_srgb,var(--system-green)_18%,transparent)] text-[var(--system-green)]',
  gemini: 'border-transparent bg-[color-mix(in_srgb,var(--system-blue)_18%,transparent)] text-[var(--system-blue)]',
}

interface RuntimeBadgesProps {
  requestedBrain?: string | null
  actualExecutor?: string | null
  hermesRuntimeMeta?: NormalizedHermesRuntimeMeta | null
  compact?: boolean
  className?: string
}

export function RuntimeBadges({
  requestedBrain,
  actualExecutor,
  hermesRuntimeMeta,
  compact = false,
  className,
}: RuntimeBadgesProps) {
  const activeBrain = actualExecutor ?? requestedBrain
  const providerModelLabel = getProviderModelLabel(hermesRuntimeMeta)
  const fallbackBrain = requestedBrain && actualExecutor && requestedBrain !== actualExecutor ? actualExecutor : null

  if (!activeBrain && !hermesRuntimeMeta) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-2', compact ? 'gap-1.5' : 'gap-2', className)}>
      {activeBrain ? (
        <Badge
          variant="outline"
          className={cn('border px-2.5 py-1 text-[11px] font-semibold', brainStyles[activeBrain.toLowerCase()] ?? 'border-[var(--separator)] text-[var(--text-secondary)]')}
        >
          {formatBrainLabel(activeBrain)}
        </Badge>
      ) : null}

      {fallbackBrain ? (
        <Badge variant="outline" className="border-[var(--separator)] bg-[var(--fill-secondary)] text-[var(--text-secondary)]">
          {`Fallback ${formatBrainLabel(fallbackBrain)}`}
        </Badge>
      ) : null}

      {hermesRuntimeMeta?.profile ? (
        <Badge variant="outline" className="border-[var(--separator)] text-[var(--text-secondary)]">
          {`Profile ${hermesRuntimeMeta.profile}`}
        </Badge>
      ) : null}

      {providerModelLabel ? (
        <Badge variant="outline" className="border-[var(--separator)] text-[var(--text-secondary)]">
          {providerModelLabel}
        </Badge>
      ) : null}

      {hermesRuntimeMeta?.mcp ? (
        <Badge variant="outline" className="border-[var(--separator)] text-[var(--text-secondary)]">
          MCP
        </Badge>
      ) : null}

      {hermesRuntimeMeta?.honcho ? (
        <Badge variant="outline" className="border-[var(--separator)] text-[var(--text-secondary)]">
          Honcho
        </Badge>
      ) : null}
    </div>
  )
}
