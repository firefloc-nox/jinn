import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult, NodeServices } from '../registry.js';
import type { WorkflowNode, RunContext, AgentNodeConfig } from '../types.js';
import { createSession, insertMessage } from '../../sessions/registry.js';
import { JINN_HOME } from '../../shared/paths.js';
import { logger } from '../../shared/logger.js';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2000;

export const agentHandler: NodeHandler = {
  type: NodeType.AGENT,
  label: 'Agent',
  async execute(node: WorkflowNode, context: RunContext, services: NodeServices): Promise<NodeResult> {
    const config = node.config as AgentNodeConfig;
    const { employee, prompt, output_var, timeout_ms } = config;

    if (!employee) throw new Error('agent node requires config.employee');
    if (!prompt) throw new Error('agent node requires config.prompt');

    const sessionManager = services.sessionManager;
    if (!sessionManager) throw new Error('agent node requires sessionManager service');

    // Interpolate prompt with context variables
    const resolvedPrompt = interpolate(prompt, context);

    // Create a new session for this employee
    const session = createSession({
      engine: 'claude',
      source: 'workflow',
      sourceRef: `workflow:${context.run_id}:${node.id}`,
      employee,
      title: `Workflow ${context.workflow_id} / ${node.id}`,
    });

    // Insert the prompt as a user message
    insertMessage(session.id, 'user', resolvedPrompt);

    // Trigger the session run via session manager
    const engine = sessionManager.getEngine(session.engine);
    if (!engine) throw new Error(`Engine "${session.engine}" not available`);

    logger.info(`[workflow:agent] Running employee "${employee}" for run ${context.run_id}`);

    // Run the session directly
    const result = await engine.run({
      prompt: resolvedPrompt,
      sessionId: session.id,
      cwd: JINN_HOME,
    });

    if (result.result) {
      insertMessage(session.id, 'assistant', result.result);
    }

    // Store output in context if output_var is specified
    const output = result.result ?? '';
    if (output_var) {
      context[output_var] = output;
    }

    if (result.error) {
      throw new Error(`Agent "${employee}" returned error: ${result.error}`);
    }

    return {
      output,
      next: null,
    };
  },
};

function interpolate(template: string, context: RunContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const trimmed = key.trim();
    const value = resolvePath(trimmed, context as unknown as Record<string, unknown>);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

function resolvePath(path: string, obj: Record<string, unknown>): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
