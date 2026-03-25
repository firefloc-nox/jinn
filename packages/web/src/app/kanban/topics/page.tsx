"use client"

import { useState, useEffect } from 'react'
import { PageLayout } from '@/components/page-layout'
import { TopicBrowser } from '@/components/kanban/topic-browser'
import { loadConfig } from '@/lib/kanban/store'
import { loadTickets } from '@/lib/kanban/store'
import type { KanbanTopic, KanbanConfig } from '@/lib/kanban/types'
import { DEFAULT_CONFIG } from '@/lib/kanban/types'

export default function KanbanTopicsPage() {
  const [config, setConfig] = useState<KanbanConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const tickets = loadTickets()

  useEffect(() => {
    loadConfig()
      .then((cfg) => { setConfig(cfg) })
      .catch(() => setError('Failed to load config'))
      .finally(() => setLoading(false))
  }, [])

  async function patchConfig(next: KanbanConfig) {
    setConfig(next)
    try {
      await fetch('/api/kanban/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
    } catch {
      // Optimistic update already applied — silent failure for now
    }
  }

  function handleCreateTopic(data: Omit<KanbanTopic, 'id'>) {
    const id = `topic-${Date.now()}`
    patchConfig({ ...config, topics: [...config.topics, { id, ...data }] })
  }

  function handleUpdateTopic(id: string, data: Omit<KanbanTopic, 'id'>) {
    patchConfig({
      ...config,
      topics: config.topics.map((t) => (t.id === id ? { ...data, id } : t)),
    })
  }

  function handleDeleteTopic(id: string) {
    patchConfig({ ...config, topics: config.topics.filter((t) => t.id !== id) })
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
          Loading topics…
        </div>
      </PageLayout>
    )
  }

  if (error) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-full text-[var(--system-red)] text-[length:var(--text-footnote)]">
          {error}
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="h-full overflow-hidden">
        <TopicBrowser
          topics={config.topics}
          tickets={Object.values(tickets)}
          onCreateTopic={handleCreateTopic}
          onUpdateTopic={handleUpdateTopic}
          onDeleteTopic={handleDeleteTopic}
        />
      </div>
    </PageLayout>
  )
}
