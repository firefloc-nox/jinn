"use client"

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Undo2, Redo2, Users } from 'lucide-react'
import { api } from '@/lib/api'
import type { Employee, OrgData } from '@/lib/api'
import type { KanbanTicket, TicketStatus, TicketPriority } from '@/lib/kanban/types'
import { type KanbanStore } from '@/lib/kanban/store'
import { useKanban } from '@/hooks/use-kanban'
import { useNotifications } from '@/hooks/use-notifications'
import { PageLayout, ToolbarActions } from '@/components/page-layout'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { CreateTicketModal } from '@/components/kanban/create-ticket-modal'
import { TicketDetailPanel } from '@/components/kanban/ticket-detail-panel'
import { DispatcherPanel } from '@/components/kanban/dispatcher-panel'

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

function DeleteConfirmDialog({
  ticket,
  onConfirm,
  onCancel,
}: {
  ticket: KanbanTicket
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent
        showCloseButton={false}
        className="bg-[var(--bg)] border border-[var(--separator)] rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] max-w-[400px]"
      >
        <DialogHeader>
          <DialogTitle className="text-[length:var(--text-title3)] font-[var(--weight-bold)] text-[var(--text-primary)]">
            Delete Ticket
          </DialogTitle>
          <DialogDescription className="text-[length:var(--text-footnote)] text-[var(--text-secondary)] leading-[1.5]">
            Are you sure you want to delete &ldquo;{ticket.title}&rdquo;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={onCancel}
            className="px-[var(--space-4)] py-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--separator)] bg-transparent text-[var(--text-secondary)] text-[length:var(--text-footnote)] font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className="px-[var(--space-4)] py-[var(--space-2)] rounded-[var(--radius-md)] border-none bg-[var(--system-red)] text-white text-[length:var(--text-footnote)] font-semibold cursor-pointer"
          >
            Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KanbanPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<KanbanTicket | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<KanbanTicket | null>(null)
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(null)
  const [dispatcherOpen, setDispatcherOpen] = useState(false)

  // Core kanban state (config + history + operations)
  const kanban = useKanban({ employees, departments })
  const { tickets, config, canUndo, canRedo, undo, redo } = kanban
  const { pushDirect } = useNotifications()

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const ctrl = isMac ? e.metaKey : e.ctrlKey
      if (!ctrl) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadData = useCallback(() => {
    setLoading(true)
    setError(null)

    api
      .getOrg()
      .then(async (data: OrgData) => {
        const details = await Promise.all(
          data.employees.map(async (name) => {
            try {
              return await api.getEmployee(name)
            } catch {
              return {
                name,
                displayName: name,
                department: '',
                rank: 'employee' as const,
                engine: 'unknown',
                model: 'unknown',
                persona: '',
              }
            }
          }),
        )
        setEmployees(details)
        setDepartments(data.departments)

        // Load board tickets from all departments
        const boardTickets: KanbanStore = {}
        for (const dept of data.departments) {
          try {
            const board = await api.getDepartmentBoard(dept) as unknown as Array<{
              id: string
              title: string
              description?: string
              status: string
              priority?: string
              assignee?: string
              topicId?: string
              createdAt?: string
              updatedAt?: string
            }>
            if (Array.isArray(board)) {
              // Build a set of valid column IDs from loaded config
              const validColumns = new Set(kanban.config.columns.map((c) => c.id))
              const defaultCol = kanban.config.columns.length > 0
                ? [...kanban.config.columns].sort((a, b) => a.order - b.order)[0].id
                : 'backlog'
              // Legacy status mappings for backward compat
              const legacyMap: Record<string, string> = {
                in_progress: 'in-progress',
                wip: 'in-progress',
                rd: 'in-progress',
                blocked: 'todo',
              }

              for (const item of board) {
                const rawStatus = item.status || ''
                const mapped = legacyMap[rawStatus] ?? rawStatus
                const status = validColumns.has(mapped) ? mapped : defaultCol
                const priorityMap: Record<string, TicketPriority> = {
                  low: 'low',
                  medium: 'medium',
                  high: 'high',
                }
                const priority = priorityMap[item.priority || 'medium'] || 'medium'
                boardTickets[item.id] = {
                  id: item.id,
                  title: item.title,
                  description: item.description || '',
                  status,
                  priority,
                  assigneeId: item.assignee || null,
                  department: dept,
                  workState: 'idle',
                  createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
                  updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now(),
                  departmentId: dept,
                  topicId: item.topicId ?? null,
                }
              }
            }
          } catch {
            // Department may not have a board.json — that's fine
          }
        }

        kanban.initializeFromApi(boardTickets)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ---------------------------------------------------------------------------
  // Keep selectedTicket in sync with store
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (selectedTicket && tickets[selectedTicket.id]) {
      const current = tickets[selectedTicket.id]
      if (current.updatedAt !== selectedTicket.updatedAt) {
        setSelectedTicket(current)
      }
    } else if (selectedTicket && !tickets[selectedTicket.id]) {
      // Ticket was deleted (e.g. via undo)
      setSelectedTicket(null)
    }
  }, [tickets, selectedTicket])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleCreateTicket(data: {
    title: string
    description: string
    priority: TicketPriority
    assigneeId: string | null
    topicId?: string | null
  }) {
    kanban.handleCreateTicket(data)
  }

  function handleMoveTicket(ticketId: string, status: TicketStatus) {
    const result = kanban.handleMoveTicket(ticketId, status)
    if (!result.success && result.reason) {
      pushDirect({
        type: 'warning',
        title: 'Déplacement bloqué',
        message: result.reason,
      })
    }
  }

  function handleDeleteTicket(ticketId: string) {
    kanban.handleDeleteTicket(ticketId)
    setSelectedTicket(null)
    setDeleteConfirm(null)
  }

  function handleAssigneeChange(ticketId: string, assigneeId: string | null) {
    kanban.handleAssigneeChange(ticketId, assigneeId)
  }

  function handleTicketClick(ticket: KanbanTicket) {
    setSelectedTicket(ticket)
    setDispatcherOpen(false)
  }

  function handleDispatcherOpen() {
    setDispatcherOpen(true)
    setSelectedTicket(null)
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center h-full gap-[var(--space-4)] text-[var(--text-tertiary)]">
          <div className="rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--system-red)_10%,transparent)] border border-[color-mix(in_srgb,var(--system-red)_30%,transparent)] px-[var(--space-4)] py-[var(--space-3)] text-[length:var(--text-body)] text-[var(--system-red)]">
            Failed to load employees: {error}
          </div>
          <button
            onClick={loadData}
            className="px-[var(--space-4)] py-[var(--space-2)] rounded-[var(--radius-md)] bg-[var(--accent)] text-[var(--accent-contrast)] border-none cursor-pointer text-[length:var(--text-body)] font-[var(--weight-semibold)]"
          >
            Retry
          </button>
        </div>
      </PageLayout>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const ticketCount = Object.keys(tickets).length
  const assignedEmployeeNames = new Set(
    Object.values(tickets).map((t) => t.assigneeId).filter(Boolean),
  )
  const assignedEmployees = employees.filter((e) => assignedEmployeeNames.has(e.name))
  const allTickets = Object.values(tickets)

  return (
    <PageLayout>
      <div className="flex h-full relative bg-[var(--bg)]">
        {/* Board area */}
        <div className="flex-1 h-full flex flex-col min-w-0">

          {/* Header */}
          <div className="px-[var(--space-5)] py-[var(--space-4)] flex items-center justify-between shrink-0 border-b border-[var(--separator)]">
            <div>
              <h1 className="text-[length:var(--text-title2)] font-[var(--weight-bold)] text-[var(--text-primary)] m-0 tracking-[-0.3px]">
                Kanban Board
              </h1>
              <p className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] mt-[2px] mb-0">
                {ticketCount} ticket{ticketCount !== 1 ? 's' : ''}
                {config !== undefined && config.columns.length > 0 && (
                  <span className="ml-[var(--space-2)] text-[var(--text-quaternary)]">
                    · {config.columns.length} colonnes
                  </span>
                )}
              </p>
            </div>

            <ToolbarActions>
              {/* Undo */}
              <button
                onClick={undo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] border border-[var(--separator)] bg-transparent cursor-pointer transition-all duration-150"
                style={{
                  color: canUndo ? 'var(--text-secondary)' : 'var(--text-quaternary)',
                  opacity: canUndo ? 1 : 0.4,
                }}
              >
                <Undo2 size={14} />
              </button>

              {/* Redo */}
              <button
                onClick={redo}
                disabled={!canRedo}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                className="flex items-center justify-center w-8 h-8 rounded-[var(--radius-md)] border border-[var(--separator)] bg-transparent cursor-pointer transition-all duration-150"
                style={{
                  color: canRedo ? 'var(--text-secondary)' : 'var(--text-quaternary)',
                  opacity: canRedo ? 1 : 0.4,
                }}
              >
                <Redo2 size={14} />
              </button>

              {/* Dispatcher toggle */}
              <button
                onClick={dispatcherOpen ? () => setDispatcherOpen(false) : handleDispatcherOpen}
                title="Dispatcher — bulk assign / move"
                className="flex items-center gap-[var(--space-1)] px-[var(--space-3)] h-8 rounded-[var(--radius-md)] border text-[length:var(--text-caption1)] font-[var(--weight-semibold)] cursor-pointer transition-all duration-150"
                style={{
                  borderColor: dispatcherOpen ? 'var(--accent)' : 'var(--separator)',
                  background: dispatcherOpen ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  color: dispatcherOpen ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <Users size={13} />
                Dispatch
              </button>

              {/* New ticket */}
              <button
                onClick={() => setCreateOpen(true)}
                className="rounded-[var(--radius-md)] px-4 h-8 text-[length:var(--text-footnote)] font-[var(--weight-semibold)] border-none flex items-center gap-[var(--space-2)] bg-[var(--accent)] text-white cursor-pointer"
              >
                <Plus size={16} />
                New Ticket
              </button>
            </ToolbarActions>
          </div>

          {/* Employee filter bar */}
          {assignedEmployees.length > 0 && (
            <div className="flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-2)] overflow-x-auto shrink-0">
              <button
                onClick={() => setFilterEmployeeId(null)}
                className={`flex items-center gap-[var(--space-1)] px-3 py-1 rounded-full border-none text-[length:var(--text-caption1)] font-semibold cursor-pointer shrink-0 ${
                  filterEmployeeId === null
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--fill-tertiary)] text-[var(--text-secondary)]'
                }`}
              >
                All
              </button>
              {assignedEmployees.map((emp) => (
                <button
                  key={emp.name}
                  onClick={() => setFilterEmployeeId(filterEmployeeId === emp.name ? null : emp.name)}
                  className={`flex items-center gap-[var(--space-1)] px-3 py-1 rounded-full border-none text-[length:var(--text-caption1)] font-semibold cursor-pointer shrink-0 ${
                    filterEmployeeId === emp.name
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--fill-tertiary)] text-[var(--text-secondary)]'
                  }`}
                >
                  {emp.displayName}
                </button>
              ))}
            </div>
          )}

          {/* Board */}
          <div className="flex-1 px-[var(--space-3)] min-h-0">
            {loading ? (
              <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-[length:var(--text-caption1)]">
                Loading...
              </div>
            ) : (
              <KanbanBoard
                tickets={tickets}
                employees={employees}
                columns={config.columns}
                topics={config.topics}
                onTicketClick={handleTicketClick}
                onMoveTicket={handleMoveTicket}
                onCreateTicket={() => setCreateOpen(true)}
                onDeleteTicket={(ticket) => setDeleteConfirm(ticket)}
                filterEmployeeId={filterEmployeeId}
              />
            )}
          </div>
        </div>

        {/* Mobile backdrop */}
        {(selectedTicket || dispatcherOpen) && (
          <div
            className="fixed inset-0 z-20 lg:hidden bg-black/50"
            onClick={() => { setSelectedTicket(null); setDispatcherOpen(false) }}
          />
        )}

        {/* Dispatcher panel */}
        {dispatcherOpen && (
          <div className="absolute top-0 right-0 bottom-0 z-30 flex">
            <DispatcherPanel
              tickets={allTickets}
              employees={employees}
              config={config}
              onBulkAssign={kanban.handleBulkAssign}
              onBulkMove={kanban.handleBulkMove}
              onClose={() => setDispatcherOpen(false)}
            />
          </div>
        )}

        {/* Ticket detail panel */}
        {selectedTicket && !dispatcherOpen && (
          <TicketDetailPanel
            ticket={selectedTicket}
            employees={employees}
            columns={config.columns}
            config={config}
            onClose={() => setSelectedTicket(null)}
            onStatusChange={(status) => handleMoveTicket(selectedTicket.id, status)}
            onAssigneeChange={(name) => handleAssigneeChange(selectedTicket.id, name)}
            onDelete={() => setDeleteConfirm(selectedTicket)}
          />
        )}

        {/* Delete confirmation */}
        {deleteConfirm && (
          <DeleteConfirmDialog
            ticket={deleteConfirm}
            onConfirm={() => handleDeleteTicket(deleteConfirm.id)}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}

        {/* Create ticket modal */}
        <CreateTicketModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          employees={employees}
          topics={config.topics}
          onSubmit={handleCreateTicket}
        />
      </div>
    </PageLayout>
  )
}
