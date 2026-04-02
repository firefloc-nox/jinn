/**
 * Workflow Engine Types — Ph1
 */

// ── Enums ──────────────────────────────────────────────────────────────────

export enum NodeType {
  TRIGGER = 'trigger',
  AGENT = 'agent',
  CONDITION = 'condition',
  MOVE_CARD = 'move_card',
  NOTIFY = 'notify',
  WAIT = 'wait',
  CRON = 'cron',
  DONE = 'done',
  ERROR = 'error',
  HTTP = 'http',
  SET_VAR = 'set_var',
  TRANSFORM = 'transform',
  LOG = 'log',
}

export enum TriggerType {
  manual = 'manual',
  cron = 'cron',
  webhook = 'webhook',
  kanban_card_added = 'kanban_card_added',
  kanban_card_moved = 'kanban_card_moved',
  session_completed = 'session_completed',
}

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// ── Node Configs ───────────────────────────────────────────────────────────

export interface TriggerNodeConfig {
  trigger_type?: TriggerType;
}

export interface AgentNodeConfig {
  employee: string;
  prompt: string;
  output_var?: string;
  timeout_ms?: number;
}

export interface ConditionNodeConfig {
  expression: string;
  true_branch: string;
  false_branch: string;
}

export interface MoveCardNodeConfig {
  board: string;
  card_id?: string;
  card_id_var?: string;
  new_status: string;
}

export interface NotifyNodeConfig {
  connector: 'discord' | 'telegram' | 'slack';
  channel?: string;
  message: string;
}

export interface WaitNodeConfig {
  mode: 'delay' | 'human_approval';
  delay_ms?: number;
  approval_message?: string;
}

export interface CronNodeConfig {
  action: 'create' | 'pause' | 'resume' | 'delete';
  job_id?: string;
  schedule?: string;
  name?: string;
  employee?: string;
  prompt?: string;
}

export interface DoneNodeConfig {
  output_var?: string;
}

export type NodeConfig =
  | TriggerNodeConfig
  | AgentNodeConfig
  | ConditionNodeConfig
  | MoveCardNodeConfig
  | NotifyNodeConfig
  | WaitNodeConfig
  | CronNodeConfig
  | DoneNodeConfig;

// ── Workflow Definition ────────────────────────────────────────────────────

export interface WorkflowTrigger {
  type: TriggerType;
  cron?: string;
  timezone?: string;
  filter?: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label?: string;
  position?: { x: number; y: number };
  config: NodeConfig;
  max_attempts?: number;
  retry_delay_ms?: number;
}

export interface WorkflowEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  condition?: 'true' | 'false';
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version?: number;
  enabled: boolean;
  trigger: WorkflowTrigger;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at?: string;
  updated_at?: string;
}

// ── Run / Step Records ─────────────────────────────────────────────────────

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_version: number;
  status: RunStatus;
  trigger_type: string | null;
  trigger_payload: TriggerPayload | null;
  context: RunContext;
  current_node_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface WorkflowStep {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  status: StepStatus;
  input: unknown;
  output: unknown;
  error: string | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
}

// ── Payloads & Context ─────────────────────────────────────────────────────

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  status: string;
  [key: string]: unknown;
}

export interface TriggerPayload {
  type: TriggerType | string;
  card?: KanbanCard;
  board?: string;
  from?: string;
  to?: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
  approval_data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RunContext {
  run_id: string;
  workflow_id: string;
  trigger: TriggerPayload;
  [key: string]: unknown;
}

// ── Suspend Info ───────────────────────────────────────────────────────────

export interface SuspendInfo {
  reason: 'human_approval' | 'delay';
  resume_after?: string; // ISO timestamp
  node_id: string;
  message?: string;
}
