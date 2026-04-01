import type { WorkflowNode, RunContext, NodeType, SuspendInfo } from './types.js';
import type { SessionManager } from '../sessions/manager.js';
import type { ApiContext } from '../gateway/api.js';

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface NodeResult {
  output: unknown;
  next: string | string[] | null;
  suspend?: SuspendInfo;
}

export interface NodeServices {
  sessionManager?: SessionManager;
  apiContext?: ApiContext;
  resumeRun?: (runId: string, data: Record<string, unknown>) => Promise<void>;
}

export interface NodeHandler {
  type: NodeType;
  label: string;
  execute(
    node: WorkflowNode,
    context: RunContext,
    services: NodeServices,
  ): Promise<NodeResult>;
}

// ── Registry ───────────────────────────────────────────────────────────────

class NodeRegistryImpl {
  private handlers = new Map<NodeType, NodeHandler>();

  register(handler: NodeHandler): void {
    this.handlers.set(handler.type, handler);
  }

  getHandler(type: NodeType): NodeHandler | undefined {
    return this.handlers.get(type);
  }

  async execute(
    node: WorkflowNode,
    context: RunContext,
    services: NodeServices,
  ): Promise<NodeResult> {
    const handler = this.handlers.get(node.type);
    if (!handler) {
      throw new Error(`No handler registered for node type: ${node.type}`);
    }
    return handler.execute(node, context, services);
  }

  listTypes(): Array<{ type: NodeType; label: string }> {
    return Array.from(this.handlers.values()).map((h) => ({
      type: h.type,
      label: h.label,
    }));
  }
}

export const nodeRegistry = new NodeRegistryImpl();
