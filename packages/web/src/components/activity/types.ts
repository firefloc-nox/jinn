export type ActivityEventType = 'thinking' | 'tool_use' | 'tool_result' | 'text'

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  timestamp: number
  /** Tool name (for tool_use / tool_result) */
  toolName?: string
  /** JSON args (for tool_use) */
  args?: string
  /** Content text (thinking text, result content, or text chunk) */
  content?: string
  /** Whether the result was an error */
  isError?: boolean
  /** Result content (for tool_result) */
  resultContent?: string
}