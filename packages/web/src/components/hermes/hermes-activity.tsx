"use client"

import Link from "next/link"
import { useHermesSessions } from "@/hooks/use-hermes"
import { cn } from "@/lib/utils"
import type { HermesSession } from "@/lib/hermes-api"
import { Cpu, MessageSquare, ExternalLink } from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(ts: number): string {
  const diff = Math.floor((Date.now() / 1000) - ts)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

// ---------------------------------------------------------------------------
// Source badge (compact, inline style)
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<string, string> = {
  cli: "text-[var(--system-blue)] bg-[color-mix(in_srgb,var(--system-blue)_12%,transparent)]",
  discord: "text-[var(--system-purple)] bg-[color-mix(in_srgb,var(--system-purple)_12%,transparent)]",
  telegram: "text-[var(--system-blue)] bg-[color-mix(in_srgb,var(--system-blue)_12%,transparent)]",
  jinn: "text-[var(--accent)] bg-[var(--accent-fill)]",
}

function SourcePill({ source }: { source: string }) {
  const key = source.toLowerCase()
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded-md text-[length:var(--text-caption2)] font-medium shrink-0 capitalize",
        SOURCE_COLORS[key] ?? "text-[var(--text-tertiary)] bg-[var(--fill-tertiary)]"
      )}
    >
      {source}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Session row
// ---------------------------------------------------------------------------

function SessionRow({ session }: { session: HermesSession }) {
  const tokens = session.inputTokens + session.outputTokens
  const label = session.title ?? `Session ${session.id.slice(0, 8)}`

  return (
    <div className="flex items-center gap-2 py-2 px-[var(--space-4)]" style={{ borderBottom: "1px solid var(--separator)" }}>
      <SourcePill source={session.source} />

      <span className="flex-1 text-[length:var(--text-caption1)] text-[var(--text-primary)] truncate min-w-0">
        {label}
      </span>

      <div className="flex items-center gap-2 shrink-0 text-[length:var(--text-caption2)] text-[var(--text-tertiary)]">
        {tokens > 0 && (
          <span className="flex items-center gap-0.5">
            <Cpu size={9} />
            {formatTokensCompact(tokens)}
          </span>
        )}
        <span className="flex items-center gap-0.5">
          <MessageSquare size={9} />
          {session.messageCount}
        </span>
        <span>{formatRelative(session.startedAt)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HermesActivityWidget — exported
// ---------------------------------------------------------------------------

export function HermesActivityWidget() {
  const { sessions, loading, unavailable } = useHermesSessions({ limit: 5, offset: 0 })

  // If Hermes is down, render nothing (no error banner in dashboard)
  if (unavailable) return null

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-[var(--space-3)]">
        <h3 className="text-[length:var(--text-body)] font-[var(--weight-semibold)] text-[var(--text-primary)]">
          Hermes Activity
        </h3>
        <Link
          href="/hermes/sessions"
          className={cn(
            "inline-flex items-center gap-1",
            "text-[length:var(--text-caption1)] text-[var(--accent)]",
            "transition-opacity hover:opacity-70 no-underline"
          )}
        >
          View all
          <ExternalLink size={11} />
        </Link>
      </div>

      {/* Card */}
      <div
        className="rounded-[var(--radius-md,12px)] border overflow-hidden"
        style={{ borderColor: "var(--separator)", background: "var(--bg-secondary)" }}
      >
        {loading && (
          <div className="p-[var(--space-6)] text-center text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
            Loading…
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="p-[var(--space-6)] text-center text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
            No recent sessions
          </div>
        )}

        {!loading && sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </div>
    </div>
  )
}
