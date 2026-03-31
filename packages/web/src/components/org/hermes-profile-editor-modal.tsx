"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { HermesProfileDetail } from "@/lib/api";

const PROVIDERS = ["anthropic", "openai", "openrouter", "auto"] as const;
const REASONING_EFFORTS = ["low", "medium", "high"] as const;
type Tab = "soul" | "agent" | "config";

interface SaveStatus {
  tab: Tab;
  state: "saving" | "saved" | "error";
  message?: string;
}

export function HermesProfileEditorModal({
  profileName,
  onClose,
}: {
  profileName: string;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("soul");
  const [profile, setProfile] = useState<HermesProfileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit state per tab
  const [soul, setSoul] = useState("");
  const [agent, setAgent] = useState("");
  const [config, setConfig] = useState<HermesProfileDetail["config"]>({
    model: "",
    provider: "anthropic",
    reasoning_effort: "medium",
    max_turns: 90,
  });

  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    api
      .getHermesProfileDetail(profileName)
      .then((p) => {
        setProfile(p);
        setSoul(p.soul ?? "");
        setAgent(p.agent ?? "");
        setConfig(
          p.config ?? {
            model: "",
            provider: "anthropic",
            reasoning_effort: "medium",
            max_turns: 90,
          },
        );
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [profileName]);

  async function saveSoul() {
    setSaveStatus({ tab: "soul", state: "saving" });
    try {
      await api.updateHermesProfile(profileName, { soul });
      setSaveStatus({ tab: "soul", state: "saved" });
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus({
        tab: "soul",
        state: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  async function saveAgent() {
    setSaveStatus({ tab: "agent", state: "saving" });
    try {
      await api.updateHermesProfile(profileName, { agent });
      setSaveStatus({ tab: "agent", state: "saved" });
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus({
        tab: "agent",
        state: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  async function saveConfig() {
    setSaveStatus({ tab: "config", state: "saving" });
    try {
      await api.updateHermesProfile(profileName, { config });
      setSaveStatus({ tab: "config", state: "saved" });
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      setSaveStatus({
        tab: "config",
        state: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  const tabStyle = (t: Tab) =>
    `px-[var(--space-4)] py-[var(--space-2)] text-[length:var(--text-caption1)] font-[var(--weight-semibold)] border-none cursor-pointer transition-colors ${
      activeTab === t
        ? "text-[var(--accent)] border-b-2 border-[var(--accent)] bg-transparent"
        : "text-[var(--text-secondary)] bg-transparent hover:text-[var(--text-primary)]"
    }`;

  const saveIndicator = (tab: Tab) => {
    if (!saveStatus || saveStatus.tab !== tab) return null;
    if (saveStatus.state === "saving")
      return (
        <span className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
          Saving...
        </span>
      );
    if (saveStatus.state === "saved")
      return (
        <span className="text-[length:var(--text-caption1)] text-[var(--system-green)]">
          Saved ✓
        </span>
      );
    if (saveStatus.state === "error")
      return (
        <span className="text-[length:var(--text-caption1)] text-[var(--system-red)]">
          {saveStatus.message ?? "Error"}
        </span>
      );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col bg-[var(--bg)] rounded-[var(--radius-lg,16px)] border border-[var(--separator)] shadow-[var(--shadow-overlay)] w-full max-w-3xl max-h-[90vh] overflow-hidden"
        style={{ minHeight: "520px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[var(--space-6)] pt-[var(--space-5)] pb-[var(--space-3)] border-b border-[var(--separator)]">
          <div>
            <h2 className="text-[length:var(--text-title3)] font-[var(--weight-bold)] text-[var(--text-primary)] m-0">
              Hermes Profile
            </h2>
            <p className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] mt-[2px] mb-0 font-[family-name:var(--font-mono)]">
              {profileName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-[30px] h-[30px] rounded-full flex items-center justify-center bg-[var(--fill-tertiary)] text-[var(--text-secondary)] border-none cursor-pointer text-sm"
          >
            &#x2715;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--separator)] px-[var(--space-2)]">
          <button className={tabStyle("soul")} onClick={() => setActiveTab("soul")}>
            SOUL.md
          </button>
          <button className={tabStyle("agent")} onClick={() => setActiveTab("agent")}>
            AGENT.md
          </button>
          <button className={tabStyle("config")} onClick={() => setActiveTab("config")}>
            Config
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-[var(--space-6)]">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-[var(--text-tertiary)] text-[length:var(--text-caption1)]">
              Loading profile...
            </div>
          ) : loadError ? (
            <div
              className="rounded-[var(--radius-md,12px)] px-[var(--space-4)] py-[var(--space-3)] text-[length:var(--text-caption1)] text-[var(--system-red)]"
              style={{
                background:
                  "color-mix(in srgb, var(--system-red) 10%, transparent)",
                border:
                  "1px solid color-mix(in srgb, var(--system-red) 30%, transparent)",
              }}
            >
              {loadError}
            </div>
          ) : (
            <>
              {activeTab === "soul" && (
                <div className="flex flex-col gap-[var(--space-3)] h-full">
                  <p className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] m-0">
                    Defines the AI persona — style, temperament, voice and cognitive biases.
                  </p>
                  <textarea
                    className="flex-1 w-full font-[family-name:var(--font-mono)] text-[length:var(--text-caption1)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-md,10px)] p-[var(--space-3)] resize-none"
                    style={{ minHeight: "280px" }}
                    value={soul}
                    onChange={(e) => setSoul(e.target.value)}
                    placeholder="# SOUL.md&#10;&#10;Style cognitif&#10;..."
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between">
                    {saveIndicator("soul") ?? <span />}
                    <button
                      onClick={saveSoul}
                      disabled={saveStatus?.tab === "soul" && saveStatus.state === "saving"}
                      className="px-[var(--space-4)] py-[var(--space-2)] rounded-[var(--radius-md,10px)] bg-[var(--accent)] text-[var(--accent-contrast,white)] border-none cursor-pointer text-[length:var(--text-body)] font-[var(--weight-semibold)]"
                    >
                      Save SOUL.md
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "agent" && (
                <div className="flex flex-col gap-[var(--space-3)] h-full">
                  <p className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] m-0">
                    Defines the operational role — mission, rules, responsibilities.
                  </p>
                  <textarea
                    className="flex-1 w-full font-[family-name:var(--font-mono)] text-[length:var(--text-caption1)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-md,10px)] p-[var(--space-3)] resize-none"
                    style={{ minHeight: "280px" }}
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                    placeholder="# AGENT.md&#10;&#10;## Mission&#10;..."
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between">
                    {saveIndicator("agent") ?? <span />}
                    <button
                      onClick={saveAgent}
                      disabled={saveStatus?.tab === "agent" && saveStatus.state === "saving"}
                      className="px-[var(--space-4)] py-[var(--space-2)] rounded-[var(--radius-md,10px)] bg-[var(--accent)] text-[var(--accent-contrast,white)] border-none cursor-pointer text-[length:var(--text-body)] font-[var(--weight-semibold)]"
                    >
                      Save AGENT.md
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "config" && (
                <div className="flex flex-col gap-[var(--space-5)]">
                  <div className="grid grid-cols-2 gap-[var(--space-4)]">
                    <div>
                      <label className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] block mb-[var(--space-1)]">
                        Model
                      </label>
                      <input
                        className="w-full text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-3)] py-[var(--space-2)]"
                        value={config.model}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, model: e.target.value }))
                        }
                        placeholder="anthropic/claude-sonnet-4.6"
                      />
                    </div>
                    <div>
                      <label className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] block mb-[var(--space-1)]">
                        Provider
                      </label>
                      <select
                        className="w-full text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-3)] py-[var(--space-2)]"
                        value={config.provider}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, provider: e.target.value }))
                        }
                      >
                        {PROVIDERS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] block mb-[var(--space-1)]">
                        Reasoning Effort
                      </label>
                      <select
                        className="w-full text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-3)] py-[var(--space-2)]"
                        value={config.reasoning_effort}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            reasoning_effort: e.target.value,
                          }))
                        }
                      >
                        {REASONING_EFFORTS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[length:var(--text-caption2)] font-[var(--weight-semibold)] uppercase tracking-[var(--tracking-wide)] text-[var(--text-tertiary)] block mb-[var(--space-1)]">
                        Max Turns
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        className="w-full text-[length:var(--text-body)] text-[var(--text-primary)] bg-[var(--fill-secondary)] border border-[var(--separator)] rounded-[var(--radius-sm,6px)] px-[var(--space-3)] py-[var(--space-2)]"
                        value={config.max_turns}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            max_turns: parseInt(e.target.value, 10) || 90,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-[var(--space-2)]">
                    {saveIndicator("config") ?? <span />}
                    <button
                      onClick={saveConfig}
                      disabled={
                        saveStatus?.tab === "config" &&
                        saveStatus.state === "saving"
                      }
                      className="px-[var(--space-4)] py-[var(--space-2)] rounded-[var(--radius-md,10px)] bg-[var(--accent)] text-[var(--accent-contrast,white)] border-none cursor-pointer text-[length:var(--text-body)] font-[var(--weight-semibold)]"
                    >
                      Save Config
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
