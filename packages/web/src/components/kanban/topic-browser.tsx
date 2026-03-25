"use client"

import { useState, useMemo } from 'react'
import { Plus, Search, Tag, Pencil, Trash2, X } from 'lucide-react'
import type { KanbanTopic, KanbanTicket, TicketPriority } from '@/lib/kanban/types'
import { PRIORITY_COLORS } from '@/lib/kanban/types'
import { TopicBadge } from './topic-badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopicFormData {
  name: string
  description: string
  color: string
  tags: string
  defaultPriority: TicketPriority | ''
}

const PRESET_COLORS = [
  '#6C8EFF', '#4CAF84', '#F5A623', '#E05C5C',
  '#9B59B6', '#2ECC71', '#E67E22', '#1ABC9C',
]

const EMPTY_FORM: TopicFormData = {
  name: '',
  description: '',
  color: PRESET_COLORS[0],
  tags: '',
  defaultPriority: '',
}

// ---------------------------------------------------------------------------
// Topic edit modal
// ---------------------------------------------------------------------------

interface TopicModalProps {
  initial?: KanbanTopic
  onSave: (data: Omit<KanbanTopic, 'id'>) => void
  onClose: () => void
}

function TopicModal({ initial, onSave, onClose }: TopicModalProps) {
  const [form, setForm] = useState<TopicFormData>({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    color: initial?.color ?? PRESET_COLORS[0],
    tags: initial?.tags.join(', ') ?? '',
    defaultPriority: initial?.defaultPriority ?? '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave({
      name: form.name.trim(),
      description: form.description.trim(),
      color: form.color,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      defaultPriority: form.defaultPriority || undefined,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[440px] max-w-[calc(100vw-32px)] bg-[var(--bg)] border border-[var(--separator)] rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] overflow-hidden">
        <div className="flex items-center justify-between px-[var(--space-5)] pt-[var(--space-4)] pb-[var(--space-3)] border-b border-[var(--separator)]">
          <h3 className="text-[length:var(--text-title3)] font-bold text-[var(--text-primary)]">
            {initial ? 'Edit Topic' : 'New Topic'}
          </h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-[var(--fill-secondary)] border-none text-[var(--text-secondary)] cursor-pointer">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-[var(--space-5)] py-[var(--space-4)] flex flex-col gap-[var(--space-4)]">
          {/* Name */}
          <div className="flex flex-col gap-[var(--space-1)]">
            <label className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]">
              Name
            </label>
            <input
              type="text"
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Bug Fix, Feature, Infra"
              required
              className="text-[length:var(--text-body)] text-[var(--text-primary)] py-2 px-3 border border-[var(--separator)] rounded-[var(--radius-md)] bg-[var(--fill-tertiary)] outline-none font-[inherit]"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-[var(--space-1)]">
            <label className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this topic cover?"
              rows={2}
              className="text-[length:var(--text-body)] text-[var(--text-primary)] resize-y min-h-[56px] py-2 px-3 border border-[var(--separator)] rounded-[var(--radius-md)] bg-[var(--fill-tertiary)] outline-none font-[inherit]"
            />
          </div>

          {/* Color */}
          <div className="flex flex-col gap-[var(--space-2)]">
            <label className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]">
              Color
            </label>
            <div className="flex items-center gap-[var(--space-2)] flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className="w-6 h-6 rounded-full border-2 transition-transform duration-100 cursor-pointer"
                  style={{
                    background: c,
                    borderColor: form.color === c ? 'var(--text-primary)' : 'transparent',
                    transform: form.color === c ? 'scale(1.2)' : 'scale(1)',
                  }}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-7 h-7 rounded-[var(--radius-sm)] border border-[var(--separator)] cursor-pointer bg-transparent p-0"
                title="Custom color"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-[var(--space-1)]">
            <label className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]">
              Tags <span className="text-[var(--text-tertiary)] font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="backend, urgent, sprint-2"
              className="text-[length:var(--text-body)] text-[var(--text-primary)] py-2 px-3 border border-[var(--separator)] rounded-[var(--radius-md)] bg-[var(--fill-tertiary)] outline-none font-[inherit]"
            />
          </div>

          {/* Default priority */}
          <div className="flex flex-col gap-[var(--space-1)]">
            <label className="text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)]">
              Default priority
            </label>
            <div className="flex gap-[var(--space-2)]">
              {(['', 'low', 'medium', 'high'] as const).map((p) => {
                const isSelected = form.defaultPriority === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, defaultPriority: p }))}
                    className="flex-1 py-[var(--space-1)] px-[var(--space-2)] rounded-[var(--radius-sm)] text-[length:var(--text-caption2)] font-[var(--weight-medium)] border transition-all duration-100 cursor-pointer"
                    style={{
                      borderColor: isSelected ? (p ? PRIORITY_COLORS[p as TicketPriority] : 'var(--accent)') : 'var(--separator)',
                      background: isSelected ? 'var(--fill-tertiary)' : 'transparent',
                      color: isSelected ? (p ? PRIORITY_COLORS[p as TicketPriority] : 'var(--accent)') : 'var(--text-tertiary)',
                    }}
                  >
                    {p || 'None'}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-[var(--space-2)] pt-[var(--space-1)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--separator)] bg-transparent text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!form.name.trim()}
              className="flex-1 py-[var(--space-2)] rounded-[var(--radius-md)] border-none text-[length:var(--text-caption1)] font-[var(--weight-semibold)] text-white cursor-pointer transition-opacity"
              style={{
                background: 'var(--accent)',
                opacity: form.name.trim() ? 1 : 0.5,
              }}
            >
              {initial ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TopicBrowserProps {
  topics: KanbanTopic[]
  tickets: KanbanTicket[]
  onCreateTopic: (data: Omit<KanbanTopic, 'id'>) => void
  onUpdateTopic: (id: string, data: Omit<KanbanTopic, 'id'>) => void
  onDeleteTopic: (id: string) => void
}

export function TopicBrowser({
  topics,
  tickets,
  onCreateTopic,
  onUpdateTopic,
  onDeleteTopic,
}: TopicBrowserProps) {
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [editingTopic, setEditingTopic] = useState<KanbanTopic | null | 'new'>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Ticket counts per topic
  const ticketCountByTopic = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tickets) {
      if (t.topicId) counts[t.topicId] = (counts[t.topicId] ?? 0) + 1
    }
    return counts
  }, [tickets])

  // All unique tags across topics
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    for (const t of topics) for (const tag of t.tags) tags.add(tag)
    return [...tags].sort()
  }, [topics])

  const filtered = useMemo(() => {
    return topics.filter((t) => {
      if (activeTag && !t.tags.includes(activeTag)) return false
      if (search) {
        const q = search.toLowerCase()
        return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      }
      return true
    })
  }, [topics, search, activeTag])

  function handleSave(data: Omit<KanbanTopic, 'id'>) {
    if (editingTopic === 'new') {
      onCreateTopic(data)
    } else if (editingTopic) {
      onUpdateTopic(editingTopic.id, data)
    }
    setEditingTopic(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] border-b border-[var(--separator)] shrink-0">
        <div className="flex items-center gap-[var(--space-2)] flex-1 bg-[var(--fill-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)]">
          <Search size={13} className="text-[var(--text-tertiary)] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search topics…"
            className="flex-1 bg-transparent border-none outline-none text-[length:var(--text-footnote)] text-[var(--text-primary)] font-[inherit] placeholder:text-[var(--text-tertiary)]"
          />
        </div>
        <button
          onClick={() => setEditingTopic('new')}
          className="flex items-center gap-[var(--space-1)] py-[var(--space-2)] px-[var(--space-3)] rounded-[var(--radius-md)] border-none bg-[var(--accent)] text-white text-[length:var(--text-caption1)] font-[var(--weight-semibold)] cursor-pointer shrink-0"
        >
          <Plus size={13} />
          New topic
        </button>
      </div>

      {/* Tag filter pills */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2)] border-b border-[var(--separator)] overflow-x-auto shrink-0">
          <Tag size={11} className="text-[var(--text-tertiary)] shrink-0" />
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className="text-[length:var(--text-caption2)] font-[var(--weight-medium)] py-px px-[var(--space-2)] rounded-full border transition-all duration-100 cursor-pointer shrink-0"
              style={{
                borderColor: activeTag === tag ? 'var(--accent)' : 'var(--separator)',
                background: activeTag === tag ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                color: activeTag === tag ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-[var(--space-4)]">
        {filtered.length === 0 && (
          <div className="py-[var(--space-12)] text-center text-[length:var(--text-footnote)] text-[var(--text-tertiary)]">
            {topics.length === 0 ? 'No topics yet. Create one to start grouping tickets.' : 'No topics match your filter.'}
          </div>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[var(--space-3)]">
          {filtered.map((topic) => {
            const count = ticketCountByTopic[topic.id] ?? 0
            return (
              <div
                key={topic.id}
                className="flex flex-col gap-[var(--space-3)] p-[var(--space-4)] rounded-[var(--radius-lg)] border bg-[var(--material-regular)] transition-shadow duration-150 group"
                style={{
                  borderColor: `color-mix(in srgb, ${topic.color} 30%, var(--separator))`,
                  borderLeft: `3px solid ${topic.color}`,
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-[var(--space-2)]">
                  <TopicBadge topic={topic} size="md" />
                  <div className="flex gap-[var(--space-1)] opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={() => setEditingTopic(topic)}
                      className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--fill-secondary)] border-none text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors"
                      title="Edit topic"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      onClick={() => setDeletingId(topic.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-[var(--fill-secondary)] border-none text-[var(--system-red)] cursor-pointer transition-colors"
                      title="Delete topic"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {/* Description */}
                {topic.description && (
                  <p className="text-[length:var(--text-caption1)] text-[var(--text-secondary)] leading-[1.4] m-0 line-clamp-2">
                    {topic.description}
                  </p>
                )}

                {/* Tags */}
                {topic.tags.length > 0 && (
                  <div className="flex gap-[var(--space-1)] flex-wrap">
                    {topic.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] bg-[var(--fill-secondary)] rounded-full px-[var(--space-2)] py-px"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-[var(--space-3)] text-[length:var(--text-caption2)] text-[var(--text-tertiary)] pt-[var(--space-1)] border-t border-[var(--separator)]">
                  <span>
                    <strong className="text-[var(--text-secondary)]">{count}</strong>{' '}
                    ticket{count !== 1 ? 's' : ''}
                  </span>
                  {topic.defaultPriority && (
                    <span
                      className="font-[var(--weight-medium)]"
                      style={{ color: PRIORITY_COLORS[topic.defaultPriority] }}
                    >
                      Default: {topic.defaultPriority}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modals */}
      {editingTopic !== null && (
        <TopicModal
          initial={editingTopic === 'new' ? undefined : editingTopic}
          onSave={handleSave}
          onClose={() => setEditingTopic(null)}
        />
      )}

      {deletingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
        >
          <div className="w-[360px] bg-[var(--bg)] border border-[var(--separator)] rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] p-[var(--space-5)] flex flex-col gap-[var(--space-4)]">
            <div>
              <h4 className="text-[length:var(--text-body)] font-bold text-[var(--text-primary)] m-0">
                Delete topic?
              </h4>
              <p className="text-[length:var(--text-footnote)] text-[var(--text-secondary)] mt-[var(--space-1)] m-0">
                Tickets with this topic will become untagged.
              </p>
            </div>
            <div className="flex gap-[var(--space-2)]">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--separator)] bg-transparent text-[length:var(--text-caption1)] font-[var(--weight-medium)] text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDeleteTopic(deletingId); setDeletingId(null) }}
                className="flex-1 py-[var(--space-2)] rounded-[var(--radius-md)] border-none bg-[var(--system-red)] text-[length:var(--text-caption1)] font-[var(--weight-semibold)] text-white cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
