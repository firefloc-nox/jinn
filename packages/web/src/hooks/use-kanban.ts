'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import type { Employee } from '@/lib/api'
import type { KanbanTicket, TicketPriority, KanbanConfig } from '@/lib/kanban/types'
import { DEFAULT_CONFIG } from '@/lib/kanban/types'
import {
  type KanbanStore,
  type KanbanHistory,
  loadConfig,
  loadTickets,
  saveTickets,
  createTicket,
  updateTicket,
  moveTicket,
  deleteTicket,
  bulkAssign,
  bulkMove,
  validateTransition,
  validateWipLimit,
  createHistory,
  historyPush,
  historyUndo,
  historyRedo,
} from '@/lib/kanban/store'

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseKanbanOpts {
  employees: Employee[]
  departments: string[]
}

export function useKanban({ employees, departments }: UseKanbanOpts) {
  const [config, setConfig] = useState<KanbanConfig>(DEFAULT_CONFIG)
  const [history, setHistory] = useState<KanbanHistory>(() =>
    createHistory(loadTickets()),
  )

  // Track whether the initial API load has completed so we don't wipe
  // the history on re-renders before it's ready.
  const initializedRef = useRef(false)

  const tickets = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  useEffect(() => {
    loadConfig().then(setConfig)
  }, [])

  // ---------------------------------------------------------------------------
  // API persistence
  // ---------------------------------------------------------------------------

  const persistToApi = useCallback(
    async (store: KanbanStore) => {
      const byDept: Record<string, KanbanTicket[]> = {}
      for (const ticket of Object.values(store)) {
        if (!ticket.departmentId) continue
        if (!byDept[ticket.departmentId]) byDept[ticket.departmentId] = []
        byDept[ticket.departmentId].push(ticket)
      }

      for (const dept of departments) {
        if (!byDept[dept]) byDept[dept] = []
      }

      await Promise.all(
        Object.entries(byDept).map(([dept, deptTickets]) => {
          const boardData = deptTickets.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            assignee: t.assigneeId ?? undefined,
            topicId: t.topicId ?? undefined,
            createdAt: new Date(t.createdAt).toISOString(),
            updatedAt: new Date(t.updatedAt).toISOString(),
          }))
          return api.updateDepartmentBoard(dept, boardData).catch(() => {})
        }),
      )
    },
    [departments],
  )

  // ---------------------------------------------------------------------------
  // Core dispatch — push to history + persist
  // ---------------------------------------------------------------------------

  const dispatch = useCallback(
    (updater: (current: KanbanStore) => KanbanStore) => {
      setHistory((h) => {
        const next = updater(h.present)
        saveTickets(next)
        persistToApi(next)
        return historyPush(h, next)
      })
    },
    [persistToApi],
  )

  // ---------------------------------------------------------------------------
  // Initialize from API data (called by page after loading org/board data)
  // ---------------------------------------------------------------------------

  const initializeFromApi = useCallback((store: KanbanStore) => {
    initializedRef.current = true
    setHistory(createHistory(store))
    saveTickets(store)
  }, [])

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  const undo = useCallback(() => {
    setHistory((h) => {
      const next = historyUndo(h)
      saveTickets(next.present)
      persistToApi(next.present)
      return next
    })
  }, [persistToApi])

  const redo = useCallback(() => {
    setHistory((h) => {
      const next = historyRedo(h)
      saveTickets(next.present)
      persistToApi(next.present)
      return next
    })
  }, [persistToApi])

  // ---------------------------------------------------------------------------
  // Ticket operations
  // ---------------------------------------------------------------------------

  const handleCreateTicket = useCallback(
    (data: {
      title: string
      description: string
      priority: TicketPriority
      assigneeId: string | null
      topicId?: string | null
    }) => {
      const emp = data.assigneeId ? employees.find((e) => e.name === data.assigneeId) : null
      const departmentId = emp?.department || departments[0] || null
      const firstColId =
        config.columns.length > 0
          ? [...config.columns].sort((a, b) => a.order - b.order)[0].id
          : 'backlog'

      dispatch((current) =>
        createTicket(current, {
          ...data,
          status: firstColId,
          department: departmentId,
          departmentId,
          topicId: data.topicId ?? null,
        }),
      )
    },
    [employees, departments, config.columns, dispatch],
  )

  /**
   * Returns `{ success, reason? }`.
   * Caller should display `reason` to the user when `success` is false.
   */
  const handleMoveTicket = useCallback(
    (ticketId: string, status: string): { success: boolean; reason?: string } => {
      const ticket = tickets[ticketId]
      if (!ticket) return { success: false, reason: 'Ticket introuvable' }
      if (!validateTransition(ticket.status, status, config)) {
        return { success: false, reason: `Transition non autorisée (${ticket.status} → ${status})` }
      }
      const wip = validateWipLimit(tickets, status, config)
      if (!wip.allowed) return { success: false, reason: wip.reason }
      dispatch((current) => moveTicket(current, ticketId, status))
      return { success: true }
    },
    [tickets, config, dispatch],
  )

  const handleDeleteTicket = useCallback(
    (ticketId: string) => {
      dispatch((current) => deleteTicket(current, ticketId))
    },
    [dispatch],
  )

  const handleUpdateTicket = useCallback(
    (ticketId: string, updates: Partial<Omit<KanbanTicket, 'id' | 'createdAt'>>) => {
      dispatch((current) => updateTicket(current, ticketId, updates))
    },
    [dispatch],
  )

  const handleAssigneeChange = useCallback(
    (ticketId: string, assigneeId: string | null) => {
      const emp = assigneeId ? employees.find((e) => e.name === assigneeId) : null
      const updates: Partial<Omit<KanbanTicket, 'id' | 'createdAt'>> = { assigneeId }
      if (emp?.department) updates.department = emp.department
      dispatch((current) => updateTicket(current, ticketId, updates))
    },
    [employees, dispatch],
  )

  // ---------------------------------------------------------------------------
  // Bulk operations
  // ---------------------------------------------------------------------------

  const handleBulkAssign = useCallback(
    (ids: string[], assigneeId: string | null) => {
      dispatch((current) => bulkAssign(current, ids, assigneeId))
      // Fire-and-forget to bulk endpoint; fallback is the department board sync in dispatch
      api.bulkKanbanOps({ ids, assigneeId }).catch(() => {})
    },
    [dispatch],
  )

  /** Returns the list of ticket ids that were blocked and NOT moved. */
  const handleBulkMove = useCallback(
    (ids: string[], targetColumn: string): string[] => {
      // Pre-compute blocked from current snapshot (for return value)
      const blocked = ids.filter((id) => {
        const t = tickets[id]
        return !t || !validateTransition(t.status, targetColumn, config)
      })
      dispatch((current) => bulkMove(current, ids, targetColumn, config).store)
      const movedIds = ids.filter((id) => !blocked.includes(id))
      if (movedIds.length > 0) {
        api.bulkKanbanOps({ ids: movedIds, targetColumn }).catch(() => {})
      }
      return blocked
    },
    [tickets, config, dispatch],
  )

  return {
    config,
    setConfig,
    tickets,
    history,
    canUndo,
    canRedo,
    undo,
    redo,
    initializeFromApi,
    handleCreateTicket,
    handleMoveTicket,
    handleDeleteTicket,
    handleUpdateTicket,
    handleAssigneeChange,
    handleBulkAssign,
    handleBulkMove,
  }
}
