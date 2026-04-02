import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult, NodeServices } from '../registry.js';
import type { WorkflowNode, RunContext } from '../types.js';
import { interpolate } from './http.js';
import { logger } from '../../shared/logger.js';

export const logHandler: NodeHandler = {
  type: NodeType.LOG,
  label: 'Log',
  async execute(node: WorkflowNode, context: RunContext, _services: NodeServices): Promise<NodeResult> {
    const config = node.config as { level?: 'info' | 'warn' | 'error'; message: string };
    const level = config.level ?? 'info';
    const message = interpolate(config.message ?? '', context);

    if (level === 'warn') {
      logger.warn(`[workflow] ${message}`);
    } else if (level === 'error') {
      logger.error(`[workflow] ${message}`);
    } else {
      logger.info(`[workflow] ${message}`);
    }

    return { output: { logged: true, message, level }, next: null };
  }
};
