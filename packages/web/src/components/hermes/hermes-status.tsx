"use client"

import { useHermesStatus } from "@/hooks/use-hermes"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// HermesStatusBadge
// Shows a compact inline indicator of Hermes WebAPI connectivity.
// "connected"    → green dot + "Hermes"
// "disconnected" → orange hollow dot + "Hermes" (with title tooltip)
// "loading"      → animated spinner dot
// ---------------------------------------------------------------------------

export function HermesStatusBadge({ className }: { className?: string }) {
  const status = useHermesStatus()

  if (status === "loading") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
          "text-[length:var(--text-caption1)] font-medium text-[var(--text-tertiary)]",
          className
        )}
        aria-label="Hermes — checking"
      >
        <span
          className="size-1.5 rounded-full bg-[var(--text-tertiary)] animate-pulse"
          aria-hidden="true"
        />
        <span>Hermes</span>
      </span>
    )
  }

  if (status === "connected") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
          "text-[length:var(--text-caption1)] font-medium",
          "text-[var(--system-green)]",
          className
        )}
        aria-label="Hermes — connected"
      >
        <span
          className="size-1.5 rounded-full bg-[var(--system-green)]"
          aria-hidden="true"
        />
        <span>Hermes</span>
      </span>
    )
  }

  // disconnected
  return (
    <span
      title="Hermes WebAPI unavailable"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "text-[length:var(--text-caption1)] font-medium",
        "text-[var(--system-orange)]",
        className
      )}
      aria-label="Hermes — disconnected"
    >
      {/* hollow ring */}
      <span
        className="size-1.5 rounded-full border border-[var(--system-orange)]"
        aria-hidden="true"
      />
      <span>Hermes</span>
    </span>
  )
}
