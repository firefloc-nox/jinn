/**
 * hermes-state-db.ts
 *
 * Direct SQLite reader for Hermes state.db — sessions and messages.
 * 
 * The WebAPI Hermes doesn't expose /api/sessions or /api/memory endpoints,
 * but the data exists in ~/.hermes/state.db. This module reads it directly.
 *
 * Read-only — all writes go through the Hermes CLI or WebAPI.
 */

import Database from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { logger } from "../../shared/logger.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
export const STATE_DB_PATH = path.join(HERMES_HOME, "state.db");

// ---------------------------------------------------------------------------
// Types (match HermesWebAPIClient types for compatibility)
// ---------------------------------------------------------------------------

export interface HermesSessionRow {
  id: string;
  source: string;
  model: string | null;
  parent_session_id: string | null;
  started_at: number;
  ended_at: number | null;
  end_reason: string | null;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  title: string | null;
  system_prompt: string | null;
}

export interface HermesSession {
  id: string;
  source: string;
  model: string | null;
  parentSessionId: string | null;
  startedAt: number;
  endedAt: number | null;
  endReason: string | null;
  messageCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  title: string | null;
  systemPrompt?: string;
}

export interface HermesMessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string | null;
  tool_name: string | null;
  timestamp: number;
  reasoning: string | null;
}

export interface HermesMessage {
  id: number;
  sessionId: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolName: string | null;
  timestamp: number;
  reasoning?: string;
}

export interface HermesSessionList {
  items: HermesSession[];
  total: number;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapSession(row: HermesSessionRow): HermesSession {
  return {
    id: row.id,
    source: row.source,
    model: row.model,
    parentSessionId: row.parent_session_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    endReason: row.end_reason,
    messageCount: row.message_count,
    toolCallCount: row.tool_call_count,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    title: row.title,
    systemPrompt: row.system_prompt ?? undefined,
  };
}

function mapMessage(row: HermesMessageRow): HermesMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as "user" | "assistant" | "tool",
    content: row.content,
    toolName: row.tool_name,
    timestamp: row.timestamp,
    reasoning: row.reasoning ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// HermesStateDB — read-only access to state.db
// ---------------------------------------------------------------------------

export class HermesStateDB {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath = STATE_DB_PATH) {
    this.dbPath = dbPath;
  }

  /** Check if state.db exists */
  exists(): boolean {
    return fs.existsSync(this.dbPath);
  }

  /** Get or create DB connection */
  private getDb(): Database.Database {
    if (!this.db) {
      if (!this.exists()) {
        throw new Error(`Hermes state.db not found at ${this.dbPath}`);
      }
      this.db = new Database(this.dbPath, { readonly: true });
      logger.debug(`[HermesStateDB] Opened ${this.dbPath}`);
    }
    return this.db;
  }

  /** Close DB connection */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.debug("[HermesStateDB] Connection closed");
    }
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  getSessions(opts?: {
    limit?: number;
    offset?: number;
    source?: string;
  }): HermesSessionList {
    const db = this.getDb();
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const source = opts?.source;

    // Count total
    let countSql = "SELECT COUNT(*) as total FROM sessions";
    const countParams: unknown[] = [];
    if (source) {
      countSql += " WHERE source = ?";
      countParams.push(source);
    }
    const totalRow = db.prepare(countSql).get(...countParams) as { total: number };
    const total = totalRow?.total ?? 0;

    // Fetch rows
    let sql = `
      SELECT id, source, model, parent_session_id, started_at, ended_at, 
             end_reason, message_count, tool_call_count, input_tokens, 
             output_tokens, title, system_prompt
      FROM sessions
    `;
    const params: unknown[] = [];
    if (source) {
      sql += " WHERE source = ?";
      params.push(source);
    }
    sql += " ORDER BY started_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = db.prepare(sql).all(...params) as HermesSessionRow[];
    return {
      items: rows.map(mapSession),
      total,
    };
  }

  getSession(id: string): HermesSession | null {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT id, source, model, parent_session_id, started_at, ended_at,
             end_reason, message_count, tool_call_count, input_tokens,
             output_tokens, title, system_prompt
      FROM sessions WHERE id = ?
    `).get(id) as HermesSessionRow | undefined;
    return row ? mapSession(row) : null;
  }

  searchSessions(query: string, limit = 20): HermesSessionList {
    const db = this.getDb();
    
    // Search in titles first, then in message content via FTS
    const titleRows = db.prepare(`
      SELECT id, source, model, parent_session_id, started_at, ended_at,
             end_reason, message_count, tool_call_count, input_tokens,
             output_tokens, title, system_prompt
      FROM sessions
      WHERE title LIKE ?
      ORDER BY started_at DESC
      LIMIT ?
    `).all(`%${query}%`, limit) as HermesSessionRow[];

    // FTS search in messages
    const ftsRows = db.prepare(`
      SELECT DISTINCT s.id, s.source, s.model, s.parent_session_id, s.started_at, 
             s.ended_at, s.end_reason, s.message_count, s.tool_call_count, 
             s.input_tokens, s.output_tokens, s.title, s.system_prompt
      FROM messages_fts fts
      JOIN messages m ON fts.rowid = m.id
      JOIN sessions s ON m.session_id = s.id
      WHERE messages_fts MATCH ?
      ORDER BY s.started_at DESC
      LIMIT ?
    `).all(query, limit) as HermesSessionRow[];

    // Merge and dedupe
    const seen = new Set<string>();
    const items: HermesSession[] = [];
    for (const row of [...titleRows, ...ftsRows]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        items.push(mapSession(row));
      }
    }

    return { items: items.slice(0, limit), total: items.length };
  }

  // ── Messages ────────────────────────────────────────────────────────────

  getMessages(sessionId: string): HermesMessage[] {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT id, session_id, role, content, tool_name, timestamp, reasoning
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `).all(sessionId) as HermesMessageRow[];
    return rows.map(mapMessage);
  }
}

// ---------------------------------------------------------------------------
// Singleton for convenience
// ---------------------------------------------------------------------------

let defaultInstance: HermesStateDB | null = null;

export function getHermesStateDB(): HermesStateDB {
  if (!defaultInstance) {
    defaultInstance = new HermesStateDB();
  }
  return defaultInstance;
}
