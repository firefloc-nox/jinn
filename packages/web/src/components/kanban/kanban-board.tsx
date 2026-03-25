"use client"

import { memo } from 'react'
import { COLUMNS } from '@/lib/kanban/types'
import type { KanbanTicket, TicketStatus, KanbanColumn as KanbanColumnType, KanbanTopic } from '@/lib/kanban/types'
import type { KanbanStore } from '@/lib/kanban/store'
import { getTicketsByStatus } from '@/lib/kanban/store'
import type { Employee } from '@/lib/api'
import { KanbanColumn } from './kanban-column'
import { TicketCard } from './ticket-card'

interface KanbanBoardProps {
  tickets: KanbanStore
  employees: Employee[]
  columns?: KanbanColumnType[]       // dynamic config columns; falls back to COLUMNS
  topics?: KanbanTopic[]
  onTicketClick: (ticket: KanbanTicket) => void
  onMoveTicket: (ticketId: string, status: TicketStatus) => void
  onCreateTicket: () => void
  onDeleteTicket?: (ticket: KanbanTicket) => void
  filterEmployeeId?: string | null
}

export const KanbanBoard = memo(function KanbanBoard({
  tickets,
  employees,
  columns,
  topics = [],
  onTicketClick,
  onMoveTicket,
  onCreateTicket,
  onDeleteTicket,
  filterEmployeeId,
}: KanbanBoardProps) {
  // Use dynamic columns from config if provided, otherwise backward-compat COLUMNS
  const activeColumns = (columns && columns.length > 0)
    ? [...columns].sort((a, b) => a.order - b.order)
    : COLUMNS

  const firstColumnId = activeColumns[0]?.id

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        height: '100%',
        overflowX: 'auto',
        overflowY: 'hidden',
        padding: 'var(--space-2) 0',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {activeColumns.map((column) => {
        const allColumnTickets = getTicketsByStatus(tickets, column.id)
        const columnTickets = filterEmployeeId
          ? allColumnTickets.filter((t) => t.assigneeId === filterEmployeeId)
          : allColumnTickets

        return (
          <KanbanColumn
            key={column.id}
            column={column}
            tickets={columnTickets}
            topics={topics}
            isFirstColumn={column.id === firstColumnId}
            onDrop={onMoveTicket}
            onCreateTicket={column.id === firstColumnId ? onCreateTicket : undefined}
            renderTicket={(ticket) => {
              const emp = employees.find((e) => e.name === ticket.assigneeId)
              return (
                <TicketCard
                  ticket={ticket}
                  assigneeName={emp?.displayName ?? null}
                  onClick={() => onTicketClick(ticket)}
                  onDelete={onDeleteTicket ? () => onDeleteTicket(ticket) : undefined}
                />
              )
            }}
          />
        )
      })}
    </div>
  )
})
