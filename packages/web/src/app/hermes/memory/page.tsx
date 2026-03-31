"use client"

import { useState } from "react"
import { PageLayout } from "@/components/page-layout"
import { useHermesMemory } from "@/hooks/use-hermes"
import { cn } from "@/lib/utils"
import { Plus, Trash2, AlertTriangle } from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse usage like "45%" or "1200/2200 chars" → a 0–100 number */
function parseUsagePct(usage: string): number {
  const pct = usage.match(/^(\d+(?:\.\d+)?)%/)
  if (pct) return parseFloat(pct[1])
  const chars = usage.match(/(\d+)\s*\/\s*(\d+)/)
  if (chars) return Math.min(100, (parseInt(chars[1]) / parseInt(chars[2])) * 100)
  return 0
}

// ---------------------------------------------------------------------------
// Usage bar
// ---------------------------------------------------------------------------

function UsageBar({ usage }: { usage: string }) {
  const pct = parseUsagePct(usage)
  const isWarning = pct >= 80
  const isCritical = pct >= 100

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--fill-tertiary)] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            isCritical
              ? "bg-[var(--system-red)]"
              : isWarning
                ? "bg-[var(--system-orange)]"
                : "bg-[var(--system-green)]"
          )}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span
        className={cn(
          "text-[length:var(--text-caption1)] tabular-nums shrink-0",
          isCritical
            ? "text-[var(--system-red)]"
            : isWarning
              ? "text-[var(--system-orange)]"
              : "text-[var(--text-tertiary)]"
        )}
      >
        {usage}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  onDelete,
  deleting,
}: {
  entry: string
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className="group flex items-start gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--fill-tertiary)]">
      <span className="flex-1 text-[length:var(--text-footnote)] text-[var(--text-primary)] leading-relaxed break-words min-w-0">
        {entry}
      </span>
      <button
        onClick={onDelete}
        disabled={deleting}
        aria-label="Delete entry"
        className={cn(
          "shrink-0 mt-0.5 size-6 inline-flex items-center justify-center rounded-md",
          "text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100",
          "transition-all hover:bg-[var(--fill-secondary)] hover:text-[var(--system-red)]",
          "disabled:pointer-events-none disabled:opacity-30"
        )}
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add entry form (inline textarea)
// ---------------------------------------------------------------------------

function AddEntryForm({
  onAdd,
  adding,
  onCancel,
}: {
  onAdd: (text: string) => Promise<void>
  adding: boolean
  onCancel: () => void
}) {
  const [value, setValue] = useState("")

  async function handleSubmit() {
    const v = value.trim()
    if (!v) return
    await onAdd(v)
    setValue("")
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--separator)] bg-[var(--fill-tertiary)] p-3 flex flex-col gap-2">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="New memory entry…"
        rows={3}
        className={cn(
          "w-full resize-none rounded-lg bg-transparent",
          "text-[length:var(--text-footnote)] text-[var(--text-primary)]",
          "placeholder:text-[var(--text-tertiary)] outline-none"
        )}
      />
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-3 py-1 text-[length:var(--text-footnote)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)]"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={adding || !value.trim()}
          className={cn(
            "rounded-lg px-3 py-1 text-[length:var(--text-footnote)] font-medium transition-colors",
            "bg-[var(--accent)] text-white hover:opacity-90",
            "disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Memory column
// ---------------------------------------------------------------------------

function MemoryColumn({
  title,
  entries,
  usage,
  target,
  update,
}: {
  title: string
  entries: string[]
  usage: string
  target: "memory" | "user"
  update: (
    target: "memory" | "user",
    action: "add" | "replace" | "remove",
    content: string,
    oldText?: string
  ) => Promise<unknown>
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null)

  async function handleAdd(text: string) {
    setAdding(true)
    try {
      await update(target, "add", text)
      setShowAdd(false)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(entry: string, idx: number) {
    setDeletingIdx(idx)
    try {
      await update(target, "remove", "", entry)
    } finally {
      setDeletingIdx(null)
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* Column header */}
      <div className="shrink-0 border-b border-[var(--separator)] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[length:var(--text-subheadline)] font-semibold text-[var(--text-primary)]">
            {title}
          </span>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2.5 py-1",
              "text-[length:var(--text-caption1)] font-medium transition-colors",
              showAdd
                ? "bg-[var(--fill-secondary)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--fill-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            <Plus size={12} />
            Add
          </button>
        </div>
        <UsageBar usage={usage} />
      </div>

      {/* Entries */}
      <div className="flex-1 overflow-y-auto px-1 py-2">
        {showAdd && (
          <div className="px-3 mb-2">
            <AddEntryForm
              onAdd={handleAdd}
              adding={adding}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}

        {entries.length === 0 && !showAdd && (
          <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
            No entries
          </div>
        )}

        {entries.map((entry, idx) => (
          <EntryRow
            key={idx}
            entry={entry}
            onDelete={() => handleDelete(entry, idx)}
            deleting={deletingIdx === idx}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HermesMemoryPage() {
  const { memory, loading, unavailable, update } = useHermesMemory()

  return (
    <PageLayout>
      <div className="flex h-full flex-col">
        {/* Page header */}
        <div className="flex h-12 shrink-0 items-center border-b border-[var(--separator)] bg-[var(--bg-secondary)] px-4">
          <span className="text-[length:var(--text-title3)] font-semibold text-[var(--text-primary)]">
            Memory
          </span>
        </div>

        {/* Unavailable banner */}
        {unavailable && (
          <div className="shrink-0 mx-4 mt-4 flex items-center gap-2 rounded-xl border border-[var(--system-orange)] bg-[color-mix(in_srgb,var(--system-orange)_10%,transparent)] px-4 py-3 text-[length:var(--text-footnote)]">
            <AlertTriangle size={14} className="shrink-0 text-[var(--system-orange)]" />
            <span className="text-[var(--system-orange)] font-semibold">Hermes WebAPI unavailable</span>
            <span className="text-[var(--text-secondary)]">— memory cannot be loaded.</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-1 items-center justify-center text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
            Loading…
          </div>
        )}

        {/* Two-column layout */}
        {!loading && memory && (
          <div className="flex flex-1 min-h-0 divide-x divide-[var(--separator)]">
            {/* Agent memory */}
            <div className="flex-1 min-w-0">
              <MemoryColumn
                title="Agent Memory"
                entries={memory.memory.entries}
                usage={memory.memory.usage}
                target="memory"
                update={update}
              />
            </div>

            {/* User profile */}
            <div className="flex-1 min-w-0">
              <MemoryColumn
                title="User Profile"
                entries={memory.user.entries}
                usage={memory.user.usage}
                target="user"
                update={update}
              />
            </div>
          </div>
        )}

        {/* Empty state when no data and not loading and not unavailable */}
        {!loading && !memory && !unavailable && (
          <div className="flex flex-1 items-center justify-center text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
            No memory data
          </div>
        )}
      </div>
    </PageLayout>
  )
}
