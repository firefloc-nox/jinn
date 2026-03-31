import path from 'node:path';
import os from 'node:os';
import { initDb } from '../sessions/registry.js';

export interface CostSummary {
  total: number;
  daily: { date: string; cost: number }[];
  byEmployee: { employee: string; cost: number; sessions: number }[];
  byDepartment: { department: string; cost: number }[];
}

/**
 * Hermes-side cost aggregation read directly from ~/.hermes/state.db (readonly).
 * Returns { totalEstimatedCostUsd, sessionCount, available } where available=false
 * if the state.db is missing or unreadable (e.g. Hermes not installed / different HERMES_HOME).
 */
export interface HermesCostSummary {
  totalEstimatedCostUsd: number;
  sessionCount: number;
  available: boolean;
}

export function getHermesCostSummary(period: 'day' | 'week' | 'month' = 'month'): HermesCostSummary {
  const hermesHome = process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes');
  const dbPath = path.join(hermesHome, 'state.db');

  let BetterSqlite3: typeof import('better-sqlite3');
  try {
    // Dynamic require — better-sqlite3 is already a dep of jimmy (used by Goals)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
  } catch {
    return { totalEstimatedCostUsd: 0, sessionCount: 0, available: false };
  }

  let db: import('better-sqlite3').Database;
  try {
    db = new BetterSqlite3(dbPath, { readonly: true });
  } catch {
    return { totalEstimatedCostUsd: 0, sessionCount: 0, available: false };
  }

  try {
    const now = new Date();
    let cutoffUnix: number;
    if (period === 'day') {
      const d = new Date(now); d.setHours(0, 0, 0, 0);
      cutoffUnix = d.getTime() / 1000;
    } else if (period === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      cutoffUnix = d.getTime() / 1000;
    } else {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      cutoffUnix = d.getTime() / 1000;
    }

    // started_at is stored as REAL (Unix timestamp in seconds)
    const row = db.prepare(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) as total, COUNT(*) as count
      FROM sessions
      WHERE started_at > ? AND estimated_cost_usd IS NOT NULL
    `).get(cutoffUnix) as { total: number; count: number };

    return {
      totalEstimatedCostUsd: row.total ?? 0,
      sessionCount: row.count ?? 0,
      available: true,
    };
  } catch {
    return { totalEstimatedCostUsd: 0, sessionCount: 0, available: false };
  } finally {
    try { db.close(); } catch { /* best effort */ }
  }
}

export function getCostSummary(period: 'day' | 'week' | 'month' = 'month'): CostSummary {
  const db = initDb();

  const now = new Date();
  let cutoff: string;
  if (period === 'day') {
    cutoff = now.toISOString().slice(0, 10);
  } else if (period === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    cutoff = d.toISOString().slice(0, 10);
  } else {
    cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  const totalRow = db.prepare(
    'SELECT COALESCE(SUM(total_cost), 0) as total FROM sessions WHERE created_at >= ?'
  ).get(cutoff) as { total: number };

  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const daily = db.prepare(
    `SELECT date(created_at) as date, SUM(total_cost) as cost
     FROM sessions WHERE created_at >= ?
     GROUP BY date(created_at) ORDER BY date`
  ).all(thirtyDaysAgo.toISOString().slice(0, 10)) as { date: string; cost: number }[];

  const byEmployee = db.prepare(
    `SELECT COALESCE(employee, 'direct') as employee, SUM(total_cost) as cost, COUNT(*) as sessions
     FROM sessions WHERE created_at >= ?
     GROUP BY employee ORDER BY cost DESC`
  ).all(cutoff) as { employee: string; cost: number; sessions: number }[];

  return { total: totalRow.total, daily, byEmployee, byDepartment: [] };
}

export function getCostsByEmployee(period: 'month' | 'week' = 'month') {
  const db = initDb();

  const now = new Date();
  const cutoff = period === 'week'
    ? (() => { const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })()
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  return db.prepare(
    `SELECT COALESCE(employee, 'direct') as employee, SUM(total_cost) as cost, COUNT(*) as sessions,
            SUM(total_turns) as turns
     FROM sessions WHERE created_at >= ?
     GROUP BY employee ORDER BY cost DESC`
  ).all(cutoff);
}
