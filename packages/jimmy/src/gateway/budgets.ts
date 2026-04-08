import { v4 as uuid } from 'uuid';
import { initDb, getSession } from '../sessions/registry.js';
import { gatewayEventBus } from './event-bus.js';
import { logger } from '../shared/logger.js';
import { notifyBudgetAlert } from '../sessions/callbacks.js';
import type { BudgetConfig } from '../shared/types.js';

export type BudgetStatus = 'ok' | 'warning' | 'exceeded' | 'paused';

export interface BudgetStatusResult {
  status: BudgetStatus;
  spend: number;
  limit: number;
  percent: number;
  threshold?: number;
  alertConnector?: string;
  alertChannel?: string;
}

export interface BudgetExceededEvent {
  employee: string;
  department?: string;
  spend: number;
  threshold: number;
  percent: number;
  alertConnector?: string;
  alertChannel?: string;
  sessionId?: string;
}

/**
 * Get budget status for an employee using new BudgetConfig.
 * Supports both legacy budgetConfig record and new per-employee BudgetConfig.
 */
export function getBudgetStatus(employee: string, budgetConfig: Record<string, number>): BudgetStatusResult {
  const db = initDb();
  const limit = budgetConfig[employee];
  if (!limit) return { status: 'ok', spend: 0, limit: 0, percent: 0 };

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const row = db.prepare(
    `SELECT COALESCE(SUM(total_cost), 0) as spend FROM sessions WHERE employee = ? AND created_at >= ?`
  ).get(employee, monthStart) as { spend: number };

  const spend = row.spend;
  const percent = limit > 0 ? Math.round((spend / limit) * 100) : 0;

  let status: BudgetStatus;
  if (percent >= 100) status = 'paused';
  else if (percent >= 80) status = 'warning';
  else status = 'ok';

  return { status, spend, limit, percent };
}

/**
 * Get budget status using BudgetConfig from employee/department.
 */
export function getBudgetStatusFromConfig(employee: string, config: BudgetConfig): BudgetStatusResult {
  const db = initDb();
  const threshold = config.threshold;
  if (!threshold || threshold <= 0) {
    return { status: 'ok', spend: 0, limit: 0, percent: 0 };
  }

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const row = db.prepare(
    `SELECT COALESCE(SUM(total_cost), 0) as spend FROM sessions WHERE employee = ? AND created_at >= ?`
  ).get(employee, monthStart) as { spend: number };

  const spend = row.spend;
  const percent = threshold > 0 ? Math.round((spend / threshold) * 100) : 0;

  let status: BudgetStatus;
  if (percent >= 100) status = 'exceeded';
  else if (percent >= 80) status = 'warning';
  else status = 'ok';

  return {
    status,
    spend,
    limit: threshold,
    percent,
    threshold,
    alertConnector: config.alertConnector,
    alertChannel: config.alertChannel,
  };
}

export function checkBudget(employee: string, budgetConfig: Record<string, number>): BudgetStatus {
  const result = getBudgetStatus(employee, budgetConfig);
  return result.status;
}

/**
 * Check if budget threshold is exceeded and emit event if so.
 * Called after accumulateSessionCost to check if threshold was crossed.
 */
export function checkBudgetThreshold(
  employee: string,
  config: BudgetConfig,
  sessionId?: string,
  department?: string,
): void {
  const result = getBudgetStatusFromConfig(employee, config);

  if (result.status === 'exceeded') {
    const event: BudgetExceededEvent = {
      employee,
      department,
      spend: result.spend,
      threshold: result.threshold!,
      percent: result.percent,
      alertConnector: config.alertConnector,
      alertChannel: config.alertChannel,
      sessionId,
    };

    logger.warn(
      `Budget threshold exceeded for employee "${employee}": $${result.spend.toFixed(2)} / $${result.threshold!.toFixed(2)} (${result.percent}%)`
    );

    // Emit budget:exceeded event for listeners (e.g., notification handlers)
    gatewayEventBus.emit('budget:exceeded', event);

    // Send notification via configured connector
    notifyBudgetAlert(
      employee,
      result.spend,
      result.threshold!,
      result.percent,
      config.alertConnector,
      config.alertChannel,
      'exceeded'
    );

    // Record the exceeded event
    recordBudgetEvent(employee, 'exceeded', result.spend, result.threshold!);
  } else if (result.status === 'warning' && result.percent >= 80) {
    // Emit warning at 80% threshold
    logger.info(
      `Budget warning for employee "${employee}": $${result.spend.toFixed(2)} / $${result.threshold!.toFixed(2)} (${result.percent}%)`
    );
    gatewayEventBus.emit('budget:warning', {
      employee,
      department,
      spend: result.spend,
      threshold: result.threshold!,
      percent: result.percent,
      alertConnector: config.alertConnector,
      alertChannel: config.alertChannel,
      sessionId,
    });

    // Send warning notification
    notifyBudgetAlert(
      employee,
      result.spend,
      result.threshold!,
      result.percent,
      config.alertConnector,
      config.alertChannel,
      'warning'
    );
  }
}

/**
 * Get accumulated spend for a department (sum of all employee sessions).
 */
export function getDepartmentSpend(department: string): number {
  const db = initDb();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const row = db.prepare(`
    SELECT COALESCE(SUM(s.total_cost), 0) as spend
    FROM sessions s
    WHERE s.created_at >= ?
    AND s.employee IN (
      SELECT name FROM employees WHERE department = ?
    )
  `).get(monthStart, department) as { spend: number } | undefined;

  // If employees table doesn't exist, fall back to session employee field
  if (!row) {
    return 0;
  }

  return row.spend;
}

export function recordBudgetEvent(employee: string, eventType: string, amount: number, limitAmount: number) {
  const db = initDb();
  db.prepare(
    `INSERT INTO budget_events (id, employee, event_type, amount, limit_amount) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), employee, eventType, amount, limitAmount);
}

export function getBudgetEvents(limit = 50) {
  const db = initDb();
  return db.prepare(
    `SELECT * FROM budget_events ORDER BY created_at DESC LIMIT ?`
  ).all(limit);
}

export function overrideBudget(employee: string, budgetConfig: Record<string, number>) {
  const limit = budgetConfig[employee] || 0;
  recordBudgetEvent(employee, 'override', 0, limit);
  return { status: 'ok', message: `Budget override recorded for ${employee}` };
}

/**
 * Get budget configuration for an employee.
 * Returns null if no budget is configured.
 */
export function getEmployeeBudgetConfig(employeeName: string): BudgetConfig | null {
  // This will be populated from the org registry at runtime
  // The actual config comes from the employee YAML file
  return null;
}

/**
 * Set budget configuration for an employee.
 * This updates the in-memory cache; actual persistence is via YAML update.
 */
export function setEmployeeBudgetConfig(employeeName: string, config: BudgetConfig): void {
  // Budget config is stored in employee YAML and loaded via scanOrg()
  // This function is a placeholder for the API route
}
