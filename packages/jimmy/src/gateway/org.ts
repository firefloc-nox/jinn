import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ORG_DIR } from "../shared/paths.js";
import type { Employee, Department } from "../shared/types.js";
import { logger } from "../shared/logger.js";

export interface OrgScanResult {
  employees: Map<string, Employee>;
  departments: Map<string, Department>;
  /** Service name → department path that provides it */
  services: Map<string, string>;
}

/**
 * Scan the org directory for employees and department hierarchy.
 * Returns the employee Map (backward-compatible) and also populates
 * orgPath / reportsTo on each employee from department.yaml files.
 */
export function scanOrg(): Map<string, Employee> {
  const { employees } = scanOrgFull();
  return employees;
}

/**
 * Full org scan returning both employees and departments.
 */
export function scanOrgFull(): OrgScanResult {
  const employees = new Map<string, Employee>();
  const departments = new Map<string, Department>();

  if (!fs.existsSync(ORG_DIR)) return { employees, departments, services: new Map() };

  // ── Pass 1: Scan all employee YAML files ──────────────────────
  function scanEmployees(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanEmployees(fullPath);
      } else if (
        (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) &&
        entry.name !== "department.yaml" &&
        entry.name !== "department.yml"
      ) {
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const data = yaml.load(raw) as any;
          if (data && data.name && data.persona) {
            const relDir = path.relative(ORG_DIR, path.dirname(fullPath));
            const orgPath = relDir === "" ? undefined : relDir;
            const employee: Employee = {
              name: data.name,
              displayName: data.displayName || data.name,
              department:
                data.department || path.basename(path.dirname(fullPath)),
              rank: data.rank || "employee",
              engine: data.engine || "claude",
              model: data.model || "sonnet",
              persona: data.persona,
              emoji: typeof data.emoji === "string" ? data.emoji : undefined,
              cliFlags: Array.isArray(data.cliFlags) ? data.cliFlags : undefined,
              effortLevel: typeof data.effortLevel === "string" ? data.effortLevel : undefined,
              alwaysNotify: typeof data.alwaysNotify === "boolean" ? data.alwaysNotify : true,
              mcp: data.mcp,
              orgPath,
            };
            employees.set(employee.name, employee);
          }
        } catch (err) {
          logger.warn(`Failed to parse employee file ${fullPath}: ${err}`);
        }
      }
    }
  }

  scanEmployees(ORG_DIR);

  // ── Pass 2: Scan all department.yaml files ────────────────────
  function scanDepartments(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDepartments(fullPath);
      } else if (entry.name === "department.yaml" || entry.name === "department.yml") {
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const data = yaml.load(raw) as any;
          const deptDir = path.dirname(fullPath);
          const relPath = path.relative(ORG_DIR, deptDir);
          if (relPath === "") continue; // skip org root if there's a department.yaml there

          const parentRelPath = path.dirname(relPath);
          const parent = parentRelPath === "." ? undefined : parentRelPath;

          const dept: Department = {
            name: data?.name || path.basename(deptDir),
            displayName: data?.displayName || data?.name || path.basename(deptDir),
            description: data?.description,
            manager: data?.manager,
            path: relPath,
            parent,
            children: [],
            employees: [],
            provides: Array.isArray(data?.provides) ? data.provides : undefined,
          };
          departments.set(relPath, dept);
        } catch (err) {
          logger.warn(`Failed to parse department file ${fullPath}: ${err}`);
        }
      }
    }
  }

  scanDepartments(ORG_DIR);

  // ── Pass 3: Build parent/children relationships ───────────────
  for (const [deptPath, dept] of departments) {
    if (dept.parent && departments.has(dept.parent)) {
      const parentDept = departments.get(dept.parent)!;
      if (!parentDept.children.includes(deptPath)) {
        parentDept.children.push(deptPath);
      }
    }
  }

  // ── Pass 4: Assign employees to departments and set reportsTo ─
  for (const [, employee] of employees) {
    const orgPath = employee.orgPath;
    if (orgPath && departments.has(orgPath)) {
      const dept = departments.get(orgPath)!;
      dept.employees.push(employee.name);

      // Set reportsTo from the department's manager field
      // (but not for the manager themselves — they report to parent dept manager)
      if (dept.manager && dept.manager !== employee.name) {
        employee.reportsTo = dept.manager;
      } else if (dept.manager === employee.name && dept.parent) {
        // Manager reports to parent department's manager
        const parentDept = departments.get(dept.parent);
        if (parentDept?.manager) {
          employee.reportsTo = parentDept.manager;
        }
      }
    }
  }

  // ── Pass 5: Build service registry ────────────────────────────
  const services = new Map<string, string>();
  for (const [deptPath, dept] of departments) {
    for (const svc of dept.provides ?? []) {
      if (services.has(svc)) {
        logger.warn(`Service "${svc}" declared by both ${services.get(svc)} and ${deptPath}`);
      }
      services.set(svc, deptPath);
    }
  }

  return { employees, departments, services };
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

export type EmployeeUpdates = {
  displayName?: string;
  department?: string;
  rank?: string;
  engine?: string;
  model?: string;
  persona?: string;
  emoji?: string;
  effortLevel?: string;
  alwaysNotify?: boolean;
  mcp?: boolean | string[];
  maxCostUsd?: number;
  cliFlags?: string[];
};

/**
 * Update an employee's YAML file with any supported fields.
 * Returns true on success, false if employee not found.
 */
export function updateEmployeeYaml(
  name: string,
  updates: EmployeeUpdates,
): boolean {
  const filePath = findEmployeeYamlPath(name);
  if (!filePath) return false;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = yaml.load(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object") return false;

    const fields: (keyof EmployeeUpdates)[] = [
      "displayName", "department", "rank", "engine", "model",
      "persona", "emoji", "effortLevel", "alwaysNotify", "mcp",
      "maxCostUsd", "cliFlags",
    ];
    for (const field of fields) {
      if (updates[field] !== undefined) {
        data[field] = updates[field] as unknown;
      }
    }

    // If department changed, move the file
    if (updates.department !== undefined && updates.department !== data.department) {
      const newDeptDir = path.join(ORG_DIR, updates.department);
      if (!fs.existsSync(newDeptDir)) fs.mkdirSync(newDeptDir, { recursive: true });
      const newFilePath = path.join(newDeptDir, `${name}.yaml`);
      fs.writeFileSync(newFilePath, yaml.dump(data, { lineWidth: -1 }), "utf-8");
      fs.unlinkSync(filePath);
      return true;
    }

    fs.writeFileSync(filePath, yaml.dump(data, { lineWidth: -1 }), "utf-8");
    return true;
  } catch (err) {
    logger.warn(`Failed to update employee YAML for ${name}: ${err}`);
    return false;
  }
}

/**
 * Create a new employee YAML file.
 * Returns the file path on success, null on failure.
 */
export function createEmployeeYaml(data: {
  name: string;
  displayName: string;
  department?: string;
  rank?: string;
  engine?: string;
  model?: string;
  persona: string;
  emoji?: string;
  effortLevel?: string;
  alwaysNotify?: boolean;
}): string | null {
  const slugName = data.name.toLowerCase().replace(/\s+/g, "-");
  const deptDir = data.department
    ? path.join(ORG_DIR, data.department)
    : ORG_DIR;

  if (!fs.existsSync(deptDir)) {
    fs.mkdirSync(deptDir, { recursive: true });
  }

  const filePath = path.join(deptDir, `${slugName}.yaml`);
  if (fs.existsSync(filePath)) return null; // already exists

  try {
    const yamlData: Record<string, unknown> = {
      name: slugName,
      displayName: data.displayName,
      rank: data.rank || "employee",
      engine: data.engine || "claude",
      persona: data.persona,
    };
    if (data.department) yamlData.department = data.department;
    if (data.model) yamlData.model = data.model;
    if (data.emoji) yamlData.emoji = data.emoji;
    if (data.effortLevel) yamlData.effortLevel = data.effortLevel;
    if (typeof data.alwaysNotify === "boolean") yamlData.alwaysNotify = data.alwaysNotify;

    fs.writeFileSync(filePath, yaml.dump(yamlData, { lineWidth: -1 }), "utf-8");
    return filePath;
  } catch (err) {
    logger.warn(`Failed to create employee YAML for ${slugName}: ${err}`);
    return null;
  }
}

/**
 * Delete an employee's YAML file.
 * Returns true on success, false if not found.
 */
export function deleteEmployeeYaml(name: string): boolean {
  const filePath = findEmployeeYamlPath(name);
  if (!filePath) return false;

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    logger.warn(`Failed to delete employee YAML for ${name}: ${err}`);
    return false;
  }
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
