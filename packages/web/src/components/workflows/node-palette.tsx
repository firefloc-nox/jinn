'use client'

import { useEffect, useState } from 'react'
import { Zap, Bot, GitBranch, KanbanSquare, Bell, Clock, Check, X, RefreshCw, Puzzle } from 'lucide-react'
import type { NodeType } from '@/lib/workflows/types'
import { api } from '@/lib/api'

interface PaletteItem {
  type: NodeType
  label: string
  icon: React.ComponentType<{ size?: number }>
  color: string
}

const PALETTE_SECTIONS: Array<{ title: string; items: PaletteItem[] }> = [
  {
    title: 'TRIGGERS',
    items: [
      { type: 'TRIGGER', label: 'Trigger', icon: Zap, color: '#8b5cf6' },
      { type: 'CRON', label: 'Cron', icon: RefreshCw, color: '#f59e0b' },
    ],
  },
  {
    title: 'ACTIONS',
    items: [
      { type: 'AGENT', label: 'Agent', icon: Bot, color: '#3b82f6' },
      { type: 'NOTIFY', label: 'Notify', icon: Bell, color: '#3b82f6' },
      { type: 'MOVE_CARD', label: 'Move Card', icon: KanbanSquare, color: '#3b82f6' },
    ],
  },
  {
    title: 'CONTROL',
    items: [
      { type: 'CONDITION', label: 'Condition', icon: GitBranch, color: '#f59e0b' },
      { type: 'WAIT', label: 'Wait', icon: Clock, color: '#f59e0b' },
      { type: 'DONE', label: 'Done', icon: Check, color: '#22c55e' },
      { type: 'ERROR', label: 'Error', icon: X, color: '#ef4444' },
    ],
  },
]

interface ModeNode {
  type: string
  label: string
  category: string
}

interface NodePaletteProps {
  onDragStart?: (event: React.DragEvent, type: NodeType) => void
  onModeDragStart?: (event: React.DragEvent, type: string) => void
}

export function NodePalette({ onDragStart, onModeDragStart }: NodePaletteProps) {
  const [modeNodes, setModeNodes] = useState<ModeNode[]>([])

  useEffect(() => {
    api.getNodeTypes()
      .then((data) => {
        const resp = data as unknown as { base?: string[]; modes?: ModeNode[] }
        if (resp && resp.modes && Array.isArray(resp.modes)) {
          setModeNodes(resp.modes)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <div
      style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--separator)',
        background: 'var(--bg)', display: 'flex', flexDirection: 'column',
        overflow: 'auto', padding: '12px 10px', gap: 16,
      }}
    >
      {PALETTE_SECTIONS.map((section) => (
        <div key={section.title} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
              color: 'var(--text-tertiary)', textTransform: 'uppercase', padding: '0 4px 4px',
            }}
          >
            {section.title}
          </div>
          {section.items.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.type}
                draggable
                onDragStart={onDragStart ? (e) => onDragStart(e, item.type) : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 6,
                  border: `1px solid ${item.color}33`,
                  background: `${item.color}11`,
                  cursor: 'grab', userSelect: 'none',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = `${item.color}22`
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = `${item.color}11`
                }}
              >
                <Icon size={13} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {item.label}
                </span>
              </div>
            )
          })}
        </div>
      ))}

      {modeNodes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div
            style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
              color: 'var(--text-tertiary)', textTransform: 'uppercase', padding: '0 4px 4px',
            }}
          >
            MODES
          </div>
          {modeNodes.map((mode) => (
            <div
              key={mode.type}
              draggable
              onDragStart={onModeDragStart ? (e) => onModeDragStart(e, mode.type) : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 6,
                border: '1px solid #6366f133',
                background: '#6366f111',
                cursor: 'grab', userSelect: 'none',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#6366f122'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#6366f111'
              }}
            >
              <Puzzle size={13} color="#6366f1" />
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                {mode.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
