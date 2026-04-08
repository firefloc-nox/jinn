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
import os from "node:os";
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
import {
  HermesStateDB,
  type HermesSession,
  type HermesSessionList,
  type HermesMessage,
} from "./state-db.js";

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
  private readonly stateDb: HermesStateDB;
  private cronWatcher: fs.FSWatcher | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private _healthy = false;

  constructor(port = 8642, host = "127.0.0.1") {
    this.client = new HermesWebAPIClient(port, host);
    this.stateDb = new HermesStateDB();
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

  // ── SQLite fallback for sessions (WebAPI doesn't expose these) ─────────

  /** 
   * Get sessions from state.db (direct SQLite read).
   * The WebAPI doesn't expose /api/sessions, so we read state.db directly.
   */
  getSessions(opts?: {
    limit?: number;
    offset?: number;
    source?: string;
  }): HermesSessionList {
    if (!this.stateDb.exists()) {
      return { items: [], total: 0 };
    }
    try {
      return this.stateDb.getSessions(opts);
    } catch (err) {
      logger.warn(`[HermesDataConnector] getSessions failed: ${err}`);
      return { items: [], total: 0 };
    }
  }

  /**
   * Get a single session by ID from state.db.
   */
  getSession(id: string): HermesSession | null {
    if (!this.stateDb.exists()) {
      return null;
    }
    try {
      return this.stateDb.getSession(id);
    } catch (err) {
      logger.warn(`[HermesDataConnector] getSession(${id}) failed: ${err}`);
      return null;
    }
  }

  /**
   * Search sessions in state.db.
   */
  searchSessions(query: string, limit?: number): HermesSessionList {
    if (!this.stateDb.exists()) {
      return { items: [], total: 0 };
    }
    try {
      return this.stateDb.searchSessions(query, limit);
    } catch (err) {
      logger.warn(`[HermesDataConnector] searchSessions failed: ${err}`);
      return { items: [], total: 0 };
    }
  }

  /**
   * Get messages for a session from state.db.
   */
  getMessages(sessionId: string): HermesMessage[] {
    if (!this.stateDb.exists()) {
      return [];
    }
    try {
      return this.stateDb.getMessages(sessionId);
    } catch (err) {
      logger.warn(`[HermesDataConnector] getMessages(${sessionId}) failed: ${err}`);
      return [];
    }
  }

  // ── Memory filesystem fallback ─────────────────────────────────────────

  /**
   * Parse a memory markdown file into entries.
   * Format: entries are separated by § on its own line.
   */
  private _parseMemoryFile(content: string): string[] {
    // Split by § separator (Hermes convention)
    const entries = content.split(/\n§\n|\n§$|^§\n/);
    return entries
      .map(e => e.trim())
      .filter(e => e.length > 0);
  }

  /**
   * Get memory entries from filesystem (~/.hermes/memories/).
   * Fallback when WebAPI doesn't expose /api/memory.
   */
  getMemory(): { memory: { entries: string[]; usage: string }; user: { entries: string[]; usage: string } } {
    const hermesHome = resolveHermesHome();
    const memoriesDir = path.join(hermesHome, "memories");
    
    // Default char limits (from Hermes conventions)
    const MEMORY_LIMIT = 2200;
    const USER_LIMIT = 1375;
    
    const result = {
      memory: { entries: [] as string[], usage: "0%" },
      user: { entries: [] as string[], usage: "0%" },
    };

    try {
      const memoryPath = path.join(memoriesDir, "MEMORY.md");
      if (fs.existsSync(memoryPath)) {
        const content = fs.readFileSync(memoryPath, "utf-8");
        result.memory.entries = this._parseMemoryFile(content);
        const chars = content.length;
        const pct = Math.round((chars / MEMORY_LIMIT) * 100);
        result.memory.usage = `${pct}% — ${chars.toLocaleString()}/${MEMORY_LIMIT.toLocaleString()} chars`;
      }
    } catch (err) {
      logger.warn(`[HermesDataConnector] Failed to read MEMORY.md: ${err}`);
    }

    try {
      const userPath = path.join(memoriesDir, "USER.md");
      if (fs.existsSync(userPath)) {
        const content = fs.readFileSync(userPath, "utf-8");
        result.user.entries = this._parseMemoryFile(content);
        const chars = content.length;
        const pct = Math.round((chars / USER_LIMIT) * 100);
        result.user.usage = `${pct}% — ${chars.toLocaleString()}/${USER_LIMIT.toLocaleString()} chars`;
      }
    } catch (err) {
      logger.warn(`[HermesDataConnector] Failed to read USER.md: ${err}`);
    }

    return result;
  }

  // ── Skills filesystem fallback ─────────────────────────────────────────

  /**
   * Get skills from filesystem (~/.hermes/skills/).
   * Fallback when WebAPI doesn't expose /api/skills.
   */
  getSkills(): { skills: Array<{ name: string; description: string; category: string }>; categories: Record<string, string[]>; count: number } {
    const hermesHome = resolveHermesHome();
    const skillsDir = path.join(hermesHome, "skills");
    
    const skills: Array<{ name: string; description: string; category: string }> = [];
    const categories: Record<string, string[]> = {};

    if (!fs.existsSync(skillsDir)) {
      return { skills, categories, count: 0 };
    }

    try {
      // Scan skills directory recursively for SKILL.md files
      const scanDir = (dir: string, category = "general"): void => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const entryPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // Check if this directory has a SKILL.md
            const skillMdPath = path.join(entryPath, "SKILL.md");
            if (fs.existsSync(skillMdPath)) {
              try {
                const content = fs.readFileSync(skillMdPath, "utf-8");
                // Extract frontmatter
                const match = content.match(/^---\n([\s\S]*?)\n---/);
                let description = "";
                let skillCategory = category;
                
                if (match) {
                  const frontmatter = match[1];
                  const descMatch = frontmatter.match(/description:\s*["']?(.+?)["']?\s*$/m);
                  const catMatch = frontmatter.match(/category:\s*["']?(.+?)["']?\s*$/m);
                  if (descMatch) description = descMatch[1].trim();
                  if (catMatch) skillCategory = catMatch[1].trim();
                }
                
                skills.push({
                  name: entry.name,
                  description,
                  category: skillCategory,
                });

                if (!categories[skillCategory]) {
                  categories[skillCategory] = [];
                }
                categories[skillCategory].push(entry.name);
              } catch {
                // Skip unreadable skill files
              }
            } else {
              // Recurse into subdirectory (category folder)
              scanDir(entryPath, entry.name);
            }
          }
        }
      };

      scanDir(skillsDir);
    } catch (err) {
      logger.warn(`[HermesDataConnector] Failed to scan skills: ${err}`);
    }

    return { skills, categories, count: skills.length };
  }

  // ── LLM Wiki filesystem ────────────────────────────────────────────────

  private _activeWikiPath: string | null = null;

  /**
   * Discover all wiki directories.
   */
  discoverWikis(): Array<{ name: string; path: string; pageCount: number }> {
    const home = os.homedir();
    const wikis: Array<{ name: string; path: string; pageCount: number }> = [];
    
    // Known wiki locations to check
    const candidates = [
      { name: "default", path: path.join(home, "wiki") },
      { name: "jinn", path: path.join(home, "wiki-jinn") },
      { name: "mission-control", path: path.join(home, "mission-control", "wiki") },
    ];
    
    // Also scan ~/wiki-* pattern
    try {
      const homeEntries = fs.readdirSync(home, { withFileTypes: true });
      for (const entry of homeEntries) {
        if (entry.isDirectory() && entry.name.startsWith("wiki-") && entry.name !== "wiki-jinn") {
          const wikiPath = path.join(home, entry.name);
          if (!candidates.some(c => c.path === wikiPath)) {
            candidates.push({ name: entry.name.replace("wiki-", ""), path: wikiPath });
          }
        }
      }
    } catch { /* ignore */ }
    
    // Check which candidates exist and have an index.md
    for (const candidate of candidates) {
      const indexPath = path.join(candidate.path, "index.md");
      if (fs.existsSync(indexPath)) {
        // Count pages
        let pageCount = 0;
        const wikiDirs = ["entities", "concepts", "comparisons", "queries"];
        for (const dir of wikiDirs) {
          const dirPath = path.join(candidate.path, dir);
          if (fs.existsSync(dirPath)) {
            try {
              const files = fs.readdirSync(dirPath);
              pageCount += files.filter(f => f.endsWith(".md")).length;
            } catch { /* ignore */ }
          }
        }
        wikis.push({ ...candidate, pageCount });
      }
    }
    
    return wikis;
  }

  /**
   * Get active wiki path.
   */
  getActiveWikiPath(): string {
    if (this._activeWikiPath) {
      return this._activeWikiPath;
    }
    
    // Try to read from config
    try {
      const hermesHome = resolveHermesHome();
      const configPath = path.join(hermesHome, "config.yaml");
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, "utf-8");
        const match = content.match(/wiki:\s*\n\s*path:\s*(.+)/);
        if (match) {
          const configuredPath = match[1].trim().replace(/^['"]|['"]$/g, "").replace(/^~/, os.homedir());
          if (fs.existsSync(path.join(configuredPath, "index.md"))) {
            this._activeWikiPath = configuredPath;
            return configuredPath;
          }
        }
      }
    } catch { /* ignore */ }
    
    // Default to ~/wiki
    return path.join(os.homedir(), "wiki");
  }

  /**
   * Set active wiki path.
   */
  setActiveWiki(wikiPath: string): boolean {
    const resolved = wikiPath.replace(/^~/, os.homedir());
    if (fs.existsSync(path.join(resolved, "index.md"))) {
      this._activeWikiPath = resolved;
      return true;
    }
    return false;
  }

  /**
   * Resolve wiki path from config or default.
   */
  private _getWikiPath(): string {
    return this.getActiveWikiPath();
  }

  /**
   * Check if wiki exists.
   */
  wikiExists(): boolean {
    const wikiPath = this._getWikiPath();
    return fs.existsSync(path.join(wikiPath, "index.md"));
  }

  /**
   * Get wiki overview: schema, index, recent log entries.
   */
  getWikiOverview(): {
    exists: boolean;
    path: string;
    schema: string | null;
    index: string | null;
    recentLog: string[];
    stats: { totalPages: number; lastUpdated: string | null };
  } {
    const wikiPath = this._getWikiPath();
    const result = {
      exists: false,
      path: wikiPath,
      schema: null as string | null,
      index: null as string | null,
      recentLog: [] as string[],
      stats: { totalPages: 0, lastUpdated: null as string | null },
    };

    if (!this.wikiExists()) {
      return result;
    }
    result.exists = true;

    try {
      const schemaPath = path.join(wikiPath, "SCHEMA.md");
      if (fs.existsSync(schemaPath)) {
        result.schema = fs.readFileSync(schemaPath, "utf-8");
      }
    } catch { /* ignore */ }

    try {
      const indexPath = path.join(wikiPath, "index.md");
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, "utf-8");
        result.index = content;
        
        // Parse stats from index header
        const pagesMatch = content.match(/Total pages:\s*(\d+)/i);
        if (pagesMatch) result.stats.totalPages = parseInt(pagesMatch[1]);
        
        const updatedMatch = content.match(/Last updated:\s*([\d-]+)/i);
        if (updatedMatch) result.stats.lastUpdated = updatedMatch[1];
      }
    } catch { /* ignore */ }

    try {
      const logPath = path.join(wikiPath, "log.md");
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, "utf-8");
        const lines = content.split("\n");
        // Get last 20 non-empty lines
        result.recentLog = lines
          .filter(l => l.trim().length > 0)
          .slice(-20);
      }
    } catch { /* ignore */ }

    return result;
  }

  /**
   * List all wiki pages with metadata.
   */
  getWikiPages(): Array<{
    name: string;
    path: string;
    type: string;
    title: string | null;
    updated: string | null;
    tags: string[];
  }> {
    const wikiPath = this._getWikiPath();
    const pages: Array<{
      name: string;
      path: string;
      type: string;
      title: string | null;
      updated: string | null;
      tags: string[];
    }> = [];

    if (!this.wikiExists()) {
      return pages;
    }

    const wikiDirs = ["entities", "concepts", "comparisons", "queries"];
    
    for (const dir of wikiDirs) {
      const dirPath = path.join(wikiPath, dir);
      if (!fs.existsSync(dirPath)) continue;
      
      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (!file.endsWith(".md")) continue;
          
          const filePath = path.join(dirPath, file);
          const content = fs.readFileSync(filePath, "utf-8");
          
          // Parse frontmatter
          let title: string | null = null;
          let updated: string | null = null;
          let tags: string[] = [];
          
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const fm = fmMatch[1];
            const titleMatch = fm.match(/title:\s*(.+)/);
            if (titleMatch) title = titleMatch[1].trim();
            
            const updatedMatch = fm.match(/updated:\s*([\d-]+)/);
            if (updatedMatch) updated = updatedMatch[1];
            
            const tagsMatch = fm.match(/tags:\s*\[([^\]]*)\]/);
            if (tagsMatch) {
              tags = tagsMatch[1].split(",").map(t => t.trim().replace(/['"]/g, "")).filter(Boolean);
            }
          }
          
          pages.push({
            name: file.replace(".md", ""),
            path: `${dir}/${file}`,
            type: dir.replace(/s$/, ""), // entities -> entity
            title,
            updated,
            tags,
          });
        }
      } catch { /* ignore */ }
    }

    return pages;
  }

  /**
   * Get a specific wiki page content.
   */
  getWikiPage(pagePath: string): { content: string; exists: boolean } {
    const wikiPath = this._getWikiPath();
    const fullPath = path.join(wikiPath, pagePath);
    
    // Security: ensure path stays within wiki
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(wikiPath))) {
      return { content: "", exists: false };
    }
    
    if (!fs.existsSync(fullPath)) {
      // Try adding .md extension
      const withMd = fullPath.endsWith(".md") ? fullPath : `${fullPath}.md`;
      if (!fs.existsSync(withMd)) {
        return { content: "", exists: false };
      }
      return { content: fs.readFileSync(withMd, "utf-8"), exists: true };
    }
    
    return { content: fs.readFileSync(fullPath, "utf-8"), exists: true };
  }

  /**
   * Save/update a wiki page content.
   */
  saveWikiPage(pagePath: string, content: string): { success: boolean; error?: string } {
    const wikiPath = this._getWikiPath();
    const fullPath = path.join(wikiPath, pagePath);
    
    // Security: ensure path stays within wiki
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(wikiPath))) {
      return { success: false, error: "Invalid path" };
    }
    
    // Ensure .md extension
    const targetPath = fullPath.endsWith(".md") ? fullPath : `${fullPath}.md`;
    
    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      fs.writeFileSync(targetPath, content, "utf-8");
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  /**
   * Search wiki pages by content.
   */
  searchWiki(query: string): Array<{
    name: string;
    path: string;
    type: string;
    matches: string[];
  }> {
    const pages = this.getWikiPages();
    const results: Array<{
      name: string;
      path: string;
      type: string;
      matches: string[];
    }> = [];
    
    const lowerQuery = query.toLowerCase();
    const wikiPath = this._getWikiPath();
    
    for (const page of pages) {
      const fullPath = path.join(wikiPath, page.path);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.toLowerCase().includes(lowerQuery)) {
          // Extract matching lines
          const lines = content.split("\n");
          const matches = lines
            .filter(l => l.toLowerCase().includes(lowerQuery))
            .slice(0, 3)
            .map(l => l.trim().substring(0, 100));
          
          results.push({
            name: page.name,
            path: page.path,
            type: page.type,
            matches,
          });
        }
      } catch { /* ignore */ }
    }
    
    return results;
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
