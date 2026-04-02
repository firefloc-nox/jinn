export interface BoardColumn {
  id: string           // slug unique dans le board, ex: 'todo'
  title: string        // label affiché
  color?: string       // couleur optionnelle ex: '#3b82f6'
  order: number        // position 0-based
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
  columnId: string      // réfère BoardColumn.id
  priority?: 'low' | 'medium' | 'high'
  assigneeId?: string   // employee name
  workState?: 'idle' | 'working' | 'done' | 'failed'
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface Board {
  config: BoardConfig
  cards: BoardCard[]
}
