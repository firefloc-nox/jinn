'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageLayout } from '@/components/page-layout'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useBreadcrumbs } from '@/context/breadcrumb-context'
import { useNotifications } from '@/hooks/use-notifications'
import type { WorkflowDefinition, WorkflowRun, TriggerType } from '@/lib/workflows/types'
import { Play, Pencil, Plus, X, CheckCircle, Clock } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hrs < 24) return `${hrs}h ago`
  return `${days}d ago`
}

function RunStatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; label: string }> = {
    queued: { color: 'var(--text-tertiary)', label: 'Queued' },
    running: { color: '#f59e0b', label: 'Running' },
    waiting: { color: '#3b82f6', label: 'Waiting' },
    success: { color: '#22c55e', label: 'Success' },
    error: { color: '#ef4444', label: 'Error' },
    cancelled: { color: 'var(--text-tertiary)', label: 'Cancelled' },
  }
  const c = config[status] ?? { color: 'var(--text-tertiary)', label: status }
  return (
    <span
      style={{
        background: `${c.color}22`,
        color: c.color,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {c.label}
    </span>
  )
}

// ─── New Workflow Modal ───────────────────────────────────────────────────────

interface NewWorkflowModalProps {
  onClose: () => void
  onCreate: (def: WorkflowDefinition) => void
}

function NewWorkflowModal({ onClose, onCreate }: NewWorkflowModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<TriggerType>('manual')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    try {
      const def = await api.createWorkflow({
        name: name.trim(),
        description: description.trim() || undefined,
        enabled: false,
        trigger: { type: triggerType },
        nodes: [],
        edges: [],
        version: 1,
      })
      onCreate(def as unknown as WorkflowDefinition)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--separator)',
          borderRadius: 12,
          padding: 24,
          width: 400,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            New Workflow
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Workflow"
            style={{
              padding: '8px 10px', borderRadius: 6, border: '1px solid var(--separator)',
              background: 'var(--fill-secondary)', color: 'var(--text-primary)', fontSize: 13,
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description…"
            rows={2}
            style={{
              padding: '8px 10px', borderRadius: 6, border: '1px solid var(--separator)',
              background: 'var(--fill-secondary)', color: 'var(--text-primary)', fontSize: 13,
              resize: 'none', fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Trigger Type</label>
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            style={{
              padding: '8px 10px', borderRadius: 6, border: '1px solid var(--separator)',
              background: 'var(--fill-secondary)', color: 'var(--text-primary)', fontSize: 13,
            }}
          >
            <option value="manual">Manual</option>
            <option value="cron">Cron</option>
            <option value="webhook">Webhook</option>
            <option value="kanban_card_added">Kanban Card Added</option>
            <option value="kanban_card_moved">Kanban Card Moved</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 6, border: '1px solid var(--separator)',
              background: 'transparent', color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 13, cursor: 'pointer',
              opacity: loading || !name.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Workflow Card ────────────────────────────────────────────────────────────

interface WorkflowCardProps {
  workflow: WorkflowDefinition
  onEdit: () => void
  onRun: () => void
  onToggle: () => void
}

function WorkflowCard({ workflow, onEdit, onRun, onToggle }: WorkflowCardProps) {
  return (
    <div
      style={{
        background: 'var(--material-regular)',
        border: '1px solid var(--separator)',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
          {workflow.name}
        </div>
        {workflow.description && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            {workflow.description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 11, padding: '1px 8px', borderRadius: 10,
              background: 'var(--fill-tertiary)', color: 'var(--text-secondary)',
            }}
          >
            {workflow.trigger?.type ?? 'manual'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>
            {workflow.nodes?.length ?? 0} nodes
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Enabled toggle */}
        <button
          onClick={onToggle}
          aria-label={workflow.enabled ? 'Disable' : 'Enable'}
          style={{
            position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none',
            cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s',
            background: workflow.enabled ? '#22c55e' : 'var(--fill-tertiary)',
          }}
        >
          <span
            style={{
              display: 'block', width: 14, height: 14, borderRadius: '50%',
              background: '#fff', position: 'absolute', top: 3,
              transform: workflow.enabled ? 'translateX(18px)' : 'translateX(3px)',
              transition: 'transform 0.2s',
            }}
          />
        </button>

        <button
          onClick={onEdit}
          title="Edit"
          style={{
            background: 'none', border: '1px solid var(--separator)', borderRadius: 6,
            padding: '5px 8px', cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
          }}
        >
          <Pencil size={13} />
          Edit
        </button>

        <button
          onClick={onRun}
          title="Run"
          style={{
            background: 'var(--accent)', border: 'none', borderRadius: 6,
            padding: '5px 8px', cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
          }}
        >
          <Play size={13} fill="#fff" />
          Run
        </button>
      </div>
    </div>
  )
}

// ─── Live Tab ────────────────────────────────────────────────────────────────

function LiveTab() {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const router = useRouter()
  const { pushFromEvent } = useNotifications()

  const refresh = useCallback(() => {
    // Poll all running/waiting runs - we fetch from a "live" endpoint
    api.listWorkflows()
      .then(async (wfs) => {
        const allRuns: WorkflowRun[] = []
        for (const wf of wfs as unknown as WorkflowDefinition[]) {
          try {
            const wfRuns = await api.getWorkflowRuns(wf.id) as unknown as WorkflowRun[]
            allRuns.push(...wfRuns.filter(r => r.status === 'running' || r.status === 'waiting' || r.status === 'queued'))
          } catch { /* skip */ }
        }
        setRuns(allRuns)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [refresh])

  async function handleApprove(runId: string) {
    try {
      await api.approveRun(runId)
      pushFromEvent('workflow_approved', { runId })
      refresh()
    } catch { /* ignore */ }
  }

  if (runs.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, color: 'var(--text-secondary)' }}>
        <CheckCircle size={32} style={{ color: 'var(--text-tertiary)' }} />
        <span>No live runs at the moment</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {runs.map((run) => (
        <div
          key={run.id}
          style={{
            background: 'var(--material-regular)', border: '1px solid var(--separator)',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          }}
          onClick={() => router.push(`/workflows/runs/${run.id}`)}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 2 }}>
              Run <code style={{ fontFamily: 'var(--font-mono)' }}>{run.id.slice(0, 8)}…</code>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Workflow: {run.workflowId}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 2 }}>
              Started {timeAgo(run.startedAt)}
            </div>
          </div>
          <RunStatusBadge status={run.status} />
          {run.status === 'waiting' && (
            <button
              onClick={(e) => { e.stopPropagation(); handleApprove(run.id) }}
              style={{
                background: '#3b82f6', color: '#fff', border: 'none',
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              }}
            >
              Approve
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab() {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    api.listWorkflows()
      .then(async (wfs) => {
        const allRuns: WorkflowRun[] = []
        for (const wf of wfs as unknown as WorkflowDefinition[]) {
          try {
            const wfRuns = await api.getWorkflowRuns(wf.id) as unknown as WorkflowRun[]
            allRuns.push(...wfRuns.filter(r => r.status === 'success' || r.status === 'error' || r.status === 'cancelled'))
          } catch { /* skip */ }
        }
        allRuns.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
        setRuns(allRuns)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', padding: 24 }}>
        <Clock size={16} />
        Loading history…
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 8, color: 'var(--text-secondary)' }}>
        <Clock size={32} style={{ color: 'var(--text-tertiary)' }} />
        <span>No completed runs yet</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {runs.map((run) => (
        <div
          key={run.id}
          style={{
            background: 'var(--material-regular)', border: '1px solid var(--separator)',
            borderRadius: 10, padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
          }}
          onClick={() => router.push(`/workflows/runs/${run.id}`)}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
              {run.id.slice(0, 16)}…
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 2 }}>
              {timeAgo(run.startedAt)} · {run.triggerType ?? 'manual'}
            </div>
          </div>
          <RunStatusBadge status={run.status} />
          {run.error && (
            <span style={{ fontSize: 11, color: '#ef4444', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {run.error}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  useBreadcrumbs([{ label: 'Workflows' }])
  const router = useRouter()
  const { pushFromEvent } = useNotifications()
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const refresh = useCallback(() => {
    api.listWorkflows()
      .then((data) => setWorkflows(data as unknown as WorkflowDefinition[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function handleRun(wf: WorkflowDefinition) {
    try {
      const result = await api.triggerWorkflow(wf.id) as Record<string, unknown>
      const runId = result.runId ?? result.id
      if (runId) {
        pushFromEvent('workflow_triggered', { runId, name: wf.name })
        router.push(`/workflows/runs/${runId}`)
      }
    } catch { /* ignore */ }
  }

  async function handleToggle(wf: WorkflowDefinition) {
    try {
      await api.toggleWorkflow(wf.id)
      setWorkflows((prev) => prev.map((w) => w.id === wf.id ? { ...w, enabled: !w.enabled } : w))
    } catch { /* ignore */ }
  }

  return (
    <PageLayout>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Header */}
        <header style={{
          flexShrink: 0, background: 'var(--material-regular)', borderBottom: '1px solid var(--separator)',
          padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
              Workflows
            </h1>
            {!loading && (
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {workflows.length} total · {workflows.filter(w => w.enabled).length} enabled
              </p>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={15} />
            New Workflow
          </button>
        </header>

        {/* Tabs */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Tabs defaultValue="workflows" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '0 24px', borderBottom: '1px solid var(--separator)', flexShrink: 0, background: 'var(--material-regular)' }}>
              <TabsList variant="line">
                <TabsTrigger value="workflows">Workflows</TabsTrigger>
                <TabsTrigger value="live">Live</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              <TabsContent value="workflows">
                {loading ? (
                  <div style={{ color: 'var(--text-secondary)', padding: 24 }}>Loading workflows…</div>
                ) : workflows.length === 0 ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: 200, gap: 8, color: 'var(--text-secondary)',
                  }}>
                    <span style={{ fontSize: 14 }}>No workflows yet.</span>
                    <button
                      onClick={() => setShowModal(true)}
                      style={{
                        background: 'var(--accent)', color: '#fff', border: 'none',
                        borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      Create your first workflow
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {workflows.map((wf) => (
                      <WorkflowCard
                        key={wf.id}
                        workflow={wf}
                        onEdit={() => router.push(`/workflows/${wf.id}`)}
                        onRun={() => handleRun(wf)}
                        onToggle={() => handleToggle(wf)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="live">
                <LiveTab />
              </TabsContent>

              <TabsContent value="history">
                <HistoryTab />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      {showModal && (
        <NewWorkflowModal
          onClose={() => setShowModal(false)}
          onCreate={(def) => {
            setShowModal(false)
            setWorkflows((prev) => [def, ...prev])
            router.push(`/workflows/${def.id}`)
          }}
        />
      )}
    </PageLayout>
  )
}
