'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { PageLayout } from '@/components/page-layout'
import { useBreadcrumbs } from '@/context/breadcrumb-context'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Period = 'day' | 'week' | 'month'

interface CostSummary {
  total: number
  daily: { date: string; cost: number }[]
  byEmployee: { employee: string; cost: number; sessions: number }[]
  byDepartment: { department: string; cost: number }[]
  hermes?: { totalEstimatedCostUsd: number; sessionCount: number; available: boolean }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCost(value: number): string {
  if (value === 0) return '$0.00'
  if (value < 0.001) return `$${(value * 1000).toFixed(3)}m`
  return `$${value.toFixed(4)}`
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-[var(--material-regular)] border border-[var(--separator)] rounded-[var(--radius-md)] p-[var(--space-4)]">
      <div className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)] font-medium mb-[var(--space-1)]">
        {label}
      </div>
      <div className="text-[length:var(--text-title2)] font-bold text-[var(--text-primary)] leading-tight">
        {value}
      </div>
      {sub && (
        <div className="text-[length:var(--text-caption2)] text-[var(--text-tertiary)] mt-[var(--space-1)]">
          {sub}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function CostsPage() {
  useBreadcrumbs([{ label: 'Costs' }])

  const [period, setPeriod] = useState<Period>('month')
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((p: Period) => {
    setLoading(true)
    setError(null)
    api
      .getCostSummary(p)
      .then((data) => setSummary(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(period)
  }, [load, period])

  const totalSessions = summary?.byEmployee.reduce((acc, e) => acc + e.sessions, 0) ?? 0
  const hermesCost = summary?.hermes?.available ? summary.hermes.totalEstimatedCostUsd : null
  const hasData = summary && (summary.total > 0 || totalSessions > 0)

  return (
    <PageLayout>
      <div className="h-full flex flex-col overflow-hidden bg-[var(--bg)]">
        {/* Header */}
        <header className="flex-shrink-0 bg-[var(--material-regular)] border-b border-[var(--separator)] px-[var(--space-6)] py-[var(--space-4)]">
          <div>
            <h1 className="text-[length:var(--text-title1)] font-bold text-[var(--text-primary)] tracking-tight leading-[1.2]">
              Costs
            </h1>
            <p className="text-[length:var(--text-footnote)] text-[var(--text-secondary)] mt-[var(--space-1)]">
              API usage and spending
            </p>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-[var(--space-6)] pt-[var(--space-4)] pb-[var(--space-6)]">
          {/* Period tabs */}
          <div className="flex items-center gap-[var(--space-2)] mb-[var(--space-4)]">
            {(['day', 'week', 'month'] as Period[]).map((p) => {
              const isActive = period === p
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="rounded-[20px] px-3.5 py-1.5 text-[length:var(--text-footnote)] font-medium border-none cursor-pointer transition-all duration-200"
                  style={{
                    background: isActive ? 'var(--accent-fill)' : 'var(--fill-secondary)',
                    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              )
            })}
          </div>

          {error ? (
            <div className="bg-[rgba(255,69,58,0.06)] border border-[var(--system-red)] rounded-[var(--radius-md)] p-[var(--space-4)] text-[var(--system-red)] text-[length:var(--text-footnote)] mb-[var(--space-4)]">
              Failed to load costs: {error}
              <button
                onClick={() => load(period)}
                className="ml-[var(--space-3)] underline bg-none border-none text-inherit cursor-pointer text-[length:inherit]"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div>
              <div className="grid grid-cols-3 gap-[var(--space-3)] mb-[var(--space-4)]">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-[var(--material-regular)] border border-[var(--separator)] rounded-[var(--radius-md)] p-[var(--space-4)] animate-pulse"
                  >
                    <div className="h-2.5 w-[60px] bg-[var(--fill-tertiary)] rounded mb-2" />
                    <div className="h-4 w-20 bg-[var(--fill-tertiary)] rounded" />
                  </div>
                ))}
              </div>
              <div className="h-48 bg-[var(--material-regular)] border border-[var(--separator)] rounded-[var(--radius-md)] animate-pulse" />
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-3 gap-[var(--space-3)] mb-[var(--space-5)]">
                <StatCard
                  label="Total Cost"
                  value={formatCost(summary?.total ?? 0)}
                  sub={`${period === 'day' ? 'Today' : period === 'week' ? 'Last 7 days' : 'This month'}`}
                />
                <StatCard
                  label="Sessions"
                  value={String(totalSessions)}
                  sub="across all employees"
                />
                <StatCard
                  label="Hermes Cost"
                  value={hermesCost !== null ? formatCost(hermesCost) : 'N/A'}
                  sub={
                    hermesCost !== null
                      ? `${summary?.hermes?.sessionCount ?? 0} sessions`
                      : 'Hermes not available'
                  }
                />
              </div>

              {!hasData ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-[var(--text-secondary)] gap-[var(--space-2)]">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[var(--text-tertiary)] mb-[var(--space-2)]"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4m0 4h.01" />
                  </svg>
                  <span className="text-[length:var(--text-subheadline)] font-medium">No data yet</span>
                  <span className="text-[length:var(--text-caption1)] text-[var(--text-tertiary)]">
                    No sessions found for this period
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-[var(--space-5)]">
                  {/* By Employee table */}
                  {summary && summary.byEmployee.length > 0 && (
                    <section>
                      <h2 className="text-[length:var(--text-subheadline)] font-semibold text-[var(--text-primary)] mb-[var(--space-3)]">
                        By Employee
                      </h2>
                      <div className="rounded-[var(--radius-md)] overflow-hidden bg-[var(--material-regular)] border border-[var(--separator)]">
                        {/* Table header */}
                        <div className="grid grid-cols-[1fr_auto_auto] gap-x-[var(--space-4)] px-[var(--space-4)] py-[var(--space-2)] bg-[var(--fill-tertiary)] border-b border-[var(--separator)]">
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                            Employee
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-right min-w-[70px]">
                            Sessions
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-right min-w-[90px]">
                            Cost
                          </span>
                        </div>
                        {/* Rows */}
                        {summary.byEmployee.map((row, idx) => (
                          <div key={row.employee}>
                            {idx > 0 && (
                              <div className="h-px bg-[var(--separator)] mx-[var(--space-4)]" />
                            )}
                            <div className="grid grid-cols-[1fr_auto_auto] gap-x-[var(--space-4)] px-[var(--space-4)] py-[var(--space-3)] items-center">
                              <span className="text-[length:var(--text-footnote)] font-medium text-[var(--text-primary)] capitalize">
                                {row.employee}
                              </span>
                              <span className="text-[length:var(--text-footnote)] text-[var(--text-secondary)] text-right min-w-[70px]">
                                {row.sessions}
                              </span>
                              <span className="text-[length:var(--text-footnote)] font-semibold text-[var(--text-primary)] text-right min-w-[90px] font-[family-name:var(--font-mono,monospace)]">
                                {formatCost(row.cost)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* By Department table */}
                  {summary && summary.byDepartment.length > 0 && (
                    <section>
                      <h2 className="text-[length:var(--text-subheadline)] font-semibold text-[var(--text-primary)] mb-[var(--space-3)]">
                        By Department
                      </h2>
                      <div className="rounded-[var(--radius-md)] overflow-hidden bg-[var(--material-regular)] border border-[var(--separator)]">
                        <div className="grid grid-cols-[1fr_auto] gap-x-[var(--space-4)] px-[var(--space-4)] py-[var(--space-2)] bg-[var(--fill-tertiary)] border-b border-[var(--separator)]">
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                            Department
                          </span>
                          <span className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-right min-w-[90px]">
                            Cost
                          </span>
                        </div>
                        {summary.byDepartment.map((row, idx) => (
                          <div key={row.department}>
                            {idx > 0 && (
                              <div className="h-px bg-[var(--separator)] mx-[var(--space-4)]" />
                            )}
                            <div className="grid grid-cols-[1fr_auto] gap-x-[var(--space-4)] px-[var(--space-4)] py-[var(--space-3)] items-center">
                              <span className="text-[length:var(--text-footnote)] font-medium text-[var(--text-primary)] capitalize">
                                {row.department}
                              </span>
                              <span className="text-[length:var(--text-footnote)] font-semibold text-[var(--text-primary)] text-right min-w-[90px] font-[family-name:var(--font-mono,monospace)]">
                                {formatCost(row.cost)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Daily breakdown (mini bar chart) */}
                  {summary && summary.daily.length > 0 && (
                    <section>
                      <h2 className="text-[length:var(--text-subheadline)] font-semibold text-[var(--text-primary)] mb-[var(--space-3)]">
                        Daily Breakdown
                      </h2>
                      <div className="rounded-[var(--radius-md)] bg-[var(--material-regular)] border border-[var(--separator)] p-[var(--space-4)]">
                        {(() => {
                          const maxCost = Math.max(...summary.daily.map((d) => d.cost), 0.0001)
                          return (
                            <div className="flex items-end gap-1 h-[100px]">
                              {summary.daily.map((d) => {
                                const pct = (d.cost / maxCost) * 100
                                return (
                                  <div
                                    key={d.date}
                                    className="flex-1 flex flex-col items-center justify-end gap-1 group/bar"
                                    title={`${d.date}: ${formatCost(d.cost)}`}
                                  >
                                    <div
                                      className="w-full rounded-t transition-opacity hover:opacity-80"
                                      style={{
                                        height: `${Math.max(pct, 2)}%`,
                                        background: 'var(--accent)',
                                        opacity: 0.75,
                                      }}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()}
                        <div className="flex justify-between mt-[var(--space-2)]">
                          <span className="text-[10px] text-[var(--text-tertiary)]">
                            {summary.daily[0]?.date}
                          </span>
                          <span className="text-[10px] text-[var(--text-tertiary)]">
                            {summary.daily[summary.daily.length - 1]?.date}
                          </span>
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageLayout>
  )
}
