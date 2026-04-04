"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Employee } from "@/lib/api";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { useSettings } from "@/app/settings-provider";
import { emojiForName } from "@/lib/emoji-pool";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Badge } from "@/components/ui/badge";
import { HermesProfileEditorModal } from "@/components/org/hermes-profile-editor-modal";

const RUNTIME_OPTIONS = [
  { value: "hermes", label: "hermes" },
  { value: "hermes:openrouter", label: "hermes:openrouter" },
  { value: "hermes:ollama", label: "hermes:ollama" },
  { value: "claude", label: "claude" },
  { value: "codex", label: "codex" },
  { value: "gemini", label: "gemini" },
] as const;

const RUNTIME_LIST = ["hermes", "hermes:openrouter", "hermes:ollama", "claude", "codex", "gemini"] as const;

type RuntimeOption = (typeof RUNTIME_OPTIONS)[number]["value"];

interface SessionData {
  id: string;
  employee?: string | null;
  status?: string;
  createdAt?: string;
  source?: string;
  [key: string]: unknown;
}

function RankBadge({ rank }: { rank: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    executive: {
      bg: "color-mix(in srgb, var(--system-purple) 15%, transparent)",
      text: "var(--system-purple)",
    },
    manager: {
      bg: "color-mix(in srgb, var(--system-blue) 15%, transparent)",
      text: "var(--system-blue)",
    },
    senior: {
      bg: "color-mix(in srgb, var(--system-green) 15%, transparent)",
      text: "var(--system-green)",
    },
    employee: {
      bg: "var(--fill-tertiary)",
      text: "var(--text-tertiary)",
    },
  };
  const c = colors[rank] || colors.employee;

  return (
    <span
      className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] px-[10px] py-[2px] rounded-[10px] uppercase tracking-[0.02em]"
      style={{ color: c.text, background: c.bg }}
    >
      {rank}
    </span>
  );
}

const engineStyles: Record<string, string> = {
  hermes:
    "border-transparent bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--accent)]",
  claude:
    "border-transparent bg-[color-mix(in_srgb,var(--system-orange)_18%,transparent)] text-[var(--system-orange)]",
  codex:
    "border-transparent bg-[color-mix(in_srgb,var(--system-green)_18%,transparent)] text-[var(--system-green)]",
};

function EngineChip({
  engine,
  runtimeRef,
  profileName,
  hermesProfile,
}: {
  engine: string;
  runtimeRef?: string;
  profileName?: string;
  hermesProfile?: string;
}) {
  const runtimeLabel = runtimeRef || engine || "hermes";
  const resolvedProfile = profileName || hermesProfile;
  const key = (runtimeLabel || "").split(":")[0].toLowerCase();
  const styleClass =
    engineStyles[key] ??
    "border-[var(--separator)] text-[var(--text-secondary)]";

  return (
    <div className="flex flex-wrap items-center gap-[var(--space-1)]">
      <Badge
        variant="outline"
        className={`px-2.5 py-1 text-[length:var(--text-caption2)] font-[var(--weight-semibold)] ${styleClass}`}
      >
        {runtimeLabel}
      </Badge>
      {resolvedProfile && (
        <Badge
          variant="outline"
          className="border-[var(--separator)] text-[var(--text-secondary)] px-2.5 py-1 text-[length:var(--text-caption2)]"
        >
          {resolvedProfile}
        </Badge>
      )}
    </div>
  );
}

const RANKS = ["employee", "senior", "manager", "executive"] as const;

interface EditState {
  displayName: string;
  department: string;
  rank: Employee["rank"];
  reportsTo: string;
  persona: string;
  runtimeRef: RuntimeOption;
  fallbackRuntimes: RuntimeOption[];
  hermesHooks: {
    memory: boolean;
    mcp: boolean;
    skills: boolean;
  };
}

export function EmployeeDetail({
  name,
  prefetched,
  allEmployees,
  onUpdate,
}: {
  name: string;
  prefetched?: Employee;
  allEmployees?: Employee[];
  /** Called after a successful save so the parent can sync its employee list */
  onUpdate?: (employee: Employee) => void;
}) {
  const [employee, setEmployee] = useState<Employee | null>(prefetched ?? null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(!prefetched);
  const [error, setError] = useState<string | null>(null);
  const [personaExpanded, setPersonaExpanded] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const { settings, setEmployeeOverride } = useSettings();

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hermes profile modal
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  // Cross-request state
  const [crossRequestService, setCrossRequestService] = useState<string | null>(null);
  const [crossRequestFrom, setCrossRequestFrom] = useState<string>('');
  const [crossRequestPrompt, setCrossRequestPrompt] = useState<string>('');
  const [crossRequestLoading, setCrossRequestLoading] = useState(false);
  const [crossRequestResult, setCrossRequestResult] = useState<string | null>(null);
  const [crossRequestError, setCrossRequestError] = useState<string | null>(null);

  useEffect(() => {
    setPersonaExpanded(false);
    setEditing(false);
    setSaveError(null);

    if (prefetched) {
      setEmployee(prefetched);
      setLoading(true);
      setError(null);
      api
        .getSessions()
        .then((allSessions) => {
          const empSessions = (allSessions as SessionData[]).filter(
            (s) => s.employee === name || (!s.employee && name === prefetched.name),
          );
          setSessions(empSessions.slice(0, 10));
        })
        .catch(() => setSessions([]))
        .finally(() => setLoading(false));
      return;
    }

    setLoading(true);
    setError(null);

    Promise.all([api.getEmployee(name), api.getSessions()])
      .then(([emp, allSessions]) => {
        setEmployee(emp);
        const empSessions = (allSessions as SessionData[]).filter(
          (s) => s.employee === name,
        );
        setSessions(empSessions.slice(0, 10));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [name, prefetched]);

  function startEdit() {
    if (!employee) return;
    setEditState({
      displayName: employee.displayName || "",
      department: employee.department || "",
      rank: employee.rank || "employee",
      reportsTo: Array.isArray(employee.reportsTo)
        ? employee.reportsTo[0] ?? ""
        : employee.reportsTo ?? "",
      persona: employee.persona || "",
      runtimeRef: (employee.runtimeRef || employee.engine || "hermes") as RuntimeOption,
      fallbackRuntimes: (employee.fallbackRuntimes ?? []) as RuntimeOption[],
      hermesHooks: {
        memory: employee.hermesHooks?.memory ?? employee.honcho ?? false,
        mcp: employee.hermesHooks?.mcp ?? employee.mcp ?? false,
        skills: employee.hermesHooks?.skills ?? false,
      },
    });
    setEditing(true);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setEditState(null);
    setSaveError(null);
  }

  async function handleCrossRequest(serviceName: string) {
    if (!crossRequestFrom || !crossRequestPrompt.trim()) return;
    setCrossRequestLoading(true);
    setCrossRequestResult(null);
    setCrossRequestError(null);
    try {
      const res = await api.crossRequest({
        fromEmployee: crossRequestFrom,
        service: serviceName,
        prompt: crossRequestPrompt.trim(),
      });
      const sessionId = (res as Record<string, unknown>).sessionId as string | undefined;
      setCrossRequestResult(sessionId ? `Session started: ${sessionId}` : 'Request submitted successfully');
      setCrossRequestPrompt('');
    } catch (err) {
      setCrossRequestError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setCrossRequestLoading(false);
    }
  }

  async function saveEdit() {
    if (!employee || !editState) return;
    setSaving(true);
    setSaveError(null);
    const prev = { ...employee };
    const runtimeRef = editState.runtimeRef;
    const updated: Employee = {
      ...employee,
      displayName: editState.displayName,
      department: editState.department,
      rank: editState.rank,
      reportsTo: editState.reportsTo || undefined,
      persona: editState.persona,
      runtimeRef,
      fallbackRuntimes: editState.fallbackRuntimes,
      hermesHooks: editState.hermesHooks.memory || editState.hermesHooks.mcp || editState.hermesHooks.skills
        ? { enabled: true, ...editState.hermesHooks }
        : undefined,
    };
    setEmployee(updated); // optimistic
    try {
      await api.updateEmployee(employee.name, {
        displayName: editState.displayName,
        department: editState.department,
        rank: editState.rank,
        reportsTo: editState.reportsTo || undefined,
        persona: editState.persona,
        runtimeRef,
        fallbackRuntimes: editState.fallbackRuntimes,
        hermesHooks: editState.hermesHooks.memory || editState.hermesHooks.mcp || editState.hermesHooks.skills
          ? { enabled: true, ...editState.hermesHooks }
          : null,
      });
      setEditing(false);
      setEditState(null);
      onUpdate?.(updated); // notify parent so org list stays in sync
    } catch (err) {
      setEmployee(prev); // rollback
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-tertiary)] text-[length:var(--text-caption1)]">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-[var(--radius-md,12px)] px-[var(--space-4)] py-[var(--space-3)] text-[length:var(--text-caption1)] text-[var(--system-red)]"
        style={{
          background: "color-mix(in srgb, var(--system-red) 10%, transparent)",
          border:
            "1px solid color-mix(in srgb, var(--system-red) 30%, transparent)",
        }}
      >
        Failed to load employee: {error}
      </div>
    );
  }

  if (!employee) return null;

  const rank = employee.rank || "employee";
  const persona = editing ? (editState?.persona ?? "") : (employee.persona || "");
  const currentEmoji =
    settings.employeeOverrides[employee.name]?.emoji ||
    emojiForName(employee.name);
  const truncatedPersona =
    persona.length > 200 && !personaExpanded
      ? persona.slice(0, 200) + "..."
      : persona;

  const otherEmployees = (allEmployees ?? []).filter(
    (e) => e.name !== employee.name,
  );

  return (
    <div className="flex flex-col gap-[var(--space-6)]">
      {/* Main info card */}
      <div className="rounded-[var(--radius-lg,16px)] border border-[var(--separator)] bg-[var(--material-regular)] p-[var(--space-6)]">
        <div className="flex items-start justify-between mb-[var(--space-4)]">
          <div className="flex items-center gap-[var(--space-3)]">
            <div className="relative">
              <EmployeeAvatar
                name={employee.name}
                size={36}
                onClick={() => setShowAvatarPicker(!showAvatarPicker)}
              />
              {showAvatarPicker && (
                <EmojiPicker
                  current={currentEmoji}
                  onSelect={(emoji) => {
                    setEmployeeOverride(employee.name, {
                      emoji:
                        emoji === emojiForName(employee.name)
                          ? undefined
                          : emoji,
                    });
                    setShowAvatarPicker(false);
                  }}
                  onClose={() => setShowAvatarPicker(false)}
                />
              )}
            </div>
            <div>
              {editing ? (
                <input
                  className="text-[length:var(--text-title2)] font-[var(--weight-bold)] tracking-[var(--tracking-tight)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[2px] w-full"
                  value={editState?.displayName ?? ""}
                  onChange={(e) =>
                    setEditState((s) =>
                      s ? { ...s, displayName: e.target.value } : s,
                    )
                  }
                />
              ) : (
                <h2 className="text-[length:var(--text-title2)] font-[var(--weight-bold)] tracking-[var(--tracking-tight)] text-[var(--text-primary)] m-0">
                  {employee.displayName || employee.name}
                </h2>
              )}
              <p className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] mt-[2px] mb-0 ml-0 mr-0 font-[family-name:var(--font-mono)]">
                {employee.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-[var(--space-2)]">
            {!editing && <RankBadge rank={rank} />}
            {editing ? (
              <>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="px-[var(--space-3)] py-[4px] rounded-[var(--radius-sm,6px)] bg-[var(--fill-tertiary)] text-[var(--text-secondary)] border-none cursor-pointer text-[length:var(--text-caption1)]"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-[var(--space-3)] py-[4px] rounded-[var(--radius-sm,6px)] bg-[var(--accent)] text-[var(--accent-contrast,white)] border-none cursor-pointer text-[length:var(--text-caption1)] font-[var(--weight-semibold)]"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <button
                onClick={startEdit}
                className="px-[var(--space-3)] py-[4px] rounded-[var(--radius-sm,6px)] bg-[var(--fill-tertiary)] text-[var(--text-secondary)] border-none cursor-pointer text-[length:var(--text-caption1)]"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {saveError && (
          <div
            className="mb-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] rounded-[var(--radius-sm,6px)] text-[length:var(--text-caption1)] text-[var(--system-red)]"
            style={{
              background:
                "color-mix(in srgb, var(--system-red) 10%, transparent)",
            }}
          >
            {saveError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-[var(--space-4)]">
          <div>
            <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-1)]">
              Department
            </p>
            {editing ? (
              <input
                className="text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[2px] w-full"
                value={editState?.department ?? ""}
                onChange={(e) =>
                  setEditState((s) =>
                    s ? { ...s, department: e.target.value } : s,
                  )
                }
              />
            ) : (
              <p className="text-[length:var(--text-body)] text-[var(--text-primary)] m-0">
                {employee.department || "None"}
              </p>
            )}
          </div>
          <div>
            <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-1)]">
              Rank
            </p>
            {editing ? (
              <select
                className="text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[2px] w-full"
                value={editState?.rank ?? "employee"}
                onChange={(e) =>
                  setEditState((s) =>
                    s
                      ? {
                          ...s,
                          rank: e.target.value as Employee["rank"],
                        }
                      : s,
                  )
                }
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <RankBadge rank={rank} />
            )}
          </div>
        </div>

        {/* Engine row */}
        {/* NOTE (needs backend fix): The COO is a synthetic employee built in jimmy's api.ts and not loaded from YAML.
            The GET /api/org/employees/:name route may not return hermesProfile for the COO, causing the EngineChip
            and hermesProfile section below to remain empty. Fix: ensure the synthetic COO object in jimmy includes
            hermesProfile before it is returned by the individual employee endpoint. */}
        <div className="mt-[var(--space-4)] grid grid-cols-2 gap-[var(--space-4)]">
          <div>
            <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-1)]">
              Runtime
            </p>
            {editing ? (
              <select
                className="text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[2px] w-full"
                value={editState?.runtimeRef ?? "hermes"}
                onChange={(e) =>
                  setEditState((s) =>
                    s ? { ...s, runtimeRef: e.target.value as RuntimeOption } : s,
                  )
                }
              >
                {RUNTIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <EngineChip
                engine={employee.engine || "hermes"}
                runtimeRef={employee.runtimeRef}
                profileName={employee.profileRef?.name}
                hermesProfile={employee.hermesProfile}
              />
            )}
          </div>
          {editing && otherEmployees.length > 0 && (
            <div>
              <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-1)]">
                Reports To
              </p>
              <select
                className="text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[2px] w-full"
                value={editState?.reportsTo ?? ""}
                onChange={(e) =>
                  setEditState((s) =>
                    s ? { ...s, reportsTo: e.target.value } : s,
                  )
                }
              >
                <option value="">— none —</option>
                {otherEmployees.map((e) => (
                  <option key={e.name} value={e.name}>
                    {e.displayName || e.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Hermes Profile section */}
        {(employee.hermesProfile || editing) && (
          <div className="mt-[var(--space-4)] pt-[var(--space-4)] border-t border-[var(--separator)]">
            <div className="flex items-center justify-between mb-[var(--space-2)]">
              <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] m-0">
                Hermes Profile
              </p>
              {!editing && employee.hermesProfile && (
                <button
                  onClick={() => setShowProfileEditor(true)}
                  className="text-[length:var(--text-caption1)] text-[var(--accent)] bg-none border-none cursor-pointer p-0"
                >
                  Edit Profile
                </button>
              )}
            </div>
            <div className="flex items-center gap-[var(--space-2)]">
              {employee.hermesProfile ? (
                <Badge
                  variant="outline"
                  className="border-transparent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)] px-2.5 py-1 text-[length:var(--text-caption1)] font-[var(--weight-semibold)]"
                >
                  {employee.hermesProfile}
                </Badge>
              ) : (
                <span className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] italic">
                  No profile assigned
                </span>
              )}
              {employee.hermesProvider && !editing && (
                <span className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)]">
                  via {employee.hermesProvider}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Hermes Hooks section */}
        {(employee.hermesHooks || employee.honcho || employee.mcp || editing) && (
          <div className="mt-[var(--space-4)] pt-[var(--space-4)] border-t border-[var(--separator)]">
            <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-2)]">
              Hermes Hooks
            </p>
            {editing ? (
              <div className="flex gap-[var(--space-6)]">
                <label className="flex items-center gap-[var(--space-2)] text-[length:var(--text-body)] text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editState?.hermesHooks.memory ?? false}
                    onChange={(e) =>
                      setEditState((s) =>
                        s ? { ...s, hermesHooks: { ...s.hermesHooks, memory: e.target.checked } } : s,
                      )
                    }
                  />
                  Honcho memory
                </label>
                <label className="flex items-center gap-[var(--space-2)] text-[length:var(--text-body)] text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editState?.hermesHooks.mcp ?? false}
                    onChange={(e) =>
                      setEditState((s) =>
                        s ? { ...s, hermesHooks: { ...s.hermesHooks, mcp: e.target.checked } } : s,
                      )
                    }
                  />
                  MCP tools
                </label>
                <label className="flex items-center gap-[var(--space-2)] text-[length:var(--text-body)] text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editState?.hermesHooks.skills ?? false}
                    onChange={(e) =>
                      setEditState((s) =>
                        s ? { ...s, hermesHooks: { ...s.hermesHooks, skills: e.target.checked } } : s,
                      )
                    }
                  />
                  Skills
                </label>
              </div>
            ) : (
              <div className="flex gap-[var(--space-4)]">
                {(employee.hermesHooks?.memory || employee.honcho) && (
                  <Badge variant="outline" className="border-[var(--separator)] text-[var(--text-secondary)] px-2.5 py-1 text-[length:var(--text-caption2)]">
                    Honcho memory
                  </Badge>
                )}
                {(employee.hermesHooks?.mcp || employee.mcp) && (
                  <Badge variant="outline" className="border-[var(--separator)] text-[var(--text-secondary)] px-2.5 py-1 text-[length:var(--text-caption2)]">
                    MCP tools
                  </Badge>
                )}
                {employee.hermesHooks?.skills && (
                  <Badge variant="outline" className="border-[var(--separator)] text-[var(--text-secondary)] px-2.5 py-1 text-[length:var(--text-caption2)]">
                    Skills
                  </Badge>
                )}
                {!employee.hermesHooks?.memory && !employee.honcho && !employee.hermesHooks?.mcp && !employee.mcp && !employee.hermesHooks?.skills && (
                  <span className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] italic">
                    No hooks enabled
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fallback Runtime Chain section */}
        {(editing || (employee.fallbackRuntimes && employee.fallbackRuntimes.length > 0)) && (
          <div className="mt-[var(--space-4)] pt-[var(--space-4)] border-t border-[var(--separator)]">
            <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-2)]">
              Fallback Runtime Chain
            </p>
            {editing ? (
              <div className="flex flex-col gap-[var(--space-2)]">
                {(editState?.fallbackRuntimes ?? []).length === 0 && (
                  <p className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] italic m-0">
                    No fallback runtimes — add one below
                  </p>
                )}
                {(editState?.fallbackRuntimes ?? []).map((runtime, i) => (
                  <div key={runtime + i} className="flex items-center gap-[var(--space-2)]">
                    <span className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] w-4 shrink-0">{i + 1}.</span>
                    <span className="flex-1 px-[var(--space-2)] py-[var(--space-1)] bg-[var(--fill-tertiary)] rounded-[var(--radius-sm,6px)] text-[length:var(--text-body)] text-[var(--text-primary)] font-[family-name:var(--font-mono)]">
                      {runtime}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditState((s) =>
                          s
                            ? { ...s, fallbackRuntimes: s.fallbackRuntimes.filter((_, idx) => idx !== i) }
                            : s,
                        )
                      }
                      className="px-[var(--space-2)] py-[var(--space-1)] rounded text-[var(--text-caption1)] text-[var(--system-red)] bg-none border-none cursor-pointer hover:bg-[var(--fill-tertiary)]"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex gap-[var(--space-2)] items-center mt-[var(--space-1)]">
                  <select
                    className="flex-1 text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[2px]"
                    value=""
                    onChange={(e) => {
                      const val = e.target.value as RuntimeOption;
                      const current = editState?.fallbackRuntimes ?? [];
                      if (val && !current.includes(val)) {
                        setEditState((s) =>
                          s ? { ...s, fallbackRuntimes: [...s.fallbackRuntimes, val] } : s,
                        );
                      }
                      // Reset to placeholder
                      const sel = e.target as HTMLSelectElement;
                      sel.selectedIndex = 0;
                    }}
                  >
                    <option value="">+ Add fallback runtime</option>
                    {RUNTIME_LIST.filter((r) => r !== editState?.runtimeRef && !(editState?.fallbackRuntimes ?? []).includes(r)).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-[var(--space-1)]">
                {(employee.fallbackRuntimes ?? []).map((runtime, i) => (
                  <div key={runtime + i} className="flex items-center gap-[var(--space-2)]">
                    <span className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] w-4 shrink-0">{i + 1}.</span>
                    <span className="px-[var(--space-2)] py-[var(--space-1)] bg-[var(--fill-tertiary)] rounded-[var(--radius-sm,6px)] text-[length:var(--text-body)] text-[var(--text-primary)] font-[family-name:var(--font-mono)]">
                      {runtime}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notification toggle */}
        <div className="mt-[var(--space-4)] pt-[var(--space-4)] border-t border-[var(--separator)] flex items-center justify-between">
          <div>
            <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-1)]">
              Notify on completion
            </p>
            <p className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] m-0">
              Notify parent session when this employee finishes
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={employee.alwaysNotify !== false}
            onClick={async () => {
              const newValue = employee.alwaysNotify === false;
              setEmployee({ ...employee, alwaysNotify: newValue });
              try {
                await api.updateEmployee(employee.name, {
                  alwaysNotify: newValue,
                });
              } catch {
                setEmployee({ ...employee, alwaysNotify: !newValue });
              }
            }}
            className="relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer rounded-full border-none transition-colors duration-200 ease-in-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{
              background:
                employee.alwaysNotify !== false
                  ? "var(--accent, var(--system-green))"
                  : "var(--fill-tertiary)",
            }}
          >
            <span
              className="pointer-events-none inline-block h-[20px] w-[20px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out"
              style={{
                transform:
                  employee.alwaysNotify !== false
                    ? "translate(22px, 2px)"
                    : "translate(2px, 2px)",
              }}
            />
          </button>
        </div>

        {/* Persona */}
        {(persona || editing) && (
          <div className="mt-[var(--space-4)] pt-[var(--space-4)] border-t border-[var(--separator)]">
            <p className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-2)]">
              Persona
            </p>
            {editing ? (
              <textarea
                className="w-full text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[var(--space-2)] resize-y"
                rows={4}
                value={editState?.persona ?? ""}
                onChange={(e) =>
                  setEditState((s) =>
                    s ? { ...s, persona: e.target.value } : s,
                  )
                }
              />
            ) : (
              <>
                <p className="text-[length:var(--text-body)] text-[var(--text-secondary)] leading-[var(--leading-relaxed)] whitespace-pre-wrap m-0">
                  {truncatedPersona}
                </p>
                {persona.length > 200 && (
                  <button
                    onClick={() => setPersonaExpanded(!personaExpanded)}
                    className="text-[length:var(--text-caption1)] text-[var(--accent)] bg-none border-none cursor-pointer p-0 mt-[var(--space-1)]"
                  >
                    {personaExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Services (provides) */}
      {employee.provides && employee.provides.length > 0 && (
        <div>
          <h3 className="text-[length:var(--text-caption1)] font-[var(--weight-semibold)] tracking-[var(--tracking-wide)] uppercase text-[var(--text-tertiary)] mb-[var(--space-3)]">
            Services
          </h3>
          <div className="rounded-[var(--radius-lg,16px)] border border-[var(--separator)] bg-[var(--material-regular)] overflow-hidden">
            {employee.provides.map((svc, idx) => (
              <div
                key={svc.name}
                className={`px-[var(--space-5)] py-[var(--space-4)]${idx > 0 ? ' border-t border-[var(--separator)]' : ''}`}
              >
                <div className="flex items-start justify-between gap-[var(--space-3)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[length:var(--text-body)] font-[var(--weight-semibold)] text-[var(--text-primary)] m-0">
                      {svc.name}
                    </p>
                    {svc.description && (
                      <p className="text-[length:var(--text-caption1)] text-[var(--text-secondary)] mt-[2px] m-0">
                        {svc.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (crossRequestService === svc.name) {
                        setCrossRequestService(null);
                        setCrossRequestResult(null);
                        setCrossRequestError(null);
                      } else {
                        setCrossRequestService(svc.name);
                        setCrossRequestResult(null);
                        setCrossRequestError(null);
                        if (!crossRequestFrom && allEmployees && allEmployees.length > 0) {
                          setCrossRequestFrom(allEmployees.find(e => e.name !== employee.name)?.name ?? '');
                        }
                      }
                    }}
                    className="shrink-0 px-[var(--space-3)] py-[4px] rounded-[var(--radius-sm,6px)] bg-[var(--accent)] text-[var(--accent-contrast,white)] border-none cursor-pointer text-[length:var(--text-caption1)] font-[var(--weight-semibold)]"
                  >
                    Request
                  </button>
                </div>

                {/* Inline request form */}
                {crossRequestService === svc.name && (
                  <div className="mt-[var(--space-3)] pt-[var(--space-3)] border-t border-[var(--separator)] flex flex-col gap-[var(--space-2)]">
                    <div>
                      <label className="block text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-1)]">
                        From Employee
                      </label>
                      {allEmployees && allEmployees.filter(e => e.name !== employee.name).length > 0 ? (
                        <select
                          className="text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[4px] w-full"
                          value={crossRequestFrom}
                          onChange={e => setCrossRequestFrom(e.target.value)}
                        >
                          <option value="">— select employee —</option>
                          {allEmployees.filter(e => e.name !== employee.name).map(e => (
                            <option key={e.name} value={e.name}>{e.displayName || e.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[4px] w-full"
                          placeholder="Employee name"
                          value={crossRequestFrom}
                          onChange={e => setCrossRequestFrom(e.target.value)}
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] mb-[var(--space-1)]">
                        Prompt
                      </label>
                      <textarea
                        className="w-full text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-2)] py-[var(--space-2)] resize-y"
                        rows={3}
                        placeholder="Describe what you need..."
                        value={crossRequestPrompt}
                        onChange={e => setCrossRequestPrompt(e.target.value)}
                      />
                    </div>
                    {crossRequestError && (
                      <p className="text-[length:var(--text-caption1)] text-[var(--system-red)] m-0">{crossRequestError}</p>
                    )}
                    {crossRequestResult && (
                      <p className="text-[length:var(--text-caption1)] text-[var(--system-green)] m-0">{crossRequestResult}</p>
                    )}
                    <div className="flex gap-[var(--space-2)] justify-end">
                      <button
                        onClick={() => { setCrossRequestService(null); setCrossRequestResult(null); setCrossRequestError(null); }}
                        className="px-[var(--space-3)] py-[4px] rounded-[var(--radius-sm,6px)] bg-[var(--fill-tertiary)] text-[var(--text-secondary)] border-none cursor-pointer text-[length:var(--text-caption1)]"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleCrossRequest(svc.name)}
                        disabled={crossRequestLoading || !crossRequestFrom || !crossRequestPrompt.trim()}
                        className="px-[var(--space-3)] py-[4px] rounded-[var(--radius-sm,6px)] bg-[var(--accent)] text-[var(--accent-contrast,white)] border-none cursor-pointer text-[length:var(--text-caption1)] font-[var(--weight-semibold)] disabled:opacity-50"
                      >
                        {crossRequestLoading ? 'Sending...' : 'Submit'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sessions */}
      <div>
        <h3 className="text-[length:var(--text-caption1)] font-[var(--weight-semibold)] tracking-[var(--tracking-wide)] uppercase text-[var(--text-tertiary)] mb-[var(--space-3)]">
          Recent Sessions
        </h3>
        {sessions.length === 0 ? (
          <p className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] text-center py-[var(--space-6)] px-0">
            No sessions found for this employee.
          </p>
        ) : (
          <div className="rounded-[var(--radius-lg,16px)] border border-[var(--separator)] bg-[var(--material-regular)] overflow-hidden">
            {sessions.map((session, idx) => (
              <div
                key={session.id}
                className={`px-[var(--space-5)] py-[var(--space-3)] flex items-center justify-between${idx > 0 ? " border-t border-[var(--separator)]" : ""}`}
              >
                <div>
                  <p className="text-[length:var(--text-body)] font-[family-name:var(--font-mono)] text-[var(--text-primary)] m-0">
                    {session.id.slice(0, 8)}
                  </p>
                  <p className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] mt-[2px]">
                    {session.source || "unknown"}{" "}
                    {session.createdAt
                      ? new Date(session.createdAt).toLocaleDateString()
                      : ""}
                  </p>
                </div>
                <span
                  className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] py-[2px] px-[8px] rounded-[10px]"
                  style={
                    session.status === "running"
                      ? {
                          background:
                            "color-mix(in srgb, var(--system-green) 15%, transparent)",
                          color: "var(--system-green)",
                        }
                      : session.status === "error"
                        ? {
                            background:
                              "color-mix(in srgb, var(--system-red) 15%, transparent)",
                            color: "var(--system-red)",
                          }
                        : {
                            background: "var(--fill-tertiary)",
                            color: "var(--text-tertiary)",
                          }
                  }
                >
                  {session.status || "idle"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hermes Profile Editor modal */}
      {showProfileEditor && employee.hermesProfile && (
        <HermesProfileEditorModal
          profileName={employee.hermesProfile}
          onClose={() => setShowProfileEditor(false)}
        />
      )}
    </div>
  );
}
