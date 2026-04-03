"use client"

import { memo, useState, useRef, useCallback } from 'react'
import { Brain, Wrench, CheckCircle2, Type, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityEvent } from './types'

/* ── Pill colors by event type ── */
const PILL_STYLES: Record<string, { bg: string; text: string; icon: typeof Brain }> = {
  thinking: { bg: 'bg-purple-500/15', text: 'text-purple-400', icon: Brain },
  tool_use: { bg: 'bg-blue-500/15', text: 'text-blue-400', icon: Wrench },
  tool_result: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: CheckCircle2 },
  text: { bg: 'bg-zinc-500/10', text: 'text-[var(--text-secondary)]', icon: Type },
}

/* ── Single pill (memoized to avoid re-renders) ── */
const EventPill = memo(function EventPill({ event }: { event: ActivityEvent }) {
  const [expanded, setExpanded] = useState(false)
  const style = PILL_STYLES[event.type] ?? PILL_STYLES.text
  const Icon = event.isError ? AlertTriangle : style.icon

  const label = event.type === 'tool_use'
    ? event.toolName ?? 'tool'
    : event.type === 'tool_result'
      ? `${event.toolName ?? 'result'}${event.isError ? ' (error)' : ''}`
      : event.type === 'thinking'
        ? 'thinking'
        : 'text'

  const hasDetail = !!(event.content || event.args || event.resultContent)
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="group">
      <button
        onClick={() => hasDetail && setExpanded(v => !v)}
        disabled={!hasDetail}
        className={cn(
          'flex items-center gap-1.5 max-w-full rounded-full px-2.5 py-1 text-[11px] font-medium',
          style.bg,
          style.text,
          hasDetail ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
          event.isError && 'bg-red-500/15 text-red-400',
        )}
      >
        <Icon className="size-3 shrink-0" />
        <span className="truncate max-w-[200px]">{label}</span>
        <span className="ml-auto text-[10px] opacity-50 tabular-nums shrink-0">{time}</span>
      </button>

      {/* Detail — only mounted when expanded */}
      {expanded && (
        <div className="mt-1.5 mb-1 rounded-[var(--radius-md)] bg-[var(--fill-tertiary)] p-3 text-[12px] leading-relaxed">
          {event.args && (
            <div className="mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Args</span>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--text-secondary)]">
                {formatJSON(event.args)}
              </pre>
            </div>
          )}
          {event.content && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                {event.type === 'thinking' ? 'Thinking' : 'Content'}
              </span>
              <pre className={cn(
                'mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px]',
                event.isError ? 'text-red-400' : 'text-[var(--text-secondary)]'
              )}>
                {truncate(event.content, 2000)}
              </pre>
            </div>
          )}
          {event.resultContent && (
            <div className={event.content ? 'mt-2' : ''}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Result</span>
              <pre className={cn(
                'mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px]',
                event.isError ? 'text-red-400' : 'text-[var(--text-secondary)]'
              )}>
                {truncate(event.resultContent, 2000)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

/* ── Visible window size for virtualization ── */
const INITIAL_VISIBLE = 50
const LOAD_MORE_STEP = 30

/* ── Timeline list (most recent first) ── */
interface EventTimelineProps {
  events: ActivityEvent[]
  className?: string
}

export function EventTimeline({ events, className }: EventTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)

  // Events in reverse chronological order (most recent first)
  const reversed = events.slice().reverse()
  const visible = reversed.slice(0, visibleCount)
  const hasMore = visibleCount < reversed.length

  const handleScroll = useCallback(() => {
    const container = containerRef.current
    if (!container || !hasMore) return
    // Load more when scrolled near the bottom
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200
    if (nearBottom) {
      setVisibleCount(prev => Math.min(prev + LOAD_MORE_STEP, reversed.length))
    }
  }, [hasMore, reversed.length])

  // Reset visible count when events list grows (new session or refresh)
  const prevLenRef = useRef(events.length)
  if (events.length < prevLenRef.current) {
    // Events were reset (new session) — reset visible window
    if (visibleCount !== INITIAL_VISIBLE) setVisibleCount(INITIAL_VISIBLE)
  }
  prevLenRef.current = events.length

  if (events.length === 0) {
    return (
      <div className={cn('flex flex-1 items-center justify-center text-[13px] text-[var(--text-tertiary)]', className)}>
        En attente d&apos;events…
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn('flex-1 overflow-y-auto px-3 py-2 space-y-1', className)}
    >
      {visible.map(evt => (
        <EventPill key={evt.id} event={evt} />
      ))}
      {hasMore && (
        <button
          onClick={() => setVisibleCount(prev => Math.min(prev + LOAD_MORE_STEP, reversed.length))}
          className="w-full py-2 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
        >
          {reversed.length - visibleCount} older events…
        </button>
      )}
    </div>
  )
}

/* ── Helpers ── */
function formatJSON(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}