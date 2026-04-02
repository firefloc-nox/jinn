import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { WORKFLOWS_DIR } from '../shared/paths.js';
import { logger } from '../shared/logger.js';
import { WorkflowRunner } from './runner.js';
import {
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowStep,
  type TriggerPayload,
  TriggerType,
} from './types.js';
import type { NodeServices } from './registry.js';
import { registerAllCronTriggers, registerCronTrigger, unregisterCronTrigger } from './triggers/cron.js';
import { registerKanbanTriggers, type GatewayEventBus } from './triggers/kanban.js';

export class WorkflowEngine {
  private runner: WorkflowRunner;
  private definitions = new Map<string, WorkflowDefinition>();
  private eventBus: GatewayEventBus | null = null;

  constructor() {
    this.runner = new WorkflowRunner();
    // Forward runner events
    this.runner.on('run.started', (data) => logger.info(`[workflow:engine] Run started: ${data.runId}`));
    this.runner.on('run.completed', (data) => logger.info(`[workflow:engine] Run completed: ${data.runId}`));
    this.runner.on('run.error', (data) => logger.error(`[workflow:engine] Run failed: ${data.runId} — ${data.error}`));
  }

  setServices(services: NodeServices): void {
    this.runner.setServices(services);
  }

  setContext(bus: GatewayEventBus): void {
    this.eventBus = bus;
    registerKanbanTriggers(bus);
  }

  getRunner(): WorkflowRunner {
    return this.runner;
  }

  loadAll(): void {
    fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });

    const files = fs.readdirSync(WORKFLOWS_DIR).filter(
      (f) => f.endsWith('.yaml') || f.endsWith('.yml'),
    );

    let loaded = 0;
    for (const file of files) {
      try {
        const filePath = path.join(WORKFLOWS_DIR, file);
        const raw = fs.readFileSync(filePath, 'utf-8');
        const def = yaml.load(raw) as WorkflowDefinition;
        if (def && def.id) {
          this.definitions.set(def.id, def);
          loaded++;
          logger.info(`[workflow:engine] Loaded workflow "${def.id}" (enabled: ${def.enabled})`);
        }
      } catch (err) {
        logger.warn(`[workflow:engine] Failed to load ${file}: ${err instanceof Error ? err.message : err}`);
      }
    }

    logger.info(`[workflow:engine] Loaded ${loaded} workflow(s)`);

    // Register cron triggers for enabled workflows
    this._registerCronTriggers();
    registerAllCronTriggers(Array.from(this.definitions.values()));
  }

  reload(id: string): void {
    const candidates = [
      path.join(WORKFLOWS_DIR, `${id}.yaml`),
      path.join(WORKFLOWS_DIR, `${id}.yml`),
    ];

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const def = yaml.load(raw) as WorkflowDefinition;
        if (def && def.id) {
          this.definitions.set(def.id, def);
          logger.info(`[workflow:engine] Reloaded workflow "${def.id}"`);
          return;
        }
      }
    }
    throw new Error(`Workflow not found: ${id}`);
  }

  async trigger(workflowId: string, payload: TriggerPayload): Promise<WorkflowRun> {
    const def = this.definitions.get(workflowId);
    if (!def) throw new Error(`Workflow not found: ${workflowId}`);
    if (!def.enabled) throw new Error(`Workflow "${workflowId}" is disabled`);

    const run = await this.runner.createRun(workflowId, payload);

    // Execute async — don't await
    this.runner.executeRun(run.id).catch((err) => {
      logger.error(`[workflow:engine] Unhandled run error ${run.id}: ${err instanceof Error ? err.message : err}`);
    });

    return run;
  }

  async resume(runId: string, data: Record<string, unknown>): Promise<void> {
    return this.runner.resumeRun(runId, data);
  }

  cancel(runId: string): void {
    this.runner.cancelRun(runId);
  }

  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.definitions.values());
  }

  getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.definitions.get(id);
  }

  saveWorkflow(def: WorkflowDefinition): void {
    fs.mkdirSync(WORKFLOWS_DIR, { recursive: true });
    const filePath = path.join(WORKFLOWS_DIR, `${def.id}.yaml`);
    const content = yaml.dump(def, { indent: 2 });
    fs.writeFileSync(filePath, content, 'utf-8');
    this.definitions.set(def.id, def);
    logger.info(`[workflow:engine] Saved workflow "${def.id}"`);
    // Register/update cron trigger when workflow changes
    registerCronTrigger(def);
    if (!def.enabled) unregisterCronTrigger(def.id);
  }

  deleteWorkflow(id: string): void {
    const candidates = [
      path.join(WORKFLOWS_DIR, `${id}.yaml`),
      path.join(WORKFLOWS_DIR, `${id}.yml`),
    ];
    let deleted = false;
    for (const fp of candidates) {
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        deleted = true;
      }
    }
    if (!deleted) throw new Error(`Workflow "${id}" not found on disk`);
    this.definitions.delete(id);
    unregisterCronTrigger(id);
    logger.info(`[workflow:engine] Deleted workflow "${id}"`);
  }

  toggleWorkflow(id: string, enabled: boolean): WorkflowDefinition {
    const def = this.definitions.get(id);
    if (!def) throw new Error(`Workflow not found: ${id}`);
    const updated = { ...def, enabled };
    this.saveWorkflow(updated);
    return updated;
  }

  getRun(runId: string): WorkflowRun | undefined {
    return this.runner.getRun(runId);
  }

  getSteps(runId: string): WorkflowStep[] {
    return this.runner.getSteps(runId);
  }

  listRuns(filter?: { workflowId?: string; status?: string }): WorkflowRun[] {
    return this.runner.listRuns(filter);
  }

  getRunsByWorkflow(workflowId: string): WorkflowRun[] {
    return this.runner.listRuns({ workflowId });
  }

  private _registerCronTriggers(): void {
    for (const def of this.definitions.values()) {
      if (!def.enabled) continue;
      if (def.trigger?.type !== TriggerType.cron) continue;
      if (!def.trigger.cron) continue;

      // Cron triggers will be handled via the existing cron system
      // The engine just logs that it found one
      logger.info(`[workflow:engine] Workflow "${def.id}" has cron trigger: ${def.trigger.cron}`);
    }
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    this.runner.on(event, listener);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    this.runner.off(event, listener);
    return this;
  }
}

// Singleton
export const workflowEngine = new WorkflowEngine();
