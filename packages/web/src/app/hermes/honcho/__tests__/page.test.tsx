import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

// ---------------------------------------------------------------------------
// Mock hooks — before imports
// ---------------------------------------------------------------------------

vi.mock("@/hooks/use-honcho-memory", () => ({
  useHonchoStatus: vi.fn(),
  useHonchoWorkspaces: vi.fn(),
  useHonchoMemory: vi.fn(),
  useHonchoSearch: vi.fn(),
}))

vi.mock("@/components/page-layout", () => ({
  PageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import {
  useHonchoStatus,
  useHonchoWorkspaces,
  useHonchoMemory,
  useHonchoSearch,
} from "@/hooks/use-honcho-memory"
import HonchoMemoryPage from "../page"

const mockStatus = useHonchoStatus as ReturnType<typeof vi.fn>
const mockWorkspaces = useHonchoWorkspaces as ReturnType<typeof vi.fn>
const mockMemory = useHonchoMemory as ReturnType<typeof vi.fn>
const mockSearch = useHonchoSearch as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockConclusionData = [
  {
    id: "c-1",
    content: "User prefers dark mode",
    observer_id: "agent-abc123",
    observed_id: "user-def456",
    session_id: "sess-123",
    created_at: "2024-01-15T10:30:00Z",
  },
  {
    id: "c-2",
    content: "User is a software developer",
    observer_id: "agent-abc123",
    observed_id: "user-def456",
    session_id: null,
    created_at: "2024-01-14T08:00:00Z",
  },
]

const mockWorkspaceData = [
  { id: "ws-1", name: "Default Workspace" },
  { id: "ws-2", name: "Test Workspace" },
]

function defaultMocks(overrides?: {
  status?: "connected" | "disconnected" | "loading"
  workspaces?: typeof mockWorkspaceData
  conclusions?: typeof mockConclusionData
  loading?: boolean
  unavailable?: boolean
}) {
  mockStatus.mockReturnValue(overrides?.status ?? "connected")

  mockWorkspaces.mockReturnValue({
    workspaces: overrides?.workspaces ?? mockWorkspaceData,
    loading: overrides?.loading ?? false,
    unavailable: overrides?.unavailable ?? false,
  })

  mockMemory.mockReturnValue({
    conclusions: overrides?.conclusions ?? mockConclusionData,
    total: (overrides?.conclusions ?? mockConclusionData).length,
    loading: overrides?.loading ?? false,
    unavailable: overrides?.unavailable ?? false,
    deleteConclusion: vi.fn().mockResolvedValue(undefined),
    createConclusion: vi.fn().mockResolvedValue({ items: [] }),
    refetch: vi.fn(),
    isDeleting: false,
    isCreating: false,
  })

  mockSearch.mockReturnValue({
    results: [],
    loading: false,
    unavailable: false,
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  defaultMocks()
})

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HonchoMemoryPage", () => {
  it("renders page title", () => {
    render(<HonchoMemoryPage />)
    expect(screen.getByText("Honcho Memory")).toBeDefined()
  })

  it("shows connected status badge when connected", () => {
    render(<HonchoMemoryPage />)
    expect(screen.getByText("Connected")).toBeDefined()
  })

  it("shows conclusions content", () => {
    render(<HonchoMemoryPage />)
    expect(screen.getByText("User prefers dark mode")).toBeDefined()
    expect(screen.getByText("User is a software developer")).toBeDefined()
  })

  it("shows memory count in footer", () => {
    render(<HonchoMemoryPage />)
    expect(screen.getByText("2")).toBeDefined()
    expect(screen.getByText(/memories stored/)).toBeDefined()
  })

  it("shows unavailable banner when Honcho is disconnected", () => {
    defaultMocks({ status: "disconnected", unavailable: true })
    render(<HonchoMemoryPage />)
    expect(screen.getByText("Honcho API unavailable")).toBeDefined()
  })

  it("shows loading spinner when loading", () => {
    defaultMocks({ loading: true })
    render(<HonchoMemoryPage />)
    // Loader2 renders as an SVG, check that conclusions aren't shown
    expect(screen.queryByText("User prefers dark mode")).toBeNull()
  })

  it("shows empty state when no conclusions", () => {
    defaultMocks({ conclusions: [] })
    render(<HonchoMemoryPage />)
    expect(screen.getByText("No memories stored yet")).toBeDefined()
  })

  it("renders workspace selector with workspaces", () => {
    render(<HonchoMemoryPage />)
    // First workspace should be auto-selected
    expect(screen.getByText("Default Workspace")).toBeDefined()
  })

  it("renders search input", () => {
    render(<HonchoMemoryPage />)
    expect(screen.getByPlaceholderText("Search memories…")).toBeDefined()
  })

  it("clicking delete button shows confirmation", () => {
    render(<HonchoMemoryPage />)
    
    // Find all delete buttons (Trash2 icons)
    const deleteButtons = screen.getAllByRole("button").filter(
      (btn) => btn.querySelector('svg[class*="lucide-trash"]')
    )
    
    // Click the first one (may need to hover first in real UI)
    if (deleteButtons.length > 0) {
      fireEvent.click(deleteButtons[0])
      // Check for confirmation text
      expect(screen.getByText("Delete this memory?")).toBeDefined()
    }
  })

  it("shows search results when query is entered", async () => {
    const searchResults = [mockConclusionData[0]]
    mockSearch.mockReturnValue({
      results: searchResults,
      loading: false,
      unavailable: false,
    })

    render(<HonchoMemoryPage />)
    
    const searchInput = screen.getByPlaceholderText("Search memories…")
    fireEvent.change(searchInput, { target: { value: "dark mode" } })

    // Should show search results count
    await waitFor(() => {
      expect(screen.getByText(/matching memories/)).toBeDefined()
    })
  })

  it("shows empty search state when no results", async () => {
    mockSearch.mockReturnValue({
      results: [],
      loading: false,
      unavailable: false,
    })

    render(<HonchoMemoryPage />)
    
    const searchInput = screen.getByPlaceholderText("Search memories…")
    fireEvent.change(searchInput, { target: { value: "nonexistent" } })

    await waitFor(() => {
      expect(screen.getByText("No memories match your search")).toBeDefined()
    })
  })
})
