"use client"

import { useState, useEffect, useCallback } from 'react'
import { PageLayout } from '@/components/page-layout'
import { KanbanConfigPanel } from '@/components/kanban/config-panel'
import { loadConfig } from '@/lib/kanban/store'
import type { KanbanConfig } from '@/lib/kanban/types'
import { DEFAULT_CONFIG } from '@/lib/kanban/types'

export default function KanbanConfigPage() {
  const [config, setConfig] = useState<KanbanConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    loadConfig().then((cfg) => {
      setConfig(cfg)
      setLoading(false)
    })
  }, [])

  const handleSave = useCallback(async (newConfig: KanbanConfig) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/kanban/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setConfig(newConfig)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save config')
    } finally {
      setSaving(false)
    }
  }, [])

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-full text-[var(--text-tertiary)] text-[length:var(--text-footnote)]">
          Loading configuration…
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="h-full overflow-hidden">
        <KanbanConfigPanel
          config={config}
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
        />
      </div>
    </PageLayout>
  )
}
