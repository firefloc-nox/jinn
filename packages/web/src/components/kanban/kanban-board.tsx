"use client"

import { DEFAULT_COLUMNS } from '@/lib/kanban/types'
import type { KanbanTicket, TicketStatus, KanbanColumn as KanbanColumnDef } from '@/lib/kanban/types'
import type { KanbanStore } from '@/lib/kanban/store'
import { getTicketsByStatus } from '@/lib/kanban/store'
import type { Employee } from '@/lib/api'
import { KanbanColumn } from './kanban-column'
import { TicketCard } from './ticket-card'

interface KanbanBoardProps {
  tickets: KanbanStore
  employees: Employee[]
  columns?: KanbanColumnDef[]
  onTicketClick: (ticket: KanbanTicket) => void
  onMoveTicket: (ticketId: string, status: TicketStatus) => void
  onCreateTicket: () => void
  onDeleteTicket?: (ticket: KanbanTicket) => void
  filterEmployeeId?: string | null
}

export function KanbanBoard({
  tickets,
  employees,
  columns,
  onTicketClick,
  onMoveTicket,
  onCreateTicket,
  onDeleteTicket,
  filterEmployeeId,
}: KanbanBoardProps) {
  const cols = columns ?? DEFAULT_COLUMNS
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
      {cols.map((column) => {
        const allColumnTickets = getTicketsByStatus(tickets, column.id)
        const columnTickets = filterEmployeeId
          ? allColumnTickets.filter((t) => t.assigneeId === filterEmployeeId)
          : allColumnTickets

        return (
          <KanbanColumn
            key={column.id}
            column={column}
            tickets={columnTickets}
            onDrop={onMoveTicket}
            onCreateTicket={column.id === 'backlog' ? onCreateTicket : undefined}
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
}
