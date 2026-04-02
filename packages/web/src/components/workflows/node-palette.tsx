'use client'

import { useEffect, useState } from 'react'
import { Zap, Bot, GitBranch, KanbanSquare, Bell, Clock, Check, X, RefreshCw, Puzzle, Globe, Variable, Shuffle, FileText } from 'lucide-react'
import type { NodeType } from '@/lib/workflows/types'
import { api } from '@/lib/api'
import { t, detectLang, type Lang } from '@/lib/workflows/i18n'

interface PaletteItem {
  type: NodeType
  label: string
  icon: React.ComponentType<{ size?: number }>
  color: string
  description?: string
}

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
  const [lang] = useState<Lang>(() => detectLang())
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  const PALETTE_SECTIONS: Array<{ title: string; items: PaletteItem[] }> = [
    {
      title: t('palette.triggers', lang),
      items: [
        { type: 'TRIGGER', label: t('node.TRIGGER', lang), icon: Zap, color: '#8b5cf6', description: t('desc.TRIGGER', lang) },
        { type: 'CRON', label: t('node.CRON', lang), icon: RefreshCw, color: '#f59e0b', description: t('desc.TRIGGER', lang) },
      ],
    },
    {
      title: t('palette.actions', lang),
      items: [
        { type: 'AGENT', label: t('node.AGENT', lang), icon: Bot, color: '#3b82f6', description: t('desc.AGENT', lang) },
        { type: 'NOTIFY', label: t('node.NOTIFY', lang), icon: Bell, color: '#3b82f6', description: t('desc.NOTIFY', lang) },
        { type: 'MOVE_CARD', label: t('node.MOVE_CARD', lang), icon: KanbanSquare, color: '#3b82f6', description: t('desc.MOVE_CARD', lang) },
        { type: 'HTTP', label: t('node.HTTP', lang), icon: Globe, color: '#06b6d4', description: t('desc.HTTP', lang) },
        { type: 'SET_VAR', label: t('node.SET_VAR', lang), icon: Variable, color: '#8b5cf6', description: t('desc.SET_VAR', lang) },
      ],
    },
    {
      title: t('palette.control', lang),
      items: [
        { type: 'CONDITION', label: t('node.CONDITION', lang), icon: GitBranch, color: '#f59e0b', description: t('desc.CONDITION', lang) },
        { type: 'WAIT', label: t('node.WAIT', lang), icon: Clock, color: '#f59e0b', description: t('desc.WAIT', lang) },
        { type: 'DONE', label: t('node.DONE', lang), icon: Check, color: '#22c55e', description: t('desc.DONE', lang) },
        { type: 'ERROR', label: t('node.ERROR', lang), icon: X, color: '#ef4444', description: t('desc.ERROR', lang) },
      ],
    },
    {
      title: t('palette.utils', lang),
      items: [
        { type: 'TRANSFORM', label: t('node.TRANSFORM', lang), icon: Shuffle, color: '#64748b', description: t('desc.TRANSFORM', lang) },
        { type: 'LOG', label: t('node.LOG', lang), icon: FileText, color: '#64748b', description: t('desc.LOG', lang) },
      ],
    },
  ]

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
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = `${item.color}22`
                  if (item.description) {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setTooltip({ text: item.description, x: rect.right + 8, y: rect.top })
                  }
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = `${item.color}11`
                  setTooltip(null)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 6,
                  border: `1px solid ${item.color}33`,
                  background: `${item.color}11`,
                  cursor: 'grab', userSelect: 'none',
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
                ;(e.currentTarget as HTMLElement).style.background = '#6366f122'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = '#6366f111'
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

      {/* Floating tooltip */}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            background: 'var(--bg)',
            border: '1px solid var(--separator)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            maxWidth: 200,
            zIndex: 9999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
            lineHeight: 1.4,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
