/**
 * hermes-jobs.ts
 *
 * Source of truth pour les cron Hermes : ~/.hermes/cron/jobs.json
 *
 * Ce module lit et écrit directement le store Hermes.
 * Le scheduler Jinn (node-cron) n'exécute PAS les jobs Hermes —
 * c'est le scheduler Python Hermes qui s'en charge.
 *
 * Phase 3 — Cron unifié (remplace jinn-hermes-cron-sync.py)
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "../shared/logger.js";
import type { CronJob } from "../shared/types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
export const HERMES_CRON_FILE = path.join(HERMES_HOME, "cron", "jobs.json");

// ---------------------------------------------------------------------------
// Hermes-native types
// ---------------------------------------------------------------------------

export interface HermesSchedule {
  kind: "cron" | "interval";
  /** Used when kind=cron */
  expr?: string;
  /** Alias for expr — some older Hermes versions write "cron" instead of "expr" */
  cron?: string;
  /** Used when kind=interval (minutes) */
  minutes?: number;
  display: string;
}

export interface HermesCronJob {
  id: string;
  name: string | null;
  prompt: string;
  skills: string[];
  schedule: HermesSchedule;
  schedule_display: string;
  repeat: { times: number | null; completed: number };
  enabled: boolean;
  state: "scheduled" | "paused" | "completed";
  deliver: string;
  created_at: string;
  next_run_at: string | null;
  last_run_at: string | null;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

/** Lire les jobs depuis ~/.hermes/cron/jobs.json. Retourne [] si absent ou illisible. */
export function loadHermesJobs(): HermesCronJob[] {
  try {
    if (!fs.existsSync(HERMES_CRON_FILE)) return [];
    const raw = fs.readFileSync(HERMES_CRON_FILE, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as HermesCronJob[];
    if (parsed && typeof parsed === "object" && "jobs" in parsed) {
      const obj = parsed as { jobs?: unknown };
      return Array.isArray(obj.jobs) ? (obj.jobs as HermesCronJob[]) : [];
    }
    return [];
  } catch (err) {
    logger.warn(`[hermes-jobs] Failed to load ${HERMES_CRON_FILE}: ${err}`);
    return [];
  }
}

/** Écrire les jobs dans ~/.hermes/cron/jobs.json. */
export function saveHermesJobs(jobs: HermesCronJob[]): void {
  const dir = path.dirname(HERMES_CRON_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const payload = { jobs, updated_at: new Date().toISOString() };
  fs.writeFileSync(
    HERMES_CRON_FILE,
    JSON.stringify(payload, null, 2) + "\n",
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

/** Convertit une expression cron en HermesSchedule */
export function cronExprToHermesSchedule(cron: string): HermesSchedule {
  return { kind: "cron", expr: cron, display: cron };
}

/** Extrait l'expression cron d'un HermesSchedule. Retourne null si non-convertible. */
export function hermesScheduleToCron(schedule: HermesSchedule): string | null {
  if (schedule.kind === "cron") {
    return schedule.expr ?? schedule.cron ?? null;
  }
  if (schedule.kind === "interval") {
    const m = schedule.minutes ?? 0;
    if (m <= 0) return null;
    if (m === 1440) return "0 0 * * *";
    if (m === 60) return "0 * * * *";
    if (m % 60 === 0) return `0 */${m / 60} * * *`;
    return `*/${m} * * * *`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Format converters
// ---------------------------------------------------------------------------

/**
 * Convertit un HermesCronJob en CronJob Jinn.
 * Retourne null si l'expression de schedule n'est pas extractible.
 *
 * Les jobs résultants ont :
 *   - id = "hermes-<hermesId>"
 *   - engine = "hermes"
 *   - _source = "hermes"  (champ privé, non persisté dans Jinn)
 *   - _hermesId = <id natif Hermes>
 */
export function hermesJobToJinn(h: HermesCronJob): (CronJob & Record<string, unknown>) | null {
  const schedule = hermesScheduleToCron(h.schedule);
  if (!schedule) {
    logger.warn(`[hermes-jobs] Cannot convert schedule for job "${h.name ?? h.id}" (kind=${h.schedule.kind})`);
    return null;
  }
  return {
    id: `hermes-${h.id}`,
    name: h.name ?? h.id,
    enabled: h.enabled && h.state !== "paused",
    schedule,
    engine: "hermes",
    prompt: h.prompt,
    delivery: parseHermesDeliver(h.deliver),
    // Champs privés — tracabilité de la source
    _hermesId: h.id,
    _source: "hermes" as const,
    _hermesState: h.state,
    _hermesNextRunAt: h.next_run_at,
    _hermesLastRunAt: h.last_run_at,
  };
}

/**
 * Convertit un CronJob Jinn en HermesCronJob.
 * Utilisé lors de la création d'un job hermes via l'API Jinn.
 */
export function jinnJobToHermes(j: CronJob): HermesCronJob {
  // Si l'id vient déjà du format "hermes-<id>", on extrait l'id natif
  const hermesId = j.id.startsWith("hermes-") ? j.id.slice(7) : j.id;
  const deliverStr = j.delivery
    ? `${j.delivery.connector}:${j.delivery.channel}`
    : "local";

  return {
    id: hermesId,
    name: j.name,
    prompt: j.prompt,
    skills: [],
    schedule: cronExprToHermesSchedule(j.schedule),
    schedule_display: j.schedule,
    repeat: { times: null, completed: 0 },
    enabled: j.enabled,
    state: j.enabled ? "scheduled" : "paused",
    deliver: deliverStr,
    created_at: new Date().toISOString(),
    next_run_at: null,
    last_run_at: null,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse la string deliver Hermes ("connector:channel" ou "local") en CronDelivery.
 * Retourne undefined si deliver === "local" ou mal formé.
 */
function parseHermesDeliver(
  deliver: string,
): { connector: string; channel: string } | undefined {
  if (!deliver || deliver === "local") return undefined;
  const colonIdx = deliver.indexOf(":");
  if (colonIdx === -1) return undefined;
  const connector = deliver.slice(0, colonIdx);
  const channel = deliver.slice(colonIdx + 1);
  if (!connector || !channel) return undefined;
  return { connector, channel };
}

// ---------------------------------------------------------------------------
// Source detector
// ---------------------------------------------------------------------------

/** Retourne true si un CronJob Jinn provient du store Hermes. */
export function isHermesJob(job: CronJob & Record<string, unknown>): boolean {
  return (job as Record<string, unknown>)["_source"] === "hermes"
    || String(job.id).startsWith("hermes-")
    || job.engine === "hermes";
}

/**
 * Extrait l'ID natif Hermes depuis un CronJob Jinn.
 * Fonctionne pour les jobs convertis ("hermes-<id>") et les jobs natifs.
 */
export function getHermesNativeId(job: CronJob & Record<string, unknown>): string {
  const stored = (job as Record<string, unknown>)["_hermesId"];
  if (typeof stored === "string") return stored;
  if (job.id.startsWith("hermes-")) return job.id.slice(7);
  return job.id;
}
