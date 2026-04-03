"use client"

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useGateway } from '@/hooks/use-gateway'
import { queryKeys } from '@/lib/query-keys'

/**
 * Subscribes to WebSocket events and invalidates React Query caches.
 * Mount once at app root (in client-providers.tsx).
 */
export function useQueryInvalidation() {
  const qc = useQueryClient()
  const { subscribe, connectionSeq } = useGateway()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Set<string>>(new Set())
  const isFirstMount = useRef(true)

  useEffect(() => {
    const unsub = subscribe((event: string, payload: unknown) => {
      const p = payload as Record<string, unknown> | undefined

      switch (event) {
        case 'session:started':
          pendingRef.current.add('sessions')
          break
        case 'session:updated':
          pendingRef.current.add('sessions')
          if (p?.sessionId) {
            qc.invalidateQueries({ queryKey: queryKeys.sessions.detail(p.sessionId as string) })
          }
          break
        case 'queue:updated':
          // Queue state changed (task started, completed, or cleared) — refresh session list
          // so transportState/queueDepth badge updates immediately in the UI.
          pendingRef.current.add('sessions')
          if (p?.sessionId) {
            qc.invalidateQueries({ queryKey: queryKeys.sessions.detail(p.sessionId as string) })
          }
          break
        case 'session:completed':
        case 'session:error':
        case 'session:deleted':
          pendingRef.current.add('sessions')
          pendingRef.current.add('costs')
          if (p?.sessionId) {
            qc.invalidateQueries({ queryKey: queryKeys.sessions.detail(p.sessionId as string) })
          }
          break
        case 'cron:completed':
        case 'cron:error':
          pendingRef.current.add('cron')
          break
        case 'skills:changed':
          pendingRef.current.add('skills')
          break
        default:
          return // No invalidation for unknown events
      }

      // Debounce: flush pending invalidations after 500ms of quiet
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        for (const key of pendingRef.current) {
          switch (key) {
            case 'sessions':
              qc.invalidateQueries({ queryKey: queryKeys.sessions.all })
              break
            case 'costs':
              qc.invalidateQueries({ queryKey: ['costs'] })
              break
            case 'cron':
              qc.invalidateQueries({ queryKey: queryKeys.cron.all })
              break
            case 'skills':
              qc.invalidateQueries({ queryKey: queryKeys.skills.all })
              break
          }
        }
        pendingRef.current.clear()
      }, 500)
    })

    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [subscribe, qc])

  // On WebSocket reconnect (connectionSeq increments), force-refresh sessions.
  // This recovers from the case where session:completed was emitted while the
  // client was disconnected (e.g. gateway restart) — otherwise the UI stays
  // stuck showing "queued" or "running" indefinitely.
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    // connectionSeq > 0 means a reconnection happened
    qc.invalidateQueries({ queryKey: queryKeys.sessions.all })
  }, [connectionSeq, qc])
}
