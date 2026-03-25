"use client"

import type { KanbanTopic } from '@/lib/kanban/types'

interface TopicBadgeProps {
  topic: KanbanTopic
  size?: 'sm' | 'md'
}

export function TopicBadge({ topic, size = 'sm' }: TopicBadgeProps) {
  const isPadded = size === 'md'
  return (
    <span
      className="inline-flex items-center gap-[var(--space-1)] rounded-full font-[var(--weight-medium)] shrink-0"
      style={{
        background: `color-mix(in srgb, ${topic.color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${topic.color} 35%, transparent)`,
        color: topic.color,
        fontSize: isPadded ? 'var(--text-caption1)' : 'var(--text-caption2)',
        padding: isPadded ? '3px 10px' : '2px 7px',
      }}
      title={topic.description || topic.name}
    >
      <span
        className="rounded-full shrink-0"
        style={{
          width: isPadded ? 7 : 6,
          height: isPadded ? 7 : 6,
          background: topic.color,
        }}
      />
      {topic.name}
    </span>
  )
}
