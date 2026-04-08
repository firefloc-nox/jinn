import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import yaml from 'js-yaml';
import { WORKFLOWS_DIR } from '../shared/paths.js';
import { initDb } from '../sessions/registry.js';
import { logger } from '../shared/logger.js';
import {
  NodeType,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowStep,
  type TriggerPayload,
  type RunContext,
  type RunStatus,
  type StepStatus,
} from './types.js';
import { nodeRegistry, type NodeServices } from './registry.js';

// Register all handlers
import { triggerHandler } from './nodes/trigger.js';
import { agentHandler } from './nodes/agent.js';
import { conditionHandler } from './nodes/condition.js';
import { moveCardHandler } from './nodes/move-card.js';
import { notifyHandler } from './nodes/notify.js';
import { waitHandler } from './nodes/wait.js';
import { cronHandler } from './nodes/cron.js';
import { doneHandler } from './nodes/done.js';
import { httpHandler } from './nodes/http.js';
import { setVarHandler } from './nodes/set-var.js';
import { transformHandler } from './nodes/transform.js';
import { logHandler } from './nodes/log.js';

nodeRegistry.register(triggerHandler);
nodeRegistry.register(agentHandler);
nodeRegistry.register(conditionHandler);
nodeRegistry.register(moveCardHandler);
nodeRegistry.register(notifyHandler);
nodeRegistry.register(waitHandler);
nodeRegistry.register(cronHandler);
nodeRegistry.register(doneHandler);
nodeRegistry.register(httpHandler);
nodeRegistry.register(setVarHandler);
nodeRegistry.register(transformHandler);
nodeRegistry.register(logHandler);

// ── DB helpers ─────────────────────────────────────────────────────────────

function insertRun(run: WorkflowRun): void {
  const db = initDb();
  db.prepare(`
    INSERT INTO workflow_runs (id, workflow_id, workflow_version, status, trigger_type, trigger_payload, context, current_node_id, started_at, completed_at, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.workflow_id, run.workflow_version, run.status,
    run.trigger_type, run.trigger_payload ? JSON.stringify(run.trigger_payload) : null,
    JSON.stringify(run.context), run.current_node_id,
    run.started_at, run.completed_at, run.error,
  );
}

function updateRun(id: string, updates: Partial<WorkflowRun>): void {
  const db = initDb();
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
  if (updates.context !== undefined) { sets.push('context = ?'); vals.push(JSON.stringify(updates.context)); }
  if (updates.current_node_id !== undefined) { sets.push('current_node_id = ?'); vals.push(updates.current_node_id); }
  if (updates.started_at !== undefined) { sets.push('started_at = ?'); vals.push(updates.started_at); }
  if (updates.completed_at !== undefined) { sets.push('completed_at = ?'); vals.push(updates.completed_at); }
  if (updates.error !== undefined) { sets.push('error = ?'); vals.push(updates.error); }

  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE workflow_runs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function getRun(id: string): WorkflowRun | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM workflow_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return rowToRun(row);
}

function rowToRun(row: Record<string, unknown>): WorkflowRun {
  return {
    id: row.id as string,
    workflow_id: row.workflow_id as string,
    workflow_version: row.workflow_version as number,
    status: row.status as RunStatus,
    trigger_type: row.trigger_type as string | null,
    trigger_payload: row.trigger_payload ? JSON.parse(row.trigger_payload as string) as TriggerPayload : null,
    context: row.context ? JSON.parse(row.context as string) as RunContext : { run_id: row.id as string, workflow_id: row.workflow_id as string, trigger: { type: 'manual' } },
    current_node_id: row.current_node_id as string | null,
    started_at: row.started_at as string | null,
    completed_at: row.completed_at as string | null,
    error: row.error as string | null,
  };
}

function insertStep(step: WorkflowStep): void {
  const db = initDb();
  db.prepare(`
    INSERT INTO workflow_steps (id, run_id, node_id, node_type, status, input, output, error, retry_count, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    step.id, step.run_id, step.node_id, step.node_type, step.status,
    step.input !== undefined ? JSON.stringify(step.input) : null,
    step.output !== undefined ? JSON.stringify(step.output) : null,
    step.error, step.retry_count, step.started_at, step.completed_at,
  );
}

function updateStep(id: string, updates: Partial<WorkflowStep>): void {
  const db = initDb();
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
  if (updates.output !== undefined) { sets.push('output = ?'); vals.push(JSON.stringify(updates.output)); }
  if (updates.error !== undefined) { sets.push('error = ?'); vals.push(updates.error); }
  if (updates.retry_count !== undefined) { sets.push('retry_count = ?'); vals.push(updates.retry_count); }
  if (updates.started_at !== undefined) { sets.push('started_at = ?'); vals.push(updates.started_at); }
  if (updates.completed_at !== undefined) { sets.push('completed_at = ?'); vals.push(updates.completed_at); }

  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE workflow_steps SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function getSteps(runId: string): WorkflowStep[] {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY rowid ASC').all(runId) as Record<string, unknown>[];
  return rows.map(rowToStep);
}

function rowToStep(row: Record<string, unknown>): WorkflowStep {
  return {
    id: row.id as string,
    run_id: row.run_id as string,
    node_id: row.node_id as string,
    node_type: row.node_type as string,
    status: row.status as StepStatus,
    input: row.input ? JSON.parse(row.input as string) : null,
    output: row.output ? JSON.parse(row.output as string) : null,
    error: row.error as string | null,
    retry_count: row.retry_count as number,
    started_at: row.started_at as string | null,
    completed_at: row.completed_at as string | null,
  };
}

// ── Runner ─────────────────────────────────────────────────────────────────

export class WorkflowRunner extends EventEmitter {
  private services: NodeServices = {};

  setServices(services: NodeServices): void {
    this.services = services;
  }

  loadDefinition(id: string): WorkflowDefinition {
    const candidates = [
      path.join(WORKFLOWS_DIR, `${id}.yaml`),
      path.join(WORKFLOWS_DIR, `${id}.yml`),
    ];

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return yaml.load(raw) as WorkflowDefinition;
      }
    }
    throw new Error(`Workflow definition not found: ${id}`);
  }

  async createRun(workflowId: string, triggerPayload: TriggerPayload): Promise<WorkflowRun> {
    const def = this.loadDefinition(workflowId);
    const runId = randomUUID();
    const context: RunContext = {
      run_id: runId,
      workflow_id: workflowId,
      trigger: triggerPayload,
    };

    const run: WorkflowRun = {
      id: runId,
      workflow_id: workflowId,
      workflow_version: def.version ?? 1,
      status: 'queued',
      trigger_type: triggerPayload.type ?? null,
      trigger_payload: triggerPayload,
      context,
      current_node_id: null,
      started_at: null,
      completed_at: null,
      error: null,
    };

    insertRun(run);
    return run;
  }

  async executeRun(runId: string): Promise<void> {
    const run = getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const def = this.loadDefinition(run.workflow_id);
    const now = new Date().toISOString();

    updateRun(runId, { status: 'running', started_at: now });
    this.emit('run.started', { runId, workflowId: run.workflow_id });

    const context = run.context;

    // Build edge map: nodeId -> [nextNodeIds]
    const edgeMap = new Map<string, string[]>();
    for (const edge of def.edges) {
      const existing = edgeMap.get(edge.source) ?? [];
      existing.push(edge.target);
      edgeMap.set(edge.source, existing);
    }

    // Build node map
    const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));

    // Find starting node (trigger node or first node)
    const triggerNode = def.nodes.find((n) => n.type === NodeType.TRIGGER);
    let currentNodeId = triggerNode?.id ?? def.nodes[0]?.id;

    if (!currentNodeId) {
      const err = 'Workflow has no nodes';
      updateRun(runId, { status: 'failed', error: err, completed_at: new Date().toISOString() });
      this.emit('run.error', { runId, error: err });
      return;
    }

    const services: NodeServices = {
      ...this.services,
      resumeRun: (rid: string, data: Record<string, unknown>) => this.resumeRun(rid, data),
    };

    try {
      while (currentNodeId) {
        const node = nodeMap.get(currentNodeId);
        if (!node) {
          throw new Error(`Node not found: ${currentNodeId}`);
        }

        // Terminal nodes
        if (node.type === NodeType.DONE) {
          const stepId = randomUUID();
          insertStep({
            id: stepId, run_id: runId, node_id: node.id, node_type: node.type,
            status: 'running', input: context, output: null, error: null,
            retry_count: 0, started_at: new Date().toISOString(), completed_at: null,
          });
          updateRun(runId, { current_node_id: currentNodeId, context });
          this.emit('step.started', { runId, nodeId: currentNodeId, stepId });

          await nodeRegistry.execute(node, context, services);

          updateStep(stepId, { status: 'completed', completed_at: new Date().toISOString(), output: context });
          this.emit('step.completed', { runId, nodeId: currentNodeId, stepId });

          updateRun(runId, { status: 'completed', completed_at: new Date().toISOString(), context });
          this.emit('run.completed', { runId, workflowId: run.workflow_id });
          return;
        }

        if (node.type === NodeType.ERROR) {
          const errMsg = String((node.config as Record<string, unknown>).message ?? 'Workflow error node reached');
          throw new Error(errMsg);
        }

        updateRun(runId, { current_node_id: currentNodeId, context });

        // Retry configuration: new retry config takes precedence over legacy fields
        // Default: 0 retries (no retry) unless explicitly configured
        const maxRetries = node.retry?.maxRetries ?? node.max_attempts ?? 0;
        const retryDelayMs = node.retry?.retryDelayMs ?? node.retry_delay_ms ?? 1000;
        const maxAttempts = maxRetries + 1; // Total attempts = retries + 1 initial attempt
        let lastError: Error | undefined;
        let stepId: string | undefined;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          stepId = randomUUID();
          const stepNow = new Date().toISOString();
          insertStep({
            id: stepId, run_id: runId, node_id: node.id, node_type: node.type,
            status: 'running', input: context, output: null, error: null,
            retry_count: attempt, started_at: stepNow, completed_at: null,
          });

          this.emit('step.started', { runId, nodeId: currentNodeId, stepId, attempt });

          try {
            const result = await nodeRegistry.execute(node, context, services);

            // Handle suspend
            if (result.suspend) {
              updateStep(stepId, {
                status: 'completed',
                output: result.output,
                completed_at: new Date().toISOString(),
              });
              this.emit('step.completed', { runId, nodeId: currentNodeId, stepId });
              updateRun(runId, { status: 'waiting', context, current_node_id: currentNodeId });
              this.emit('run.suspended', { runId, suspend: result.suspend });
              return;
            }

            // Apply context updates from node result
            if (result.context_updates) {
              Object.assign(context, result.context_updates);
              updateRun(runId, { context });
            }

            updateStep(stepId, {
              status: 'completed',
              output: result.output,
              completed_at: new Date().toISOString(),
            });
            this.emit('step.completed', { runId, nodeId: currentNodeId, stepId });

            // Determine next node
            let nextId: string | null = null;
            if (result.next) {
              nextId = Array.isArray(result.next) ? result.next[0] : result.next;
            } else {
              const edges = edgeMap.get(currentNodeId);
              nextId = edges?.[0] ?? null;
            }

            currentNodeId = nextId ?? '';
            lastError = undefined;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const isRetrying = attempt + 1 < maxAttempts;
            const retryInfo = isRetrying ? `, retrying in ${retryDelayMs}ms...` : ' (no more retries)';
            logger.warn(`[workflow:runner] Step ${node.id} failed (attempt ${attempt + 1}/${maxAttempts})${retryInfo}: ${lastError.message}`);

            updateStep(stepId, {
              status: attempt + 1 >= maxAttempts ? 'failed' : 'failed',
              error: lastError.message,
              completed_at: new Date().toISOString(),
              retry_count: attempt,
            });
            this.emit('step.failed', { runId, nodeId: currentNodeId, stepId, error: lastError.message, attempt });

            if (attempt + 1 < maxAttempts) {
              await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
            }
          }
        }

        if (lastError) {
          throw lastError;
        }
      }

      // Reached end without DONE node
      updateRun(runId, { status: 'completed', completed_at: new Date().toISOString(), context });
      this.emit('run.completed', { runId, workflowId: run.workflow_id });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[workflow:runner] Run ${runId} failed: ${errMsg}`);
      updateRun(runId, { status: 'failed', error: errMsg, completed_at: new Date().toISOString(), context });
      this.emit('run.error', { runId, error: errMsg });
    }
  }

  async resumeRun(runId: string, approvalData: Record<string, unknown>): Promise<void> {
    const run = getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.status !== 'waiting') throw new Error(`Run ${runId} is not waiting (status: ${run.status})`);

    // Inject approval data into context
    if (approvalData) {
      run.context['approval_data'] = approvalData;
      if (run.trigger_payload) {
        run.trigger_payload.approval_data = approvalData;
      }
    }

    // Find the next node after the current wait node
    const def = this.loadDefinition(run.workflow_id);
    const edgeMap = new Map<string, string[]>();
    for (const edge of def.edges) {
      const existing = edgeMap.get(edge.source) ?? [];
      existing.push(edge.target);
      edgeMap.set(edge.source, existing);
    }

    const currentNodeId = run.current_node_id;
    if (!currentNodeId) throw new Error('Run has no current_node_id');

    const nextNodes = edgeMap.get(currentNodeId);
    const nextNodeId = nextNodes?.[0];

    if (!nextNodeId) {
      // No next node — mark as completed
      updateRun(runId, { status: 'completed', completed_at: new Date().toISOString(), context: run.context });
      this.emit('run.completed', { runId });
      return;
    }

    // Update context and move to next node
    updateRun(runId, { context: run.context, current_node_id: nextNodeId });

    // Continue execution from next node
    const modifiedRun = getRun(runId)!;
    modifiedRun.context['approval_data'] = approvalData;

    // Re-execute from the next node
    await this._continueRun(runId, def, nextNodeId, run.context);
  }

  private async _continueRun(
    runId: string,
    def: WorkflowDefinition,
    startNodeId: string,
    context: RunContext,
  ): Promise<void> {
    const edgeMap = new Map<string, string[]>();
    for (const edge of def.edges) {
      const existing = edgeMap.get(edge.source) ?? [];
      existing.push(edge.target);
      edgeMap.set(edge.source, existing);
    }

    const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
    let currentNodeId: string | null = startNodeId;

    const services: NodeServices = {
      ...this.services,
      resumeRun: (rid: string, data: Record<string, unknown>) => this.resumeRun(rid, data),
    };

    updateRun(runId, { status: 'running' });

    try {
      while (currentNodeId) {
        const node = nodeMap.get(currentNodeId);
        if (!node) throw new Error(`Node not found: ${currentNodeId}`);

        if (node.type === NodeType.DONE) {
          updateRun(runId, { status: 'completed', completed_at: new Date().toISOString(), context });
          this.emit('run.completed', { runId });
          return;
        }

        if (node.type === NodeType.ERROR) {
          throw new Error(String((node.config as Record<string, unknown>).message ?? 'Error node reached'));
        }

        updateRun(runId, { current_node_id: currentNodeId, context });

        // Retry configuration for _continueRun
        const maxRetries = node.retry?.maxRetries ?? node.max_attempts ?? 0;
        const retryDelayMs = node.retry?.retryDelayMs ?? node.retry_delay_ms ?? 1000;
        const maxAttempts = maxRetries + 1;
        let lastError: Error | undefined;
        let stepId: string | undefined;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          stepId = randomUUID();
          insertStep({
            id: stepId, run_id: runId, node_id: node.id, node_type: node.type,
            status: 'running', input: context, output: null, error: null,
            retry_count: attempt, started_at: new Date().toISOString(), completed_at: null,
          });

          try {
            const result = await nodeRegistry.execute(node, context, services);

            if (result.suspend) {
              updateStep(stepId, { status: 'completed', output: result.output, completed_at: new Date().toISOString() });
              updateRun(runId, { status: 'waiting', context, current_node_id: currentNodeId });
              this.emit('run.suspended', { runId, suspend: result.suspend });
              return;
            }

            // Apply context updates from node result
            if (result.context_updates) {
              Object.assign(context, result.context_updates);
              updateRun(runId, { context });
            }

            updateStep(stepId, { status: 'completed', output: result.output, completed_at: new Date().toISOString() });

            let nextId: string | null = null;
            if (result.next) {
              nextId = Array.isArray(result.next) ? result.next[0] : result.next;
            } else if (currentNodeId) {
              const edges = edgeMap.get(currentNodeId);
              nextId = edges?.[0] ?? null;
            }

            currentNodeId = nextId;
            lastError = undefined;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            const isRetrying = attempt + 1 < maxAttempts;
            const retryInfo = isRetrying ? `, retrying in ${retryDelayMs}ms...` : ' (no more retries)';
            logger.warn(`[workflow:runner] Step ${node.id} failed (attempt ${attempt + 1}/${maxAttempts})${retryInfo}: ${lastError.message}`);

            updateStep(stepId, {
              status: 'failed',
              error: lastError.message,
              completed_at: new Date().toISOString(),
              retry_count: attempt,
            });

            if (attempt + 1 < maxAttempts) {
              await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs * (attempt + 1)));
            }
          }
        }

        if (lastError) {
          throw lastError;
        }
      }

      updateRun(runId, { status: 'completed', completed_at: new Date().toISOString(), context });
      this.emit('run.completed', { runId });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateRun(runId, { status: 'failed', error: errMsg, completed_at: new Date().toISOString(), context });
      this.emit('run.error', { runId, error: errMsg });
    }
  }

  getRun(runId: string): WorkflowRun | undefined {
    return getRun(runId);
  }

  getSteps(runId: string): WorkflowStep[] {
    return getSteps(runId);
  }

  listRuns(filter?: { workflowId?: string; status?: string }): WorkflowRun[] {
    const db = initDb();
    const conditions: string[] = [];
    const vals: unknown[] = [];

    if (filter?.workflowId) {
      conditions.push('workflow_id = ?');
      vals.push(filter.workflowId);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      vals.push(filter.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM workflow_runs ${where} ORDER BY rowid DESC`).all(...vals) as Record<string, unknown>[];
    return rows.map(rowToRun);
  }

  cancelRun(runId: string): void {
    const run = getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      throw new Error(`Run ${runId} is already in terminal state: ${run.status}`);
    }
    updateRun(runId, { status: 'cancelled', completed_at: new Date().toISOString() });
    this.emit('run.cancelled', { runId });
  }
}
