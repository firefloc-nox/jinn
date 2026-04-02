import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult, NodeServices } from '../registry.js';
import type { WorkflowNode, RunContext } from '../types.js';
import { interpolate } from './http.js';

export const setVarHandler: NodeHandler = {
  type: NodeType.SET_VAR,
  label: 'Set Variable',
  async execute(node: WorkflowNode, context: RunContext, _services: NodeServices): Promise<NodeResult> {
    const config = node.config as { variable: string; value: string };
    if (!config.variable) throw new Error('set_var requires config.variable');
    const value = interpolate(config.value ?? '', context);
    return {
      output: { [config.variable]: value },
      next: null,
      context_updates: { [config.variable]: value },
    };
  }
};
