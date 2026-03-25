"use client"

import { useState, useCallback, useEffect } from 'react'
import { Plus } from 'lucide-react'
import type { Employee } from '@/lib/api'
import type { TicketPriority, KanbanTopic } from '@/lib/kanban/types'
import { PRIORITY_COLORS } from '@/lib/kanban/types'
import { EmployeePicker } from './employee-picker'
import { TopicBadge } from './topic-badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface CreateTicketModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: Employee[]
  topics?: KanbanTopic[]
  onSubmit: (ticket: {
    title: string
    description: string
    priority: TicketPriority
    assigneeId: string | null
    topicId: string | null
  }) => void
}

const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high']
const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

const initialState = {
  title: '',
  description: '',
  priority: 'medium' as TicketPriority,
  assigneeId: '' as string,
  topicId: '' as string,
}

export function CreateTicketModal({
  open,
  onOpenChange,
  employees,
  topics = [],
  onSubmit,
}: CreateTicketModalProps) {
  const [form, setForm] = useState(initialState)

  const resetForm = useCallback(() => {
    setForm(initialState)
  }, [])

  function handleOpenChange(next: boolean) {
    if (!next) resetForm()
    onOpenChange(next)
  }

  // When a topic is selected, auto-fill priority and assignee from topic defaults
  useEffect(() => {
    if (!form.topicId) return
    const topic = topics.find((t) => t.id === form.topicId)
    if (!topic) return
    setForm((f) => ({
      ...f,
      priority: topic.defaultPriority ?? f.priority,
      assigneeId: topic.defaultAssignee ?? f.assigneeId,
    }))
  }, [form.topicId, topics])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return

    onSubmit({
      title: form.title.trim(),
      description: form.description.trim(),
      priority: form.priority,
      assigneeId: form.assigneeId || null,
      topicId: form.topicId || null,
    })

    resetForm()
    onOpenChange(false)
  }

  const selectedTopic = topics.find((t) => t.id === form.topicId) ?? null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="bg-[var(--bg)] border border-[var(--separator)] rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] max-w-[480px]"
      >
        <DialogHeader>
          <DialogTitle
            className="text-[length:var(--text-title3)] font-[var(--weight-bold)] text-[var(--text-primary)]"
          >
            Create Ticket
          </DialogTitle>
          <DialogDescription
            className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)]"
          >
            Add a new ticket to the backlog.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-[var(--space-4)]"
        >
          {/* Title */}
          <div className="flex flex-col gap-[var(--space-1)]">
            <label
              htmlFor="ticket-title"
              className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]"
            >
              Title
            </label>
            <input
              id="ticket-title"
              type="text"
              placeholder="What needs to be done?"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              autoFocus
              className="text-[length:var(--text-body)] text-[var(--text-primary)] py-2 px-3 border border-[var(--separator)] rounded-[var(--radius-md)] bg-[var(--fill-tertiary)] outline-none font-[inherit]"
            />
          </div>

          {/* Topic picker — shown only when topics exist */}
          {topics.length > 0 && (
            <div className="flex flex-col gap-[var(--space-1)]">
              <label className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]">
                Topic
              </label>
              <div className="flex items-center gap-[var(--space-2)]">
                <select
                  value={form.topicId}
                  onChange={(e) => setForm((f) => ({ ...f, topicId: e.target.value }))}
                  className="flex-1 text-[length:var(--text-body)] text-[var(--text-primary)] py-2 px-3 border border-[var(--separator)] rounded-[var(--radius-md)] bg-[var(--fill-tertiary)] outline-none font-[inherit]"
                >
                  <option value="">No topic</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {selectedTopic && <TopicBadge topic={selectedTopic} />}
              </div>
              {selectedTopic?.description && (
                <p className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] m-0 leading-[1.4]">
                  {selectedTopic.description}
                </p>
              )}
            </div>
          )}

          {/* Description */}
          <div className="flex flex-col gap-[var(--space-1)]">
            <label
              htmlFor="ticket-description"
              className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]"
            >
              Description
            </label>
            <textarea
              id="ticket-description"
              placeholder="Add details..."
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="text-[length:var(--text-body)] text-[var(--text-primary)] resize-y min-h-[72px] py-2 px-3 border border-[var(--separator)] rounded-[var(--radius-md)] bg-[var(--fill-tertiary)] outline-none font-[inherit]"
            />
          </div>

          {/* Priority */}
          <div className="flex flex-col gap-[var(--space-2)]">
            <span className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]">
              Priority
            </span>
            <div className="flex gap-[var(--space-2)]">
              {PRIORITIES.map((p) => {
                const isSelected = form.priority === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, priority: p }))}
                    className="flex-1 flex items-center justify-center gap-[var(--space-1)] py-[var(--space-2)] px-[var(--space-3)] rounded-[var(--radius-md)] cursor-pointer text-[length:var(--text-caption1)] font-[var(--weight-medium)] transition-all duration-150 ease-[var(--ease-smooth)]"
                    style={{
                      border: isSelected
                        ? `2px solid ${PRIORITY_COLORS[p]}`
                        : '2px solid var(--separator)',
                      background: isSelected ? 'var(--fill-tertiary)' : 'transparent',
                      color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: PRIORITY_COLORS[p] }}
                    />
                    {PRIORITY_LABELS[p]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Assignee */}
          <div className="flex flex-col gap-[var(--space-1)]">
            <label className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]">
              Assignee
            </label>
            <EmployeePicker
              employees={employees}
              value={form.assigneeId}
              onChange={(name) => setForm((f) => ({ ...f, assigneeId: name }))}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!form.title.trim()}
            className="rounded-[var(--radius-md)] py-3 px-5 w-full text-[length:var(--text-body)] font-[var(--weight-semibold)] border-none flex items-center justify-center gap-[var(--space-2)] mt-[var(--space-2)] bg-[var(--accent)] text-white transition-opacity duration-150 ease-linear"
            style={{
              cursor: form.title.trim() ? 'pointer' : 'default',
              opacity: form.title.trim() ? 1 : 0.5,
            }}
          >
            <Plus size={16} />
            Create Ticket
          </button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
