export interface BoardColumn {
  id: string
  title: string
  color?: string
  order: number
}

export interface BoardConfig {
  id: string
  name: string
  description?: string
  columns: BoardColumn[]
  createdAt: string
  updatedAt: string
}

export interface BoardCard {
  id: string
  title: string
  description?: string
  columnId: string
  priority?: 'low' | 'medium' | 'high'
  assigneeId?: string
  workState?: 'idle' | 'working' | 'done' | 'failed'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}
