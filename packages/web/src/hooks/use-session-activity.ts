"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import type { ActivityEvent, ActivityEventType } from '@/components/activity/types'

type Listener = (event: string, payload: unknown) => void

interface UseSessionActivityOptions {
  sessionId: string | null
  subscribe: (fn: Listener) => () => void
}

export function useSessionActivity({ sessionId, subscribe }: UseSessionActivityOptions) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const sessionIdRef = useRef(sessionId)
  const thinkingBufferRef = useRef<string>('')
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textBufferRef = useRef<string>('')
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Reset events and status when session changes, then load historical events
  useEffect(() => {
    setEvents([])
    setSessionStatus('idle')
    thinkingBufferRef.current = ''
    textBufferRef.current = ''
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current)
      thinkingTimerRef.current = null
    }
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current)
      textTimerRef.current = null
    }

    if (!sessionId) return

    // Load persisted events (thinking, tool_use, tool_result) from the gateway
    api.getSessionEvents(sessionId).then(({ events: stored }) => {
      // Guard against stale responses after session switch
      if (sessionIdRef.current !== sessionId) return
      if (!stored || stored.length === 0) return

      const historical: ActivityEvent[] = stored.map((e) => ({
        id: e.id,
        type: e.type as ActivityEventType,
        timestamp: e.timestamp,
        toolName: e.toolName ?? undefined,
        args: e.toolArgs ? JSON.stringify(e.toolArgs, null, 2) : undefined,
        content: e.thinkingText ?? e.content ?? undefined,
        isError: false,
        resultContent: e.resultContent ?? undefined,
      }))

      setEvents(historical)
    }).catch(() => {
      // Silently ignore — events will still accumulate from WS
    })
  }, [sessionId])

  // Flush any buffered thinking text into a single consolidated event
  const flushThinkingBuffer = useCallback(() => {
    if (thinkingBufferRef.current) {
      const consolidated: ActivityEvent = {
        id: crypto.randomUUID(),
        type: 'thinking',
        content: thinkingBufferRef.current,
        timestamp: Date.now(),
      }
      setEvents(prev => [...prev, consolidated])
      thinkingBufferRef.current = ''
    }
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current)
      thinkingTimerRef.current = null
    }
  }, [])

  // Flush any buffered text into a single consolidated event
  const flushTextBuffer = useCallback(() => {
    if (textBufferRef.current) {
      const consolidated: ActivityEvent = {
        id: crypto.randomUUID(),
        type: 'text',
        content: textBufferRef.current,
        timestamp: Date.now(),
      }
      setEvents(prev => [...prev, consolidated])
      textBufferRef.current = ''
    }
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current)
      textTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return subscribe((event, payload) => {
      const p = payload as Record<string, unknown>
      const sid = sessionIdRef.current
      if (!sid || p.sessionId !== sid) return

      if (event === 'session:delta') {
        setSessionStatus('running')
        const deltaType = String(p.type || 'text') as ActivityEventType

        if (deltaType === 'thinking') {
          // Buffer thinking deltas and consolidate with debounce
          thinkingBufferRef.current += (p.thinkingText ?? p.content ?? '') as string
          if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current)
          thinkingTimerRef.current = setTimeout(() => {
            flushThinkingBuffer()
          }, 150)
        } else if (deltaType === 'text' || deltaType === 'text_snapshot' as string) {
          // Buffer text deltas and consolidate with debounce (same pattern as thinking)
          if (deltaType === 'text') {
            textBufferRef.current += (p.content ?? '') as string
          } else {
            // text_snapshot replaces the buffer if longer
            const snapshot = String(p.content || '')
            if (snapshot.length >= textBufferRef.current.length) {
              textBufferRef.current = snapshot
            }
          }
          if (textTimerRef.current) clearTimeout(textTimerRef.current)
          textTimerRef.current = setTimeout(() => {
            flushTextBuffer()
          }, 300)
        } else if (deltaType === 'tool_use' || deltaType === 'tool_result') {
          // Flush any pending buffers before adding non-streaming event
          flushThinkingBuffer()
          flushTextBuffer()

          const activityEvent: ActivityEvent = {
            id: crypto.randomUUID(),
            type: deltaType,
            timestamp: Date.now(),
            toolName: p.toolName ? String(p.toolName) : undefined,
            args: p.toolArgs ? (typeof p.toolArgs === 'string' ? p.toolArgs : JSON.stringify(p.toolArgs, null, 2)) : undefined,
            content: p.content ? String(p.content) : undefined,
            isError: p.isError === true,
            resultContent: p.resultContent ? String(p.resultContent) : undefined,
          }

          setEvents(prev => [...prev, activityEvent])
        }
      }

      if (event === 'session:completed' || event === 'session:stopped') {
        flushThinkingBuffer()
        flushTextBuffer()
        setSessionStatus('idle')
      }

      if (event === 'session:error') {
        flushThinkingBuffer()
        flushTextBuffer()
        setSessionStatus('error')
      }
    })
  }, [subscribe, flushThinkingBuffer, flushTextBuffer])

  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  return { events, clearEvents, sessionStatus }
}
