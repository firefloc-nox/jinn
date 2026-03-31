"use client"

import { useState, useMemo } from "react"
import { PageLayout } from "@/components/page-layout"
import { Badge } from "@/components/ui/badge"
import { useHermesSkills } from "@/hooks/use-hermes"
import { cn } from "@/lib/utils"
import type { HermesSkill } from "@/lib/hermes-api"
import { Search, X, AlertTriangle, BookOpen, FolderOpen } from "lucide-react"

// ---------------------------------------------------------------------------
// Category badge colors
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<string, string> = {
  mlops:
    "bg-[color-mix(in_srgb,var(--system-purple)_14%,transparent)] text-[var(--system-purple)] border-transparent",
  devops:
    "bg-[color-mix(in_srgb,var(--system-blue)_14%,transparent)] text-[var(--system-blue)] border-transparent",
  creative:
    "bg-[color-mix(in_srgb,var(--system-pink)_14%,transparent)] text-[var(--system-pink)] border-transparent",
  research:
    "bg-[color-mix(in_srgb,var(--system-indigo)_14%,transparent)] text-[var(--system-indigo)] border-transparent",
  productivity:
    "bg-[color-mix(in_srgb,var(--system-green)_14%,transparent)] text-[var(--system-green)] border-transparent",
  "software-development":
    "bg-[color-mix(in_srgb,var(--system-teal)_14%,transparent)] text-[var(--system-teal)] border-transparent",
  gaming:
    "bg-[color-mix(in_srgb,var(--system-orange)_14%,transparent)] text-[var(--system-orange)] border-transparent",
  "social-media":
    "bg-[color-mix(in_srgb,var(--system-pink)_14%,transparent)] text-[var(--system-pink)] border-transparent",
}

function getCategoryColor(category: string): string {
  const root = category.split("/")[0].toLowerCase()
  return (
    CATEGORY_COLORS[root] ??
    "bg-[var(--fill-tertiary)] text-[var(--text-secondary)] border-transparent"
  )
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "px-2 py-0.5 text-[length:var(--text-caption2)] font-medium shrink-0 capitalize",
        getCategoryColor(category)
      )}
    >
      {category}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Skill card
// ---------------------------------------------------------------------------

const DESCRIPTION_MAX = 100

function SkillCard({
  skill,
  onClick,
}: {
  skill: HermesSkill
  onClick: () => void
}) {
  const truncated =
    skill.description.length > DESCRIPTION_MAX
      ? skill.description.slice(0, DESCRIPTION_MAX) + "…"
      : skill.description

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border border-[var(--separator)] bg-[var(--bg-secondary)]",
        "px-4 py-3 flex flex-col gap-2 transition-colors hover-lift",
        "hover:border-[var(--separator-opaque)]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[length:var(--text-subheadline)] font-semibold text-[var(--text-primary)] leading-snug truncate">
          {skill.name}
        </span>
        <CategoryBadge category={skill.category} />
      </div>
      <p className="text-[length:var(--text-caption1)] text-[var(--text-secondary)] leading-relaxed text-left">
        {truncated}
      </p>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Skill detail modal
// ---------------------------------------------------------------------------

function SkillModal({
  skill,
  onClose,
}: {
  skill: HermesSkill
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="mx-4 w-full max-w-lg rounded-2xl border border-[var(--separator)] bg-[var(--bg-primary)] shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--separator)] px-5 py-4 gap-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[length:var(--text-headline)] font-semibold text-[var(--text-primary)] break-words">
              {skill.name}
            </span>
            <CategoryBadge category={skill.category} />
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 inline-flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-secondary)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Description */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-[length:var(--text-caption1)] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              <BookOpen size={11} />
              Description
            </div>
            <p className="text-[length:var(--text-footnote)] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
              {skill.description}
            </p>
          </div>

          {/* Category path */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-[length:var(--text-caption1)] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              <FolderOpen size={11} />
              Category
            </div>
            <p className="text-[length:var(--text-footnote)] font-mono text-[var(--text-secondary)]">
              {skill.category}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category section
// ---------------------------------------------------------------------------

function CategorySection({
  category,
  skills,
  onSkillClick,
}: {
  category: string
  skills: HermesSkill[]
  onSkillClick: (skill: HermesSkill) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-[length:var(--text-footnote)] font-semibold text-[var(--text-secondary)] capitalize">
          {category}
        </h3>
        <span className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)]">
          {skills.length}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {skills.map((skill) => (
          <SkillCard
            key={`${skill.category}/${skill.name}`}
            skill={skill}
            onClick={() => onSkillClick(skill)}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HermesSkillsPage() {
  const { skills, count, loading, unavailable } = useHermesSkills()
  const [query, setQuery] = useState("")
  const [selectedSkill, setSelectedSkill] = useState<HermesSkill | null>(null)

  // Filter by search
  const filtered = useMemo(() => {
    if (!query.trim()) return skills
    const q = query.toLowerCase()
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    )
  }, [skills, query])

  // Group by root category
  const grouped = useMemo(() => {
    const map: Record<string, HermesSkill[]> = {}
    for (const skill of filtered) {
      const root = skill.category.split("/")[0]
      if (!map[root]) map[root] = []
      map[root].push(skill)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const isFiltered = query.trim().length > 0

  return (
    <PageLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--separator)] bg-[var(--bg-secondary)] px-4">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--text-title3)] font-semibold text-[var(--text-primary)]">
              Skills
            </span>
            {!loading && !unavailable && (
              <Badge
                variant="outline"
                className="border-[var(--separator)] text-[var(--text-tertiary)] text-[length:var(--text-caption1)]"
              >
                {isFiltered ? `${filtered.length} / ${count}` : count}
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
              placeholder="Search skills…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={cn(
                "w-full rounded-lg border border-[var(--separator)] bg-[var(--fill-tertiary)]",
                "py-1.5 pl-8 pr-3 text-[length:var(--text-footnote)] text-[var(--text-primary)]",
                "placeholder:text-[var(--text-tertiary)] outline-none",
                "focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-fill)]"
              )}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Unavailable */}
          {unavailable && (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--system-orange)] bg-[color-mix(in_srgb,var(--system-orange)_10%,transparent)] px-4 py-3 text-[length:var(--text-footnote)]">
              <AlertTriangle size={14} className="shrink-0 text-[var(--system-orange)]" />
              <span className="text-[var(--system-orange)] font-semibold">Hermes WebAPI unavailable</span>
              <span className="text-[var(--text-secondary)]">— skills cannot be loaded.</span>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
              Loading…
            </div>
          )}

          {/* Empty search */}
          {!loading && !unavailable && filtered.length === 0 && (
            <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
              {isFiltered ? `No skills matching "${query}"` : "No skills available"}
            </div>
          )}

          {/* Grouped grid */}
          {!loading && !unavailable && grouped.length > 0 && (
            <div className="flex flex-col gap-8">
              {grouped.map(([category, catSkills]) => (
                <CategorySection
                  key={category}
                  category={category}
                  skills={catSkills}
                  onSkillClick={setSelectedSkill}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {selectedSkill && (
        <SkillModal
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </PageLayout>
  )
}
