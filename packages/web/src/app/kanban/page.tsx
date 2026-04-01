"use client"

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Trash2, Kanban, ChevronDown } from 'lucide-react'
import { api } from '@/lib/api'
import type { Employee } from '@/lib/api'
import type { BoardConfig, BoardCard, BoardColumn } from '@/lib/boards/types'
import { PageLayout } from '@/components/page-layout'

// ── Default columns for new boards ───────────────────────────────────────────
const DEFAULT_COLUMNS: Omit<BoardColumn, 'id'>[] = [
  { title: 'Backlog', color: 'var(--fill-secondary)', order: 0 },
  { title: 'To Do', color: 'var(--system-blue)', order: 1 },
  { title: 'In Progress', color: 'var(--system-orange)', order: 2 },
  { title: 'Review', color: 'var(--system-purple)', order: 3 },
  { title: 'Done', color: 'var(--system-green)', order: 4 },
]

// ── Priority badge ────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  low: 'var(--system-green)',
  medium: 'var(--system-orange)',
  high: 'var(--system-red)',
}

function PriorityBadge({ priority }: { priority?: string }) {
  if (!priority) return null
  return (
    <span
      style={{ background: `color-mix(in srgb, ${PRIORITY_COLORS[priority] ?? 'var(--fill-secondary)'} 15%, transparent)`, color: PRIORITY_COLORS[priority] ?? 'var(--text-secondary)', border: `1px solid color-mix(in srgb, ${PRIORITY_COLORS[priority] ?? 'var(--fill-secondary)'} 30%, transparent)` }}
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize leading-none"
    >
      {priority}
    </span>
  )
}

// ── WorkState dot ─────────────────────────────────────────────────────────────
function WorkStateDot({ state }: { state?: string }) {
  if (state === 'working') {
    return (
      <span className="inline-block w-2 h-2 rounded-full bg-[var(--system-orange)] animate-pulse shrink-0" title="Working" />
    )
  }
  if (state === 'done') {
    return <span className="inline-block w-2 h-2 rounded-full bg-[var(--system-green)] shrink-0" title="Done" />
  }
  if (state === 'failed') {
    return <span className="inline-block w-2 h-2 rounded-full bg-[var(--system-red)] shrink-0" title="Failed" />
  }
  return null
}

// ── Assignee avatar ───────────────────────────────────────────────────────────
function AssigneeAvatar({ employee }: { employee?: Employee }) {
  if (!employee) return null
  const initials = employee.displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold shrink-0"
      title={employee.displayName}
    >
      {initials}
    </span>
  )
}

// ── Card component ────────────────────────────────────────────────────────────
function KanbanCard({
  card,
  employee,
  onClick,
  onDragStart,
}: {
  card: BoardCard
  employee?: Employee
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="bg-[var(--bg)] border border-[var(--separator)] rounded-[var(--radius-md)] p-3 cursor-pointer hover:border-[var(--accent)] transition-colors shadow-sm group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[length:var(--text-footnote)] font-medium text-[var(--text-primary)] leading-snug flex-1 min-w-0">
          {card.title}
        </p>
        <WorkStateDot state={card.workState} />
      </div>
      {card.description && (
        <p className="text-[10px] text-[var(--text-tertiary)] mb-2 line-clamp-2 leading-snug">
          {card.description}
        </p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        <PriorityBadge priority={card.priority} />
        {employee && (
          <div className="flex items-center gap-1 ml-auto">
            <AssigneeAvatar employee={employee} />
            <span className="text-[10px] text-[var(--text-secondary)]">{employee.displayName}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Column component ──────────────────────────────────────────────────────────
function KanbanColumnView({
  column,
  cards,
  employees,
  boardId,
  onCardClick,
  onCardMove,
  onCardAdd,
  onColumnDelete,
  onColumnRename,
}: {
  column: BoardColumn
  cards: BoardCard[]
  employees: Employee[]
  boardId: string
  onCardClick: (card: BoardCard) => void
  onCardMove: (cardId: string, colId: string) => void
  onCardAdd: (colId: string, title: string) => void
  onColumnDelete: (colId: string) => void
  onColumnRename: (colId: string, title: string) => void
}) {
  const [isOver, setIsOver] = useState(false)
  const [addingCard, setAddingCard] = useState(false)
  const [newCardTitle, setNewCardTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(column.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingCard && inputRef.current) inputRef.current.focus()
  }, [addingCard])

  useEffect(() => {
    if (editingTitle && titleInputRef.current) titleInputRef.current.focus()
  }, [editingTitle])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsOver(false)
    const cardId = e.dataTransfer.getData('cardId')
    if (cardId) onCardMove(cardId, column.id)
  }

  function handleAddCard() {
    const title = newCardTitle.trim()
    if (!title) { setAddingCard(false); return }
    onCardAdd(column.id, title)
    setNewCardTitle('')
    setAddingCard(false)
  }

  function handleRenameBlur() {
    setEditingTitle(false)
    const t = titleDraft.trim()
    if (t && t !== column.title) onColumnRename(column.id, t)
    else setTitleDraft(column.title)
  }

  const canDelete = cards.length === 0

  return (
    <div
      className={`flex flex-col w-[260px] shrink-0 rounded-[var(--radius-lg)] bg-[var(--fill-tertiary)] border transition-colors ${isOver ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_5%,var(--fill-tertiary))]' : 'border-[var(--separator)]'}`}
      onDragOver={(e) => { e.preventDefault(); setIsOver(true) }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--separator)]">
        {column.color && (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: column.color }} />
        )}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleRenameBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameBlur(); if (e.key === 'Escape') { setTitleDraft(column.title); setEditingTitle(false) } }}
            className="flex-1 bg-[var(--bg)] border border-[var(--accent)] rounded px-1.5 py-0.5 text-[length:var(--text-footnote)] font-semibold text-[var(--text-primary)] outline-none"
          />
        ) : (
          <span
            className="flex-1 text-[length:var(--text-footnote)] font-semibold text-[var(--text-primary)] cursor-pointer select-none"
            onDoubleClick={() => setEditingTitle(true)}
            title="Double-click to rename"
          >
            {column.title}
          </span>
        )}
        <span className="text-[10px] text-[var(--text-tertiary)] font-medium bg-[var(--fill-secondary)] px-1.5 py-0.5 rounded-full">
          {cards.length}
        </span>
        {canDelete && (
          <button
            onClick={() => onColumnDelete(column.id)}
            className="text-[var(--text-tertiary)] hover:text-[var(--system-red)] transition-colors opacity-0 group-hover:opacity-100 ml-auto"
            title="Delete column"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 flex-1 min-h-[40px]">
        {cards.map((card) => {
          const emp = card.assigneeId ? employees.find((e) => e.name === card.assigneeId) : undefined
          return (
            <KanbanCard
              key={card.id}
              card={card}
              employee={emp}
              onClick={() => onCardClick(card)}
              onDragStart={(e) => { e.dataTransfer.setData('cardId', card.id) }}
            />
          )
        })}
      </div>

      {/* Add card */}
      <div className="p-2 pt-0">
        {addingCard ? (
          <div className="bg-[var(--bg)] border border-[var(--accent)] rounded-[var(--radius-md)] p-2">
            <input
              ref={inputRef}
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCard(); if (e.key === 'Escape') { setAddingCard(false); setNewCardTitle('') } }}
              placeholder="Card title..."
              className="w-full bg-transparent border-none outline-none text-[length:var(--text-footnote)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            />
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={handleAddCard}
                className="px-2 py-1 rounded bg-[var(--accent)] text-white text-[10px] font-semibold border-none cursor-pointer"
              >
                Add
              </button>
              <button
                onClick={() => { setAddingCard(false); setNewCardTitle('') }}
                className="px-2 py-1 rounded bg-[var(--fill-secondary)] text-[var(--text-secondary)] text-[10px] font-semibold border-none cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingCard(true)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[length:var(--text-caption1)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--fill-secondary)] border-none bg-transparent cursor-pointer transition-colors"
          >
            <Plus size={13} />
            Add Card
          </button>
        )}
      </div>
    </div>
  )
}

// ── Card detail drawer ────────────────────────────────────────────────────────
function CardDetailDrawer({
  card,
  employees,
  boardId,
  onClose,
  onUpdate,
  onDelete,
}: {
  card: BoardCard
  employees: Employee[]
  boardId: string
  onClose: () => void
  onUpdate: (data: Partial<BoardCard>) => void
  onDelete: () => void
}) {
  const [titleDraft, setTitleDraft] = useState(card.title)
  const [descDraft, setDescDraft] = useState(card.description ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await api.patchBoardCard(boardId, card.id, { title: titleDraft.trim(), description: descDraft })
      onUpdate({ title: titleDraft.trim(), description: descDraft })
    } finally {
      setSaving(false)
    }
  }

  async function handleAssigneeChange(assigneeId: string) {
    await api.patchBoardCard(boardId, card.id, { assigneeId: assigneeId || undefined })
    onUpdate({ assigneeId: assigneeId || undefined })
  }

  async function handlePriorityChange(priority: string) {
    await api.patchBoardCard(boardId, card.id, { priority: priority as BoardCard['priority'] })
    onUpdate({ priority: priority as BoardCard['priority'] })
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 lg:bg-transparent" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[380px] bg-[var(--bg)] border-l border-[var(--separator)] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--separator)]">
          <h3 className="text-[length:var(--text-body)] font-semibold text-[var(--text-primary)]">Card Detail</h3>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors text-xl leading-none border-none bg-transparent cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Title</label>
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="w-full bg-[var(--fill-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-body)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Description</label>
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              rows={4}
              placeholder="Add a description..."
              className="w-full bg-[var(--fill-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-footnote)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          {/* Assignee */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Assignee</label>
            <div className="relative">
              <select
                value={card.assigneeId ?? ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className="w-full appearance-none bg-[var(--fill-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-footnote)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer pr-8"
              >
                <option value="">Unassigned</option>
                {employees.map((emp) => (
                  <option key={emp.name} value={emp.name}>{emp.displayName}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
            </div>
          </div>

          {/* Priority */}
          <div>
            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Priority</label>
            <div className="relative">
              <select
                value={card.priority ?? ''}
                onChange={(e) => handlePriorityChange(e.target.value)}
                className="w-full appearance-none bg-[var(--fill-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-footnote)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer pr-8"
              >
                <option value="">No priority</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
            </div>
          </div>

          {/* WorkState */}
          {card.workState && card.workState !== 'idle' && (
            <div className="flex items-center gap-2 p-2 rounded bg-[var(--fill-secondary)]">
              <WorkStateDot state={card.workState} />
              <span className="text-[length:var(--text-caption1)] text-[var(--text-secondary)] capitalize">{card.workState}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--separator)]">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[var(--system-red)] border border-[color-mix(in_srgb,var(--system-red)_30%,transparent)] bg-transparent text-[length:var(--text-footnote)] font-medium cursor-pointer hover:bg-[color-mix(in_srgb,var(--system-red)_10%,transparent)] transition-colors"
          >
            <Trash2 size={13} />
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white border-none text-[length:var(--text-footnote)] font-semibold cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Create Board Modal ────────────────────────────────────────────────────────
function CreateBoardModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (config: BoardConfig) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [columns, setColumns] = useState<Array<{ title: string; color?: string }>>(
    DEFAULT_COLUMNS.map((c) => ({ title: c.title, color: c.color }))
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateColumnTitle(i: number, title: string) {
    setColumns((prev) => prev.map((c, idx) => idx === i ? { ...c, title } : c))
  }

  function removeColumn(i: number) {
    setColumns((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addColumn() {
    setColumns((prev) => [...prev, { title: 'New Column' }])
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Board name is required'); return }
    setLoading(true)
    setError(null)
    try {
      const board = await api.createBoard({
        name: name.trim(),
        description: description.trim() || undefined,
        columns: columns.filter((c) => c.title.trim()).map((c, i) => ({
          id: `col-${i}-${Date.now()}`,
          title: c.title.trim(),
          color: c.color,
          order: i,
        })),
      })
      onCreate(board)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create board')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-[var(--bg)] border border-[var(--separator)] rounded-[var(--radius-lg)] shadow-2xl w-full max-w-[480px] flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--separator)]">
            <h2 className="text-[length:var(--text-title3)] font-bold text-[var(--text-primary)]">Create Board</h2>
            <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xl leading-none border-none bg-transparent cursor-pointer">×</button>
          </div>

          <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[60vh]">
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Board Name *</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                placeholder="e.g. Engineering Sprint"
                className="w-full bg-[var(--fill-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-body)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full bg-[var(--fill-tertiary)] border border-[var(--separator)] rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-footnote)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Columns</label>
                <button
                  onClick={addColumn}
                  className="text-[10px] text-[var(--accent)] border-none bg-transparent cursor-pointer font-semibold flex items-center gap-0.5"
                >
                  <Plus size={10} /> Add
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {columns.map((col, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={col.title}
                      onChange={(e) => updateColumnTitle(i, e.target.value)}
                      className="flex-1 bg-[var(--fill-tertiary)] border border-[var(--separator)] rounded px-2 py-1 text-[length:var(--text-footnote)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      onClick={() => removeColumn(i)}
                      className="text-[var(--text-tertiary)] hover:text-[var(--system-red)] border-none bg-transparent cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-[length:var(--text-caption1)] text-[var(--system-red)]">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--separator)]">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-[var(--radius-md)] border border-[var(--separator)] bg-transparent text-[var(--text-secondary)] text-[length:var(--text-footnote)] font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="px-4 py-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] text-white border-none text-[length:var(--text-footnote)] font-semibold cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Board'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function KanbanPage() {
  const [boards, setBoards] = useState<BoardConfig[]>([])
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [boardConfig, setBoardConfig] = useState<BoardConfig | null>(null)
  const [cards, setCards] = useState<BoardCard[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [boardLoading, setBoardLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedCard, setSelectedCard] = useState<BoardCard | null>(null)
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null)
  const [filterPriority, setFilterPriority] = useState<string | null>(null)
  const [editingBoardName, setEditingBoardName] = useState(false)
  const [boardNameDraft, setBoardNameDraft] = useState('')
  const boardNameInputRef = useRef<HTMLInputElement>(null)

  // Load boards list + employees on mount
  useEffect(() => {
    Promise.all([api.listBoards(), api.getOrg()])
      .then(([boardList, orgData]) => {
        setBoards(boardList)
        setEmployees(orgData.employees)
        if (boardList.length > 0) setActiveBoardId(boardList[0].id)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Load board details when activeBoardId changes
  useEffect(() => {
    if (!activeBoardId) return
    setBoardLoading(true)
    api.getBoard(activeBoardId)
      .then(({ config, cards: boardCards }) => {
        setBoardConfig(config)
        setCards(boardCards)
        setBoardNameDraft(config.name)
      })
      .catch((e) => setError(e.message))
      .finally(() => setBoardLoading(false))
  }, [activeBoardId])

  useEffect(() => {
    if (editingBoardName && boardNameInputRef.current) boardNameInputRef.current.focus()
  }, [editingBoardName])

  // ── Board selection ──
  function selectBoard(id: string) {
    setActiveBoardId(id)
    setSelectedCard(null)
    setFilterAssignee(null)
    setFilterPriority(null)
  }

  // ── Delete board ──
  async function handleDeleteBoard(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this board? This cannot be undone.')) return
    await api.deleteBoard(id)
    const updated = boards.filter((b) => b.id !== id)
    setBoards(updated)
    if (activeBoardId === id) {
      setActiveBoardId(updated.length > 0 ? updated[0].id : null)
      setBoardConfig(null)
      setCards([])
    }
  }

  // ── Create board ──
  function handleBoardCreated(config: BoardConfig) {
    setBoards((prev) => [...prev, config])
    setActiveBoardId(config.id)
    setShowCreateModal(false)
  }

  // ── Rename board ──
  async function handleBoardNameBlur() {
    setEditingBoardName(false)
    const name = boardNameDraft.trim()
    if (!name || !boardConfig || name === boardConfig.name) return
    const updated = await api.updateBoard(boardConfig.id, { name })
    setBoardConfig(updated)
    setBoards((prev) => prev.map((b) => b.id === updated.id ? { ...b, name: updated.name } : b))
  }

  // ── Move card (drag & drop) ──
  async function handleCardMove(cardId: string, colId: string) {
    setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, columnId: colId } : c))
    if (activeBoardId) {
      await api.patchBoardCard(activeBoardId, cardId, { columnId: colId })
    }
  }

  // ── Add card ──
  async function handleCardAdd(colId: string, title: string) {
    if (!activeBoardId) return
    const card = await api.createBoardCard(activeBoardId, { title, columnId: colId })
    setCards((prev) => [...prev, card])
  }

  // ── Delete card ──
  async function handleCardDelete(cardId: string) {
    if (!activeBoardId) return
    await api.deleteBoardCard(activeBoardId, cardId)
    setCards((prev) => prev.filter((c) => c.id !== cardId))
    setSelectedCard(null)
  }

  // ── Update card locally after patch ──
  function handleCardUpdate(cardId: string, data: Partial<BoardCard>) {
    setCards((prev) => prev.map((c) => c.id === cardId ? { ...c, ...data } : c))
    if (selectedCard?.id === cardId) setSelectedCard((prev) => prev ? { ...prev, ...data } : prev)
  }

  // ── Add column ──
  async function handleAddColumn() {
    if (!activeBoardId) return
    const title = prompt('Column title:')?.trim()
    if (!title) return
    const updated = await api.addColumn(activeBoardId, { title })
    setBoardConfig(updated)
  }

  // ── Delete column ──
  async function handleColumnDelete(colId: string) {
    if (!activeBoardId) return
    const updated = await api.deleteColumn(activeBoardId, colId)
    setBoardConfig(updated)
  }

  // ── Rename column ──
  async function handleColumnRename(colId: string, title: string) {
    if (!activeBoardId) return
    const updated = await api.updateColumn(activeBoardId, colId, { title })
    setBoardConfig(updated)
  }

  // ── Filtered cards ──
  const filteredCards = cards.filter((c) => {
    if (filterAssignee && c.assigneeId !== filterAssignee) return false
    if (filterPriority && c.priority !== filterPriority) return false
    return true
  })

  const sortedColumns = boardConfig
    ? [...boardConfig.columns].sort((a, b) => a.order - b.order)
    : []

  // Assignees present on this board
  const boardAssignees = employees.filter((e) =>
    cards.some((c) => c.assigneeId === e.name)
  )

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-[length:var(--text-caption1)]">
          Loading…
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-[var(--system-red)] text-[length:var(--text-body)]">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded bg-[var(--accent)] text-white border-none cursor-pointer text-[length:var(--text-footnote)] font-semibold"
          >
            Retry
          </button>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="flex h-full overflow-hidden bg-[var(--bg)]">
        {/* ── Sidebar ── */}
        <aside className="w-[220px] shrink-0 border-r border-[var(--separator)] flex flex-col bg-[var(--fill-tertiary)]">
          <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--separator)]">
            <span className="text-[length:var(--text-footnote)] font-bold text-[var(--text-primary)] uppercase tracking-wider">Boards</span>
            <button
              onClick={() => setShowCreateModal(true)}
              className="w-6 h-6 rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--accent)] text-white border-none cursor-pointer hover:opacity-90"
              title="Create board"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {boards.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-[var(--text-tertiary)] mb-2">No boards yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="text-[10px] text-[var(--accent)] border-none bg-transparent cursor-pointer font-semibold"
                >
                  Create your first board
                </button>
              </div>
            ) : (
              boards.map((board) => {
                const isActive = board.id === activeBoardId
                return (
                  <div
                    key={board.id}
                    onClick={() => selectBoard(board.id)}
                    className={`group flex items-center gap-2 px-3 py-2 mx-1 rounded-[var(--radius-md)] cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--fill-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Kanban size={14} className="shrink-0" />
                    <span className="flex-1 text-[length:var(--text-caption1)] font-medium truncate">{board.name}</span>
                    <button
                      onClick={(e) => handleDeleteBoard(board.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--system-red)] transition-all border-none bg-transparent cursor-pointer p-0"
                      title="Delete board"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* ── Main board area ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!activeBoardId || !boardConfig ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--fill-secondary)] flex items-center justify-center">
                <Kanban size={32} className="text-[var(--text-tertiary)]" />
              </div>
              <div className="text-center">
                <p className="text-[length:var(--text-title3)] font-bold text-[var(--text-primary)] mb-1">No board selected</p>
                <p className="text-[length:var(--text-footnote)] text-[var(--text-tertiary)]">Create your first board to get started</p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white border-none cursor-pointer text-[length:var(--text-footnote)] font-semibold"
              >
                <Plus size={16} />
                Create Board
              </button>
            </div>
          ) : (
            <>
              {/* Board header */}
              <div className="px-5 py-3 border-b border-[var(--separator)] shrink-0 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {editingBoardName ? (
                    <input
                      ref={boardNameInputRef}
                      value={boardNameDraft}
                      onChange={(e) => setBoardNameDraft(e.target.value)}
                      onBlur={handleBoardNameBlur}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleBoardNameBlur(); if (e.key === 'Escape') { setEditingBoardName(false); setBoardNameDraft(boardConfig.name) } }}
                      className="text-[length:var(--text-title2)] font-bold text-[var(--text-primary)] bg-transparent border-b-2 border-[var(--accent)] outline-none w-full"
                    />
                  ) : (
                    <h1
                      className="text-[length:var(--text-title2)] font-bold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] transition-colors m-0 truncate"
                      onClick={() => setEditingBoardName(true)}
                      title="Click to rename"
                    >
                      {boardConfig.name}
                    </h1>
                  )}
                  {boardConfig.description && (
                    <p className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] mt-0.5">{boardConfig.description}</p>
                  )}
                </div>
                <button
                  onClick={handleAddColumn}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--fill-secondary)] border border-[var(--separator)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--fill-tertiary)] text-[length:var(--text-caption1)] font-medium cursor-pointer transition-colors shrink-0"
                >
                  <Plus size={13} />
                  Add Column
                </button>
              </div>

              {/* Filter bar */}
              {(boardAssignees.length > 0 || cards.some((c) => c.priority)) && (
                <div className="flex items-center gap-2 px-5 py-2 border-b border-[var(--separator)] overflow-x-auto shrink-0 bg-[var(--fill-tertiary)]">
                  <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 font-medium">Filter:</span>
                  {boardAssignees.map((emp) => (
                    <button
                      key={emp.name}
                      onClick={() => setFilterAssignee(filterAssignee === emp.name ? null : emp.name)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full border-none text-[10px] font-semibold cursor-pointer shrink-0 ${
                        filterAssignee === emp.name
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--fill-secondary)] text-[var(--text-secondary)] hover:bg-[var(--fill-tertiary)]'
                      }`}
                    >
                      {emp.displayName}
                    </button>
                  ))}
                  {(['high', 'medium', 'low'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setFilterPriority(filterPriority === p ? null : p)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full border-none text-[10px] font-semibold cursor-pointer shrink-0 capitalize ${
                        filterPriority === p
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--fill-secondary)] text-[var(--text-secondary)] hover:bg-[var(--fill-tertiary)]'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  {(filterAssignee || filterPriority) && (
                    <button
                      onClick={() => { setFilterAssignee(null); setFilterPriority(null) }}
                      className="px-2 py-0.5 rounded-full border-none text-[10px] font-semibold cursor-pointer shrink-0 bg-[color-mix(in_srgb,var(--system-red)_15%,transparent)] text-[var(--system-red)]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {/* Columns area */}
              {boardLoading ? (
                <div className="flex items-center justify-center flex-1 text-[var(--text-tertiary)] text-[length:var(--text-caption1)]">
                  Loading board…
                </div>
              ) : (
                <div className="flex-1 overflow-x-auto overflow-y-hidden">
                  <div className="flex gap-3 p-4 h-full items-start">
                    {sortedColumns.map((col) => {
                      const colCards = filteredCards
                        .filter((c) => c.columnId === col.id)
                      return (
                        <KanbanColumnView
                          key={col.id}
                          column={col}
                          cards={colCards}
                          employees={employees}
                          boardId={activeBoardId}
                          onCardClick={setSelectedCard}
                          onCardMove={handleCardMove}
                          onCardAdd={handleCardAdd}
                          onColumnDelete={handleColumnDelete}
                          onColumnRename={handleColumnRename}
                        />
                      )
                    })}

                    {/* Add column placeholder */}
                    <button
                      onClick={handleAddColumn}
                      className="w-[260px] shrink-0 flex items-center justify-center gap-2 h-14 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--separator)] text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)] bg-transparent cursor-pointer transition-colors text-[length:var(--text-footnote)] font-medium"
                    >
                      <Plus size={16} />
                      Add Column
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Card detail drawer ── */}
        {selectedCard && boardConfig && (
          <CardDetailDrawer
            card={selectedCard}
            employees={employees}
            boardId={boardConfig.id}
            onClose={() => setSelectedCard(null)}
            onUpdate={(data) => handleCardUpdate(selectedCard.id, data)}
            onDelete={() => handleCardDelete(selectedCard.id)}
          />
        )}

        {/* ── Create board modal ── */}
        {showCreateModal && (
          <CreateBoardModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleBoardCreated}
          />
        )}
      </div>
    </PageLayout>
  )
}
