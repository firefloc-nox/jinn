'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ReactFlow, Background, BackgroundVariant, MiniMap, Controls,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { PageLayout } from '@/components/page-layout'
import { api } from '@/lib/api'
import { useWorkflowStore } from '@/lib/workflows/store'
import { workflowNodeTypes } from '@/components/workflows/nodes'
import { useBreadcrumbs } from '@/context/breadcrumb-context'
import type { WorkflowDefinition, WorkflowRun, WorkflowStep, StepStatus } from '@/lib/workflows/types'
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(diff / 3600000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${hrs}h ago`
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
    <span style={{ background: `${c.color}22`, color: c.color, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
      {c.label}
    </span>
  )
}

function StepStatusDot({ status }: { status: StepStatus }) {
  const colors: Record<StepStatus, string> = {
    pending: 'var(--text-quaternary)',
    running: '#f59e0b',
    success: '#22c55e',
    failed: '#ef4444',
    skipped: 'var(--text-tertiary)',
    waiting: '#3b82f6',
  }
  return (
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[status], display: 'inline-block', flexShrink: 0 }} />
  )
}

// ─── Step Logs Panel ──────────────────────────────────────────────────────────

function StepLogsPanel({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--separator)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--separator)',
        background: 'var(--material-regular)', flexShrink: 0,
        fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
      }}>
        Step Logs
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', marginTop: 16 }}>
            No steps yet
          </div>
        ) : (
          steps.map((step) => (
            <div
              key={step.id}
              style={{
                background: 'var(--material-regular)', border: '1px solid var(--separator)',
                borderRadius: 8, padding: '8px 10px', fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <StepStatusDot status={step.status} />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{step.nodeType}</span>
                <span style={{ color: 'var(--text-quaternary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  {step.nodeId.slice(0, 10)}…
                </span>
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                {timeAgo(step.startedAt)}
                {step.completedAt && ` → ${timeAgo(step.completedAt)}`}
              </div>
              {step.error && (
                <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {step.error}
                </div>
              )}
              {step.output != null && (
                <pre style={{
                  margin: '4px 0 0', padding: '4px 6px', background: 'var(--fill-secondary)',
                  borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)', overflow: 'auto', maxHeight: 80,
                }}>
                  {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkflowRunPage() {
  const runId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') ?? '' : ''
  const router = useRouter()
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const sseRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { nodes, edges, definition, setDefinition, setStepState, clearStepStates } = useWorkflowStore()

  useBreadcrumbs([
    { label: 'Workflows', href: '/workflows' },
    { label: `Run ${runId?.slice(0, 8)}…` },
  ])

  // Load run + definition
  useEffect(() => {
    if (!runId) return

    api.getRun(runId)
      .then(async (runData) => {
        const r = runData as unknown as WorkflowRun
        setRun(r)
        // Load workflow definition
        const wfId = r.workflowId ?? r.workflow_id
        if (!wfId) return
        const wfData = await api.getWorkflow(wfId)
        setDefinition(wfData as unknown as WorkflowDefinition)
        clearStepStates()
      })
      .catch(() => {})
  }, [runId, setDefinition, clearStepStates])

  // Load steps
  const refreshSteps = useCallback(() => {
    if (!runId) return
    api.getRunSteps(runId)
      .then((data) => {
        const s = data as unknown as WorkflowStep[]
        setSteps(s)
        // Sync step states into store
        for (const step of s) {
          setStepState(step.nodeId, step.status)
        }
      })
      .catch(() => {})
  }, [runId, setStepState])

  // SSE + polling
  useEffect(() => {
    if (!runId) return
    refreshSteps()

    // Try SSE
    let sseOk = false
    try {
      const es = new EventSource(`/api/workflows/runs/${runId}/stream`)
      sseRef.current = es

      es.addEventListener('step', (event) => {
        sseOk = true
        try {
          const data = JSON.parse(event.data) as { nodeId: string; status: StepStatus; step?: WorkflowStep }
          setStepState(data.nodeId, data.status)
          if (data.step) {
            setSteps((prev) => {
              const idx = prev.findIndex((s) => s.id === data.step!.id)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = data.step!
                return next
              }
              return [data.step!, ...prev]
            })
          }
        } catch { /* parse error */ }
      })

      es.addEventListener('run_update', (event) => {
        sseOk = true
        try {
          const data = JSON.parse(event.data) as WorkflowRun
          setRun(data)
        } catch { /* parse error */ }
      })

      es.onerror = () => {
        es.close()
        sseRef.current = null
      }
    } catch { /* SSE not available */ }

    // Polling fallback (5s)
    pollRef.current = setInterval(() => {
      if (!sseOk) {
        refreshSteps()
        api.getRun(runId)
          .then((data) => setRun(data as unknown as WorkflowRun))
          .catch(() => {})
      }
    }, 5000)

    return () => {
      sseRef.current?.close()
      sseRef.current = null
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [runId, refreshSteps, setStepState])

  async function handleApprove() {
    if (!runId) return
    try {
      await api.approveRun(runId)
      setRun((prev) => prev ? { ...prev, status: 'running' } : prev)
    } catch { /* ignore */ }
  }

  async function handleReject() {
    if (!runId) return
    try {
      await api.cancelRun(runId)
      setRun((prev) => prev ? { ...prev, status: 'cancelled' } : prev)
    } catch { /* ignore */ }
  }

  return (
    <PageLayout>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{
          height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 16px', borderBottom: '1px solid var(--separator)',
          background: 'var(--material-regular)',
        }}>
          <button
            onClick={() => router.push('/workflows')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}
          >
            <ArrowLeft size={15} />
          </button>
          <div style={{ height: 20, width: 1, background: 'var(--separator)' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
            {definition?.name ?? 'Workflow Run'}
          </span>
          {run && <RunStatusBadge status={run.status} />}
          <div style={{ flex: 1 }} />
          {run?.status === 'waiting' && (
            <>
              <button
                onClick={handleApprove}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: '#22c55e', border: 'none', borderRadius: 6,
                  padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#fff',
                }}
              >
                <CheckCircle size={13} />
                Approve
              </button>
              <button
                onClick={handleReject}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: '#ef4444', border: 'none', borderRadius: 6,
                  padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#fff',
                }}
              >
                <XCircle size={13} />
                Reject
              </button>
            </>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Read-only ReactFlow */}
          <div style={{ flex: 1, position: 'relative' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={workflowNodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <MiniMap zoomable pannable />
              <Controls />
            </ReactFlow>
          </div>

          {/* Step logs */}
          <StepLogsPanel steps={steps} />
        </div>
      </div>
    </PageLayout>
  )
}
