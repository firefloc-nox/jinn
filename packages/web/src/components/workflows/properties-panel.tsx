'use client'

import { useEffect, useRef, useState } from 'react'
import { useWorkflowStore } from '@/lib/workflows/store'
import type { Node } from '@xyflow/react'
import { api } from '@/lib/api'
import type { NodeType } from '@/lib/workflows/types'
import type { Employee, BoardConfig } from '@/lib/api'
import { X } from 'lucide-react'
import { describeCron } from '@/lib/cron-utils'
import { t, detectLang, type Lang } from '@/lib/workflows/i18n'

// ─── Shared input styles ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 6,
  border: '1px solid var(--separator)', background: 'var(--fill-secondary)',
  color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
}

const presetBtnStyle = (active?: boolean): React.CSSProperties => ({
  padding: '4px 8px', borderRadius: 5, border: `1px solid ${active ? 'var(--accent)' : 'var(--separator)'}`,
  background: active ? 'var(--accent)' : 'var(--fill-secondary)',
  color: active ? '#fff' : 'var(--text-primary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
})

// ─── Helper components ───────────────────────────────────────────────────────

function HelpTip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%',
          background: 'var(--fill-tertiary)', color: 'var(--text-tertiary)',
          fontSize: 9, fontWeight: 700, cursor: 'help', lineHeight: 1,
        }}
      >?</span>
      {visible && (
        <span
          style={{
            position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg)', border: '1px solid var(--separator)',
            borderRadius: 6, padding: '6px 8px', fontSize: 11, color: 'var(--text-secondary)',
            width: 200, zIndex: 100, lineHeight: 1.4, whiteSpace: 'normal',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >{text}</span>
      )}
    </span>
  )
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center' }}>
        {label}
        {help && <HelpTip text={help} />}
      </label>
      {children}
    </div>
  )
}

function VarChips({ vars, onInsert }: { vars: string[]; onInsert: (v: string) => void }) {
  if (!vars.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {vars.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(`{{${v}}}`)}
          style={{
            padding: '2px 7px', borderRadius: 10, border: '1px solid var(--accent)',
            background: 'transparent', color: 'var(--accent)', fontSize: 10,
            cursor: 'pointer', fontFamily: 'var(--font-mono)',
          }}
        >{`{{${v}}}`}</button>
      ))}
    </div>
  )
}

// ─── Node forms ──────────────────────────────────────────────────────────────

function AgentForm({
  config, onChange, availableVars, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; availableVars: string[]; lang: Lang }) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const promptRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api.getOrg().then((o) => setEmployees(o.employees)).catch(() => {})
  }, [])

  function insertVar(v: string) {
    const ta = promptRef.current
    if (!ta) return
    const start = ta.selectionStart ?? ta.value.length
    const end = ta.selectionEnd ?? ta.value.length
    const newVal = ta.value.slice(0, start) + v + ta.value.slice(end)
    onChange('prompt', newVal)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + v.length; ta.focus() }, 0)
  }

  return (
    <>
      <Field label={t('field.employee', lang)}>
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
      <Field label={t('field.prompt', lang)} help={t('help.prompt', lang)}>
        <textarea
          ref={promptRef}
          value={String(config.prompt ?? '')}
          onChange={(e) => onChange('prompt', e.target.value)}
          rows={4}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="What should the agent do?"
        />
        <VarChips vars={availableVars} onInsert={insertVar} />
      </Field>
      <Field label={t('field.output_var', lang)} help={t('help.output_var', lang)}>
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

function ConditionForm({
  config, onChange, availableVars, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; availableVars: string[]; lang: Lang }) {
  const [advanced, setAdvanced] = useState(false)

  const OPERATORS = [
    { value: '==', label: t('op.eq', lang) },
    { value: '!=', label: t('op.neq', lang) },
    { value: 'contains', label: t('op.contains', lang) },
    { value: '>', label: t('op.gt', lang) },
    { value: '<', label: t('op.lt', lang) },
    { value: 'empty', label: t('op.empty', lang) },
    { value: 'not_empty', label: t('op.not_empty', lang) },
  ]

  // Parse existing expression for the visual builder
  const [visVar, setVisVar] = useState('')
  const [visOp, setVisOp] = useState('==')
  const [visVal, setVisVal] = useState('')

  function buildExpression(variable: string, op: string, value: string): string {
    if (!variable) return ''
    if (op === 'empty') return `!${variable}`
    if (op === 'not_empty') return `!!${variable}`
    if (op === 'contains') return `${variable}.includes('${value}')`
    return `${variable} ${op} '${value}'`
  }

  function handleVisChange(newVar: string, newOp: string, newVal: string) {
    setVisVar(newVar)
    setVisOp(newOp)
    setVisVal(newVal)
    onChange('expression', buildExpression(newVar, newOp, newVal))
  }

  const noValue = visOp === 'empty' || visOp === 'not_empty'

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setAdvanced(!advanced)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', padding: '2px 0' }}
        >
          {advanced ? t('btn.simple', lang) : t('btn.advanced', lang)}
        </button>
      </div>

      {advanced ? (
        <Field label={t('field.expression', lang)} help={t('help.expression', lang)}>
          <input
            value={String(config.expression ?? '')}
            onChange={(e) => onChange('expression', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            placeholder="{{result}} === 'ok'"
          />
        </Field>
      ) : (
        <Field label={t('field.expression', lang)} help={t('help.expression', lang)}>
          <div style={{ display: 'flex', gap: 4 }}>
            <select
              value={visVar}
              onChange={(e) => handleVisChange(e.target.value, visOp, visVal)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">— var —</option>
              {availableVars.map((v) => (
                <option key={v} value={`{{${v}}}`}>{`{{${v}}}`}</option>
              ))}
              <option value="trigger.card.status">trigger.card.status</option>
              <option value="trigger.card.id">trigger.card.id</option>
            </select>
            <select
              value={visOp}
              onChange={(e) => handleVisChange(visVar, e.target.value, visVal)}
              style={{ ...inputStyle, flex: 1 }}
            >
              {OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            {!noValue && (
              <input
                value={visVal}
                onChange={(e) => handleVisChange(visVar, visOp, e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder="value"
              />
            )}
          </div>
          {!!config.expression && (
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', marginTop: 2 }}>
              {String(config.expression)}
            </span>
          )}
        </Field>
      )}

      <Field label={t('field.true_branch', lang)}>
        <input
          value={String(config.true_branch ?? 'true')}
          onChange={(e) => onChange('true_branch', e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label={t('field.false_branch', lang)}>
        <input
          value={String(config.false_branch ?? 'false')}
          onChange={(e) => onChange('false_branch', e.target.value)}
          style={inputStyle}
        />
      </Field>
    </>
  )
}

function NotifyForm({
  config, onChange, availableVars, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; availableVars: string[]; lang: Lang }) {
  const msgRef = useRef<HTMLTextAreaElement>(null)

  function insertVar(v: string) {
    const ta = msgRef.current
    if (!ta) return
    const start = ta.selectionStart ?? ta.value.length
    const end = ta.selectionEnd ?? ta.value.length
    const newVal = ta.value.slice(0, start) + v + ta.value.slice(end)
    onChange('template', newVal)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + v.length; ta.focus() }, 0)
  }

  const CONNECTORS = [
    { value: 'discord', label: '🎮 Discord' },
    { value: 'telegram', label: '✈️ Telegram' },
    { value: 'slack', label: '🟡 Slack' },
  ]

  return (
    <>
      <Field label={t('field.connector', lang)}>
        <select
          value={String(config.connector ?? 'discord')}
          onChange={(e) => onChange('connector', e.target.value)}
          style={inputStyle}
        >
          {CONNECTORS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </Field>
      <Field label={t('field.channel', lang)}>
        <input
          value={String(config.channel ?? '')}
          onChange={(e) => onChange('channel', e.target.value)}
          style={inputStyle}
          placeholder="#general"
        />
      </Field>
      <Field label={t('field.message', lang)}>
        <textarea
          ref={msgRef}
          value={String(config.template ?? '')}
          onChange={(e) => onChange('template', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="{{message}}"
        />
        <VarChips vars={availableVars} onInsert={insertVar} />
      </Field>
    </>
  )
}

function MoveCardForm({
  config, onChange, availableVars, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; availableVars: string[]; lang: Lang }) {
  const [boards, setBoards] = useState<BoardConfig[]>([])
  const [columns, setColumns] = useState<{ id: string; title: string }[]>([])
  const [cardMode, setCardMode] = useState<'trigger' | 'var' | 'custom'>('trigger')

  useEffect(() => {
    api.listBoards().then(setBoards).catch(() => {})
  }, [])

  useEffect(() => {
    const boardId = String(config.board ?? '')
    if (!boardId) { setColumns([]); return }
    const board = boards.find((b) => b.id === boardId)
    if (board) {
      setColumns(board.columns ?? [])
    } else {
      api.getBoard(boardId).then((d) => setColumns(d.config?.columns ?? [])).catch(() => {})
    }
  }, [config.board, boards])

  function handleCardModeChange(mode: 'trigger' | 'var' | 'custom') {
    setCardMode(mode)
    if (mode === 'trigger') onChange('card_id', '{{trigger.card.id}}')
    else onChange('card_id', '')
  }

  return (
    <>
      <Field label={t('field.board', lang)}>
        <select
          value={String(config.board ?? '')}
          onChange={(e) => onChange('board', e.target.value)}
          style={inputStyle}
        >
          <option value="">— select board —</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </Field>
      <Field label={t('field.to_column', lang)}>
        {columns.length > 0 ? (
          <select
            value={String(config.to_column ?? '')}
            onChange={(e) => onChange('to_column', e.target.value)}
            style={inputStyle}
          >
            <option value="">— select column —</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        ) : (
          <input
            value={String(config.to_column ?? '')}
            onChange={(e) => onChange('to_column', e.target.value)}
            style={inputStyle}
            placeholder="done"
          />
        )}
      </Field>
      <Field label={t('field.card', lang)}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {(['trigger', 'var', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleCardModeChange(mode)}
              style={presetBtnStyle(cardMode === mode)}
            >
              {mode === 'trigger' ? 'From trigger' : mode === 'var' ? 'From variable' : 'Custom'}
            </button>
          ))}
        </div>
        {cardMode === 'var' && (
          <select
            value={String(config.card_id ?? '')}
            onChange={(e) => onChange('card_id', e.target.value)}
            style={inputStyle}
          >
            <option value="">— select var —</option>
            {availableVars.map((v) => (
              <option key={v} value={`{{${v}}}`}>{`{{${v}}}`}</option>
            ))}
          </select>
        )}
        {cardMode === 'custom' && (
          <input
            value={String(config.card_id ?? '')}
            onChange={(e) => onChange('card_id', e.target.value)}
            style={inputStyle}
            placeholder="card-id or {{var}}"
          />
        )}
      </Field>
    </>
  )
}

function WaitForm({
  config, onChange, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; lang: Lang }) {
  const mode = String(config.mode ?? 'delay')

  const DELAY_PRESETS = [
    { label: t('wait.1min', lang), ms: 60000 },
    { label: t('wait.5min', lang), ms: 300000 },
    { label: t('wait.30min', lang), ms: 1800000 },
    { label: t('wait.1h', lang), ms: 3600000 },
    { label: t('wait.24h', lang), ms: 86400000 },
  ]

  return (
    <>
      <Field label={t('field.mode', lang)}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => onChange('mode', 'delay')}
            style={{
              ...presetBtnStyle(mode === 'delay'),
              flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2,
            }}
          >
            <span style={{ fontSize: 16 }}>⏱</span>
            <span style={{ fontSize: 11 }}>{lang === 'fr' ? 'Délai' : 'Delay'}</span>
          </button>
          <button
            type="button"
            onClick={() => onChange('mode', 'human_approval')}
            style={{
              ...presetBtnStyle(mode === 'human_approval'),
              flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2,
            }}
          >
            <span style={{ fontSize: 16 }}>👤</span>
            <span style={{ fontSize: 11 }}>{lang === 'fr' ? 'Approbation' : 'Approval'}</span>
          </button>
        </div>
      </Field>
      {mode === 'delay' && (
        <Field label={t('field.delay', lang)}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {DELAY_PRESETS.map((p) => (
              <button
                key={p.ms}
                type="button"
                onClick={() => onChange('timeout_ms', p.ms)}
                style={presetBtnStyle(Number(config.timeout_ms) === p.ms)}
              >{p.label}</button>
            ))}
          </div>
          <input
            type="number"
            value={String(config.timeout_ms ?? '')}
            onChange={(e) => onChange('timeout_ms', Number(e.target.value))}
            style={inputStyle}
            placeholder="ms"
          />
        </Field>
      )}
      {mode === 'human_approval' && (
        <Field label={t('field.approval_message', lang)}>
          <textarea
            value={String(config.approval_message ?? '')}
            onChange={(e) => onChange('approval_message', e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Optional approval message..."
          />
        </Field>
      )}
    </>
  )
}

function CronForm({
  config, onChange, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; lang: Lang }) {
  const schedule = String(config.schedule ?? '* * * * *')
  let preview = ''
  try { preview = describeCron(schedule) } catch { /* invalid */ }

  const PRESETS = [
    { label: t('cron.every_day_9', lang), cron: '0 9 * * *' },
    { label: t('cron.every_monday', lang), cron: '0 9 * * 1' },
    { label: t('cron.every_hour', lang), cron: '0 * * * *' },
    { label: t('cron.every_15min', lang), cron: '*/15 * * * *' },
  ]

  return (
    <>
      <Field label="Action">
        <select
          value={String(config.action ?? 'trigger')}
          onChange={(e) => onChange('action', e.target.value)}
          style={inputStyle}
        >
          <option value="trigger">Trigger</option>
          <option value="pause">Pause</option>
          <option value="resume">Resume</option>
          <option value="delete">Delete</option>
        </select>
      </Field>
      <Field label={t('field.schedule', lang)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {PRESETS.map((p) => (
            <button
              key={p.cron}
              type="button"
              onClick={() => onChange('schedule', p.cron)}
              style={presetBtnStyle(schedule === p.cron)}
            >{p.label}</button>
          ))}
        </div>
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

function TriggerForm({
  config, onChange, workflowId, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; workflowId?: string; lang: Lang }) {
  const [boards, setBoards] = useState<BoardConfig[]>([])
  const [columns, setColumns] = useState<{ id: string; title: string }[]>([])
  const [copied, setCopied] = useState(false)
  const type = String(config.triggerType ?? 'manual')

  let cronPreview = ''
  if (type === 'cron') {
    const schedule = String(config.schedule ?? '')
    try { cronPreview = schedule ? describeCron(schedule) : '' } catch { /* invalid */ }
  }

  const webhookUrl = workflowId ? `/api/workflows/webhook/${workflowId}` : ''

  const CRON_PRESETS = [
    { label: t('cron.every_day_9', lang), cron: '0 9 * * *' },
    { label: t('cron.every_monday', lang), cron: '0 9 * * 1' },
    { label: t('cron.every_hour', lang), cron: '0 * * * *' },
    { label: t('cron.every_15min', lang), cron: '*/15 * * * *' },
  ]

  const TRIGGER_TYPES = [
    { value: 'manual', label: t('trigger.manual', lang) },
    { value: 'cron', label: t('trigger.cron', lang) },
    { value: 'webhook', label: t('trigger.webhook', lang) },
    { value: 'kanban_card_added', label: t('trigger.kanban_card_added', lang) },
    { value: 'kanban_card_moved', label: t('trigger.kanban_card_moved', lang) },
  ]

  useEffect(() => {
    if (type === 'kanban_card_added' || type === 'kanban_card_moved') {
      api.listBoards().then(setBoards).catch(() => {})
    }
  }, [type])

  useEffect(() => {
    const boardId = String(config.board ?? '')
    if (!boardId || !boards.length) { setColumns([]); return }
    const board = boards.find((b) => b.id === boardId)
    if (board) setColumns(board.columns ?? [])
  }, [config.board, boards])

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <>
      <Field label="Trigger Type">
        <select
          value={type}
          onChange={(e) => onChange('triggerType', e.target.value)}
          style={inputStyle}
        >
          {TRIGGER_TYPES.map((tt) => (
            <option key={tt.value} value={tt.value}>{tt.label}</option>
          ))}
        </select>
      </Field>

      {type === 'cron' && (
        <Field label={t('field.schedule', lang)}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {CRON_PRESETS.map((p) => (
              <button
                key={p.cron}
                type="button"
                onClick={() => onChange('schedule', p.cron)}
                style={presetBtnStyle(String(config.schedule) === p.cron)}
              >{p.label}</button>
            ))}
          </div>
          <input
            value={String(config.schedule ?? '')}
            onChange={(e) => onChange('schedule', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            placeholder="0 9 * * 1-5"
          />
          {cronPreview && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {cronPreview}
            </span>
          )}
        </Field>
      )}

      {type === 'webhook' && (
        <Field label="Webhook URL" help={t('help.webhook_url', lang)}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={webhookUrl}
              readOnly
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', cursor: 'text', flex: 1 }}
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              style={{ ...presetBtnStyle(copied), whiteSpace: 'nowrap' }}
            >
              {copied ? '✓' : t('btn.copy', lang)}
            </button>
          </div>
        </Field>
      )}

      {(type === 'kanban_card_added' || type === 'kanban_card_moved') && (
        <Field label={t('field.board', lang)}>
          <select
            value={String(config.board ?? '')}
            onChange={(e) => onChange('board', e.target.value)}
            style={inputStyle}
          >
            <option value="">— optional board —</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </Field>
      )}

      {type === 'kanban_card_moved' && (
        <Field label={t('field.to_column', lang)}>
          {columns.length > 0 ? (
            <select
              value={String(config.to_column ?? '')}
              onChange={(e) => onChange('to_column', e.target.value)}
              style={inputStyle}
            >
              <option value="">— any column —</option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          ) : (
            <input
              value={String(config.to_column ?? '')}
              onChange={(e) => onChange('to_column', e.target.value)}
              style={inputStyle}
              placeholder="e.g. done"
            />
          )}
        </Field>
      )}
    </>
  )
}

function HttpForm({
  config, onChange, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; lang: Lang }) {
  const method = String(config.method ?? 'GET')
  const showBody = ['POST', 'PUT', 'PATCH'].includes(method)

  return (
    <>
      <Field label={t('field.method', lang)}>
        <select
          value={method}
          onChange={(e) => onChange('method', e.target.value)}
          style={inputStyle}
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label={t('field.url', lang)} help={t('help.http_url', lang)}>
        <input
          value={String(config.url ?? '')}
          onChange={(e) => onChange('url', e.target.value)}
          style={inputStyle}
          placeholder="https://api.example.com/endpoint"
        />
      </Field>
      {showBody && (
        <Field label={t('field.body', lang)}>
          <textarea
            value={String(config.body ?? '')}
            onChange={(e) => onChange('body', e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11 }}
            placeholder='{"key": "value"}'
          />
        </Field>
      )}
      <Field label={t('field.output_var', lang)} help={t('help.output_var', lang)}>
        <input
          value={String(config.output_var ?? '')}
          onChange={(e) => onChange('output_var', e.target.value)}
          style={inputStyle}
          placeholder="http_result"
        />
      </Field>
    </>
  )
}

function SetVarForm({
  config, onChange, availableVars, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; availableVars: string[]; lang: Lang }) {
  const valRef = useRef<HTMLInputElement>(null)

  function insertVar(v: string) {
    const el = valRef.current
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    const newVal = el.value.slice(0, start) + v + el.value.slice(end)
    onChange('value', newVal)
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + v.length; el.focus() }, 0)
  }

  return (
    <>
      <Field label={t('field.variable', lang)}>
        <input
          value={String(config.variable ?? '')}
          onChange={(e) => onChange('variable', e.target.value.replace(/\s+/g, '_'))}
          style={inputStyle}
          placeholder="my_variable"
        />
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
          snake_case recommended
        </span>
      </Field>
      <Field label={t('field.value', lang)}>
        <input
          ref={valRef}
          value={String(config.value ?? '')}
          onChange={(e) => onChange('value', e.target.value)}
          style={inputStyle}
          placeholder="value or {{var}}"
        />
        <VarChips vars={availableVars} onInsert={insertVar} />
      </Field>
    </>
  )
}

function TransformForm({
  config, onChange, availableVars, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; availableVars: string[]; lang: Lang }) {
  const operation = String(config.operation ?? 'uppercase')
  const showRegex = operation === 'regex_extract'

  const OPERATIONS = [
    { value: 'json_parse', label: 'JSON Parse' },
    { value: 'json_stringify', label: 'JSON Stringify' },
    { value: 'uppercase', label: 'UPPERCASE' },
    { value: 'lowercase', label: 'lowercase' },
    { value: 'trim', label: 'Trim whitespace' },
    { value: 'regex_extract', label: 'Regex extract' },
  ]

  return (
    <>
      <Field label={`Input ${t('field.variable', lang)}`} help={t('help.transform', lang)}>
        <select
          value={String(config.input_var ?? '')}
          onChange={(e) => onChange('input_var', e.target.value)}
          style={inputStyle}
        >
          <option value="">— select var —</option>
          {availableVars.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label={t('field.operation', lang)}>
        <select
          value={operation}
          onChange={(e) => onChange('operation', e.target.value)}
          style={inputStyle}
        >
          {OPERATIONS.map((op) => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      </Field>
      {showRegex && (
        <Field label="Regex">
          <input
            value={String(config.regex ?? '')}
            onChange={(e) => onChange('regex', e.target.value)}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
            placeholder="([a-z]+)"
          />
        </Field>
      )}
      <Field label={t('field.output_var', lang)} help={t('help.output_var', lang)}>
        <input
          value={String(config.output_var ?? '')}
          onChange={(e) => onChange('output_var', e.target.value)}
          style={inputStyle}
          placeholder="transformed_result"
        />
      </Field>
    </>
  )
}

function LogForm({
  config, onChange, availableVars, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; availableVars: string[]; lang: Lang }) {
  const level = String(config.level ?? 'info')
  const msgRef = useRef<HTMLTextAreaElement>(null)

  function insertVar(v: string) {
    const ta = msgRef.current
    if (!ta) return
    const start = ta.selectionStart ?? ta.value.length
    const end = ta.selectionEnd ?? ta.value.length
    const newVal = ta.value.slice(0, start) + v + ta.value.slice(end)
    onChange('message', newVal)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + v.length; ta.focus() }, 0)
  }

  const LEVELS = [
    { value: 'info', label: 'ℹ️ Info' },
    { value: 'warn', label: '⚠️ Warn' },
    { value: 'error', label: '❌ Error' },
  ]

  return (
    <>
      <Field label={t('field.level', lang)}>
        <div style={{ display: 'flex', gap: 6 }}>
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => onChange('level', l.value)}
              style={{ ...presetBtnStyle(level === l.value), flex: 1 }}
            >{l.label}</button>
          ))}
        </div>
      </Field>
      <Field label={t('field.message', lang)}>
        <textarea
          ref={msgRef}
          value={String(config.message ?? '')}
          onChange={(e) => onChange('message', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Log message..."
        />
        <VarChips vars={availableVars} onInsert={insertVar} />
      </Field>
    </>
  )
}

// ─── Retry Config Form ────────────────────────────────────────────────────────

function RetryForm({
  config, onChange, lang,
}: { config: Record<string, unknown>; onChange: (k: string, v: unknown) => void; lang: Lang }) {
  const maxRetries = Number(config.maxRetries ?? 0)
  const retryDelayMs = Number(config.retryDelayMs ?? 1000)

  const RETRY_PRESETS = [
    { label: lang === 'fr' ? 'Aucun' : 'None', value: 0 },
    { label: '1', value: 1 },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '5', value: 5 },
  ]

  const DELAY_PRESETS = [
    { label: '1s', ms: 1000 },
    { label: '2s', ms: 2000 },
    { label: '5s', ms: 5000 },
    { label: '10s', ms: 10000 },
    { label: '30s', ms: 30000 },
  ]

  return (
    <>
      <div
        style={{
          marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--separator)',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {lang === 'fr' ? 'Configuration des retentatives' : 'Retry Configuration'}
        </span>
      </div>
      <Field
        label={lang === 'fr' ? 'Tentatives max' : 'Max Retries'}
        help={lang === 'fr' ? 'Nombre de retentatives en cas d\'échec (0 = pas de retry)' : 'Number of retry attempts on failure (0 = no retry)'}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {RETRY_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange('maxRetries', p.value)}
              style={presetBtnStyle(maxRetries === p.value)}
            >{p.label}</button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          max={10}
          value={maxRetries}
          onChange={(e) => onChange('maxRetries', Math.max(0, Math.min(10, Number(e.target.value))))}
          style={inputStyle}
        />
      </Field>
      {maxRetries > 0 && (
        <Field
          label={lang === 'fr' ? 'Délai entre retentatives' : 'Retry Delay'}
          help={lang === 'fr' ? 'Délai avant chaque retentative (augmente à chaque tentative)' : 'Delay before each retry attempt (increases with each attempt)'}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {DELAY_PRESETS.map((p) => (
              <button
                key={p.ms}
                type="button"
                onClick={() => onChange('retryDelayMs', p.ms)}
                style={presetBtnStyle(retryDelayMs === p.ms)}
              >{p.label}</button>
            ))}
          </div>
          <input
            type="number"
            min={100}
            step={100}
            value={retryDelayMs}
            onChange={(e) => onChange('retryDelayMs', Math.max(100, Number(e.target.value)))}
            style={inputStyle}
            placeholder="ms"
          />
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
            {lang === 'fr' ? `Délai: ${retryDelayMs}ms × numéro de tentative` : `Delay: ${retryDelayMs}ms × attempt number`}
          </span>
        </Field>
      )}
    </>
  )
}

// ─── Properties Panel ────────────────────────────────────────────────────────

export function PropertiesPanel() {
  const { selectedNodeId, nodes, definition, updateNodeConfig, setSelectedNodeId } = useWorkflowStore()
  const [lang] = useState<Lang>(() => detectLang())

  const selectedNode = nodes.find((n: Node) => n.id === selectedNodeId)
  const nodeType = selectedNode ? (String((selectedNode.data as Record<string, unknown>).nodeType ?? '').toUpperCase() as NodeType) : null
  const config = (selectedNode?.data ?? {}) as Record<string, unknown>
  const workflowId = definition?.id

  // Get all output_var values from nodes that precede the selected node
  const availableVars = nodes
    .filter((n: Node) => n.id !== selectedNodeId)
    .map((n: Node) => (n.data as Record<string, unknown>).output_var as string)
    .filter(Boolean)

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
          {nodeType ? t(`node.${nodeType}`, lang) : 'Properties'}
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
            {t('placeholder.no_node', lang)}
          </div>
        ) : (
          <>
            <Field label="Node ID">
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                {selectedNode.id}
              </span>
            </Field>

            {nodeType === 'AGENT' && <AgentForm config={config} onChange={handleChange} availableVars={availableVars} lang={lang} />}
            {nodeType === 'CONDITION' && <ConditionForm config={config} onChange={handleChange} availableVars={availableVars} lang={lang} />}
            {nodeType === 'NOTIFY' && <NotifyForm config={config} onChange={handleChange} availableVars={availableVars} lang={lang} />}
            {nodeType === 'MOVE_CARD' && <MoveCardForm config={config} onChange={handleChange} availableVars={availableVars} lang={lang} />}
            {nodeType === 'WAIT' && <WaitForm config={config} onChange={handleChange} lang={lang} />}
            {nodeType === 'CRON' && <CronForm config={config} onChange={handleChange} lang={lang} />}
            {nodeType === 'TRIGGER' && <TriggerForm config={config} onChange={handleChange} workflowId={workflowId} lang={lang} />}
            {nodeType === 'HTTP' && <HttpForm config={config} onChange={handleChange} lang={lang} />}
            {nodeType === 'SET_VAR' && <SetVarForm config={config} onChange={handleChange} availableVars={availableVars} lang={lang} />}
            {nodeType === 'TRANSFORM' && <TransformForm config={config} onChange={handleChange} availableVars={availableVars} lang={lang} />}
            {nodeType === 'LOG' && <LogForm config={config} onChange={handleChange} availableVars={availableVars} lang={lang} />}
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

            {/* Retry configuration - available for nodes that can fail and be retried */}
            {nodeType && !['TRIGGER', 'DONE', 'ERROR', 'CONDITION'].includes(nodeType) && (
              <RetryForm config={config} onChange={handleChange} lang={lang} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
