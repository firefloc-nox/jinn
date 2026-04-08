import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ORG_DIR } from "../shared/paths.js";
import type { BudgetConfig, Employee, HermesHooks, ProfileRef, RuntimeRef } from "../shared/types.js";
import { logger } from "../shared/logger.js";

function parseProfileRef(value: unknown): ProfileRef | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const runtime = (value as Record<string, unknown>).runtime;
  const name = (value as Record<string, unknown>).name;
  if (typeof runtime !== "string" || typeof name !== "string") return undefined;
  return { runtime, name };
}

function parseHermesHooks(value: unknown): HermesHooks | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const hooks = value as Record<string, unknown>;
  if (typeof hooks.enabled !== "boolean") return undefined;
  return {
    enabled: hooks.enabled,
    memory: typeof hooks.memory === "boolean" ? hooks.memory : undefined,
    skills: typeof hooks.skills === "boolean" ? hooks.skills : undefined,
    mcp: typeof hooks.mcp === "boolean" ? hooks.mcp : undefined,
  };
}

function parseBudgetConfig(value: unknown): BudgetConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const config = value as Record<string, unknown>;
  if (typeof config.threshold !== "number" || config.threshold <= 0) return undefined;
  return {
    threshold: config.threshold,
    alertConnector: typeof config.alertConnector === "string" ? config.alertConnector : undefined,
    alertChannel: typeof config.alertChannel === "string" ? config.alertChannel : undefined,
  };
}

export function scanOrg(): Map<string, Employee> {
  const registry = new Map<string, Employee>();

  if (!fs.existsSync(ORG_DIR)) return registry;

  // Recursively find all .yaml files in org/
  function scan(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (
        entry.name.endsWith(".yaml") &&
        entry.name !== "department.yaml"
      ) {
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const data = yaml.load(raw) as any;
          if (data && data.name && data.persona) {
            // ── Infer runtimeRef from legacy engine field if not explicitly set ──
            const explicitRuntimeRef = typeof data.runtimeRef === "string" ? data.runtimeRef as RuntimeRef : undefined;
            const legacyEngine = typeof data.engine === "string" ? data.engine : undefined;
            // Map known engine names to runtime refs
            const engineToRuntimeRef: Record<string, RuntimeRef> = {
              hermes: "hermes",
              claude: "claude",
              codex: "codex",
              gemini: "gemini",
            };
            const inferredRuntimeRef = explicitRuntimeRef
              ?? (legacyEngine && Object.prototype.hasOwnProperty.call(engineToRuntimeRef, legacyEngine)
                ? engineToRuntimeRef[legacyEngine]
                : undefined);

            // ── Map honcho:true → hermesHooks.memory for backward compat ─────
            const honchoAsHooks: HermesHooks | undefined =
              data.hermesHooks === undefined && data.honcho === true
                ? { enabled: true, memory: true }
                : undefined;

            const employee: Employee = {
              name: data.name,
              displayName: data.displayName || data.name,
              department:
                data.department || path.basename(path.dirname(fullPath)),
              rank: data.rank || "employee",
              engine: legacyEngine || explicitRuntimeRef || "hermes",
              runtimeRef: inferredRuntimeRef,
              profileRef: parseProfileRef(data.profileRef),
              model: data.model || undefined,
              reasoning: typeof data.reasoning === "string" ? data.reasoning : undefined,
              persona: data.persona,
              emoji: typeof data.emoji === "string" ? data.emoji : undefined,
              cliFlags: Array.isArray(data.cliFlags) ? data.cliFlags : undefined,
              effortLevel: typeof data.effortLevel === "string" ? data.effortLevel : undefined,
              alwaysNotify: typeof data.alwaysNotify === "boolean" ? data.alwaysNotify : true,
              reportsTo: data.reportsTo ?? undefined,
              mcp: data.mcp ?? undefined,
              provides: Array.isArray(data.provides)
                ? data.provides.filter((s: unknown) => s && typeof s === "object" && typeof (s as any).name === "string" && typeof (s as any).description === "string")
                  .map((s: any) => ({ name: s.name as string, description: s.description as string }))
                : undefined,
              hermesHooks: parseHermesHooks(data.hermesHooks) ?? honchoAsHooks,
              hermesProfile: typeof data.hermesProfile === "string" ? data.hermesProfile : undefined,
              hermesProvider: typeof data.hermesProvider === "string" ? data.hermesProvider : undefined,
              hermesToolsets: typeof data.hermesToolsets === "string" ? data.hermesToolsets : undefined,
              hermesSkills: typeof data.hermesSkills === "string" ? data.hermesSkills : undefined,
              // fallbackEngine (string) → fallbackRuntimes (RuntimeRef[])
              fallbackRuntimes:
                Array.isArray(data.fallbackRuntimes)
                  ? data.fallbackRuntimes.filter((r: unknown) => typeof r === "string") as RuntimeRef[]
                  : typeof data.fallbackEngine === "string"
                    ? [data.fallbackEngine as RuntimeRef]
                    : undefined,
              budgetConfig: parseBudgetConfig(data.budgetConfig),
            };
            registry.set(employee.name, employee);
          }
        } catch (err) {
          logger.warn(`Failed to parse employee file ${fullPath}: ${err}`);
        }
      }
    }
  }

  scan(ORG_DIR);
  return registry;
}

/**
 * Find the YAML file for an employee by name.
 * Searches ORG_DIR recursively.
 */
function findEmployeeYamlPath(name: string): string | undefined {
  if (!fs.existsSync(ORG_DIR)) return undefined;

  function search(dir: string): string | undefined {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = search(fullPath);
        if (found) return found;
      } else if (
        (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) &&
        entry.name !== "department.yaml"
      ) {
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const data = yaml.load(raw) as any;
          if (data?.name === name) return fullPath;
        } catch {
          // skip unreadable files
        }
      }
    }
    return undefined;
  }

  return search(ORG_DIR);
}

/**
 * All fields that can be patched on an employee via PATCH /api/org/employees/:name.
 * Fields that are undefined are left unchanged.
 */
export interface UpdateEmployeeFields {
  displayName?: string;
  department?: string;
  rank?: "executive" | "manager" | "senior" | "employee";
  reportsTo?: string | null;
  persona?: string;
  engine?: string;
  runtimeRef?: RuntimeRef | null;
  profileRef?: ProfileRef | null;
  model?: string | null;
  reasoning?: string | null;
  fallbackEngine?: string | null;
  fallbackRuntimes?: RuntimeRef[] | null;
  emoji?: string | null;
  alwaysNotify?: boolean;
  mcp?: boolean | string[] | null;
  hermesHooks?: HermesHooks | null;
  hermesProfile?: string | null;
  hermesProvider?: string | null;
  hermesToolsets?: string | null;
  hermesSkills?: string | null;
  /** @deprecated Use hermesHooks.memory instead. Synced bidirectionally. */
  honcho?: boolean | null;
  /** Budget configuration for alerts */
  budgetConfig?: BudgetConfig | null;
}

/**
 * Update an employee's YAML file with the provided fields.
 * Only fields explicitly set (not undefined) are written.
 * Returns true on success, false if employee not found.
 */
export function updateEmployeeYaml(
  name: string,
  updates: UpdateEmployeeFields,
): boolean {
  const filePath = findEmployeeYamlPath(name);
  if (!filePath) return false;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = yaml.load(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object") return false;

    // String fields — set or clear (null removes the key)
    if (updates.displayName !== undefined) {
      data.displayName = updates.displayName || undefined;
    }
    if (updates.department !== undefined) {
      data.department = updates.department || undefined;
    }
    if (updates.rank !== undefined) {
      data.rank = updates.rank;
    }
    if (updates.reportsTo !== undefined) {
      if (updates.reportsTo === null || updates.reportsTo === "") {
        delete data.reportsTo;
      } else {
        data.reportsTo = updates.reportsTo;
      }
    }
    if (updates.persona !== undefined) {
      data.persona = updates.persona || undefined;
    }
    if (updates.engine !== undefined) {
      data.engine = updates.engine || undefined;
    }
    if (updates.runtimeRef !== undefined) {
      if (updates.runtimeRef === null || updates.runtimeRef === "") {
        delete data.runtimeRef;
      } else {
        data.runtimeRef = updates.runtimeRef;
      }
    }
    if (updates.profileRef !== undefined) {
      if (updates.profileRef === null) {
        delete data.profileRef;
      } else {
        data.profileRef = updates.profileRef;
      }
    }
    if (updates.model !== undefined) {
      if (updates.model === null || updates.model === "") {
        delete data.model;
      } else {
        data.model = updates.model;
      }
    }
    if (updates.reasoning !== undefined) {
      if (updates.reasoning === null || updates.reasoning === "") {
        delete data.reasoning;
      } else {
        data.reasoning = updates.reasoning;
      }
    }
    if (updates.fallbackEngine !== undefined) {
      if (updates.fallbackEngine === null || updates.fallbackEngine === "") {
        delete data.fallbackEngine;
      } else {
        data.fallbackEngine = updates.fallbackEngine;
      }
    }
    if (updates.fallbackRuntimes !== undefined) {
      if (updates.fallbackRuntimes === null || updates.fallbackRuntimes.length === 0) {
        delete data.fallbackRuntimes;
      } else {
        // Filter to only string elements (defensive — reject malformed input)
        const filtered = (updates.fallbackRuntimes as unknown[]).filter(
          (r): r is string => typeof r === "string",
        );
        if (filtered.length === 0) {
          delete data.fallbackRuntimes;
        } else {
          data.fallbackRuntimes = filtered;
        }
      }
    }
    if (updates.emoji !== undefined) {
      if (updates.emoji === null || updates.emoji === "") {
        delete data.emoji;
      } else {
        data.emoji = updates.emoji;
      }
    }
    if (typeof updates.alwaysNotify === "boolean") {
      data.alwaysNotify = updates.alwaysNotify;
    }
    if (updates.mcp !== undefined) {
      if (updates.mcp === null) {
        delete data.mcp;
      } else {
        data.mcp = updates.mcp;
      }
    }
    if (updates.hermesHooks !== undefined) {
      if (updates.hermesHooks === null) {
        delete data.hermesHooks;
        delete data.honcho; // honcho: legacy compat — also clear honcho when hooks are cleared
      } else {
        data.hermesHooks = updates.hermesHooks;
        // Sync honcho legacy field bidirectionally with hermesHooks.memory
        data.honcho = updates.hermesHooks.memory ?? false;
      }
    }
    // Sync hermesHooks.memory from honcho when honcho is written standalone
    if (updates.honcho !== undefined) {
      if (updates.honcho === null || updates.honcho === false) {
        delete data.honcho;
        // Also clear hermesHooks.memory if it was set by a previous honcho:true
        if (data.hermesHooks) {
          delete (data.hermesHooks as Record<string, unknown>).memory;
          if (Object.keys(data.hermesHooks).length === 0) {
            delete data.hermesHooks;
          }
        }
      } else {
        data.honcho = true;
        // Upgrade: hermesHooks.memory takes precedence; set it if not already present
        if (!data.hermesHooks) {
          data.hermesHooks = { enabled: true, memory: true };
        } else if (!(data.hermesHooks as HermesHooks).memory) {
          (data.hermesHooks as HermesHooks).memory = true;
          (data.hermesHooks as HermesHooks).enabled = true;
        }
      }
    }
    if (updates.hermesProfile !== undefined) {
      if (updates.hermesProfile === null || updates.hermesProfile === "") {
        delete data.hermesProfile;
      } else {
        data.hermesProfile = updates.hermesProfile;
      }
    }
    if (updates.hermesProvider !== undefined) {
      if (updates.hermesProvider === null || updates.hermesProvider === "") {
        delete data.hermesProvider;
      } else {
        data.hermesProvider = updates.hermesProvider;
      }
    }
    if (updates.hermesToolsets !== undefined) {
      if (updates.hermesToolsets === null || updates.hermesToolsets === "") {
        delete data.hermesToolsets;
      } else {
        data.hermesToolsets = updates.hermesToolsets;
      }
    }
    if (updates.hermesSkills !== undefined) {
      if (updates.hermesSkills === null || updates.hermesSkills === "") {
        delete data.hermesSkills;
      } else {
        data.hermesSkills = updates.hermesSkills;
      }
    }
    if (updates.budgetConfig !== undefined) {
      if (updates.budgetConfig === null) {
        delete data.budgetConfig;
      } else {
        data.budgetConfig = updates.budgetConfig;
      }
    }

    fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1 }), "utf-8");
    return true;
  } catch (err) {
    logger.warn(`Failed to update employee YAML for ${name}: ${err}`);
    return false;
  }
}

/**
 * Input shape for creating a new employee YAML file.
 */
export interface CreateEmployeeInput {
  name: string;
  displayName?: string;
  department?: string;
  rank?: "executive" | "manager" | "senior" | "employee";
  reportsTo?: string;
  persona: string;
  engine?: string;
  runtimeRef?: RuntimeRef;
  profileRef?: ProfileRef;
  model?: string;
  reasoning?: string;
  fallbackEngine?: string;
  fallbackRuntimes?: RuntimeRef[];
  emoji?: string;
  alwaysNotify?: boolean;
  mcp?: boolean | string[];
  hermesHooks?: HermesHooks;
  hermesProfile?: string;
  hermesProvider?: string;
  hermesToolsets?: string;
  hermesSkills?: string;
  /** @deprecated Use hermesHooks.memory instead. Synced bidirectionally. */
  honcho?: boolean;
  budgetConfig?: BudgetConfig;
}

/**
 * Create a new employee YAML file under ORG_DIR/<department>/<name>.yaml.
 * Returns the resolved file path on success, throws on error.
 */
export function createEmployeeYaml(input: CreateEmployeeInput): string {
  const department = input.department || "default";
  const deptDir = path.join(ORG_DIR, department);
  fs.mkdirSync(deptDir, { recursive: true });

  const filePath = path.join(deptDir, `${input.name}.yaml`);

  const data: Record<string, unknown> = {
    name: input.name,
    displayName: input.displayName || input.name,
    department,
    rank: input.rank || "employee",
    persona: input.persona,
    engine: input.engine || input.runtimeRef || "hermes",
  };

  if (input.runtimeRef) data.runtimeRef = input.runtimeRef;
  if (input.profileRef) data.profileRef = input.profileRef;
  if (input.reportsTo) data.reportsTo = input.reportsTo;
  if (input.model) data.model = input.model;
  if (input.reasoning) data.reasoning = input.reasoning;
  if (input.fallbackEngine) data.fallbackEngine = input.fallbackEngine;
  if (input.fallbackRuntimes?.length) {
    // Defensive: filter to valid RuntimeRef strings only
    const filtered = input.fallbackRuntimes.filter((r): r is string => typeof r === "string");
    if (filtered.length) data.fallbackRuntimes = filtered;
  }
  if (input.emoji) data.emoji = input.emoji;
  if (typeof input.alwaysNotify === "boolean") data.alwaysNotify = input.alwaysNotify;
  if (input.mcp !== undefined) data.mcp = input.mcp;
  if (input.hermesHooks) {
    data.hermesHooks = input.hermesHooks;
    data.honcho = input.hermesHooks.memory ?? false; // legacy compat write
  }
  if (typeof input.honcho === "boolean") {
    data.honcho = input.honcho;
    if (input.honcho && !input.hermesHooks) {
      data.hermesHooks = { enabled: true, memory: true }; // upgrade honcho:true
    }
  }
  if (input.hermesProfile) data.hermesProfile = input.hermesProfile;
  if (input.hermesProvider) data.hermesProvider = input.hermesProvider;
  if (input.hermesToolsets) data.hermesToolsets = input.hermesToolsets;
  if (input.hermesSkills) data.hermesSkills = input.hermesSkills;
  if (input.budgetConfig) data.budgetConfig = input.budgetConfig;

  fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1 }), "utf-8");
  logger.info(`Created employee YAML: ${filePath}`);
  return filePath;
}

/**
 * Delete an employee YAML file by name. Searches ORG_DIR recursively.
 * Returns the path that was deleted, or undefined if not found.
 */
export function deleteEmployeeYaml(name: string): string | undefined {
  const filePath = findEmployeeYamlPath(name);
  if (!filePath) return undefined;
  fs.unlinkSync(filePath);
  logger.info(`Deleted employee YAML: ${filePath}`);
  return filePath;
}

export function findEmployee(
  name: string,
  registry: Map<string, Employee>,
): Employee | undefined {
  return registry.get(name);
}

export function extractMention(
  text: string,
  registry: Map<string, Employee>,
): Employee | undefined {
  for (const [name, employee] of registry) {
    if (text.includes(`@${name}`)) {
      return employee;
    }
  }
  return undefined;
}

/**
 * Extract ALL mentioned employees from text (e.g. "@jinn-dev @jinn-qa do X").
 * Returns an array of matched employees (can be empty).
 */
export function extractMentions(
  text: string,
  registry: Map<string, Employee>,
): Employee[] {
  const mentioned: Employee[] = [];
  for (const [name, employee] of registry) {
    if (text.includes(`@${name}`)) {
      mentioned.push(employee);
    }
  }
  return mentioned;
}
