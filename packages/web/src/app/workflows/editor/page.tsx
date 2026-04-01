'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ReactFlow, Background, MiniMap, Controls, BackgroundVariant,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { PageLayout } from '@/components/page-layout'
import { api } from '@/lib/api'
import { useWorkflowStore } from '@/lib/workflows/store'
import { workflowNodeTypes } from '@/components/workflows/nodes'
import { NodePalette } from '@/components/workflows/node-palette'
import { PropertiesPanel } from '@/components/workflows/properties-panel'
import { useBreadcrumbs } from '@/context/breadcrumb-context'
import { useNotifications } from '@/hooks/use-notifications'
import type { WorkflowDefinition, NodeType } from '@/lib/workflows/types'
import { ArrowLeft, Play, Save } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNodeId() {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

interface ToolbarProps {
  workflow: WorkflowDefinition | null
  isDirty: boolean
  onSave: () => void
  onTestRun: () => void
  onToggle: () => void
}

function Toolbar({ workflow, isDirty, onSave, onTestRun, onToggle }: ToolbarProps) {
  const router = useRouter()

  return (
    <div
      style={{
        height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', borderBottom: '1px solid var(--separator)',
        background: 'var(--material-regular)',
      }}
    >
      <button
        onClick={() => router.push('/workflows')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
      >
        <ArrowLeft size={15} />
      </button>

      <div style={{ height: 20, width: 1, background: 'var(--separator)' }} />

      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
        {workflow?.name ?? 'Loading…'}
        {isDirty && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: 13 }}> (unsaved)</span>}
      </span>

      {workflow && (
        <button
          onClick={onToggle}
          style={{
            padding: '3px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600,
            background: workflow.enabled ? '#22c55e22' : 'var(--fill-secondary)',
            color: workflow.enabled ? '#22c55e' : 'var(--text-tertiary)',
          }}
        >
          {workflow.enabled ? '● Enabled' : '○ Disabled'}
        </button>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={onTestRun}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: '1px solid var(--separator)',
          borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
          color: 'var(--text-primary)',
        }}
      >
        <Play size={13} />
        Test Run
      </button>

      <button
        onClick={onSave}
        disabled={!isDirty}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'var(--accent)', border: 'none',
          borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: isDirty ? 'pointer' : 'default',
          color: '#fff', opacity: isDirty ? 1 : 0.5,
        }}
      >
        <Save size={13} />
        Save
      </button>
    </div>
  )
}

// ─── Editor Page ─────────────────────────────────────────────────────────────

export default function WorkflowEditorPage() {
  const id = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') ?? '' : ''
  const router = useRouter()
  const { pushFromEvent } = useNotifications()
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const dragTypeRef = useRef<NodeType | null>(null)

  const {
    nodes, edges, definition, isDirty,
    onNodesChange, onEdgesChange, onConnect,
    setDefinition, addNode, setDirty, setSelectedNodeId,
  } = useWorkflowStore()

  useBreadcrumbs([
    { label: 'Workflows', href: '/workflows' },
    { label: definition?.name ?? '…' },
  ])

  // Load workflow
  useEffect(() => {
    if (!id) return
    api.getWorkflow(id)
      .then((data) => setDefinition(data as unknown as WorkflowDefinition))
      .catch(() => {})
  }, [id, setDefinition])

  // Save
  const handleSave = useCallback(async () => {
    if (!definition || !id) return
    const store = useWorkflowStore.getState()
    const def = store.toDefinition()
    if (!def) return
    try {
      await api.updateWorkflow(id, def as unknown as Record<string, unknown>)
      setDirty(false)
      pushFromEvent('workflow_saved', { name: def.name })
    } catch { /* ignore */ }
  }, [definition, id, setDirty, pushFromEvent])

  // Test Run
  const handleTestRun = useCallback(async () => {
    if (!id) return
    try {
      const result = await api.triggerWorkflow(id) as Record<string, unknown>
      const runId = result.runId ?? result.id
      if (runId) {
        router.push(`/workflows/run?id=${runId}`)
      }
    } catch { /* ignore */ }
  }, [id, router])

  // Toggle
  const handleToggle = useCallback(async () => {
    if (!id || !definition) return
    try {
      await api.toggleWorkflow(id, !definition.enabled)
      setDefinition({ ...definition, enabled: !definition.enabled })
    } catch { /* ignore */ }
  }, [id, definition, setDefinition])

  // Drag from palette
  function handleDragStart(event: React.DragEvent, type: NodeType) {
    event.dataTransfer.effectAllowed = 'move'
    dragTypeRef.current = type
  }

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = dragTypeRef.current
      if (!type || !rfInstance) return
      dragTypeRef.current = null

      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })

      addNode({
        id: makeNodeId(),
        type,
        position,
        config: { nodeType: type },
      })
    },
    [rfInstance, addNode]
  )

  const handleNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    setSelectedNodeId(node.id)
  }, [setSelectedNodeId])

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [setSelectedNodeId])

  return (
    <PageLayout>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Toolbar
          workflow={definition}
          isDirty={isDirty}
          onSave={handleSave}
          onTestRun={handleTestRun}
          onToggle={handleToggle}
        />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Node Palette */}
          <NodePalette onDragStart={handleDragStart} />

          {/* Canvas */}
          <div
            style={{ flex: 1, position: 'relative' }}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              nodeTypes={workflowNodeTypes}
              onInit={setRfInstance}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <MiniMap zoomable pannable nodeStrokeWidth={3} />
              <Controls />
            </ReactFlow>
          </div>

          {/* Properties Panel */}
          <PropertiesPanel />
        </div>
      </div>
    </PageLayout>
  )
}
