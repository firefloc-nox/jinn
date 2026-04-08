/**
 * HonchoConnector — Jinn service connector for the Honcho v3 API.
 * Note: This is a service connector, not a messaging connector.
 * It does not implement the full Connector interface.
 */

import { HonchoClient, resolveHonchoUrl, type HonchoConclusion, type HonchoWorkspace, type HonchoConclusionList } from "./client.js";
import { logger } from "../../shared/logger.js";

export {
  HonchoClient,
  resolveHonchoUrl,
  type HonchoConclusion,
  type HonchoWorkspace,
  type HonchoConclusionList,
} from "./client.js";

export class HonchoConnector {
  name = "honcho";

  private readonly client: HonchoClient;
  private healthInterval: ReturnType<typeof setInterval> | null = null;

  constructor(port?: number, host?: string) {
    const resolved = resolveHonchoUrl();
    this.client = new HonchoClient(port ?? resolved.port, host ?? resolved.host);
  }

  async start(): Promise<void> {
    const healthy = await this.client.checkHealth();
    if (healthy) {
      logger.info(`HonchoConnector: connected to Honcho API`);
    } else {
      logger.warn(`HonchoConnector: Honcho API not reachable (will retry)`);
    }
    // Periodic health check every 30s
    this.healthInterval = setInterval(() => {
      this.client.checkHealth().catch(() => {});
    }, 30_000);
  }

  async stop(): Promise<void> {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  isHealthy(): boolean {
    return this.client.healthy;
  }

  getClient(): HonchoClient {
    return this.client;
  }

  // Convenience methods that delegate to client
  listWorkspaces(): Promise<HonchoWorkspace[]> {
    return this.client.listWorkspaces();
  }

  listConclusions(workspaceId: string, opts?: { limit?: number; offset?: number }): Promise<HonchoConclusionList> {
    return this.client.listConclusions(workspaceId, opts);
  }

  queryConclusions(workspaceId: string, query: string, topK?: number): Promise<HonchoConclusion[]> {
    return this.client.queryConclusions(workspaceId, query, topK);
  }

  deleteConclusion(workspaceId: string, conclusionId: string): Promise<void> {
    return this.client.deleteConclusion(workspaceId, conclusionId);
  }

  createConclusions(
    workspaceId: string,
    conclusions: Array<{ content: string; observer_id: string; observed_id: string; session_id?: string }>,
  ): Promise<HonchoConclusion[]> {
    return this.client.createConclusions(workspaceId, conclusions);
  }
}
