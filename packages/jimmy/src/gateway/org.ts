import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ORG_DIR } from "../shared/paths.js";
import type { Employee } from "../shared/types.js";
import { logger } from "../shared/logger.js";

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
            const employee: Employee = {
              name: data.name,
              displayName: data.displayName || data.name,
              department:
                data.department || path.basename(path.dirname(fullPath)),
              rank: data.rank || "employee",
              engine: data.engine || "claude",
              model: data.model || undefined,
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
              hermesProfile: typeof data.hermesProfile === "string" ? data.hermesProfile : undefined,
              hermesProvider: typeof data.hermesProvider === "string" ? data.hermesProvider : undefined,
              hermesToolsets: typeof data.hermesToolsets === "string" ? data.hermesToolsets : undefined,
              hermesSkills: typeof data.hermesSkills === "string" ? data.hermesSkills : undefined,
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
  model?: string | null;
  fallbackEngine?: string | null;
  emoji?: string | null;
  alwaysNotify?: boolean;
  mcp?: boolean | string[] | null;
  hermesProfile?: string | null;
  hermesProvider?: string | null;
  hermesToolsets?: string | null;
  hermesSkills?: string | null;
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
    if (updates.model !== undefined) {
      if (updates.model === null || updates.model === "") {
        delete data.model;
      } else {
        data.model = updates.model;
      }
    }
    if (updates.fallbackEngine !== undefined) {
      if (updates.fallbackEngine === null || updates.fallbackEngine === "") {
        delete data.fallbackEngine;
      } else {
        data.fallbackEngine = updates.fallbackEngine;
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
  model?: string;
  fallbackEngine?: string;
  emoji?: string;
  alwaysNotify?: boolean;
  mcp?: boolean | string[];
  hermesProfile?: string;
  hermesProvider?: string;
  hermesToolsets?: string;
  hermesSkills?: string;
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
    engine: input.engine || "hermes",
  };

  if (input.reportsTo) data.reportsTo = input.reportsTo;
  if (input.model) data.model = input.model;
  if (input.fallbackEngine) data.fallbackEngine = input.fallbackEngine;
  if (input.emoji) data.emoji = input.emoji;
  if (typeof input.alwaysNotify === "boolean") data.alwaysNotify = input.alwaysNotify;
  if (input.mcp !== undefined) data.mcp = input.mcp;
  if (input.hermesProfile) data.hermesProfile = input.hermesProfile;
  if (input.hermesProvider) data.hermesProvider = input.hermesProvider;
  if (input.hermesToolsets) data.hermesToolsets = input.hermesToolsets;
  if (input.hermesSkills) data.hermesSkills = input.hermesSkills;

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
