"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Activity, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EventTimeline } from './event-timeline'
import type { ActivityEvent } from './types'

interface SessionActivityPanelProps {
  events: ActivityEvent[]
  sessionTitle?: string
  sessionStatus?: string
  connected?: boolean
  onClose: () => void
}

export function SessionActivityPanel({
  events,
  sessionTitle,
  sessionStatus,
  connected,
  onClose,
}: SessionActivityPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  // Escape key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  const statusColor = sessionStatus === 'running'
    ? 'bg-emerald-500'
    : sessionStatus === 'error'
      ? 'bg-red-500'
      : 'bg-zinc-400'

  return (
    <>
      {/* ── Desktop: right side panel ── */}
      <div className="hidden lg:flex absolute top-0 right-0 bottom-0 z-30">
        <div className="w-[380px] max-w-[100vw] h-full bg-[var(--material-regular)] shadow-[-4px_0_24px_rgba(0,0,0,0.25)] flex flex-col">
          {/* Accent strip */}
          <div className="h-[3px] bg-[var(--accent)] shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--separator)] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="size-4 text-[var(--accent)] shrink-0" />
              <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                {sessionTitle || 'Activity'}
              </span>
              {connected !== undefined && (
                <span className={cn('size-2 rounded-full shrink-0', connected ? 'bg-[var(--system-green)]' : 'bg-red-500')} />
              )}
              {sessionStatus && (
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider shrink-0">
                  <span className={cn('size-1.5 rounded-full', statusColor)} />
                  {sessionStatus}
                </span>
              )}
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Fermer le panneau"
              className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--fill-secondary)] text-[var(--text-secondary)] border-none cursor-pointer text-[length:var(--text-footnote)] transition-all duration-150 ease-[var(--ease-spring)] hover:bg-[var(--fill-tertiary)]"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* Event count */}
          <div className="px-4 py-1.5 text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider border-b border-[var(--separator)] shrink-0">
            {events.length} event{events.length !== 1 ? 's' : ''}
          </div>

          {/* Timeline */}
          <EventTimeline events={events} />
        </div>
      </div>

      {/* ── Mobile: bottom sheet ── */}
      <MobileBottomSheet events={events} sessionTitle={sessionTitle} sessionStatus={sessionStatus} statusColor={statusColor} connected={connected} onClose={onClose} />
    </>
  )
}

/* ── Mobile bottom sheet ── */
function MobileBottomSheet({
  events,
  sessionTitle,
  sessionStatus,
  statusColor,
  connected,
  onClose,
}: {
  events: ActivityEvent[]
  sessionTitle?: string
  sessionStatus?: string
  statusColor: string
  connected?: boolean
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const touchDeltaY = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchDeltaY.current = 0
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none'
    }
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - touchStartY.current
    touchDeltaY.current = delta
    // Only allow downward drag (positive delta)
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = ''
      sheetRef.current.style.transform = ''
    }
    const dy = touchDeltaY.current
    if (dy > 80) {
      if (expanded) { setExpanded(false) } else { onClose() }
    } else if (dy < -80) {
      setExpanded(true)
    }
  }, [expanded, onClose])

  return (
    <div
      ref={sheetRef}
      className={cn(
        'lg:hidden fixed inset-x-0 bottom-0 z-40 bg-[var(--material-regular)] shadow-[0_-4px_24px_rgba(0,0,0,0.25)] transition-all duration-300 ease-[var(--ease-spring)] rounded-t-2xl flex flex-col',
        expanded ? 'top-0' : 'max-h-[45vh]',
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-2 pb-1 shrink-0 cursor-grab touch-none">
        <div className="w-10 h-1 rounded-full bg-[var(--fill-tertiary)]" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--separator)] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="size-4 text-[var(--accent)] shrink-0" />
          <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
            {sessionTitle || 'Activity'}
          </span>
          {connected !== undefined && (
            <span className={cn('size-2 rounded-full shrink-0', connected ? 'bg-[var(--system-green)]' : 'bg-red-500')} />
          )}
          {sessionStatus && (
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider shrink-0">
              <span className={cn('size-1.5 rounded-full', statusColor)} />
              {sessionStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Réduire' : 'Agrandir'}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--fill-secondary)] text-[var(--text-secondary)] border-none cursor-pointer transition-all duration-150"
          >
            <ChevronUp className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
          </button>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--fill-secondary)] text-[var(--text-secondary)] border-none cursor-pointer transition-all duration-150"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Event count */}
      <div className="px-4 py-1.5 text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider shrink-0">
        {events.length} event{events.length !== 1 ? 's' : ''}
      </div>

      {/* Timeline */}
      <EventTimeline events={events} />
    </div>
  )
}