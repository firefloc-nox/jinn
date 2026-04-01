import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult } from '../registry.js';
import type { WorkflowNode, RunContext } from '../types.js';

export const triggerHandler: NodeHandler = {
  type: NodeType.TRIGGER,
  label: 'Trigger',
  async execute(node: WorkflowNode, context: RunContext): Promise<NodeResult> {
    // The trigger node just injects the trigger payload into context
    // The context already has context.trigger from the runner
    // Find the first edge from this node
    return {
      output: context.trigger,
      next: null, // next is resolved by the runner via edges
    };
  },
};
