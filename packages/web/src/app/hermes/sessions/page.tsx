"use client"

import { useState, useCallback } from "react"
import { PageLayout } from "@/components/page-layout"
import { Badge } from "@/components/ui/badge"
import {
  useHermesSessions,
  useHermesSession,
  useHermesSessionSearch,
} from "@/hooks/use-hermes"
import { cn } from "@/lib/utils"
import type { HermesSession, HermesMessage } from "@/lib/hermes-api"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  MessageSquare,
  Terminal,
  Bot,
  User,
  Cpu,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDuration(start: number, end: number | null): string {
  if (!end) return "ongoing"
  const s = Math.round(end - start)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

// ---------------------------------------------------------------------------
// Source badge
// ---------------------------------------------------------------------------

const SOURCE_STYLES: Record<string, string> = {
  cli: "border-transparent bg-[color-mix(in_srgb,var(--system-blue)_18%,transparent)] text-[var(--system-blue)]",
  discord:
    "border-transparent bg-[color-mix(in_srgb,var(--system-purple)_18%,transparent)] text-[var(--system-purple)]",
  telegram:
    "border-transparent bg-[color-mix(in_srgb,var(--system-blue)_18%,transparent)] text-[var(--system-blue)]",
  slack:
    "border-transparent bg-[color-mix(in_srgb,var(--system-green)_18%,transparent)] text-[var(--system-green)]",
  whatsapp:
    "border-transparent bg-[color-mix(in_srgb,var(--system-green)_18%,transparent)] text-[var(--system-green)]",
}

function SourceBadge({ source }: { source: string }) {
  const key = source.toLowerCase()
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-2 py-0.5 text-[length:var(--text-caption1)] font-medium shrink-0",
        SOURCE_STYLES[key] ?? "border-[var(--separator)] text-[var(--text-secondary)]"
      )}
    >
      {source}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Session card
// ---------------------------------------------------------------------------

function SessionCard({
  session,
  active,
  onClick,
}: {
  session: HermesSession
  active: boolean
  onClick: () => void
}) {
  const tokens = session.inputTokens + session.outputTokens

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border px-4 py-3 transition-colors hover-lift",
        "flex flex-col gap-1.5",
        active
          ? "border-[var(--accent)] bg-[var(--accent-fill)]"
          : "border-[var(--separator)] bg-[var(--bg-secondary)] hover:border-[var(--separator-opaque)]"
      )}
    >
      {/* Row 1: title + source */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "text-[length:var(--text-subheadline)] font-semibold leading-snug truncate",
            active ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
          )}
        >
          {session.title ?? `Session ${session.id.slice(0, 8)}`}
        </span>
        <SourceBadge source={session.source} />
      </div>

      {/* Row 2: model + date */}
      <div className="flex items-center gap-2 text-[length:var(--text-footnote)] text-[var(--text-secondary)]">
        {session.model && (
          <>
            <span className="truncate max-w-[160px]">{session.model}</span>
            <span className="text-[var(--text-tertiary)]">·</span>
          </>
        )}
        <span>{formatTs(session.startedAt)}</span>
        {session.endedAt && (
          <>
            <span className="text-[var(--text-tertiary)]">·</span>
            <span>{formatDuration(session.startedAt, session.endedAt)}</span>
          </>
        )}
      </div>

      {/* Row 3: stats */}
      <div className="flex items-center gap-3 text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1">
          <MessageSquare size={10} />
          {session.messageCount}
        </span>
        {tokens > 0 && (
          <span className="flex items-center gap-1">
            <Cpu size={10} />
            {formatTokens(tokens)}
          </span>
        )}
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function RoleIcon({ role }: { role: HermesMessage["role"] }) {
  switch (role) {
    case "user":
      return <User size={13} className="shrink-0 mt-0.5" />
    case "assistant":
      return <Bot size={13} className="shrink-0 mt-0.5" />
    case "tool":
      return <Terminal size={11} className="shrink-0 mt-0.5" />
    default:
      return null
  }
}

function MessageBubble({ msg }: { msg: HermesMessage }) {
  const isUser = msg.role === "user"
  const isTool = msg.role === "tool"

  return (
    <div
      className={cn(
        "flex gap-2 text-[length:var(--text-footnote)]",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "size-6 rounded-full flex items-center justify-center shrink-0",
          isUser
            ? "bg-[var(--accent-fill)] text-[var(--accent)]"
            : isTool
              ? "bg-[var(--fill-tertiary)] text-[var(--text-tertiary)]"
              : "bg-[var(--fill-secondary)] text-[var(--text-secondary)]"
        )}
      >
        <RoleIcon role={msg.role} />
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-3 py-2 whitespace-pre-wrap break-words",
          isUser
            ? "bg-[var(--accent-fill)] text-[var(--text-primary)]"
            : isTool
              ? "bg-[var(--fill-tertiary)] text-[var(--text-tertiary)] font-mono text-[length:var(--text-caption1)]"
              : "bg-[var(--fill-secondary)] text-[var(--text-primary)]"
        )}
      >
        {msg.content}
        {msg.reasoning && (
          <details className="mt-2 text-[var(--text-tertiary)] text-[length:var(--text-caption1)]">
            <summary className="cursor-pointer hover:text-[var(--text-secondary)]">
              reasoning
            </summary>
            <p className="mt-1 whitespace-pre-wrap">{msg.reasoning}</p>
          </details>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function SessionDetailPanel({
  sessionId,
  onClose,
}: {
  sessionId: string
  onClose: () => void
}) {
  const { session, messages, loading, unavailable } = useHermesSession(sessionId)

  return (
    <div className="flex h-full flex-col border-l border-[var(--separator)] bg-[var(--bg-secondary)] animate-slide-in-right">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--separator)] px-4">
        <span className="text-[length:var(--text-subheadline)] font-semibold text-[var(--text-primary)] truncate">
          {session?.title ?? `Session ${sessionId.slice(0, 8)}`}
        </span>
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)] hover:text-[var(--text-primary)]"
        >
          <X size={16} />
        </button>
      </div>

      {/* Session meta */}
      {session && (
        <div className="shrink-0 border-b border-[var(--separator)] px-4 py-2 flex flex-wrap gap-2">
          <SourceBadge source={session.source} />
          {session.model && (
            <Badge
              variant="outline"
              className="border-[var(--separator)] text-[var(--text-secondary)] text-[length:var(--text-caption1)]"
            >
              {session.model}
            </Badge>
          )}
          <span className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
            {formatTs(session.startedAt)}
            {session.endedAt && ` · ${formatDuration(session.startedAt, session.endedAt)}`}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {loading && (
          <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
            Loading messages…
          </div>
        )}
        {unavailable && !loading && (
          <div className="rounded-xl border border-[var(--separator)] bg-[var(--fill-tertiary)] px-4 py-3 text-[var(--text-secondary)] text-[length:var(--text-footnote)]">
            Could not load messages.
          </div>
        )}
        {!loading && messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {!loading && !unavailable && messages.length === 0 && (
          <div className="text-center py-8 text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
            No messages
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unavailable banner
// ---------------------------------------------------------------------------

function HermesUnavailableBanner() {
  return (
    <div className="mx-4 mt-4 rounded-xl border border-[var(--system-orange)] bg-[color-mix(in_srgb,var(--system-orange)_10%,transparent)] px-4 py-3 text-[length:var(--text-footnote)] text-[var(--system-orange)]">
      <span className="font-semibold">Hermes WebAPI unavailable</span>
      <span className="ml-2 text-[var(--text-secondary)]">
        — sessions cannot be loaded. Check that Hermes is running.
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HermesSessionsPage() {
  const [offset, setOffset] = useState(0)
  const [query, setQuery] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)

  // Use search hook when query non-empty, list hook otherwise
  const listResult = useHermesSessions({ limit: PAGE_SIZE, offset })
  const searchResult = useHermesSessionSearch(query)

  const isSearching = query.trim().length > 0
  const sessions: HermesSession[] = isSearching ? searchResult.sessions : listResult.sessions
  const total = isSearching ? searchResult.total : listResult.total
  const loading = isSearching ? searchResult.loading : listResult.loading
  const unavailable = isSearching ? searchResult.unavailable : listResult.unavailable

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  const handleSelect = useCallback(
    (id: string) => setActiveId((prev) => (prev === id ? null : id)),
    []
  )

  const handlePrev = useCallback(() => {
    setOffset((o) => Math.max(0, o - PAGE_SIZE))
    setActiveId(null)
  }, [])

  const handleNext = useCallback(() => {
    setOffset((o) => o + PAGE_SIZE)
    setActiveId(null)
  }, [])

  return (
    <PageLayout>
      <div className="flex h-full">
        {/* List column */}
        <div
          className={cn(
            "flex flex-col",
            activeId ? "w-[400px] shrink-0" : "flex-1"
          )}
        >
          {/* Header */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--separator)] bg-[var(--bg-secondary)] px-4">
            <div className="flex items-center gap-2">
              <span className="text-[length:var(--text-title3)] font-semibold text-[var(--text-primary)]">
                Sessions
              </span>
              {!unavailable && !loading && (
                <Badge
                  variant="outline"
                  className="border-[var(--separator)] text-[var(--text-tertiary)] text-[length:var(--text-caption1)]"
                >
                  {total}
                </Badge>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="shrink-0 border-b border-[var(--separator)] bg-[var(--bg-secondary)] px-4 py-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                type="search"
                placeholder="Search sessions…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setOffset(0)
                  setActiveId(null)
                }}
                className={cn(
                  "w-full rounded-lg border border-[var(--separator)] bg-[var(--fill-tertiary)]",
                  "py-1.5 pl-8 pr-3 text-[length:var(--text-footnote)] text-[var(--text-primary)]",
                  "placeholder:text-[var(--text-tertiary)] outline-none",
                  "focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-fill)]"
                )}
              />
            </div>
          </div>

          {/* Unavailable banner */}
          {unavailable && <HermesUnavailableBanner />}

          {/* Session list */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {loading && (
              <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
                Loading…
              </div>
            )}
            {!loading && sessions.length === 0 && !unavailable && (
              <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
                {isSearching ? "No results" : "No sessions"}
              </div>
            )}
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                active={s.id === activeId}
                onClick={() => handleSelect(s.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {!isSearching && totalPages > 1 && (
            <div className="shrink-0 flex items-center justify-between border-t border-[var(--separator)] bg-[var(--bg-secondary)] px-4 py-2">
              <button
                onClick={handlePrev}
                disabled={offset === 0}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[length:var(--text-footnote)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)] disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={handleNext}
                disabled={offset + PAGE_SIZE >= total}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[length:var(--text-footnote)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)] disabled:pointer-events-none disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {activeId && (
          <div className="flex-1 min-w-0">
            <SessionDetailPanel
              sessionId={activeId}
              onClose={() => setActiveId(null)}
            />
          </div>
        )}
      </div>
    </PageLayout>
  )
}
