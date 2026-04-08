"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { PageLayout } from "@/components/page-layout"
import { cn } from "@/lib/utils"
import {
  Search,
  FileText,
  FolderOpen,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Loader2,
  AlertCircle,
  Edit3,
  Eye,
  Save,
  X,
  List,
  GitBranch,
  Database,
  ChevronsUpDown,
  Check,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WikiInfo {
  name: string
  path: string
  pageCount: number
}

interface WikiPage {
  name: string
  path: string
  type: string
  title: string | null
  updated: string | null
  tags: string[]
}

interface WikiOverview {
  exists: boolean
  path: string
  schema: string | null
  index: string | null
  recentLog: string[]
  stats: { totalPages: number; lastUpdated: string | null }
}

interface SearchResult {
  name: string
  path: string
  type: string
  matches: string[]
}

interface TreeNode {
  name: string
  path: string
  isFolder: boolean
  children: TreeNode[]
  page?: WikiPage
}

// ---------------------------------------------------------------------------
// API hooks
// ---------------------------------------------------------------------------

function useWikis() {
  const [wikis, setWikis] = useState<WikiInfo[]>([])
  const [activePath, setActivePath] = useState<string>("")
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    fetch("/api/hermes/wikis")
      .then((r) => r.json())
      .then((d) => {
        setWikis(d.wikis || [])
        setActivePath(d.activePath || "")
      })
      .catch(() => {
        setWikis([])
        setActivePath("")
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const switchWiki = useCallback(async (path: string) => {
    const res = await fetch("/api/hermes/wikis/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
    if (res.ok) {
      const data = await res.json()
      setActivePath(data.activePath)
      return true
    }
    return false
  }, [])

  return { wikis, activePath, loading, switchWiki, refresh }
}

function useWikiOverview(activePath: string) {
  const [data, setData] = useState<WikiOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!activePath) return
    setLoading(true)
    fetch("/api/hermes/wiki")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [activePath])

  return { overview: data, loading, error }
}

function useWikiPages(activePath: string) {
  const [data, setData] = useState<WikiPage[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    if (!activePath) return
    setLoading(true)
    fetch("/api/hermes/wiki/pages")
      .then((r) => r.json())
      .then((d) => setData(d.pages || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [activePath])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { pages: data, loading, refresh }
}

function useWikiSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    fetch(`/api/hermes/wiki/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((d) => setResults(d.results || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [query])

  return { results, loading }
}

function useWikiPage(pagePath: string | null) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!pagePath) {
      setContent(null)
      return
    }
    setLoading(true)
    fetch(`/api/hermes/wiki/page/${encodeURIComponent(pagePath)}`)
      .then((r) => r.json())
      .then((d) => setContent(d.content || null))
      .catch(() => setContent(null))
      .finally(() => setLoading(false))
  }, [pagePath])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { content, loading, refresh }
}

async function saveWikiPage(pagePath: string, content: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/hermes/wiki/page/${encodeURIComponent(pagePath)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    const data = await res.json()
    if (!res.ok) {
      return { success: false, error: data.error || "Failed to save" }
    }
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Network error" }
  }
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

function buildTree(pages: WikiPage[]): TreeNode[] {
  const root: TreeNode[] = []
  
  for (const page of pages) {
    const parts = page.path.split("/")
    let currentLevel = root
    let currentPath = ""
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLast = i === parts.length - 1
      
      let existing = currentLevel.find((n) => n.name === part)
      
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFolder: !isLast,
          children: [],
          page: isLast ? page : undefined,
        }
        currentLevel.push(existing)
      }
      
      if (!isLast) {
        currentLevel = existing.children
      }
    }
  }
  
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1
      if (!a.isFolder && b.isFolder) return 1
      return a.name.localeCompare(b.name)
    }).map((n) => ({
      ...n,
      children: sortNodes(n.children),
    }))
  }
  
  return sortNodes(root)
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function WikiSwitcher({
  wikis,
  activePath,
  onSwitch,
}: {
  wikis: WikiInfo[]
  activePath: string
  onSwitch: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const activeWiki = wikis.find((w) => w.path === activePath)

  if (wikis.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-[length:var(--text-caption1)] text-[var(--text-secondary)]">
        <Database size={14} />
        <span className="truncate">{activeWiki?.name || "wiki"}</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
          "text-[length:var(--text-caption1)] text-[var(--text-primary)]",
          "hover:bg-[var(--fill-secondary)]",
          open && "bg-[var(--fill-secondary)]"
        )}
      >
        <Database size={14} className="shrink-0 text-[var(--accent)]" />
        <span className="flex-1 text-left truncate font-medium">
          {activeWiki?.name || "Select wiki"}
        </span>
        <ChevronsUpDown size={14} className="shrink-0 text-[var(--text-tertiary)]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-lg bg-[var(--fill-secondary)] border border-[var(--separator)] shadow-lg overflow-hidden">
            {wikis.map((wiki) => (
              <button
                key={wiki.path}
                onClick={() => {
                  onSwitch(wiki.path)
                  setOpen(false)
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                  "text-[length:var(--text-caption1)]",
                  wiki.path === activePath
                    ? "bg-[var(--accent-fill)] text-[var(--accent)]"
                    : "hover:bg-[var(--fill-tertiary)] text-[var(--text-primary)]"
                )}
              >
                <span className="flex-1 truncate">{wiki.name}</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {wiki.pageCount} pages
                </span>
                {wiki.path === activePath && (
                  <Check size={12} className="shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    entity: "bg-blue-500/20 text-blue-400",
    entitie: "bg-blue-500/20 text-blue-400",
    concept: "bg-green-500/20 text-green-400",
    comparison: "bg-purple-500/20 text-purple-400",
    query: "bg-orange-500/20 text-orange-400",
    querie: "bg-orange-500/20 text-orange-400",
  }
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
        colors[type] || "bg-gray-500/20 text-gray-400"
      )}
    >
      {type.replace(/e$/, "")}
    </span>
  )
}

function TreeNodeItem({
  node,
  depth,
  selectedPath,
  expandedFolders,
  onSelect,
  onToggleFolder,
}: {
  node: TreeNode
  depth: number
  selectedPath: string | null
  expandedFolders: Set<string>
  onSelect: (path: string) => void
  onToggleFolder: (path: string) => void
}) {
  const isExpanded = expandedFolders.has(node.path)
  const isSelected = selectedPath === node.path
  
  return (
    <div>
      <button
        onClick={() => {
          if (node.isFolder) {
            onToggleFolder(node.path)
          } else {
            onSelect(node.path)
          }
        }}
        className={cn(
          "w-full text-left flex items-center gap-1.5 py-1 px-2 rounded transition-colors",
          isSelected && !node.isFolder
            ? "bg-[var(--accent-fill)] text-[var(--accent)]"
            : "hover:bg-[var(--fill-secondary)]"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.isFolder ? (
          <>
            {isExpanded ? (
              <ChevronDown size={12} className="shrink-0 text-[var(--text-tertiary)]" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-[var(--text-tertiary)]" />
            )}
            {isExpanded ? (
              <FolderOpen size={14} className="shrink-0 text-[var(--system-yellow)]" />
            ) : (
              <FolderClosed size={14} className="shrink-0 text-[var(--system-yellow)]" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileText size={14} className="shrink-0 text-[var(--text-tertiary)]" />
          </>
        )}
        <span
          className={cn(
            "text-[length:var(--text-caption1)] truncate",
            node.isFolder ? "font-medium text-[var(--text-secondary)]" : "text-[var(--text-primary)]"
          )}
        >
          {node.isFolder ? node.name : node.page?.title || node.name.replace(".md", "")}
        </span>
      </button>
      
      {node.isFolder && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PageListItem({
  page,
  onClick,
  selected,
}: {
  page: WikiPage
  onClick: () => void
  selected: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg p-2.5 transition-colors",
        selected
          ? "bg-[var(--accent-fill)] border border-[var(--accent)]"
          : "bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] border border-transparent"
      )}
    >
      <div className="flex items-center gap-2">
        <FileText size={14} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="text-[length:var(--text-caption1)] font-medium text-[var(--text-primary)] truncate flex-1">
          {page.title || page.name}
        </span>
        <TypeBadge type={page.type} />
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)] truncate pl-[22px]">
        {page.path}
      </p>
    </button>
  )
}

function SearchResultCard({
  result,
  onClick,
}: {
  result: SearchResult
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg p-2.5 bg-[var(--fill-tertiary)] hover:bg-[var(--fill-secondary)] transition-colors"
    >
      <div className="flex items-center gap-2">
        <FileText size={14} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="text-[length:var(--text-caption1)] font-medium text-[var(--text-primary)]">
          {result.name}
        </span>
        <TypeBadge type={result.type} />
      </div>
      {result.matches.length > 0 && (
        <div className="mt-1.5 space-y-0.5 pl-[22px]">
          {result.matches.slice(0, 2).map((match, i) => (
            <p
              key={i}
              className="text-[10px] text-[var(--text-secondary)] truncate"
            >
              …{match}…
            </p>
          ))}
        </div>
      )}
    </button>
  )
}

function MarkdownViewer({ content }: { content: string }) {
  const lines = content.split("\n")
  
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return (
            <h1 key={i} className="text-xl font-bold text-[var(--text-primary)] mt-4 mb-2">
              {line.slice(2)}
            </h1>
          )
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={i} className="text-lg font-semibold text-[var(--text-primary)] mt-3 mb-2">
              {line.slice(3)}
            </h2>
          )
        }
        if (line.startsWith("### ")) {
          return (
            <h3 key={i} className="text-base font-medium text-[var(--text-primary)] mt-2 mb-1">
              {line.slice(4)}
            </h3>
          )
        }
        if (line === "---") {
          return <hr key={i} className="border-[var(--separator)] my-2" />
        }
        if (line.startsWith("- ")) {
          return (
            <li key={i} className="text-[length:var(--text-footnote)] text-[var(--text-secondary)] ml-4">
              {line.slice(2)}
            </li>
          )
        }
        const withLinks = line.replace(
          /\[\[([^\]]+)\]\]/g,
          '<span class="rounded bg-[var(--accent-fill)] px-1.5 py-0.5 text-[var(--accent)] text-xs cursor-pointer hover:underline">$1</span>'
        )
        if (!line.trim()) {
          return <div key={i} className="h-2" />
        }
        return (
          <p
            key={i}
            className="text-[length:var(--text-footnote)] text-[var(--text-secondary)] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: withLinks }}
          />
        )
      })}
    </div>
  )
}

function MarkdownEditor({
  content,
  onChange,
}: {
  content: string
  onChange: (content: string) => void
}) {
  return (
    <textarea
      value={content}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full h-full resize-none p-4 font-mono text-[13px] leading-relaxed",
        "bg-[var(--fill-tertiary)] text-[var(--text-primary)]",
        "border-none outline-none",
        "placeholder:text-[var(--text-tertiary)]"
      )}
      placeholder="# Page title..."
      spellCheck={false}
    />
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function WikiPage() {
  const { wikis, activePath, loading: wikisLoading, switchWiki, refresh: refreshWikis } = useWikis()
  const { overview, loading: overviewLoading, error } = useWikiOverview(activePath)
  const { pages, loading: pagesLoading, refresh: refreshPages } = useWikiPages(activePath)
  const [searchQuery, setSearchQuery] = useState("")
  const { results: searchResults, loading: searchLoading } = useWikiSearch(searchQuery)
  const [selectedPage, setSelectedPage] = useState<string | null>(null)
  const { content: pageContent, loading: pageLoading, refresh: refreshContent } = useWikiPage(selectedPage)
  
  // View modes
  const [viewMode, setViewMode] = useState<"list" | "tree">("tree")
  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["entities", "concepts", "comparisons", "queries"]))

  // Build tree
  const tree = useMemo(() => buildTree(pages), [pages])

  // Group pages by type for list view
  const groupedPages = useMemo(() => {
    return pages.reduce((acc, page) => {
      const type = page.type.replace(/e$/, "")
      if (!acc[type]) acc[type] = []
      acc[type].push(page)
      return acc
    }, {} as Record<string, WikiPage[]>)
  }, [pages])

  // Toggle folder expansion
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  // Handle wiki switch
  const handleSwitchWiki = useCallback(async (path: string) => {
    const success = await switchWiki(path)
    if (success) {
      setSelectedPage(null)
      setEditMode(false)
      refreshPages()
    }
  }, [switchWiki, refreshPages])

  // Enter edit mode
  const startEdit = useCallback(() => {
    if (pageContent) {
      setEditContent(pageContent)
      setEditMode(true)
    }
  }, [pageContent])

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setEditMode(false)
    setEditContent("")
  }, [])

  // Save changes
  const handleSave = useCallback(async () => {
    if (!selectedPage) return
    setSaving(true)
    const result = await saveWikiPage(selectedPage, editContent)
    setSaving(false)
    if (result.success) {
      setEditMode(false)
      refreshContent()
      refreshPages()
    } else {
      alert(`Save failed: ${result.error}`)
    }
  }, [selectedPage, editContent, refreshContent, refreshPages])

  if (wikisLoading || overviewLoading) {
    return (
      <PageLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={24} />
        </div>
      </PageLayout>
    )
  }

  if (wikis.length === 0 || error || !overview?.exists) {
    return (
      <PageLayout>
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center px-4">
          <AlertCircle size={48} className="text-[var(--system-orange)]" />
          <div>
            <h2 className="text-[length:var(--text-title3)] font-semibold text-[var(--text-primary)]">
              No Wiki Found
            </h2>
            <p className="mt-1 text-[length:var(--text-footnote)] text-[var(--text-secondary)] max-w-md">
              No LLM Wiki directories found. Create one using the llm-wiki skill in Hermes.
            </p>
          </div>
          <code className="rounded-lg bg-[var(--fill-tertiary)] px-3 py-2 text-[length:var(--text-caption1)] text-[var(--text-secondary)]">
            ~/wiki or ~/wiki-*
          </code>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="flex h-full">
        {/* Sidebar - Page list */}
        <div className="w-72 shrink-0 border-r border-[var(--separator)] flex flex-col">
          {/* Wiki switcher */}
          <div className="p-2 border-b border-[var(--separator)]">
            <WikiSwitcher
              wikis={wikis}
              activePath={activePath}
              onSwitch={handleSwitchWiki}
            />
          </div>

          {/* Search + view toggle */}
          <div className="p-2 border-b border-[var(--separator)] space-y-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search wiki…"
                className={cn(
                  "w-full rounded-lg bg-[var(--fill-tertiary)] py-1.5 pl-8 pr-3",
                  "text-[length:var(--text-caption1)] text-[var(--text-primary)]",
                  "placeholder:text-[var(--text-tertiary)] outline-none",
                  "focus:ring-1 focus:ring-[var(--accent)]"
                )}
              />
            </div>
            
            {/* View mode toggle */}
            <div className="flex gap-1">
              <button
                onClick={() => setViewMode("tree")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1 rounded text-[10px] font-medium transition-colors",
                  viewMode === "tree"
                    ? "bg-[var(--accent-fill)] text-[var(--accent)]"
                    : "text-[var(--text-tertiary)] hover:bg-[var(--fill-secondary)]"
                )}
              >
                <GitBranch size={12} />
                Tree
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1 rounded text-[10px] font-medium transition-colors",
                  viewMode === "list"
                    ? "bg-[var(--accent-fill)] text-[var(--accent)]"
                    : "text-[var(--text-tertiary)] hover:bg-[var(--fill-secondary)]"
                )}
              >
                <List size={12} />
                List
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {searchQuery ? (
              <div className="p-2 space-y-1">
                {searchLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={20} />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-8 text-center text-[var(--text-tertiary)] text-[length:var(--text-caption1)]">
                    No results
                  </div>
                ) : (
                  searchResults.map((result) => (
                    <SearchResultCard
                      key={result.path}
                      result={result}
                      onClick={() => {
                        setSelectedPage(result.path)
                        setSearchQuery("")
                      }}
                    />
                  ))
                )}
              </div>
            ) : viewMode === "tree" ? (
              <div className="py-1">
                {pagesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={20} />
                  </div>
                ) : (
                  tree.map((node) => (
                    <TreeNodeItem
                      key={node.path}
                      node={node}
                      depth={0}
                      selectedPath={selectedPage}
                      expandedFolders={expandedFolders}
                      onSelect={setSelectedPage}
                      onToggleFolder={toggleFolder}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="p-2 space-y-3">
                {pagesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={20} />
                  </div>
                ) : (
                  Object.entries(groupedPages).map(([type, typePages]) => (
                    <div key={type}>
                      <div className="flex items-center gap-2 px-1 py-1">
                        <FolderOpen size={12} className="text-[var(--text-tertiary)]" />
                        <span className="text-[10px] font-medium text-[var(--text-secondary)] uppercase">
                          {type}s
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          {typePages.length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {typePages.map((page) => (
                          <PageListItem
                            key={page.path}
                            page={page}
                            onClick={() => setSelectedPage(page.path)}
                            selected={selectedPage === page.path}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          
          {/* Stats footer */}
          <div className="shrink-0 border-t border-[var(--separator)] px-3 py-2 text-[10px] text-[var(--text-tertiary)]">
            {overview.stats.totalPages} pages • Updated {overview.stats.lastUpdated || "never"}
          </div>
        </div>

        {/* Main content - Page viewer/editor */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedPage ? (
            <>
              {/* Header with actions */}
              <div className="shrink-0 border-b border-[var(--separator)] px-4 py-2 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[length:var(--text-footnote)] font-semibold text-[var(--text-primary)] truncate">
                    {pages.find((p) => p.path === selectedPage)?.title ||
                      selectedPage.split("/").pop()?.replace(".md", "")}
                  </h2>
                  <p className="text-[10px] text-[var(--text-tertiary)] truncate">
                    {selectedPage}
                  </p>
                </div>
                
                <div className="flex items-center gap-1.5 ml-2">
                  {editMode ? (
                    <>
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[length:var(--text-caption1)] text-[var(--text-secondary)] hover:bg-[var(--fill-secondary)] transition-colors"
                      >
                        <X size={12} />
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[length:var(--text-caption1)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                      >
                        {saving ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Save size={12} />
                        )}
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditMode(false)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[length:var(--text-caption1)] transition-colors",
                          !editMode
                            ? "bg-[var(--fill-secondary)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--fill-secondary)]"
                        )}
                      >
                        <Eye size={12} />
                        View
                      </button>
                      <button
                        onClick={startEdit}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[length:var(--text-caption1)] transition-colors",
                          editMode
                            ? "bg-[var(--fill-secondary)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--fill-secondary)]"
                        )}
                      >
                        <Edit3 size={12} />
                        Edit
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Content area */}
              <div className="flex-1 overflow-hidden">
                {pageLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={20} />
                  </div>
                ) : editMode ? (
                  <MarkdownEditor content={editContent} onChange={setEditContent} />
                ) : pageContent ? (
                  <div className="h-full overflow-y-auto p-4">
                    <MarkdownViewer content={pageContent} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-[var(--text-tertiary)]">
                    Page not found
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <BookOpen size={48} className="mx-auto text-[var(--text-tertiary)] opacity-50" />
                <p className="mt-4 text-[length:var(--text-footnote)] text-[var(--text-tertiary)]">
                  Select a page to view
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
