import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult, NodeServices } from '../registry.js';
import type { WorkflowNode, RunContext } from '../types.js';

export const transformHandler: NodeHandler = {
  type: NodeType.TRANSFORM,
  label: 'Transform',
  async execute(node: WorkflowNode, context: RunContext, _services: NodeServices): Promise<NodeResult> {
    const config = node.config as {
      input_var: string;
      operation: 'json_parse' | 'json_stringify' | 'uppercase' | 'lowercase' | 'trim' | 'regex_extract';
      regex?: string;
      output_var: string;
    };

    const input = context[config.input_var];
    let result: unknown;

    switch (config.operation) {
      case 'json_parse':
        result = JSON.parse(String(input));
        break;
      case 'json_stringify':
        result = JSON.stringify(input);
        break;
      case 'uppercase':
        result = String(input ?? '').toUpperCase();
        break;
      case 'lowercase':
        result = String(input ?? '').toLowerCase();
        break;
      case 'trim':
        result = String(input ?? '').trim();
        break;
      case 'regex_extract': {
        const match = String(input ?? '').match(new RegExp(config.regex ?? '(.*)'));
        result = match ? (match[1] ?? match[0]) : null;
        break;
      }
      default:
        result = input;
    }

    return {
      output: result,
      next: null,
      context_updates: { [config.output_var]: result },
    };
  }
};
