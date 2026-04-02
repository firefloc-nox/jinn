import { NodeType } from '../types.js';
import type { NodeHandler, NodeResult, NodeServices } from '../registry.js';
import type { WorkflowNode, RunContext } from '../types.js';

export interface HttpNodeConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  output_var?: string;
}

export const httpHandler: NodeHandler = {
  type: NodeType.HTTP,
  label: 'HTTP Request',
  async execute(node: WorkflowNode, context: RunContext, _services: NodeServices): Promise<NodeResult> {
    const config = node.config as HttpNodeConfig;
    const method = config.method ?? 'GET';

    // Interpolate {{variables}} in url and body
    const url = interpolate(config.url ?? '', context);
    const bodyStr = config.body ? interpolate(config.body, context) : undefined;

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
      body: bodyStr,
    });

    const text = await response.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* keep as text */ }

    const output = { status: response.status, ok: response.ok, data };
    const next: Record<string, unknown> = {};
    if (config.output_var) next[config.output_var] = data;

    return { output, next: null, context_updates: next };
  }
};

export function interpolate(template: string, context: RunContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const parts = (key as string).trim().split('.');
    let val: unknown = context;
    for (const p of parts) val = (val as Record<string, unknown>)?.[p];
    return val !== undefined ? String(val) : '';
  });
}
