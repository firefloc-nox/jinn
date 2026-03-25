"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { Employee } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const RANKS = ["executive", "director", "manager", "lead", "senior", "employee"] as const;
const ENGINES = ["claude", "codex", "local"] as const;
const EFFORT_LEVELS = ["low", "medium", "high"] as const;

interface EmployeeFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
  /** If provided, form is in edit mode */
  employee?: Employee;
  /** List of existing departments for the dropdown */
  departments?: string[];
}

type FormData = {
  name: string;
  displayName: string;
  department: string;
  rank: string;
  engine: string;
  model: string;
  persona: string;
  effortLevel: string;
  alwaysNotify: boolean;
};

const defaultForm: FormData = {
  name: "",
  displayName: "",
  department: "",
  rank: "employee",
  engine: "claude",
  model: "",
  persona: "",
  effortLevel: "medium",
  alwaysNotify: true,
};

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function EmployeeFormDialog({
  open,
  onClose,
  onSaved,
  employee,
  departments = [],
}: EmployeeFormDialogProps) {
  const isEdit = !!employee;
  const [form, setForm] = useState<FormData>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameAutoSync, setNameAutoSync] = useState(!isEdit);

  useEffect(() => {
    if (!open) return;
    if (employee) {
      setForm({
        name: employee.name,
        displayName: employee.displayName || employee.name,
        department: employee.department || "",
        rank: employee.rank || "employee",
        engine: employee.engine || "claude",
        model: employee.model || "",
        persona: employee.persona || "",
        effortLevel: (employee as any).effortLevel || "medium",
        alwaysNotify: employee.alwaysNotify !== false,
      });
      setNameAutoSync(false);
    } else {
      setForm(defaultForm);
      setNameAutoSync(true);
    }
    setError(null);
  }, [open, employee]);

  function set(field: keyof FormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleDisplayNameChange(value: string) {
    set("displayName", value);
    if (nameAutoSync && !isEdit) {
      set("name", toSlug(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.displayName.trim() || !form.persona.trim()) {
      setError("Display name and persona are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && employee) {
        await api.updateEmployee(employee.name, {
          displayName: form.displayName,
          department: form.department,
          rank: form.rank as Employee["rank"],
          engine: form.engine,
          model: form.model || undefined,
          persona: form.persona,
          effortLevel: form.effortLevel,
          alwaysNotify: form.alwaysNotify,
        } as Partial<Employee>);
        onSaved(employee.name);
      } else {
        const slug = toSlug(form.name || form.displayName);
        const result = await api.createEmployee({
          name: slug,
          displayName: form.displayName,
          department: form.department || undefined,
          rank: form.rank as Employee["rank"],
          engine: form.engine,
          model: form.model || undefined,
          persona: form.persona,
          effortLevel: form.effortLevel,
          alwaysNotify: form.alwaysNotify,
        });
        onSaved(result.name);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save employee");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" style={{ background: "var(--bg)", border: "1px solid var(--separator)", borderRadius: "var(--radius-lg, 16px)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--text-primary)", fontSize: "var(--text-title2)", fontWeight: "var(--weight-bold)" }}>
            {isEdit ? `Edit ${employee?.displayName || employee?.name}` : "New Employee"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--space-4)]">
          {/* Display name + auto slug */}
          <div className="grid grid-cols-2 gap-[var(--space-3)]">
            <Field label="Display Name" required>
              <Input
                value={form.displayName}
                onChange={(v) => handleDisplayNameChange(v)}
                placeholder="Alice Dupont"
              />
            </Field>
            <Field label="ID (slug)" hint="auto-generated">
              <Input
                value={form.name}
                onChange={(v) => { setNameAutoSync(false); set("name", toSlug(v)); }}
                placeholder="alice-dupont"
                disabled={isEdit}
                style={isEdit ? { opacity: 0.5 } : {}}
              />
            </Field>
          </div>

          {/* Department + Rank */}
          <div className="grid grid-cols-2 gap-[var(--space-3)]">
            <Field label="Department">
              <div className="flex gap-[var(--space-2)]">
                <Input
                  value={form.department}
                  onChange={(v) => set("department", v)}
                  placeholder="engineering"
                  list="dept-list"
                />
                <datalist id="dept-list">
                  {departments.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
            </Field>
            <Field label="Rank">
              <Select value={form.rank} onChange={(v) => set("rank", v)} options={RANKS} />
            </Field>
          </div>

          {/* Engine + Model */}
          <div className="grid grid-cols-2 gap-[var(--space-3)]">
            <Field label="Engine">
              <Select value={form.engine} onChange={(v) => set("engine", v)} options={ENGINES} />
            </Field>
            <Field label="Model" hint="optional">
              <Input
                value={form.model}
                onChange={(v) => set("model", v)}
                placeholder="sonnet, opus, o3…"
              />
            </Field>
          </div>

          {/* Effort level */}
          <Field label="Default Effort">
            <Select value={form.effortLevel} onChange={(v) => set("effortLevel", v)} options={EFFORT_LEVELS} />
          </Field>

          {/* Persona */}
          <Field label="Persona / System Prompt" required>
            <textarea
              value={form.persona}
              onChange={(e) => set("persona", e.target.value)}
              placeholder="You are Alice, a senior engineer at…"
              rows={6}
              style={{
                width: "100%",
                background: "var(--fill-secondary)",
                border: "1px solid var(--separator)",
                borderRadius: "var(--radius-md, 10px)",
                padding: "var(--space-3) var(--space-3)",
                color: "var(--text-primary)",
                fontSize: "var(--text-body)",
                fontFamily: "var(--font-mono)",
                resize: "vertical",
                outline: "none",
              }}
            />
          </Field>

          {/* Always notify toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p style={{ color: "var(--text-primary)", fontSize: "var(--text-body)", margin: 0 }}>Notify on completion</p>
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--text-caption2)", margin: 0 }}>Notify parent session when this employee finishes</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.alwaysNotify}
              onClick={() => set("alwaysNotify", !form.alwaysNotify)}
              className="relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full border-none transition-colors duration-200"
              style={{ background: form.alwaysNotify ? "var(--accent, var(--system-green))" : "var(--fill-tertiary)" }}
            >
              <span
                className="pointer-events-none inline-block h-[20px] w-[20px] rounded-full bg-white shadow-sm transition-transform duration-200"
                style={{ transform: form.alwaysNotify ? "translate(22px, 2px)" : "translate(2px, 2px)" }}
              />
            </button>
          </div>

          {error && (
            <div style={{
              background: "color-mix(in srgb, var(--system-red) 10%, transparent)",
              border: "1px solid color-mix(in srgb, var(--system-red) 30%, transparent)",
              borderRadius: "var(--radius-md, 10px)",
              padding: "var(--space-3)",
              color: "var(--system-red)",
              fontSize: "var(--text-caption1)",
            }}>
              {error}
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-md, 10px)",
                background: "var(--fill-tertiary)",
                color: "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
                fontSize: "var(--text-body)",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-md, 10px)",
                background: "var(--accent)",
                color: "var(--accent-contrast)",
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                fontSize: "var(--text-body)",
                fontWeight: "var(--weight-semibold)",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Employee"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Helpers ---

function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <label style={{ fontSize: "var(--text-caption2)", fontWeight: "var(--weight-semibold)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--text-tertiary)" }}>
        {label}{required && <span style={{ color: "var(--system-red)", marginLeft: 2 }}>*</span>}
        {hint && <span style={{ color: "var(--text-tertiary)", marginLeft: 4, fontWeight: "normal", textTransform: "none" }}>({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, disabled, style, list }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  list?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      list={list}
      style={{
        width: "100%",
        background: "var(--fill-secondary)",
        border: "1px solid var(--separator)",
        borderRadius: "var(--radius-md, 10px)",
        padding: "var(--space-2) var(--space-3)",
        color: "var(--text-primary)",
        fontSize: "var(--text-body)",
        outline: "none",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

function Select({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        background: "var(--fill-secondary)",
        border: "1px solid var(--separator)",
        borderRadius: "var(--radius-md, 10px)",
        padding: "var(--space-2) var(--space-3)",
        color: "var(--text-primary)",
        fontSize: "var(--text-body)",
        outline: "none",
      }}
    >
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
