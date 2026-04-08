export type NodeType = 'TRIGGER' | 'AGENT' | 'CONDITION' | 'MOVE_CARD' | 'NOTIFY' | 'WAIT' | 'CRON' | 'DONE' | 'ERROR' | 'HTTP' | 'SET_VAR' | 'TRANSFORM' | 'LOG'
export type TriggerType = 'manual' | 'cron' | 'webhook' | 'kanban_card_added' | 'kanban_card_moved'
export type RunStatus = 'queued' | 'running' | 'waiting' | 'success' | 'error' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'waiting'

export interface RetryConfig {
  maxRetries?: number
  retryDelayMs?: number
}

export interface WorkflowNode {
  id: string
  type: NodeType
  position?: { x: number; y: number }
  config: Record<string, unknown>
  retry?: RetryConfig
}

export interface WorkflowEdge {
  id?: string
  source: string
  target: string
  label?: string
  condition?: 'true' | 'false'
}

export interface WorkflowDefinition {
  id: string
  version: number
  name: string
  description?: string
  enabled: boolean
  tags?: string[]
  trigger: { type: TriggerType; [key: string]: unknown }
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export interface WorkflowRun {
  id: string
  workflowId?: string
  workflow_id?: string       // snake_case from API
  status: RunStatus
  triggerType?: string
  trigger_type?: string      // snake_case from API
  currentNodeId?: string
  current_node_id?: string   // snake_case from API
  startedAt?: string
  started_at?: string        // snake_case from API
  completedAt?: string
  completed_at?: string      // snake_case from API
  error?: string
}

export interface WorkflowStep {
  id: string
  runId: string
  nodeId: string
  nodeType: string
  status: StepStatus
  output?: unknown
  error?: string
  startedAt?: string
  completedAt?: string
}

export interface HttpNodeConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  output_var?: string
}

export interface SetVarNodeConfig {
  variable: string
  value: string
}

export interface TransformNodeConfig {
  input_var: string
  operation: 'json_parse' | 'json_stringify' | 'uppercase' | 'lowercase' | 'trim' | 'regex_extract'
  regex?: string
  output_var: string
}

export interface LogNodeConfig {
  level: 'info' | 'warn' | 'error'
  message: string
}
