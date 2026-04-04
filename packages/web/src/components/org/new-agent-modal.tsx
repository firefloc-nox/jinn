"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Employee, CreateEmployeeRequest } from "@/lib/api";

const RANKS = ["employee", "senior", "manager", "executive"] as const;
const ENGINES = ["hermes", "claude", "codex"] as const;
const FALLBACK_ENGINES = ["claude", "codex", "none"] as const;
const PROVIDERS = ["anthropic", "openai", "openrouter", "auto"] as const;

function slugify(v: string) {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

interface FormState {
  // Step 1
  name: string;
  displayName: string;
  department: string;
  rank: (typeof RANKS)[number];
  reportsTo: string;
  // Step 2
  engine: (typeof ENGINES)[number];
  hermesProfile: string;
  createNewProfile: boolean;
  newProfileName: string;
  cloneProfile: boolean;
  cloneFrom: string;
  hermesProvider: string;
  // Step 3
  persona: string;
  fallbackEngine: (typeof FALLBACK_ENGINES)[number];
  mcp: boolean;
  honcho: boolean;
}

const INITIAL: FormState = {
  name: "",
  displayName: "",
  department: "",
  rank: "employee",
  reportsTo: "",
  engine: "hermes",
  hermesProfile: "",
  createNewProfile: false,
  newProfileName: "",
  cloneProfile: false,
  cloneFrom: "",
  hermesProvider: "",
  persona: "",
  fallbackEngine: "none",
  mcp: false,
  honcho: false,
};

export function NewAgentModal({
  employees,
  onClose,
  onCreated,
}: {
  employees: Employee[];
  onClose: () => void;
  onCreated: (emp: Employee) => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [hermesProfiles, setHermesProfiles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Derive departments from existing employees
  const departments = Array.from(
    new Set(employees.map((e) => e.department).filter(Boolean)),
  );

  useEffect(() => {
    api
      .listHermesProfiles()
      .then((r) => setHermesProfiles(r.profiles ?? []))
      .catch(() => setHermesProfiles([]));
  }, []);

  // Auto-slug from displayName
  function handleDisplayNameChange(v: string) {
    const slug = slugify(v);
    setForm((f) => ({ ...f, displayName: v, name: slug }));
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Validation per step
  function canNext(): boolean {
    if (step === 1) return form.name.length > 0 && form.displayName.length > 0;
    if (step === 2) {
      if (form.engine === "hermes") {
        if (form.createNewProfile) return form.newProfileName.length > 0;
        return true; // hermesProfile optional
      }
      return true;
    }
    return true;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // If creating a new Hermes profile
      if (form.engine === "hermes" && form.createNewProfile && form.newProfileName) {
        await api.createHermesProfile(
          form.newProfileName,
          form.cloneProfile && form.cloneFrom ? form.cloneFrom : undefined,
        );
      }

      const hermesProfileName =
        form.engine === "hermes"
          ? form.createNewProfile
            ? form.newProfileName
            : form.hermesProfile || undefined
          : undefined;

      const payload: CreateEmployeeRequest = {
        name: form.name,
        displayName: form.displayName,
        department: form.department || undefined,
        rank: form.rank,
        reportsTo: form.reportsTo || undefined,
        engine: form.engine,
        runtimeRef: form.engine,
        profileRef: hermesProfileName
          ? { runtime: "hermes", name: hermesProfileName }
          : undefined,
        persona: form.persona || undefined,
        hermesHooks: form.mcp || form.honcho
          ? {
              enabled: true,
              memory: form.honcho || undefined,
              mcp: form.mcp || undefined,
            }
          : undefined,
        hermesProfile: hermesProfileName,
        hermesProvider:
          form.engine === "hermes" && form.hermesProvider
            ? form.hermesProvider
            : undefined,
        fallbackEngine:
          form.fallbackEngine !== "none" ? form.fallbackEngine : undefined,
        mcp: form.mcp || undefined,
        honcho: form.honcho || undefined,
      };

      const created = await api.createEmployee(payload);
      onCreated(created);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Creation failed");
      setSubmitting(false);
    }
  }

  const stepLabel = (n: number, label: string) => (
    <div className="flex items-center gap-[var(--space-2)]">
      <span
        className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[length:var(--text-caption2)] font-[var(--weight-bold)] ${
          step === n
            ? "bg-[var(--accent)] text-[var(--accent-contrast,white)]"
            : step > n
              ? "bg-[var(--system-green)] text-white"
              : "bg-[var(--fill-tertiary)] text-[var(--text-tertiary)]"
        }`}
      >
        {step > n ? "✓" : n}
      </span>
      <span
        className={`text-[length:var(--text-caption1)] font-[var(--weight-semibold)] ${
          step === n ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
        }`}
      >
        {label}
      </span>
    </div>
  );

  const inputClass =
    "w-full text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-3)] py-[var(--space-2)]";
  const labelClass =
    "block text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-1)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col bg-[var(--bg)] rounded-[var(--radius-lg,16px)] border border-[var(--separator)] shadow-[var(--shadow-overlay)] w-full max-w-lg overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[var(--space-6)] pt-[var(--space-5)] pb-[var(--space-4)] border-b border-[var(--separator)]">
          <h2 className="text-[length:var(--text-title3)] font-[var(--weight-bold)] text-[var(--text-primary)] m-0">
            New Agent
          </h2>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-full flex items-center justify-center bg-[var(--fill-tertiary)] text-[var(--text-secondary)] border-none cursor-pointer text-sm"
          >
            &#x2715;
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-[var(--space-4)] px-[var(--space-6)] py-[var(--space-3)] border-b border-[var(--separator)]">
          {stepLabel(1, "Identity")}
          <span className="text-[var(--separator)]">›</span>
          {stepLabel(2, "Runtime")}
          <span className="text-[var(--separator)]">›</span>
          {stepLabel(3, "Hooks")}
        </div>

        {/* Form content */}
        <div className="flex-1 overflow-y-auto px-[var(--space-6)] py-[var(--space-5)]">
          {step === 1 && (
            <div className="flex flex-col gap-[var(--space-4)]">
              <div>
                <label className={labelClass}>Display Name</label>
                <input
                  className={inputClass}
                  value={form.displayName}
                  onChange={(e) => handleDisplayNameChange(e.target.value)}
                  placeholder="My Agent"
                  autoFocus
                />
              </div>
              <div>
                <label className={labelClass}>Slug (name)</label>
                <input
                  className={inputClass + " font-[family-name:var(--font-mono)]"}
                  value={form.name}
                  onChange={(e) =>
                    setField("name", slugify(e.target.value))
                  }
                  placeholder="my-agent"
                />
                <p className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] mt-[var(--space-1)] mb-0">
                  Lowercase alphanumeric + hyphens. Used as identifier.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-[var(--space-3)]">
                <div>
                  <label className={labelClass}>Department</label>
                  {departments.length > 0 ? (
                    <select
                      className={inputClass}
                      value={form.department}
                      onChange={(e) => setField("department", e.target.value)}
                    >
                      <option value="">— none —</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                      <option value="__custom__">Custom…</option>
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      value={form.department}
                      onChange={(e) => setField("department", e.target.value)}
                      placeholder="Engineering"
                    />
                  )}
                  {form.department === "__custom__" && (
                    <input
                      className={inputClass + " mt-[var(--space-1)]"}
                      value=""
                      onChange={(e) => setField("department", e.target.value)}
                      placeholder="Department name"
                      autoFocus
                    />
                  )}
                </div>
                <div>
                  <label className={labelClass}>Rank</label>
                  <select
                    className={inputClass}
                    value={form.rank}
                    onChange={(e) =>
                      setField("rank", e.target.value as FormState["rank"])
                    }
                  >
                    {RANKS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {employees.length > 0 && (
                <div>
                  <label className={labelClass}>Reports To (optional)</label>
                  <select
                    className={inputClass}
                    value={form.reportsTo}
                    onChange={(e) => setField("reportsTo", e.target.value)}
                  >
                    <option value="">— none —</option>
                    {employees.map((e) => (
                      <option key={e.name} value={e.name}>
                        {e.displayName || e.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-[var(--space-4)]">
              <div>
                <label className={labelClass}>Runtime</label>
                <div className="flex gap-[var(--space-2)]">
                  {ENGINES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setField("engine", e)}
                      className={`flex-1 py-[var(--space-2)] px-[var(--space-3)] rounded-[var(--radius-sm,6px)] border text-[length:var(--text-caption1)] font-[var(--weight-semibold)] cursor-pointer transition-colors ${
                        form.engine === e
                          ? "bg-[var(--accent)] text-[var(--accent-contrast,white)] border-[var(--accent)]"
                          : "bg-transparent text-[var(--text-secondary)] border-[var(--separator)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {e}
                      {e === "hermes" && (
                        <span className="ml-1 text-[length:var(--text-caption2)] opacity-70">
                          ★
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {form.engine === "hermes" && (
                <>
                  <div>
                    <label className={labelClass}>Hermes Profile</label>
                    {!form.createNewProfile && (
                      <select
                        className={inputClass}
                        value={form.hermesProfile}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setField("createNewProfile", true);
                          } else {
                            setField("hermesProfile", e.target.value);
                          }
                        }}
                      >
                        <option value="">— none / auto —</option>
                        {hermesProfiles.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                        <option value="__new__">+ Create new profile</option>
                      </select>
                    )}
                    {form.createNewProfile && (
                      <div className="flex flex-col gap-[var(--space-2)]">
                        <div className="flex gap-[var(--space-2)] items-center">
                          <input
                            className={inputClass + " flex-1 font-[family-name:var(--font-mono)]"}
                            value={form.newProfileName}
                            onChange={(e) =>
                              setField("newProfileName", slugify(e.target.value))
                            }
                            placeholder="my-agent-profile"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setField("createNewProfile", false);
                              setField("newProfileName", "");
                            }}
                            className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] bg-none border-none cursor-pointer px-[var(--space-2)]"
                          >
                            ✕
                          </button>
                        </div>
                        <label className="flex items-center gap-[var(--space-2)] text-[length:var(--text-caption1)] text-[var(--text-secondary)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.cloneProfile}
                            onChange={(e) =>
                              setField("cloneProfile", e.target.checked)
                            }
                          />
                          Clone from existing profile
                        </label>
                        {form.cloneProfile && hermesProfiles.length > 0 && (
                          <select
                            className={inputClass}
                            value={form.cloneFrom}
                            onChange={(e) =>
                              setField("cloneFrom", e.target.value)
                            }
                          >
                            <option value="">— select source —</option>
                            {hermesProfiles.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>Hermes Provider (optional)</label>
                    <select
                      className={inputClass}
                      value={form.hermesProvider}
                      onChange={(e) =>
                        setField("hermesProvider", e.target.value)
                      }
                    >
                      <option value="">— auto —</option>
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-[var(--space-4)]">
              <div>
                <label className={labelClass}>Persona</label>
                <textarea
                  className={inputClass + " resize-y"}
                  rows={5}
                  value={form.persona}
                  onChange={(e) => setField("persona", e.target.value)}
                  placeholder="Describe the agent's role and behavior…"
                />
              </div>
              <div>
                <label className={labelClass}>Fallback Runtime</label>
                <select
                  className={inputClass}
                  value={form.fallbackEngine}
                  onChange={(e) =>
                    setField(
                      "fallbackEngine",
                      e.target.value as FormState["fallbackEngine"],
                    )
                  }
                >
                  {FALLBACK_ENGINES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Hermes Hooks</label>
                <div className="flex gap-[var(--space-6)]">
                  <label className="flex items-center gap-[var(--space-2)] text-[length:var(--text-body)] text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.mcp}
                      onChange={(e) => setField("mcp", e.target.checked)}
                    />
                    MCP tools
                  </label>
                  <label className="flex items-center gap-[var(--space-2)] text-[length:var(--text-body)] text-[var(--text-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.honcho}
                      onChange={(e) => setField("honcho", e.target.checked)}
                    />
                    Honcho memory
                  </label>
                </div>
              </div>
            </div>
          )}

          {submitError && (
            <div
              className="mt-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] rounded-[var(--radius-sm,6px)] text-[length:var(--text-caption1)] text-[var(--system-red)]"
              style={{
                background:
                  "color-mix(in srgb, var(--system-red) 10%, transparent)",
              }}
            >
              {submitError}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-[var(--space-6)] py-[var(--space-4)] border-t border-[var(--separator)]">
          <button
            onClick={step === 1 ? onClose : () => setStep((s) => s - 1)}
            className="px-[var(--space-4)] py-[var(--space-2)] rounded-[var(--radius-md,10px)] bg-[var(--fill-tertiary)] text-[var(--text-secondary)] border-none cursor-pointer text-[length:var(--text-body)]"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext()}
              className="px-[var(--space-5)] py-[var(--space-2)] rounded-[var(--radius-md,10px)] bg-[var(--accent)] text-[var(--accent-contrast,white)] border-none cursor-pointer text-[length:var(--text-body)] font-[var(--weight-semibold)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-[var(--space-5)] py-[var(--space-2)] rounded-[var(--radius-md,10px)] bg-[var(--accent)] text-[var(--accent-contrast,white)] border-none cursor-pointer text-[length:var(--text-body)] font-[var(--weight-semibold)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create Agent"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
