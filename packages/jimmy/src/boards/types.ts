/**
 * Auto-dispatch configuration for a board column.
 * When enabled, moving a card to this column automatically triggers a session.
 */
export interface AutoDispatchConfig {
  /** Enable auto-dispatch for this column */
  enabled: boolean
  /** Employee to assign the session to (optional) */
  employee?: string
  /** Prompt template - {{card.title}}, {{card.description}} are replaced */
  promptTemplate?: string
  /** Runtime to use (optional, defaults to org default) */
  runtime?: string
  /** Model to use (optional) */
  model?: string
  /** Mark card workState as 'working' when session starts */
  setWorkingState?: boolean
}

export interface BoardColumn {
  id: string           // slug unique dans le board, ex: 'todo'
  title: string        // label affiché
  color?: string       // couleur optionnelle ex: '#3b82f6'
  order: number        // position 0-based
  /** Auto-dispatch config - triggers a session when card moves to this column */
  autoDispatch?: AutoDispatchConfig
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
  /** Session ID linked via auto-dispatch (if any) */
  sessionId?: string
}

export interface Board {
  config: BoardConfig
  cards: BoardCard[]
}
