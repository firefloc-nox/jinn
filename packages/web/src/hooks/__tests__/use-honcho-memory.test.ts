import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React from "react"

import {
  useHonchoStatus,
  useHonchoWorkspaces,
  useHonchoMemory,
  useHonchoSearch,
  honchoApi,
  HonchoUnavailableError,
} from "../use-honcho-memory"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../use-honcho-memory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../use-honcho-memory")>()
  return {
    ...actual,
    honchoApi: {
      getHealth: vi.fn(),
      getWorkspaces: vi.fn(),
      getMemory: vi.fn(),
      queryMemory: vi.fn(),
      deleteMemory: vi.fn(),
      createMemory: vi.fn(),
    },
  }
})

// ---------------------------------------------------------------------------
// Test wrapper
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockWorkspaces = [
  { id: "ws-1", name: "Default Workspace" },
  { id: "ws-2", name: "Test Workspace" },
]

const mockConclusions = [
  {
    id: "c-1",
    content: "User prefers dark mode",
    observer_id: "agent-1",
    observed_id: "user-1",
    session_id: "session-1",
    created_at: "2024-01-15T10:30:00Z",
  },
  {
    id: "c-2",
    content: "User is a software developer",
    observer_id: "agent-1",
    observed_id: "user-1",
    session_id: null,
    created_at: "2024-01-14T08:00:00Z",
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useHonchoStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 'loading' while fetching", () => {
    vi.mocked(honchoApi.getHealth).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    const { result } = renderHook(() => useHonchoStatus(), {
      wrapper: createWrapper(),
    })

    expect(result.current).toBe("loading")
  })

  it("returns 'connected' when health check succeeds", async () => {
    vi.mocked(honchoApi.getHealth).mockResolvedValue({ status: "ok" })

    const { result } = renderHook(() => useHonchoStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current).toBe("connected")
    })
  })

  it("returns 'disconnected' when health check fails", async () => {
    vi.mocked(honchoApi.getHealth).mockRejectedValue(new HonchoUnavailableError())

    const { result } = renderHook(() => useHonchoStatus(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current).toBe("disconnected")
    })
  })
})

describe("useHonchoWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns workspaces on success", async () => {
    vi.mocked(honchoApi.getWorkspaces).mockResolvedValue({ workspaces: mockWorkspaces })

    const { result } = renderHook(() => useHonchoWorkspaces(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.workspaces).toEqual(mockWorkspaces)
      expect(result.current.loading).toBe(false)
      expect(result.current.unavailable).toBe(false)
    })
  })

  it("returns unavailable=true on error", async () => {
    vi.mocked(honchoApi.getWorkspaces).mockRejectedValue(new HonchoUnavailableError())

    const { result } = renderHook(() => useHonchoWorkspaces(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.workspaces).toEqual([])
      expect(result.current.unavailable).toBe(true)
    })
  })
})

describe("useHonchoMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns conclusions for a workspace", async () => {
    vi.mocked(honchoApi.getMemory).mockResolvedValue({
      items: mockConclusions,
      total: mockConclusions.length,
    })

    const { result } = renderHook(() => useHonchoMemory("ws-1"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.conclusions).toEqual(mockConclusions)
      expect(result.current.total).toBe(2)
      expect(result.current.loading).toBe(false)
    })
  })

  it("does not fetch when workspaceId is null", () => {
    const { result } = renderHook(() => useHonchoMemory(null), {
      wrapper: createWrapper(),
    })

    expect(result.current.conclusions).toEqual([])
    expect(honchoApi.getMemory).not.toHaveBeenCalled()
  })

  it("deleteConclusion calls API and returns", async () => {
    vi.mocked(honchoApi.getMemory).mockResolvedValue({
      items: mockConclusions,
      total: mockConclusions.length,
    })
    vi.mocked(honchoApi.deleteMemory).mockResolvedValue(undefined)

    const { result } = renderHook(() => useHonchoMemory("ws-1"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.deleteConclusion("c-1")

    expect(honchoApi.deleteMemory).toHaveBeenCalledWith("ws-1", "c-1")
  })

  it("createConclusion calls API with correct params", async () => {
    vi.mocked(honchoApi.getMemory).mockResolvedValue({
      items: mockConclusions,
      total: mockConclusions.length,
    })
    vi.mocked(honchoApi.createMemory).mockResolvedValue({ items: [mockConclusions[0]] })

    const { result } = renderHook(() => useHonchoMemory("ws-1"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const newConclusions = [
      {
        content: "New fact",
        observer_id: "agent-1",
        observed_id: "user-1",
      },
    ]

    await result.current.createConclusion(newConclusions)

    expect(honchoApi.createMemory).toHaveBeenCalledWith("ws-1", newConclusions)
  })
})

describe("useHonchoSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns search results for a query", async () => {
    vi.mocked(honchoApi.queryMemory).mockResolvedValue({ items: [mockConclusions[0]] })

    const { result } = renderHook(() => useHonchoSearch("ws-1", "dark mode"), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.results).toEqual([mockConclusions[0]])
      expect(result.current.loading).toBe(false)
    })

    expect(honchoApi.queryMemory).toHaveBeenCalledWith("ws-1", "dark mode")
  })

  it("does not search when query is empty", () => {
    const { result } = renderHook(() => useHonchoSearch("ws-1", ""), {
      wrapper: createWrapper(),
    })

    expect(result.current.results).toEqual([])
    expect(honchoApi.queryMemory).not.toHaveBeenCalled()
  })

  it("does not search when workspaceId is null", () => {
    const { result } = renderHook(() => useHonchoSearch(null, "test"), {
      wrapper: createWrapper(),
    })

    expect(result.current.results).toEqual([])
    expect(honchoApi.queryMemory).not.toHaveBeenCalled()
  })
})
