import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult } from '../registry.js';
import type { WorkflowNode, RunContext, NotifyNodeConfig } from '../types.js';
import { notifyDiscordChannel } from '../../sessions/callbacks.js';
import { logger } from '../../shared/logger.js';

export const notifyHandler: NodeHandler = {
  type: NodeType.NOTIFY,
  label: 'Notify',
  async execute(node: WorkflowNode, context: RunContext): Promise<NodeResult> {
    const config = node.config as NotifyNodeConfig;
    const { connector, message, channel } = config;

    if (!connector) throw new Error('notify node requires config.connector');
    if (!message) throw new Error('notify node requires config.message');

    const resolvedMessage = interpolate(message, context);

    switch (connector) {
      case 'discord':
        notifyDiscordChannel(resolvedMessage);
        logger.info(`[workflow:notify] Discord notification sent`);
        break;
      case 'telegram':
        // Telegram uses the same callback mechanism — send via API
        await sendViaApi('telegram', channel ?? '', resolvedMessage);
        break;
      case 'slack':
        await sendViaApi('slack', channel ?? '', resolvedMessage);
        break;
      default:
        throw new Error(`Unknown connector: ${connector}`);
    }

    return {
      output: { sent: true, connector, message: resolvedMessage },
      next: null,
    };
  },
};

async function sendViaApi(connector: string, channel: string, message: string): Promise<void> {
  let port = 7777;
  try {
    const { loadConfig } = await import('../../shared/config.js');
    const config = loadConfig();
    port = config.gateway?.port ?? 7777;
  } catch {
    // Use default
  }

  await fetch(`http://127.0.0.1:${port}/api/connectors/${connector}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text: message }),
  });
}

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
