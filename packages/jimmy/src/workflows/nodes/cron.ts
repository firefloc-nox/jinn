import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult } from '../registry.js';
import type { WorkflowNode, RunContext, CronNodeConfig } from '../types.js';
import { loadJobs, saveJobs } from '../../cron/jobs.js';
import { reloadScheduler, setCronJobEnabled } from '../../cron/scheduler.js';
import { logger } from '../../shared/logger.js';

export const cronHandler: NodeHandler = {
  type: NodeType.CRON,
  label: 'Cron',
  async execute(node: WorkflowNode, context: RunContext): Promise<NodeResult> {
    const config = node.config as CronNodeConfig;
    const { action, job_id } = config;

    if (!action) throw new Error('cron node requires config.action');

    switch (action) {
      case 'create': {
        if (!config.schedule) throw new Error('cron create requires config.schedule');
        if (!config.employee) throw new Error('cron create requires config.employee');
        if (!config.prompt) throw new Error('cron create requires config.prompt');

        const jobs = loadJobs();
        const id = job_id ?? `workflow-${context.run_id}-${node.id}`;
        const name = config.name ?? `Workflow cron ${id}`;

        const newJob = {
          id,
          name,
          schedule: config.schedule,
          enabled: true,
          employee: config.employee,
          prompt: config.prompt,
          timezone: 'UTC',
        };
        jobs.push(newJob);
        saveJobs(jobs);
        reloadScheduler(jobs);
        logger.info(`[workflow:cron] Created cron job "${id}"`);
        return { output: { action, job_id: id }, next: null };
      }

      case 'pause': {
        if (!job_id) throw new Error('cron pause requires config.job_id');
        const job = setCronJobEnabled(job_id, false);
        if (!job) throw new Error(`Cron job "${job_id}" not found`);
        logger.info(`[workflow:cron] Paused cron job "${job_id}"`);
        return { output: { action, job_id }, next: null };
      }

      case 'resume': {
        if (!job_id) throw new Error('cron resume requires config.job_id');
        const job = setCronJobEnabled(job_id, true);
        if (!job) throw new Error(`Cron job "${job_id}" not found`);
        logger.info(`[workflow:cron] Resumed cron job "${job_id}"`);
        return { output: { action, job_id }, next: null };
      }

      case 'delete': {
        if (!job_id) throw new Error('cron delete requires config.job_id');
        const jobs = loadJobs();
        const filtered = jobs.filter((j) => j.id !== job_id);
        if (filtered.length === jobs.length) throw new Error(`Cron job "${job_id}" not found`);
        saveJobs(filtered);
        reloadScheduler(filtered);
        logger.info(`[workflow:cron] Deleted cron job "${job_id}"`);
        return { output: { action, job_id }, next: null };
      }

      default:
        throw new Error(`Unknown cron action: ${action}`);
    }
  },
};
