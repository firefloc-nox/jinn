"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  hermesApi,
  HermesUnavailableError,
  type HermesStatus,
  type HermesSession,
  type HermesMessage,
  type HermesMemory,
  type HermesSkill,
} from "@/lib/hermes-api"

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const hermesKeys = {
  health: ["hermes", "health"] as const,
  sessions: (opts?: { limit?: number; offset?: number }) =>
    ["hermes", "sessions", opts] as const,
  session: (id: string) => ["hermes", "session", id] as const,
  messages: (sessionId: string) => ["hermes", "messages", sessionId] as const,
  search: (q: string) => ["hermes", "search", q] as const,
  memory: ["hermes", "memory"] as const,
  skills: ["hermes", "skills"] as const,
  cron: ["hermes", "cron"] as const,
  models: ["hermes", "models"] as const,
}

// ---------------------------------------------------------------------------
// useHermesStatus — polls /api/hermes/health
// ---------------------------------------------------------------------------

export function useHermesStatus(): HermesStatus {
  const { data, isLoading, isError } = useQuery({
    queryKey: hermesKeys.health,
    queryFn: () => hermesApi.getHealth(),
    refetchInterval: 30_000,
    retry: false,
  })

  if (isLoading) return "loading"
  if (isError || !data) return "disconnected"
  return data.status === "ok" ? "connected" : "disconnected"
}

// ---------------------------------------------------------------------------
// useHermesSessions
// ---------------------------------------------------------------------------

export function useHermesSessions(opts?: { limit?: number; offset?: number }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: hermesKeys.sessions(opts),
    queryFn: () => hermesApi.getSessions(opts),
    retry: (_, err) => !(err instanceof HermesUnavailableError),
  })

  return {
    sessions: data?.items ?? ([] as HermesSession[]),
    total: data?.total ?? 0,
    loading: isLoading,
    unavailable: isError,
  }
}

// ---------------------------------------------------------------------------
// useHermesSessionSearch
// ---------------------------------------------------------------------------

export function useHermesSessionSearch(q: string) {
  const { data, isLoading, isError } = useQuery({
    queryKey: hermesKeys.search(q),
    queryFn: () => hermesApi.searchSessions(q),
    enabled: q.trim().length > 0,
    retry: (_, err) => !(err instanceof HermesUnavailableError),
  })

  return {
    sessions: data?.items ?? ([] as HermesSession[]),
    total: data?.total ?? 0,
    loading: isLoading,
    unavailable: isError,
  }
}

// ---------------------------------------------------------------------------
// useHermesSession — single session + messages
// ---------------------------------------------------------------------------

export function useHermesSession(id: string | null) {
  const sessionQ = useQuery({
    queryKey: hermesKeys.session(id!),
    queryFn: () => hermesApi.getSession(id!),
    enabled: !!id,
    retry: (_, err) => !(err instanceof HermesUnavailableError),
  })

  const messagesQ = useQuery({
    queryKey: hermesKeys.messages(id!),
    queryFn: () => hermesApi.getMessages(id!),
    enabled: !!id,
    retry: (_, err) => !(err instanceof HermesUnavailableError),
  })

  return {
    session: sessionQ.data ?? null,
    messages: messagesQ.data ?? ([] as HermesMessage[]),
    loading: sessionQ.isLoading || messagesQ.isLoading,
    unavailable: sessionQ.isError || messagesQ.isError,
  }
}

// ---------------------------------------------------------------------------
// useHermesMemory
// ---------------------------------------------------------------------------

export function useHermesMemory() {
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: hermesKeys.memory,
    queryFn: () => hermesApi.getMemory(),
    retry: (_, err) => !(err instanceof HermesUnavailableError),
  })

  const mutation = useMutation({
    mutationFn: ({
      target,
      action,
      content,
      oldText,
    }: {
      target: "memory" | "user"
      action: "add" | "replace" | "remove"
      content: string
      oldText?: string
    }) => hermesApi.updateMemory(target, action, content, oldText),
    onSuccess: () => qc.invalidateQueries({ queryKey: hermesKeys.memory }),
  })

  return {
    memory: data ?? (null as HermesMemory | null),
    loading: isLoading,
    unavailable: isError,
    update: (
      target: "memory" | "user",
      action: "add" | "replace" | "remove",
      content: string,
      oldText?: string
    ) => mutation.mutateAsync({ target, action, content, oldText }),
  }
}

// ---------------------------------------------------------------------------
// useHermesSkills
// ---------------------------------------------------------------------------

export function useHermesSkills() {
  const { data, isLoading, isError } = useQuery({
    queryKey: hermesKeys.skills,
    queryFn: () => hermesApi.getSkills(),
    retry: (_, err) => !(err instanceof HermesUnavailableError),
  })

  return {
    skills: data?.skills ?? ([] as HermesSkill[]),
    categories: data?.categories ?? ({} as Record<string, string[]>),
    count: data?.count ?? 0,
    loading: isLoading,
    unavailable: isError,
  }
}

// ---------------------------------------------------------------------------
// useHermesCron
// ---------------------------------------------------------------------------

export function useHermesCron() {
  const { data, isLoading, isError } = useQuery({
    queryKey: hermesKeys.cron,
    queryFn: () => hermesApi.getCron(),
    retry: (_, err) => !(err instanceof HermesUnavailableError),
  })

  return {
    jobs: data ?? [],
    loading: isLoading,
    unavailable: isError,
  }
}
