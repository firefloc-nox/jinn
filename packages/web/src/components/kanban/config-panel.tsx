"use client"

import { useState, useCallback } from 'react'
import { Save, Plus, Trash2, GripVertical, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import type { KanbanConfig, KanbanColumn, KanbanTopic, TransitionRule } from '@/lib/kanban/types'
import { PRIORITY_COLORS } from '@/lib/kanban/types'

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type Tab = 'columns' | 'topics' | 'transitions'

// ---------------------------------------------------------------------------
// Columns editor
// ---------------------------------------------------------------------------

interface ColumnsEditorProps {
  columns: KanbanColumn[]
  onChange: (columns: KanbanColumn[]) => void
}

function ColumnsEditor({ columns, onChange }: ColumnsEditorProps) {
  function update(idx: number, patch: Partial<KanbanColumn>) {
    const next = columns.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    onChange(next)
  }

  function addColumn() {
    const next: KanbanColumn = {
      id: `col-${Date.now()}`,
      title: 'New Column',
      order: columns.length,
    }
    onChange([...columns, next])
  }

  function removeColumn(idx: number) {
    onChange(columns.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
        Columns define the workflow stages. Drag to reorder (coming soon).
      </div>

      <div className="flex flex-col gap-[var(--space-2)]">
        {columns.map((col, idx) => (
          <div
            key={col.id}
            className="flex items-center gap-[var(--space-2)] p-[var(--space-3)] bg-[var(--fill-tertiary)] rounded-[var(--radius-md)] border border-[var(--separator)]"
          >
            <GripVertical size={14} className="text-[var(--text-quaternary)] shrink-0 cursor-grab" />

            {/* Color swatch */}
            <input
              type="color"
              value={col.color ?? '#888888'}
              onChange={(e) => update(idx, { color: e.target.value })}
              className="w-6 h-6 rounded-[var(--radius-sm)] border border-[var(--separator)] cursor-pointer bg-transparent p-0 shrink-0"
              title="Column color"
            />

            {/* Title */}
            <input
              type="text"
              value={col.title}
              onChange={(e) => update(idx, { title: e.target.value })}
              placeholder="Column name"
              className="flex-1 bg-transparent border-none outline-none text-[length:var(--text-footnote)] text-[var(--text-primary)] font-[inherit] min-w-0"
            />

            {/* WIP limit */}
            <div className="flex items-center gap-[var(--space-1)] shrink-0">
              <span className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)]">WIP</span>
              <input
                type="number"
                min={0}
                value={col.wipLimit ?? ''}
                onChange={(e) => update(idx, { wipLimit: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="∞"
                className="w-12 text-center bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm)] text-[length:var(--text-caption2)] text-[var(--text-primary)] outline-none font-[inherit] py-px"
              />
            </div>

            <button
              onClick={() => removeColumn(idx)}
              disabled={columns.length <= 1}
              className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-transparent border-none text-[var(--system-red)] cursor-pointer transition-opacity"
              style={{ opacity: columns.length <= 1 ? 0.3 : 1 }}
              title="Remove column"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addColumn}
        className="flex items-center justify-center gap-[var(--space-2)] py-[var(--space-2)] rounded-[var(--radius-md)] border border-dashed border-[var(--separator)] bg-transparent text-[length:var(--text-caption1)] text-[var(--text-tertiary)] cursor-pointer hover:border-[var(--text-tertiary)] transition-colors"
      >
        <Plus size={13} />
        Add column
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Topics editor (quick list — full topic management is in TopicBrowser)
// ---------------------------------------------------------------------------

interface TopicsEditorProps {
  topics: KanbanTopic[]
  onChange: (topics: KanbanTopic[]) => void
}

function TopicsEditor({ topics, onChange }: TopicsEditorProps) {
  function update(idx: number, patch: Partial<KanbanTopic>) {
    onChange(topics.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }

  function addTopic() {
    const id = `topic-${Date.now()}`
    onChange([
      ...topics,
      { id, name: 'New Topic', description: '', color: '#6C8EFF', tags: [] },
    ])
  }

  function removeTopic(idx: number) {
    onChange(topics.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
        Topics group tickets semantically and provide context for agents. Full topic management is in the Topics page.
      </div>

      <div className="flex flex-col gap-[var(--space-2)]">
        {topics.map((topic, idx) => (
          <div
            key={topic.id}
            className="flex items-center gap-[var(--space-2)] p-[var(--space-3)] bg-[var(--fill-tertiary)] rounded-[var(--radius-md)] border border-[var(--separator)]"
          >
            <input
              type="color"
              value={topic.color}
              onChange={(e) => update(idx, { color: e.target.value })}
              className="w-6 h-6 rounded-full border-2 border-[var(--separator)] cursor-pointer bg-transparent p-0 shrink-0"
            />
            <input
              type="text"
              value={topic.name}
              onChange={(e) => update(idx, { name: e.target.value })}
              placeholder="Topic name"
              className="flex-1 bg-transparent border-none outline-none text-[length:var(--text-footnote)] text-[var(--text-primary)] font-[inherit] min-w-0"
            />
            <input
              type="text"
              value={topic.description}
              onChange={(e) => update(idx, { description: e.target.value })}
              placeholder="Description (optional)"
              className="flex-1 bg-transparent border-none outline-none text-[length:var(--text-caption1)] text-[var(--text-tertiary)] font-[inherit] min-w-0"
            />
            <button
              onClick={() => removeTopic(idx)}
              className="w-6 h-6 flex items-center justify-center rounded-[var(--radius-sm)] bg-transparent border-none text-[var(--system-red)] cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {topics.length === 0 && (
          <div className="text-center py-[var(--space-4)] text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
            No topics yet.
          </div>
        )}
      </div>

      <button
        onClick={addTopic}
        className="flex items-center justify-center gap-[var(--space-2)] py-[var(--space-2)] rounded-[var(--radius-md)] border border-dashed border-[var(--separator)] bg-transparent text-[length:var(--text-caption1)] text-[var(--text-tertiary)] cursor-pointer hover:border-[var(--text-tertiary)] transition-colors"
      >
        <Plus size={13} />
        Add topic
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transitions matrix
// ---------------------------------------------------------------------------

interface TransitionsEditorProps {
  columns: KanbanColumn[]
  transitions: TransitionRule[]
  onChange: (transitions: TransitionRule[]) => void
}

function TransitionsEditor({ columns, transitions, onChange }: TransitionsEditorProps) {
  function getRule(from: string, to: string): TransitionRule | undefined {
    return transitions.find((r) => r.from === from && r.to === to)
  }

  function toggleRule(from: string, to: string) {
    const existing = getRule(from, to)
    const currentAllowed = existing === undefined ? true : existing.allowed
    const next = transitions.filter((r) => !(r.from === from && r.to === to))
    onChange([...next, { from, to, allowed: !currentAllowed }])
  }

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
        Define which column-to-column moves are allowed. Green = allowed, red = blocked. Same-column moves are always allowed.
      </div>

      <div className="overflow-x-auto">
        <table className="border-collapse text-[length:var(--text-caption2)]" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr>
              <th className="text-left py-[var(--space-2)] pr-[var(--space-4)] text-[var(--text-tertiary)] font-[var(--weight-medium)] whitespace-nowrap">
                From ↓ / To →
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="py-[var(--space-2)] px-[var(--space-3)] text-[var(--text-secondary)] font-[var(--weight-medium)] whitespace-nowrap"
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((fromCol) => (
              <tr key={fromCol.id}>
                <td className="py-[var(--space-2)] pr-[var(--space-4)] text-[var(--text-secondary)] font-[var(--weight-medium)] whitespace-nowrap">
                  {fromCol.title}
                </td>
                {columns.map((toCol) => {
                  const isSame = fromCol.id === toCol.id
                  const rule = getRule(fromCol.id, toCol.id)
                  const isAllowed = isSame ? true : (rule === undefined ? true : rule.allowed)

                  return (
                    <td key={toCol.id} className="py-[var(--space-1)] px-[var(--space-3)] text-center">
                      {isSame ? (
                        <span className="text-[var(--text-quaternary)]">—</span>
                      ) : (
                        <button
                          onClick={() => toggleRule(fromCol.id, toCol.id)}
                          className="w-7 h-7 flex items-center justify-center mx-auto rounded-[var(--radius-sm)] border-none cursor-pointer transition-all duration-100"
                          style={{
                            background: isAllowed
                              ? 'color-mix(in srgb, var(--system-green) 12%, transparent)'
                              : 'color-mix(in srgb, var(--system-red) 12%, transparent)',
                          }}
                          title={`${fromCol.title} → ${toCol.title}: ${isAllowed ? 'Allowed (click to block)' : 'Blocked (click to allow)'}`}
                        >
                          {isAllowed ? (
                            <CheckCircle size={14} className="text-[var(--system-green)]" />
                          ) : (
                            <XCircle size={14} className="text-[var(--system-red)]" />
                          )}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-[var(--space-2)] text-[length:var(--text-caption2)] text-[var(--text-tertiary)]">
        <AlertCircle size={12} />
        <span>Cells without explicit rules default to <strong>allowed</strong>. Add a rule to block a transition.</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main KanbanConfigPanel
// ---------------------------------------------------------------------------

interface KanbanConfigPanelProps {
  config: KanbanConfig
  saving?: boolean
  saveError?: string | null
  onSave: (config: KanbanConfig) => void
}

export function KanbanConfigPanel({ config, saving, saveError, onSave }: KanbanConfigPanelProps) {
  const [tab, setTab] = useState<Tab>('columns')
  const [draft, setDraft] = useState<KanbanConfig>(config)
  const [dirty, setDirty] = useState(false)

  const update = useCallback(<K extends keyof KanbanConfig>(key: K, value: KanbanConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }, [])

  function handleSave() {
    onSave(draft)
    setDirty(false)
  }

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'columns', label: 'Columns', count: draft.columns.length },
    { id: 'topics', label: 'Topics', count: draft.topics.length },
    { id: 'transitions', label: 'Transitions' },
  ]

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--space-5)] py-[var(--space-4)] border-b border-[var(--separator)] shrink-0">
        <div>
          <h2 className="text-[length:var(--text-title3)] font-bold text-[var(--text-primary)] m-0">
            Board Configuration
          </h2>
          <p className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] m-0 mt-[2px]">
            Columns, topics, and transition rules
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-[var(--space-2)] py-[var(--space-2)] px-[var(--space-4)] rounded-[var(--radius-md)] border-none text-[length:var(--text-footnote)] font-[var(--weight-semibold)] transition-all duration-150 cursor-pointer"
          style={{
            background: dirty && !saving ? 'var(--accent)' : 'var(--fill-tertiary)',
            color: dirty && !saving ? '#fff' : 'var(--text-tertiary)',
          }}
        >
          <Save size={13} />
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {saveError && (
        <div className="px-[var(--space-5)] py-[var(--space-2)] bg-[color-mix(in_srgb,_var(--system-red)_10%,_transparent)] text-[var(--system-red)] text-[length:var(--text-caption1)] shrink-0">
          {saveError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[var(--separator)] px-[var(--space-5)] shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-[var(--space-1)] py-[var(--space-3)] px-[var(--space-4)] border-b-2 border-transparent text-[length:var(--text-footnote)] font-[var(--weight-medium)] cursor-pointer bg-transparent border-l-0 border-r-0 border-t-0 transition-colors duration-150"
            style={{
              color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottomColor: tab === t.id ? 'var(--accent)' : 'transparent',
            }}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="text-[length:var(--text-caption2)] bg-[var(--fill-secondary)] rounded-full px-[6px] py-px text-[var(--text-tertiary)]">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-[var(--space-5)] py-[var(--space-4)]">
        {tab === 'columns' && (
          <ColumnsEditor
            columns={draft.columns}
            onChange={(columns) => update('columns', columns)}
          />
        )}
        {tab === 'topics' && (
          <TopicsEditor
            topics={draft.topics}
            onChange={(topics) => update('topics', topics)}
          />
        )}
        {tab === 'transitions' && (
          <TransitionsEditor
            columns={draft.columns}
            transitions={draft.transitions}
            onChange={(transitions) => update('transitions', transitions)}
          />
        )}
      </div>
    </div>
  )
}
