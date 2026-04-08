"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HonchoWorkspace {
  id: string
  name?: string
  metadata?: Record<string, unknown>
  configuration?: Record<string, unknown>
  created_at?: string
}

export interface HonchoConclusion {
  id: string
  content: string
  observer_id: string
  observed_id: string
  session_id: string | null
  created_at: string
  metadata?: Record<string, unknown>
}

// API returns nested format: { items: { items: [...], total: N, page: N, ... } }
export interface HonchoMemoryResponse {
  items: {
    items: HonchoConclusion[]
    total: number
    page?: number
    size?: number
    pages?: number
  }
}

export interface HonchoWorkspacesResponse {
  workspaces: HonchoWorkspace[]
}

export interface HonchoSearchResponse {
  items: HonchoConclusion[]
}

export interface CreateConclusionInput {
  content: string
  observer_id: string
  observed_id: string
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class HonchoUnavailableError extends Error {
  constructor(message = "Honcho service unavailable") {
    super(message)
    this.name = "HonchoUnavailableError"
  }
}

// ---------------------------------------------------------------------------
// API client - Direct Honcho V3 API
// ---------------------------------------------------------------------------
// Jinn API proxy (avoids CORS issues)
const API_BASE = "/api/honcho"

export const honchoApi = {
  async getHealth(): Promise<{ status: string }> {
    try {
      const res = await fetch(`${API_BASE}/health`)
      if (!res.ok) throw new HonchoUnavailableError()
      return res.json()
    } catch {
      throw new HonchoUnavailableError()
    }
  },

  async getWorkspaces(): Promise<HonchoWorkspacesResponse> {
    const res = await fetch(`${API_BASE}/workspaces`)
    if (!res.ok) throw new HonchoUnavailableError()
    const data = await res.json()
    // Handle nested format: {workspaces: {items: [...]}} or {workspaces: [...]}
    const workspaces = Array.isArray(data.workspaces) 
      ? data.workspaces 
      : (data.workspaces?.items || [])
    return { workspaces }
  },

  async getMemory(workspaceId: string): Promise<HonchoMemoryResponse> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/memory?limit=100`)
    if (!res.ok) throw new HonchoUnavailableError()
    return res.json()
  },

  async queryMemory(workspaceId: string, query: string): Promise<HonchoSearchResponse> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: 20 }),
    })
    if (!res.ok) throw new HonchoUnavailableError()
    return res.json()
  },

  async deleteMemory(workspaceId: string, conclusionId: string): Promise<void> {
    const res = await fetch(
      `${API_BASE}/workspaces/${workspaceId}/conclusions/${conclusionId}`,
      { method: "DELETE" }
    )
    if (!res.ok) throw new HonchoUnavailableError()
  },

  async createMemory(
    workspaceId: string,
    conclusions: CreateConclusionInput[]
  ): Promise<{ items: HonchoConclusion[] }> {
    const res = await fetch(`${API_BASE}/workspaces/${workspaceId}/conclusions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conclusions }),
    })
    if (!res.ok) throw new HonchoUnavailableError()
    return res.json()
  },
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const honchoKeys = {
  health: ["honcho", "health"] as const,
  workspaces: ["honcho", "workspaces"] as const,
  memory: (workspaceId: string) => ["honcho", "memory", workspaceId] as const,
  search: (workspaceId: string, query: string) => ["honcho", "search", workspaceId, query] as const,
}

// ---------------------------------------------------------------------------
// useHonchoStatus
// ---------------------------------------------------------------------------

export type HonchoStatus = "loading" | "connected" | "disconnected"

export function useHonchoStatus(): HonchoStatus {
  const { data, isLoading, isError } = useQuery({
    queryKey: honchoKeys.health,
    queryFn: () => honchoApi.getHealth(),
    refetchInterval: 30_000,
    retry: false,
  })

  if (isLoading) return "loading"
  if (isError || !data) return "disconnected"
  return data.status === "ok" ? "connected" : "disconnected"
}

// ---------------------------------------------------------------------------
// useHonchoWorkspaces
// ---------------------------------------------------------------------------

export function useHonchoWorkspaces() {
  const { data, isLoading, isError } = useQuery({
    queryKey: honchoKeys.workspaces,
    queryFn: () => honchoApi.getWorkspaces(),
    staleTime: 60_000,
    retry: 1,
  })

  // Ensure workspaces is always an array (defensive against API format changes)
  const workspaces = Array.isArray(data?.workspaces) 
    ? data.workspaces 
    : []
    
  return {
    workspaces,
    loading: isLoading,
    unavailable: isError,
  }
}

// ---------------------------------------------------------------------------
// useHonchoMemory
// ---------------------------------------------------------------------------

export function useHonchoMemory(workspaceId: string | null) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: workspaceId ? honchoKeys.memory(workspaceId) : ["honcho", "memory", "disabled"],
    queryFn: () => (workspaceId ? honchoApi.getMemory(workspaceId) : Promise.resolve({ items: { items: [], total: 0 } })),
    enabled: !!workspaceId,
    staleTime: 30_000,
    retry: 1,
  })

  const deleteMutation = useMutation({
    mutationFn: (conclusionId: string) =>
      workspaceId ? honchoApi.deleteMemory(workspaceId, conclusionId) : Promise.resolve(),
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: honchoKeys.memory(workspaceId) })
      }
    },
  })

  const createMutation = useMutation({
    mutationFn: (conclusions: CreateConclusionInput[]) =>
      workspaceId ? honchoApi.createMemory(workspaceId, conclusions) : Promise.resolve({ items: [] }),
    onSuccess: () => {
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: honchoKeys.memory(workspaceId) })
      }
    },
  })

  // Extract from nested response: { items: { items: [...], total: N } }
  const items = data?.items?.items ?? []
  const total = data?.items?.total ?? 0
  
  return {
    conclusions: workspaceId ? items : [],
    total,
    loading: isLoading,
    deleteConclusion: (id: string) => deleteMutation.mutateAsync(id),
    createConclusion: (conclusions: CreateConclusionInput[]) => createMutation.mutateAsync(conclusions),
  }
}

// ---------------------------------------------------------------------------
// useHonchoSearch
// ---------------------------------------------------------------------------

export function useHonchoSearch(workspaceId: string | null, query: string) {
  const { data, isLoading } = useQuery({
    queryKey: workspaceId && query ? honchoKeys.search(workspaceId, query) : ["honcho", "search", "disabled"],
    queryFn: () =>
      workspaceId && query ? honchoApi.queryMemory(workspaceId, query) : Promise.resolve({ items: [] }),
    enabled: !!workspaceId && !!query,
    staleTime: 30_000,
    retry: 1,
  })

  return {
    results: (workspaceId && query) ? (data?.items ?? []) : [],
    loading: isLoading,
  }
}
