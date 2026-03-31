"use client"

import { useState, useRef } from "react"
import { PageLayout } from "@/components/page-layout"
import { useHermesMemory } from "@/hooks/use-hermes"
import { cn } from "@/lib/utils"
import {
  Plus,
  Trash2,
  AlertTriangle,
  Pencil,
  Check,
  X,
  Upload,
  Download,
  Loader2,
} from "lucide-react"

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
// Diff preview (delete confirmation)
// ---------------------------------------------------------------------------

function DiffPreview({
  entry,
  onConfirm,
  onCancel,
  loading,
}: {
  entry: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="mt-1 rounded-lg border border-[color-mix(in_srgb,var(--system-red)_30%,transparent)] bg-[color-mix(in_srgb,var(--system-red)_6%,transparent)] p-3">
      <p className="text-[length:var(--text-caption1)] text-[var(--system-red)] font-medium mb-1.5">
        Will be removed:
      </p>
      <p className="text-[length:var(--text-caption1)] text-[var(--text-secondary)] line-through opacity-70 break-words leading-relaxed">
        {entry}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="rounded-md px-2.5 py-1 text-[length:var(--text-caption1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1",
            "text-[length:var(--text-caption1)] font-medium text-white",
            "bg-[var(--system-red)] transition-opacity hover:opacity-90",
            "disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          Delete
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Edit form (inline)
// ---------------------------------------------------------------------------

function EditForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: string
  onSave: (newText: string) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [value, setValue] = useState(initial)

  async function handleSave() {
    const v = value.trim()
    if (!v || v === initial.trim()) {
      onCancel()
      return
    }
    await onSave(v)
  }

  return (
    <div className="mt-1 rounded-lg border border-[var(--accent)] bg-[var(--fill-tertiary)] p-2 flex flex-col gap-2">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={Math.max(2, value.split("\n").length)}
        className={cn(
          "w-full resize-none rounded-md bg-transparent",
          "text-[length:var(--text-footnote)] text-[var(--text-primary)]",
          "outline-none leading-relaxed"
        )}
      />
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-md px-2.5 py-1 text-[length:var(--text-caption1)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !value.trim()}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1",
            "text-[length:var(--text-caption1)] font-medium text-white",
            "bg-[var(--accent)] transition-opacity hover:opacity-90",
            "disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
          Save
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Entry row — with edit + diff-delete
// ---------------------------------------------------------------------------

type EntryState =
  | { mode: "idle" }
  | { mode: "editing" }
  | { mode: "confirming-delete" }

function EntryRow({
  entry,
  onDelete,
  onEdit,
  mutating,
}: {
  entry: string
  onDelete: () => Promise<void>
  onEdit: (newText: string) => Promise<void>
  mutating: boolean
}) {
  const [state, setState] = useState<EntryState>({ mode: "idle" })
  const [actionLoading, setActionLoading] = useState(false)

  async function handleDeleteConfirm() {
    setActionLoading(true)
    try {
      await onDelete()
    } finally {
      setActionLoading(false)
      setState({ mode: "idle" })
    }
  }

  async function handleEditSave(newText: string) {
    setActionLoading(true)
    try {
      await onEdit(newText)
      setState({ mode: "idle" })
    } finally {
      setActionLoading(false)
    }
  }

  const isIdle = state.mode === "idle"

  return (
    <div className="group rounded-lg px-3 py-2 transition-colors hover:bg-[var(--fill-tertiary)]">
      <div className="flex items-start gap-2">
        <span className="flex-1 text-[length:var(--text-footnote)] text-[var(--text-primary)] leading-relaxed break-words min-w-0">
          {entry}
        </span>
        {/* Action icons — show on hover when idle */}
        {isIdle && !mutating && (
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
            <button
              onClick={() => setState({ mode: "editing" })}
              aria-label="Edit entry"
              className="size-6 inline-flex items-center justify-center rounded-md text-[var(--text-tertiary)] transition-all hover:bg-[var(--fill-secondary)] hover:text-[var(--accent)]"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={() => setState({ mode: "confirming-delete" })}
              aria-label="Delete entry"
              className="size-6 inline-flex items-center justify-center rounded-md text-[var(--text-tertiary)] transition-all hover:bg-[var(--fill-secondary)] hover:text-[var(--system-red)]"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
        {/* Auto-save spinner */}
        {mutating && (
          <Loader2 size={13} className="shrink-0 mt-0.5 animate-spin text-[var(--text-tertiary)]" />
        )}
        {/* Close button when editing / confirming */}
        {!isIdle && (
          <button
            onClick={() => setState({ mode: "idle" })}
            aria-label="Cancel"
            className="shrink-0 mt-0.5 size-6 inline-flex items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill-secondary)]"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Edit form */}
      {state.mode === "editing" && (
        <EditForm
          initial={entry}
          onSave={handleEditSave}
          onCancel={() => setState({ mode: "idle" })}
          saving={actionLoading}
        />
      )}

      {/* Delete confirmation */}
      {state.mode === "confirming-delete" && (
        <DiffPreview
          entry={entry}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setState({ mode: "idle" })}
          loading={actionLoading}
        />
      )}
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
            "inline-flex items-center gap-1 rounded-lg px-3 py-1 text-[length:var(--text-footnote)] font-medium transition-colors",
            "bg-[var(--accent)] text-white hover:opacity-90",
            "disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          {adding ? <Loader2 size={12} className="animate-spin" /> : null}
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
  globalMutating,
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
  globalMutating: boolean
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [mutatingIdx, setMutatingIdx] = useState<number | null>(null)

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
    setMutatingIdx(idx)
    try {
      await update(target, "remove", "", entry)
    } finally {
      setMutatingIdx(null)
    }
  }

  async function handleEdit(entry: string, idx: number, newText: string) {
    setMutatingIdx(idx)
    try {
      await update(target, "replace", newText, entry)
    } finally {
      setMutatingIdx(null)
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* Column header */}
      <div className="shrink-0 border-b border-[var(--separator)] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--text-subheadline)] font-semibold text-[var(--text-primary)]">
              {title}
            </span>
            {/* Global mutating spinner */}
            {globalMutating && (
              <Loader2 size={12} className="animate-spin text-[var(--text-tertiary)]" />
            )}
          </div>
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
            mutating={mutatingIdx === idx}
            onDelete={() => handleDelete(entry, idx)}
            onEdit={(newText) => handleEdit(entry, idx, newText)}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Import / Export controls
// ---------------------------------------------------------------------------

function buildMemoryMarkdown(
  memoryEntries: string[],
  userEntries: string[]
): string {
  const lines: string[] = ["# Hermes Memory\n"]
  lines.push("## Agent Memory\n")
  memoryEntries.forEach((e) => lines.push(`- ${e}`))
  lines.push("\n## User Profile\n")
  userEntries.forEach((e) => lines.push(`- ${e}`))
  return lines.join("\n")
}

function ExportImportBar({
  memoryEntries,
  userEntries,
  onImport,
}: {
  memoryEntries: string[]
  userEntries: string[]
  onImport: (content: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    const md = buildMemoryMarkdown(memoryEntries, userEntries)
    const blob = new Blob([md], { type: "text/markdown" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "MEMORY.md"
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      if (content) onImport(content)
    }
    reader.readAsText(file)
    // reset so same file can be re-selected
    e.target.value = ""
  }

  return (
    <div className="shrink-0 flex items-center gap-2 border-t border-[var(--separator)] bg-[var(--bg-secondary)] px-4 py-2">
      <span className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] flex-1">
        MEMORY.md
      </span>
      <button
        onClick={handleExport}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1",
          "text-[length:var(--text-caption1)] font-medium text-[var(--text-secondary)]",
          "transition-colors hover:bg-[var(--fill-secondary)] hover:text-[var(--text-primary)]"
        )}
      >
        <Download size={12} />
        Export
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1",
          "text-[length:var(--text-caption1)] font-medium text-[var(--text-secondary)]",
          "transition-colors hover:bg-[var(--fill-secondary)] hover:text-[var(--text-primary)]"
        )}
      >
        <Upload size={12} />
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".md,text/plain,text/markdown"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Import preview modal (simple)
// ---------------------------------------------------------------------------

function ImportPreviewModal({
  content,
  onConfirm,
  onCancel,
}: {
  content: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-2xl border border-[var(--separator)] bg-[var(--bg-primary)] shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-[var(--separator)] px-5 py-3">
          <span className="text-[length:var(--text-subheadline)] font-semibold text-[var(--text-primary)]">
            Import Memory
          </span>
          <button
            onClick={onCancel}
            className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)]"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--system-orange)_30%,transparent)] bg-[color-mix(in_srgb,var(--system-orange)_8%,transparent)] px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-[var(--system-orange)]" />
            <p className="text-[length:var(--text-caption1)] text-[var(--system-orange)]">
              This will replace all memory entries with the imported file content.
            </p>
          </div>
          <pre className="text-[length:var(--text-caption1)] font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-words max-h-60 overflow-y-auto bg-[var(--fill-tertiary)] rounded-lg p-3">
            {content.slice(0, 2000)}{content.length > 2000 ? "\n…" : ""}
          </pre>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--separator)] px-5 py-3">
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-[length:var(--text-footnote)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-lg px-3 py-1.5 text-[length:var(--text-footnote)] font-medium text-white",
              "bg-[var(--accent)] transition-opacity hover:opacity-90"
            )}
          >
            Replace & Import
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HermesMemoryPage() {
  const { memory, loading, unavailable, update } = useHermesMemory()
  const [importContent, setImportContent] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  async function handleImportConfirm() {
    if (!importContent || !memory) return
    setImporting(true)
    try {
      // Parse imported markdown: extract bullet lines
      const memLines: string[] = []
      const userLines: string[] = []
      let section: "memory" | "user" | null = null
      for (const line of importContent.split("\n")) {
        if (/^##?\s+agent memory/i.test(line)) { section = "memory"; continue }
        if (/^##?\s+user profile/i.test(line)) { section = "user"; continue }
        const bullet = line.match(/^[-*]\s+(.+)/)
        if (bullet && section === "memory") memLines.push(bullet[1].trim())
        if (bullet && section === "user") userLines.push(bullet[1].trim())
      }

      // Remove all existing entries first
      for (const e of memory.memory.entries) {
        await update("memory", "remove", "", e)
      }
      for (const e of memory.user.entries) {
        await update("user", "remove", "", e)
      }
      // Add imported
      for (const e of memLines) {
        await update("memory", "add", e)
      }
      for (const e of userLines) {
        await update("user", "add", e)
      }

      setImportContent(null)
    } finally {
      setImporting(false)
    }
  }

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
          <>
            <div className="flex flex-1 min-h-0 divide-x divide-[var(--separator)]">
              {/* Agent memory */}
              <div className="flex-1 min-w-0">
                <MemoryColumn
                  title="Agent Memory"
                  entries={memory.memory.entries}
                  usage={memory.memory.usage}
                  target="memory"
                  update={update}
                  globalMutating={importing}
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
                  globalMutating={importing}
                />
              </div>
            </div>

            {/* Import / Export bar */}
            <ExportImportBar
              memoryEntries={memory.memory.entries}
              userEntries={memory.user.entries}
              onImport={setImportContent}
            />
          </>
        )}

        {/* Empty state */}
        {!loading && !memory && !unavailable && (
          <div className="flex flex-1 items-center justify-center text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
            No memory data
          </div>
        )}
      </div>

      {/* Import preview modal */}
      {importContent && (
        <ImportPreviewModal
          content={importContent}
          onConfirm={handleImportConfirm}
          onCancel={() => setImportContent(null)}
        />
      )}
    </PageLayout>
  )
}
