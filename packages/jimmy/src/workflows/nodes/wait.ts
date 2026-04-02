import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult, NodeServices } from '../registry.js';
import type { WorkflowNode, RunContext, WaitNodeConfig, SuspendInfo } from '../types.js';
import { logger } from '../../shared/logger.js';

export const waitHandler: NodeHandler = {
  type: NodeType.WAIT,
  label: 'Wait',
  async execute(node: WorkflowNode, context: RunContext, services: NodeServices): Promise<NodeResult> {
    const config = node.config as WaitNodeConfig;
    const { mode, delay_ms, approval_message } = config;

    if (!mode) throw new Error('wait node requires config.mode');

    if (mode === 'delay') {
      const ms = delay_ms ?? 1000;
      logger.info(`[workflow:wait] Delaying ${ms}ms for run ${context.run_id}`);

      if (services.resumeRun) {
        // Suspend, then auto-resume after delay
        const resumeAt = new Date(Date.now() + ms).toISOString();
        const suspend: SuspendInfo = {
          reason: 'delay',
          resume_after: resumeAt,
          node_id: node.id,
          message: `Waiting ${ms}ms`,
        };

        // Schedule auto-resume
        const runId = context.run_id;
        const resumeFn = services.resumeRun;
        setTimeout(() => {
          resumeFn(runId, { resumed_by: 'delay', node_id: node.id }).catch((err) => {
            logger.error(`[workflow:wait] Auto-resume failed for run ${runId}: ${err instanceof Error ? err.message : err}`);
          });
        }, ms);

        return {
          output: { mode: 'delay', delay_ms: ms },
          next: null,
          suspend,
        };
      } else {
        // Fallback: block inline (for tests/simple runners)
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
        return {
          output: { mode: 'delay', delay_ms: ms },
          next: null,
        };
      }
    }

    if (mode === 'human_approval') {
      const timeout_ms = (config as WaitNodeConfig & { timeout_ms?: number }).timeout_ms;
      const resumeAfter = timeout_ms ? new Date(Date.now() + timeout_ms).toISOString() : undefined;

      const suspend: SuspendInfo = {
        reason: 'human_approval',
        node_id: node.id,
        message: approval_message ?? 'Waiting for human approval',
        resume_after: resumeAfter,
      };

      logger.info(`[workflow:wait] Suspending run ${context.run_id} for human approval${timeout_ms ? ` (timeout: ${timeout_ms}ms)` : ''}`);

      // Schedule auto-reject if timeout_ms is defined
      if (timeout_ms && services.resumeRun) {
        const runId = context.run_id;
        const resumeFn = services.resumeRun;
        setTimeout(() => {
          resumeFn(runId, { resumed_by: 'timeout', approved: false, node_id: node.id }).catch((err) => {
            logger.error(`[workflow:wait] Auto-reject failed for run ${runId}: ${err instanceof Error ? err.message : err}`);
          });
        }, timeout_ms);
      }

      return {
        output: { mode: 'human_approval', suspended: true },
        next: null,
        suspend,
      };
    }

    throw new Error(`Unknown wait mode: ${mode}`);
  },
};
