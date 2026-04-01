import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult } from '../registry.js';
import type { WorkflowNode, RunContext, ConditionNodeConfig } from '../types.js';

type Operator = '>=' | '<=' | '==' | '!=' | '>' | '<' | 'contains';

export const conditionHandler: NodeHandler = {
  type: NodeType.CONDITION,
  label: 'Condition',
  async execute(node: WorkflowNode, context: RunContext): Promise<NodeResult> {
    const config = node.config as ConditionNodeConfig;
    const { expression, true_branch, false_branch } = config;

    if (!expression) throw new Error('condition node requires config.expression');
    if (!true_branch) throw new Error('condition node requires config.true_branch');
    if (!false_branch) throw new Error('condition node requires config.false_branch');

    const result = evaluateExpression(expression, context);
    return {
      output: result,
      next: result ? true_branch : false_branch,
    };
  },
};

function evaluateExpression(expression: string, context: RunContext): boolean {
  const operators: Operator[] = ['>=', '<=', '==', '!=', '>', '<', 'contains'];

  for (const op of operators) {
    const idx = expression.indexOf(op);
    if (idx === -1) continue;

    const left = expression.slice(0, idx).trim();
    const right = expression.slice(idx + op.length).trim();

    const leftVal = resolveValue(left, context);
    const rightVal = parseRightValue(right, context);

    return compare(leftVal, op, rightVal);
  }

  // Boolean-only expression (e.g. "context.approved")
  const val = resolveValue(expression.trim(), context);
  return Boolean(val);
}

function resolveValue(expr: string, context: RunContext): unknown {
  if (expr.startsWith('context.') || expr.startsWith('trigger.')) {
    const path = expr.split('.');
    let current: unknown = context;
    if (path[0] === 'trigger') {
      current = context.trigger;
      path.shift();
    }
    for (const part of path) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
  return expr;
}

function parseRightValue(expr: string, context: RunContext): unknown {
  const trimmed = expr.trim();
  // Quoted string
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  // Number
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== '') return num;
  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // Context variable
  return resolveValue(trimmed, context);
}

function compare(left: unknown, op: Operator, right: unknown): boolean {
  switch (op) {
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    case '==': return String(left) === String(right);
    case '!=': return String(left) !== String(right);
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case 'contains':
      if (typeof left === 'string') return left.includes(String(right));
      if (Array.isArray(left)) return left.includes(right);
      return false;
    default:
      return false;
  }
}
