"use client"

import { useState, useMemo } from 'react'
import { X, Users, ArrowRight, AlertTriangle, CheckSquare, Square } from 'lucide-react'
import type { Employee } from '@/lib/api'
import type { KanbanTicket, KanbanConfig } from '@/lib/kanban/types'
import { PRIORITY_COLORS } from '@/lib/kanban/types'
import { validateTransition } from '@/lib/kanban/store'
import { EmployeePicker } from './employee-picker'

interface DispatcherPanelProps {
  tickets: KanbanTicket[]
  employees: Employee[]
  config: KanbanConfig
  onBulkAssign: (ids: string[], assigneeId: string | null) => void
  onBulkMove: (ids: string[], targetColumn: string) => void
  onClose: () => void
}

export function DispatcherPanel({
  tickets,
  employees,
  config,
  onBulkAssign,
  onBulkMove,
  onClose,
}: DispatcherPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [targetColumn, setTargetColumn] = useState<string>('')
  const [lastResult, setLastResult] = useState<{ moved: string[]; blocked: string[] } | null>(null)

  const selectedTickets = useMemo(
    () => tickets.filter((t) => selectedIds.has(t.id)),
    [tickets, selectedIds],
  )

  // Preview which tickets would be blocked for the chosen target column
  const movePreview = useMemo(() => {
    if (!targetColumn) return { allowed: [], blocked: [] }
    const allowed: string[] = []
    const blocked: string[] = []
    for (const t of selectedTickets) {
      if (validateTransition(t.status, targetColumn, config)) {
        allowed.push(t.id)
      } else {
        blocked.push(t.id)
      }
    }
    return { allowed, blocked }
  }, [selectedTickets, targetColumn, config])

  function toggleAll() {
    if (selectedIds.size === tickets.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(tickets.map((t) => t.id)))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleAssign() {
    if (selectedIds.size === 0) return
    onBulkAssign([...selectedIds], assigneeId || null)
    setLastResult(null)
    setSelectedIds(new Set())
  }

  function handleMove() {
    if (selectedIds.size === 0 || !targetColumn) return
    onBulkMove([...selectedIds], targetColumn)
    setLastResult({ moved: movePreview.allowed, blocked: movePreview.blocked })
    // Only deselect the ones that were moved
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of movePreview.allowed) next.delete(id)
      return next
    })
  }

  const allSelected = tickets.length > 0 && selectedIds.size === tickets.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < tickets.length

  return (
    <div className="flex flex-col h-full bg-[var(--material-regular)] border-l border-[var(--separator)] w-[360px] shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--space-4)] py-[var(--space-3)] border-b border-[var(--separator)] shrink-0">
        <div className="flex items-center gap-[var(--space-2)]">
          <Users size={15} className="text-[var(--text-secondary)]" />
          <span className="text-[length:var(--text-footnote)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
            Dispatcher
          </span>
          {selectedIds.size > 0 && (
            <span className="text-[length:var(--text-caption2)] font-[var(--weight-medium)] text-white bg-[var(--accent)] rounded-full px-[var(--space-2)] py-px min-w-[20px] text-center">
              {selectedIds.size}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close dispatcher"
          className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-transparent border-none text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Ticket list with checkboxes */}
      <div className="flex-1 overflow-y-auto">
        {/* Select all row */}
        <div
          className="flex items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-2)] border-b border-[var(--separator)] cursor-pointer hover:bg-[var(--fill-tertiary)] transition-colors"
          onClick={toggleAll}
        >
          <span className="text-[var(--text-tertiary)]">
            {allSelected ? (
              <CheckSquare size={15} className="text-[var(--accent)]" />
            ) : someSelected ? (
              <CheckSquare size={15} className="text-[var(--text-tertiary)] opacity-60" />
            ) : (
              <Square size={15} />
            )}
          </span>
          <span className="text-[length:var(--text-caption1)] text-[var(--text-secondary)] font-[var(--weight-medium)]">
            {allSelected ? 'Deselect all' : `Select all (${tickets.length})`}
          </span>
        </div>

        {tickets.length === 0 && (
          <div className="py-[var(--space-8)] text-center text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
            No tickets
          </div>
        )}

        {tickets.map((ticket) => {
          const isSelected = selectedIds.has(ticket.id)
          const emp = employees.find((e) => e.name === ticket.assigneeId)
          const col = config.columns.find((c) => c.id === ticket.status)

          return (
            <div
              key={ticket.id}
              onClick={() => toggleOne(ticket.id)}
              className="flex items-start gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] border-b border-[var(--separator)] cursor-pointer transition-colors"
              style={{
                background: isSelected ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : undefined,
              }}
            >
              <span className="mt-[3px] shrink-0 text-[var(--text-tertiary)]">
                {isSelected ? (
                  <CheckSquare size={15} className="text-[var(--accent)]" />
                ) : (
                  <Square size={15} />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-[var(--space-2)]">
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ background: PRIORITY_COLORS[ticket.priority] }}
                  />
                  <span className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-primary)] line-clamp-2 leading-[1.35]">
                    {ticket.title}
                  </span>
                </div>
                <div className="flex items-center gap-[var(--space-2)] mt-1 flex-wrap">
                  <span className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] bg-[var(--fill-secondary)] px-[5px] py-px rounded-[var(--radius-sm)]">
                    {col?.title ?? ticket.status}
                  </span>
                  {emp && (
                    <span className="text-[length:var(--text-caption2)] text-[var(--text-secondary)]">
                      {emp.displayName}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-[var(--separator)] px-[var(--space-4)] py-[var(--space-3)] flex flex-col gap-[var(--space-3)]">

        {/* Last result feedback */}
        {lastResult && (lastResult.blocked.length > 0) && (
          <div className="flex items-start gap-[var(--space-2)] text-[length:var(--text-caption2)] text-[var(--system-orange)] bg-[color-mix(in_srgb,_var(--system-orange)_10%,_transparent)] rounded-[var(--radius-md)] p-[var(--space-2)]">
            <AlertTriangle size={13} className="mt-[1px] shrink-0" />
            <span>
              {lastResult.blocked.length} ticket{lastResult.blocked.length > 1 ? 's' : ''} blocked (forbidden transition)
            </span>
          </div>
        )}

        {/* Bulk Assign */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] text-[var(--text-tertiary)] uppercase tracking-[0.4px]">
            Assign to
          </span>
          <EmployeePicker
            employees={employees}
            value={assigneeId}
            onChange={setAssigneeId}
          />
          <button
            onClick={handleAssign}
            disabled={selectedIds.size === 0}
            className="w-full py-[var(--space-2)] rounded-[var(--radius-md)] text-[length:var(--text-caption1)] font-[var(--weight-semibold)] border-none transition-all duration-150"
            style={{
              background: selectedIds.size > 0 ? 'var(--accent)' : 'var(--fill-tertiary)',
              color: selectedIds.size > 0 ? '#fff' : 'var(--text-tertiary)',
              cursor: selectedIds.size > 0 ? 'pointer' : 'default',
            }}
          >
            <Users size={12} className="inline mr-1.5 mb-px" />
            Assign {selectedIds.size > 0 ? `${selectedIds.size} ticket${selectedIds.size > 1 ? 's' : ''}` : ''}
          </button>
        </div>

        {/* Bulk Move */}
        <div className="flex flex-col gap-[var(--space-2)]">
          <span className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] text-[var(--text-tertiary)] uppercase tracking-[0.4px]">
            Move to column
          </span>
          <select
            value={targetColumn}
            onChange={(e) => setTargetColumn(e.target.value)}
            className="text-[length:var(--text-caption1)] text-[var(--text-primary)] py-[var(--space-2)] px-[var(--space-3)] border border-[var(--separator)] rounded-[var(--radius-md)] bg-[var(--fill-tertiary)] outline-none font-[inherit]"
          >
            <option value="">Select column…</option>
            {config.columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.title}
              </option>
            ))}
          </select>

          {/* Preview blocked count */}
          {targetColumn && selectedIds.size > 0 && movePreview.blocked.length > 0 && (
            <div className="text-[length:var(--text-caption2)] text-[var(--system-orange)]">
              <AlertTriangle size={11} className="inline mr-1" />
              {movePreview.blocked.length} will be blocked · {movePreview.allowed.length} will move
            </div>
          )}

          <button
            onClick={handleMove}
            disabled={selectedIds.size === 0 || !targetColumn}
            className="w-full py-[var(--space-2)] rounded-[var(--radius-md)] text-[length:var(--text-caption1)] font-[var(--weight-semibold)] border-none transition-all duration-150"
            style={{
              background: selectedIds.size > 0 && targetColumn ? 'var(--fill-secondary)' : 'var(--fill-tertiary)',
              color: selectedIds.size > 0 && targetColumn ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: selectedIds.size > 0 && targetColumn ? 'pointer' : 'default',
            }}
          >
            <ArrowRight size={12} className="inline mr-1.5 mb-px" />
            Move {movePreview.allowed.length > 0 ? `${movePreview.allowed.length} ticket${movePreview.allowed.length > 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}
