import cron from 'node-cron';
import { workflowEngine } from '../engine.js';
import type { WorkflowDefinition } from '../types.js';

const cronJobs = new Map<string, cron.ScheduledTask>();

export function registerCronTrigger(wf: WorkflowDefinition) {
  if (!wf.enabled || wf.trigger.type !== 'cron') return;
  const schedule = (wf.trigger as { schedule?: string; cron?: string }).schedule
    ?? (wf.trigger as { schedule?: string; cron?: string }).cron;
  if (!schedule || !cron.validate(schedule)) return;

  const existing = cronJobs.get(wf.id);
  if (existing) existing.stop();

  const task = cron.schedule(schedule, () => {
    workflowEngine.trigger(wf.id, { type: 'cron', data: { scheduledAt: new Date().toISOString() } })
      .catch(() => {});
  });
  cronJobs.set(wf.id, task);
}

export function unregisterCronTrigger(workflowId: string) {
  const task = cronJobs.get(workflowId);
  if (task) { task.stop(); cronJobs.delete(workflowId); }
}

export function registerAllCronTriggers(workflows: WorkflowDefinition[]) {
  for (const wf of workflows) registerCronTrigger(wf);
}
