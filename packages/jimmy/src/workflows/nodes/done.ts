import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult } from '../registry.js';
import type { WorkflowNode, RunContext, DoneNodeConfig } from '../types.js';

export const doneHandler: NodeHandler = {
  type: NodeType.DONE,
  label: 'Done',
  async execute(node: WorkflowNode, context: RunContext): Promise<NodeResult> {
    const config = node.config as DoneNodeConfig;
    const output = config.output_var ? context[config.output_var] : null;

    return {
      output,
      next: null,
    };
  },
};
