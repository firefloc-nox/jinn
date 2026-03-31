/**
 * HermesDataConnector — connecteur Jinn qui expose la WebAPI Hermes.
 *
 * Responsabilités :
 *  - Vérifier la santé de Hermes au démarrage et toutes les 30s.
 *  - Surveiller ~/.hermes/cron/jobs.json via fs.watch pour détecter les
 *    changements de jobs cron (lecture filesystem — pas de route WebAPI).
 *  - Exposer getClient() pour les routes /api/hermes/* dans api.ts.
 *
 * Ce connecteur n'intercepte PAS les sessions Jinn existantes.
 * Il n'implémente pas onMessage/sendMessage/etc. de manière significative —
 * l'interface Connector est satisfaite avec des stubs no-op car ce connecteur
 * est un data-connector, pas un transport de messages.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  Connector,
  ConnectorCapabilities,
  ConnectorHealth,
  IncomingMessage,
  ReplyContext,
  Target,
} from "../../shared/types.js";
import { logger } from "../../shared/logger.js";
import { HermesWebAPIClient, resolveHermesHome } from "./client.js";

// ── Constantes ──────────────────────────────────────────────────────────────

const HEALTH_CHECK_INTERVAL_MS = 30_000;

const CAPABILITIES: ConnectorCapabilities = {
  threading: false,
  messageEdits: false,
  reactions: false,
  attachments: false,
};

// ── HermesDataConnector ─────────────────────────────────────────────────────

export class HermesDataConnector implements Connector {
  name = "hermes-data";

  private readonly client: HermesWebAPIClient;
  private cronWatcher: fs.FSWatcher | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private _healthy = false;

  constructor(port = 8642, host = "127.0.0.1") {
    this.client = new HermesWebAPIClient(port, host);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    // 1. Vérification de santé initiale
    const alive = await this.client.checkHealth();
    this._healthy = alive;

    if (alive) {
      logger.info("HermesDataConnector: connected to Hermes WebAPI");
    } else {
      logger.warn(
        "HermesDataConnector: Hermes WebAPI unavailable at startup — will retry every 30s",
      );
    }

    // 2. Démarrer fs.watch sur ~/.hermes/cron/jobs.json
    this._startCronWatcher();

    // 3. Health check loop toutes les 30s
    this.healthTimer = setInterval(async () => {
      try {
        const wasHealthy = this._healthy;
        this._healthy = await this.client.checkHealth();
        if (wasHealthy && !this._healthy) {
          logger.warn("HermesDataConnector: lost connection to Hermes WebAPI");
        } else if (!wasHealthy && this._healthy) {
          logger.info("HermesDataConnector: reconnected to Hermes WebAPI");
        }
      } catch {
        this._healthy = false;
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    // unref() pour que le timer ne bloque pas la sortie du process
    if (typeof this.healthTimer.unref === "function") {
      this.healthTimer.unref();
    }
  }

  async stop(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.cronWatcher) {
      this.cronWatcher.close();
      this.cronWatcher = null;
    }
    this._healthy = false;
    logger.info("HermesDataConnector: stopped");
  }

  // ── Health & capabilities ──────────────────────────────────────────────

  getCapabilities(): ConnectorCapabilities {
    return CAPABILITIES;
  }

  getHealth(): ConnectorHealth {
    return {
      status: this._healthy ? "running" : "error",
      detail: this._healthy ? undefined : "Hermes WebAPI unreachable",
      capabilities: CAPABILITIES,
    };
  }

  // ── Accès au client ────────────────────────────────────────────────────

  /** Expose le client HTTP pour les routes /api/hermes/* dans api.ts */
  getClient(): HermesWebAPIClient {
    return this.client;
  }

  /** Indique si le connecteur est opérationnel */
  isHealthy(): boolean {
    return this._healthy;
  }

  // ── Stubs Connector (transport no-op) ──────────────────────────────────
  // Ce connecteur n'est pas un transport de messages.
  // Ces méthodes satisfont l'interface sans effet.

  reconstructTarget(replyContext: ReplyContext): Target {
    return {
      channel: typeof replyContext.channel === "string" ? replyContext.channel : "",
      thread: typeof replyContext.thread === "string" ? replyContext.thread : undefined,
      replyContext,
    };
  }

  async sendMessage(_target: Target, _text: string): Promise<void> {}
  async replyMessage(_target: Target, _text: string): Promise<void> {}
  async addReaction(_target: Target, _emoji: string): Promise<void> {}
  async removeReaction(_target: Target, _emoji: string): Promise<void> {}
  async editMessage(_target: Target, _text: string): Promise<void> {}

  onMessage(_handler: (msg: IncomingMessage) => void): void {
    // No-op : ce connecteur ne génère pas de messages entrants
  }

  // ── Cron watcher (filesystem) ──────────────────────────────────────────

  private _startCronWatcher(): void {
    const cronJobsPath = path.join(resolveHermesHome(), "cron", "jobs.json");

    const startWatch = (): void => {
      if (!fs.existsSync(cronJobsPath)) {
        // Attendre que le fichier existe — retry dans 10s
        setTimeout(startWatch, 10_000).unref();
        return;
      }

      try {
        this.cronWatcher = fs.watch(cronJobsPath, (eventType) => {
          if (eventType === "change" || eventType === "rename") {
            logger.debug("HermesDataConnector: cron/jobs.json changed");
          }
        });

        this.cronWatcher.on("error", (err) => {
          logger.warn(
            `HermesDataConnector: cron watcher error — ${err.message}`,
          );
          this.cronWatcher = null;
          // Redémarrer le watcher après un délai
          setTimeout(startWatch, 5_000).unref();
        });

        logger.debug(
          `HermesDataConnector: watching ${cronJobsPath} for cron changes`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`HermesDataConnector: cannot watch cron jobs file — ${msg}`);
      }
    };

    startWatch();
  }
}
