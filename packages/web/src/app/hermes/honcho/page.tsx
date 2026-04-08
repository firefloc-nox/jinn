"use client"

import { useState, useMemo, useEffect } from "react"
import { PageLayout } from "@/components/page-layout"
import { Badge } from "@/components/ui/badge"
import {
  useHonchoWorkspaces,
  useHonchoMemory,
  useHonchoSearch,
  useHonchoStatus,
} from "@/hooks/use-honcho-memory"
import { cn } from "@/lib/utils"
import {
  Search,
  Trash2,
  Brain,
  AlertCircle,
  Loader2,
  Database,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusBadge() {
  const status = useHonchoStatus()

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        status === "connected" && "border-green-500 text-green-600",
        status === "disconnected" && "border-red-500 text-red-600",
        status === "loading" && "border-yellow-500 text-yellow-600"
      )}
    >
      {status === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "connected" && <Database className="h-3 w-3" />}
      {status === "disconnected" && <AlertCircle className="h-3 w-3" />}
      {status}
    </Badge>
  )
}

function WorkspaceSelector({
  workspaces,
  selected,
  onSelect,
}: {
  workspaces: { id: string; name?: string }[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  if (workspaces.length === 0) return null

  return (
    <select
      value={selected ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
    >
      {workspaces.map((ws) => (
        <option key={ws.id} value={ws.id}>
          {ws.name ?? ws.id}
        </option>
      ))}
    </select>
  )
}

function ConclusionCard({
  conclusion,
  onDelete,
}: {
  conclusion: {
    id: string
    content: string
    observer_id: string
    observed_id: string
    session_id: string | null
    created_at: string
  }
  onDelete: (id: string) => void
}) {
  const [confirming, setConfirming] = useState(false)

  const handleDelete = () => {
    if (confirming) {
      onDelete(conclusion.id)
      setConfirming(false)
    } else {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-foreground flex-1">{conclusion.content}</p>
        <button
          onClick={handleDelete}
          className={cn(
            "shrink-0 p-1.5 rounded transition-colors",
            confirming
              ? "bg-red-100 text-red-600 hover:bg-red-200"
              : "text-muted-foreground hover:text-red-500 hover:bg-muted"
          )}
          title={confirming ? "Click again to confirm" : "Delete"}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{formatDate(conclusion.created_at)}</span>
        {conclusion.session_id && (
          <>
            <span>•</span>
            <span className="truncate max-w-[120px]" title={conclusion.session_id}>
              {conclusion.session_id}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function HonchoMemoryPage() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const { workspaces, loading: loadingWorkspaces, unavailable } = useHonchoWorkspaces()

  // Auto-select first workspace
  useEffect(() => {
    if (!selectedWorkspace && workspaces.length > 0) {
      setSelectedWorkspace(workspaces[0].id)
    }
  }, [workspaces, selectedWorkspace])

  const {
    conclusions,
    total,
    loading: loadingMemory,
    deleteConclusion,
  } = useHonchoMemory(selectedWorkspace)

  const { results: searchResults, loading: loadingSearch } = useHonchoSearch(
    selectedWorkspace,
    debouncedQuery
  )

  const displayedItems = debouncedQuery ? searchResults : conclusions
  const isLoading = loadingWorkspaces || loadingMemory || loadingSearch

  return (
    <PageLayout>
      <div className="h-full overflow-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Brain className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">Honcho Memory</h1>
            <StatusBadge />
          </div>
          <p className="text-muted-foreground">
            View and manage cross-session memory stored in Honcho
          </p>
        </div>

        {unavailable ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Honcho Unavailable</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Could not connect to Honcho service. Make sure it is running on port 8000.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3">
              <WorkspaceSelector
                workspaces={workspaces}
                selected={selectedWorkspace}
                onSelect={setSelectedWorkspace}
              />
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search memories…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm"
                />
              </div>
              {!debouncedQuery && (
                <span className="text-sm text-muted-foreground">
                  {total} conclusion{total !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Database className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">
                  {debouncedQuery ? "No results" : "No memories yet"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {debouncedQuery
                    ? "Try a different search query"
                    : "Conclusions will appear here as Hermes learns about users"}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {displayedItems.map((conclusion) => (
                  <ConclusionCard
                    key={conclusion.id}
                    conclusion={conclusion}
                    onDelete={deleteConclusion}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
