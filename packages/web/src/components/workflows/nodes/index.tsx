'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Zap, Bot, GitBranch, KanbanSquare, Bell, Clock, Check, X,
  RefreshCw,
} from 'lucide-react'
import { useWorkflowStore, type WorkflowEditorStore } from '@/lib/workflows/store'
import type { NodeType, StepStatus } from '@/lib/workflows/types'

// ─── Color config ──────────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeType, string> = {
  TRIGGER: '#8b5cf6',
  AGENT: '#3b82f6',
  CONDITION: '#f59e0b',
  MOVE_CARD: '#3b82f6',
  NOTIFY: '#3b82f6',
  WAIT: '#f59e0b',
  CRON: '#f59e0b',
  DONE: '#22c55e',
  ERROR: '#ef4444',
}

const NODE_ICONS: Record<NodeType, React.ComponentType<{ size?: number }>> = {
  TRIGGER: Zap,
  AGENT: Bot,
  CONDITION: GitBranch,
  MOVE_CARD: KanbanSquare,
  NOTIFY: Bell,
  WAIT: Clock,
  CRON: RefreshCw,
  DONE: Check,
  ERROR: X,
}

const NODE_LABELS: Record<NodeType, string> = {
  TRIGGER: 'Trigger',
  AGENT: 'Agent',
  CONDITION: 'Condition',
  MOVE_CARD: 'Move Card',
  NOTIFY: 'Notify',
  WAIT: 'Wait',
  CRON: 'Cron',
  DONE: 'Done',
  ERROR: 'Error',
}

// ─── Status overlay ─────────────────────────────────────────────────────────

function StatusOverlay({ status }: { status: StepStatus }) {
  const config: Record<StepStatus, { symbol: string; color: string; animate?: boolean }> = {
    pending: { symbol: '•', color: 'var(--text-tertiary)' },
    running: { symbol: '↻', color: '#f59e0b', animate: true },
    success: { symbol: '✓', color: '#22c55e' },
    failed: { symbol: '✗', color: '#ef4444' },
    skipped: { symbol: '⟶', color: 'var(--text-tertiary)' },
    waiting: { symbol: '⏸', color: '#3b82f6' },
  }
  const c = config[status]
  return (
    <div
      style={{
        position: 'absolute',
        top: -8,
        right: -8,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'var(--bg)',
        border: `2px solid ${c.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        color: c.color,
        fontWeight: 700,
        zIndex: 10,
        animation: c.animate ? 'spin 1s linear infinite' : undefined,
      }}
    >
      {c.symbol}
    </div>
  )
}

// ─── Base node wrapper ───────────────────────────────────────────────────────

interface BaseNodeProps {
  nodeType: NodeType
  id: string
  selected?: boolean
  children?: React.ReactNode
  showTarget?: boolean
  showSource?: boolean
  /** For CONDITION node: show two sources */
  conditionSources?: boolean
}

function BaseNode({ nodeType, id, selected, children, showTarget = true, showSource = true, conditionSources = false }: BaseNodeProps) {
  const stepStates = useWorkflowStore((s: WorkflowEditorStore) => s.stepStates)
  const stepStatus = stepStates.get(id)
  const color = NODE_COLORS[nodeType]
  const Icon = NODE_ICONS[nodeType]
  const label = NODE_LABELS[nodeType]

  return (
    <div
      style={{
        position: 'relative',
        minWidth: 160,
        borderRadius: 8,
        border: `2px solid ${selected ? color : 'var(--separator)'}`,
        background: 'var(--bg)',
        boxShadow: selected ? `0 0 0 2px ${color}33` : 'var(--shadow-overlay)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: color,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ color: '#fff', display: 'flex' }}><Icon size={13} /></span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-primary)', minHeight: 32 }}>
        {children}
      </div>

      {/* Handles */}
      {showTarget && <Handle type="target" position={Position.Top} style={{ background: color, border: '2px solid var(--bg)' }} />}
      {showSource && !conditionSources && <Handle type="source" position={Position.Bottom} style={{ background: color, border: '2px solid var(--bg)' }} />}
      {conditionSources && (
        <>
          <Handle
            type="source"
            id="true"
            position={Position.Bottom}
            style={{ left: '30%', background: '#22c55e', border: '2px solid var(--bg)' }}
          />
          <Handle
            type="source"
            id="false"
            position={Position.Bottom}
            style={{ left: '70%', background: '#ef4444', border: '2px solid var(--bg)' }}
          />
          <div style={{ padding: '2px 10px 6px', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)' }}>
            <span style={{ color: '#22c55e' }}>true</span>
            <span style={{ color: '#ef4444' }}>false</span>
          </div>
        </>
      )}

      {stepStatus && <StatusOverlay status={stepStatus} />}
    </div>
  )
}

// ─── Individual node components ──────────────────────────────────────────────

export const TriggerNode = memo(({ id, data, selected }: NodeProps) => (
  <BaseNode nodeType="TRIGGER" id={id} selected={selected} showTarget={false}>
    <span style={{ color: 'var(--text-secondary)' }}>
      {String((data as Record<string, unknown>).triggerType ?? 'manual')}
    </span>
  </BaseNode>
))
TriggerNode.displayName = 'TriggerNode'

export const AgentNode = memo(({ id, data, selected }: NodeProps) => (
  <BaseNode nodeType="AGENT" id={id} selected={selected}>
    <div style={{ fontWeight: 600 }}>{String((data as Record<string, unknown>).employee ?? '—')}</div>
    <div style={{ color: 'var(--text-tertiary)', marginTop: 2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {String((data as Record<string, unknown>).prompt ?? '')}
    </div>
  </BaseNode>
))
AgentNode.displayName = 'AgentNode'

export const ConditionNode = memo(({ id, data, selected }: NodeProps) => (
  <BaseNode nodeType="CONDITION" id={id} selected={selected} conditionSources>
    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      {String((data as Record<string, unknown>).expression ?? '...')}
    </span>
  </BaseNode>
))
ConditionNode.displayName = 'ConditionNode'

export const MoveCardNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as Record<string, unknown>
  return (
    <BaseNode nodeType="MOVE_CARD" id={id} selected={selected}>
      <span style={{ color: 'var(--text-secondary)' }}>
        → {String(d.to_column ?? '?')} {d.board ? `(${String(d.board)})` : ''}
      </span>
    </BaseNode>
  )
})
MoveCardNode.displayName = 'MoveCardNode'

export const NotifyNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as Record<string, unknown>
  return (
    <BaseNode nodeType="NOTIFY" id={id} selected={selected}>
      <span style={{ color: 'var(--text-secondary)' }}>
        {String(d.connector ?? 'discord')} #{String(d.channel ?? '?')}
      </span>
    </BaseNode>
  )
})
NotifyNode.displayName = 'NotifyNode'

export const WaitNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as Record<string, unknown>
  return (
    <BaseNode nodeType="WAIT" id={id} selected={selected}>
      <span style={{ color: 'var(--text-secondary)' }}>
        {String(d.mode ?? 'delay')}
        {d.timeout_ms ? ` · ${String(d.timeout_ms)}ms` : ''}
      </span>
    </BaseNode>
  )
})
WaitNode.displayName = 'WaitNode'

export const CronNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as Record<string, unknown>
  return (
    <BaseNode nodeType="CRON" id={id} selected={selected}>
      <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {String(d.schedule ?? '* * * * *')}
      </span>
    </BaseNode>
  )
})
CronNode.displayName = 'CronNode'

export const DoneNode = memo(({ id, selected }: NodeProps) => (
  <BaseNode nodeType="DONE" id={id} selected={selected} showSource={false}>
    <span style={{ color: '#22c55e' }}>Workflow complete</span>
  </BaseNode>
))
DoneNode.displayName = 'DoneNode'

export const ErrorNode = memo(({ id, data, selected }: NodeProps) => (
  <BaseNode nodeType="ERROR" id={id} selected={selected} showSource={false}>
    <span style={{ color: '#ef4444' }}>
      {String((data as Record<string, unknown>).message ?? 'Error')}
    </span>
  </BaseNode>
))
ErrorNode.displayName = 'ErrorNode'

// ─── nodeTypes map for ReactFlow ─────────────────────────────────────────────

export const workflowNodeTypes = {
  trigger: TriggerNode,
  agent: AgentNode,
  condition: ConditionNode,
  move_card: MoveCardNode,
  notify: NotifyNode,
  wait: WaitNode,
  cron: CronNode,
  done: DoneNode,
  error: ErrorNode,
}
