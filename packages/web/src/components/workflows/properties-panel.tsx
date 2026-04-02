'use client'

import { useEffect, useState } from 'react'
import { useWorkflowStore } from '@/lib/workflows/store'
import type { Node } from '@xyflow/react'
import { api } from '@/lib/api'
import type { NodeType } from '@/lib/workflows/types'
import type { Employee } from '@/lib/api'
import { X } from 'lucide-react'
import { describeCron } from '@/lib/cron-utils'

// ─── Shared input styles ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 6,
  border: '1px solid var(--separator)', background: 'var(--fill-secondary)',
  color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── Node forms ──────────────────────────────────────────────────────────────

function AgentForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const [employees, setEmployees] = useState<Employee[]>([])

  useEffect(() => {
    api.getOrg().then((o) => setEmployees(o.employees)).catch(() => {})
  }, [])

  return (
    <>
      <Field label="Employee">
        <select
          value={String(config.employee ?? '')}
          onChange={(e) => onChange('employee', e.target.value)}
          style={inputStyle}
        >
          <option value="">— select —</option>
          {employees.map((emp) => (
            <option key={emp.name} value={emp.name}>{emp.displayName || emp.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Prompt">
        <textarea
          value={String(config.prompt ?? '')}
          onChange={(e) => onChange('prompt', e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="What should the agent do?"
        />
      </Field>
      <Field label="Output Variable">
        <input
          value={String(config.output_var ?? '')}
          onChange={(e) => onChange('output_var', e.target.value)}
          style={inputStyle}
          placeholder="result"
        />
      </Field>
    </>
  )
}

function ConditionForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Expression">
        <input
          value={String(config.expression ?? '')}
          onChange={(e) => onChange('expression', e.target.value)}
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          placeholder="{{result}} === 'ok'"
        />
      </Field>
      <Field label="True branch label">
        <input
          value={String(config.true_branch ?? 'true')}
          onChange={(e) => onChange('true_branch', e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="False branch label">
        <input
          value={String(config.false_branch ?? 'false')}
          onChange={(e) => onChange('false_branch', e.target.value)}
          style={inputStyle}
        />
      </Field>
    </>
  )
}

function NotifyForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Connector">
        <select
          value={String(config.connector ?? 'discord')}
          onChange={(e) => onChange('connector', e.target.value)}
          style={inputStyle}
        >
          <option value="discord">Discord</option>
          <option value="telegram">Telegram</option>
          <option value="slack">Slack</option>
        </select>
      </Field>
      <Field label="Channel">
        <input
          value={String(config.channel ?? '')}
          onChange={(e) => onChange('channel', e.target.value)}
          style={inputStyle}
          placeholder="#general"
        />
      </Field>
      <Field label="Message Template">
        <textarea
          value={String(config.template ?? '')}
          onChange={(e) => onChange('template', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="{{message}}"
        />
      </Field>
    </>
  )
}

function MoveCardForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Board">
        <input
          value={String(config.board ?? '')}
          onChange={(e) => onChange('board', e.target.value)}
          style={inputStyle}
          placeholder="board-id"
        />
      </Field>
      <Field label="Card ID / Variable">
        <input
          value={String(config.card_id ?? '')}
          onChange={(e) => onChange('card_id', e.target.value)}
          style={inputStyle}
          placeholder="{{card.id}}"
        />
      </Field>
      <Field label="To Column">
        <input
          value={String(config.to_column ?? '')}
          onChange={(e) => onChange('to_column', e.target.value)}
          style={inputStyle}
          placeholder="done"
        />
      </Field>
    </>
  )
}

function WaitForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  return (
    <>
      <Field label="Mode">
        <select
          value={String(config.mode ?? 'delay')}
          onChange={(e) => onChange('mode', e.target.value)}
          style={inputStyle}
        >
          <option value="delay">Delay</option>
          <option value="human_approval">Human Approval</option>
        </select>
      </Field>
      <Field label="Timeout (ms)">
        <input
          type="number"
          value={String(config.timeout_ms ?? '')}
          onChange={(e) => onChange('timeout_ms', Number(e.target.value))}
          style={inputStyle}
          placeholder="5000"
        />
      </Field>
    </>
  )
}

function CronForm({ config, onChange }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void }) {
  const schedule = String(config.schedule ?? '* * * * *')
  let preview = ''
  try { preview = describeCron(schedule) } catch { /* invalid */ }

  return (
    <>
      <Field label="Action">
        <select
          value={String(config.action ?? 'trigger')}
          onChange={(e) => onChange('action', e.target.value)}
          style={inputStyle}
        >
          <option value="trigger">Trigger</option>
          <option value="stop">Stop</option>
        </select>
      </Field>
      <Field label="Schedule (cron)">
        <input
          value={schedule}
          onChange={(e) => onChange('schedule', e.target.value)}
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          placeholder="0 9 * * 1-5"
        />
        {preview && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{preview}</span>
        )}
      </Field>
    </>
  )
}

function TriggerForm({ config, onChange, workflowId }: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; workflowId?: string }) {
  const type = String(config.triggerType ?? 'manual')

  let cronPreview = ''
  if (type === 'cron') {
    const schedule = String(config.schedule ?? '')
    try { cronPreview = schedule ? describeCron(schedule) : '' } catch { /* invalid */ }
  }

  const webhookUrl = workflowId ? `/api/workflows/webhook/${workflowId}` : ''

  return (
    <>
      <Field label="Trigger Type">
        <select
          value={type}
          onChange={(e) => onChange('triggerType', e.target.value)}
          style={inputStyle}
        >
          <option value="manual">Manual</option>
          <option value="cron">Cron</option>
          <option value="webhook">Webhook</option>
          <option value="kanban_card_added">Kanban Card Added</option>
          <option value="kanban_card_moved">Kanban Card Moved</option>
        </select>
      </Field>

      {type === 'cron' && (
        <Field label="Schedule">
          <input
            value={String(config.schedule ?? '')}
            onChange={(e) => onChange('schedule', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            placeholder="0 9 * * 1-5"
          />
          {cronPreview && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Prochain run : {cronPreview}
            </span>
          )}
        </Field>
      )}

      {type === 'webhook' && (
        <Field label="Webhook URL">
          <input
            value={webhookUrl}
            readOnly
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', cursor: 'text' }}
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
        </Field>
      )}

      {(type === 'kanban_card_added' || type === 'kanban_card_moved') && (
        <Field label="Board">
          <input
            value={String(config.board ?? '')}
            onChange={(e) => onChange('board', e.target.value)}
            style={inputStyle}
            placeholder="optional board id"
          />
        </Field>
      )}

      {type === 'kanban_card_moved' && (
        <Field label="To Column">
          <input
            value={String(config.to_column ?? '')}
            onChange={(e) => onChange('to_column', e.target.value)}
            style={inputStyle}
            placeholder="e.g. done"
          />
        </Field>
      )}
    </>
  )
}

// ─── Properties Panel ────────────────────────────────────────────────────────

export function PropertiesPanel() {
  const { selectedNodeId, nodes, definition, updateNodeConfig, setSelectedNodeId } = useWorkflowStore()

  const selectedNode = nodes.find((n: Node) => n.id === selectedNodeId)
  const nodeType = selectedNode ? (String((selectedNode.data as Record<string, unknown>).nodeType ?? '').toUpperCase() as NodeType) : null
  const config = (selectedNode?.data ?? {}) as Record<string, unknown>
  const workflowId = definition?.id

  function handleChange(key: string, value: unknown) {
    if (!selectedNodeId) return
    updateNodeConfig(selectedNodeId, { [key]: value })
  }

  return (
    <div
      style={{
        width: 280, flexShrink: 0, borderLeft: '1px solid var(--separator)',
        background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          padding: '12px 14px', borderBottom: '1px solid var(--separator)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--material-regular)', flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {nodeType ?? 'Properties'}
        </span>
        {selectedNodeId && (
          <button
            onClick={() => setSelectedNodeId(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!selectedNode ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', marginTop: 32 }}>
            Select a node to configure
          </div>
        ) : (
          <>
            <Field label="Node ID">
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                {selectedNode.id}
              </span>
            </Field>

            {nodeType === 'AGENT' && <AgentForm config={config} onChange={handleChange} />}
            {nodeType === 'CONDITION' && <ConditionForm config={config} onChange={handleChange} />}
            {nodeType === 'NOTIFY' && <NotifyForm config={config} onChange={handleChange} />}
            {nodeType === 'MOVE_CARD' && <MoveCardForm config={config} onChange={handleChange} />}
            {nodeType === 'WAIT' && <WaitForm config={config} onChange={handleChange} />}
            {nodeType === 'CRON' && <CronForm config={config} onChange={handleChange} />}
            {nodeType === 'TRIGGER' && <TriggerForm config={config} onChange={handleChange} workflowId={workflowId} />}
            {(nodeType === 'DONE' || nodeType === 'ERROR') && (
              <Field label="Message">
                <input
                  value={String(config.message ?? '')}
                  onChange={(e) => handleChange('message', e.target.value)}
                  style={inputStyle}
                  placeholder="Optional message"
                />
              </Field>
            )}
          </>
        )}
      </div>
    </div>
  )
}
