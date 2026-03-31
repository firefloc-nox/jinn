/**
 * Tests for cron/hermes-jobs.ts
 *
 * Coverage:
 *  - loadHermesJobs
 *  - saveHermesJobs
 *  - hermesScheduleToCron
 *  - hermesJobToJinn
 *  - jinnJobToHermes
 *  - isHermesJob
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before module imports
// ---------------------------------------------------------------------------

vi.mock("node:fs");
vi.mock("../../../shared/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import fs from "node:fs";
import {
  loadHermesJobs,
  saveHermesJobs,
  hermesScheduleToCron,
  hermesJobToJinn,
  jinnJobToHermes,
  isHermesJob,
  type HermesCronJob,
  type HermesSchedule,
} from "../hermes-jobs.js";
import type { CronJob } from "../../shared/types.js";

// ---------------------------------------------------------------------------
// Helpers — typed mock accessors
// ---------------------------------------------------------------------------

const mockedFs = vi.mocked(fs);

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------

function makeHermesJob(overrides: Partial<HermesCronJob> = {}): HermesCronJob {
  return {
    id: "job-abc",
    name: "My Job",
    prompt: "Do something",
    skills: [],
    schedule: { kind: "cron", expr: "0 8 * * *", display: "Daily at 8am" },
    schedule_display: "Daily at 8am",
    repeat: { times: null, completed: 0 },
    enabled: true,
    state: "scheduled",
    deliver: "local",
    created_at: "2026-01-01T00:00:00Z",
    next_run_at: null,
    last_run_at: null,
    ...overrides,
  };
}

function makeJinnJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: "my-job",
    name: "Test Job",
    enabled: true,
    schedule: "0 * * * *",
    prompt: "Do something",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// describe: loadHermesJobs
// ---------------------------------------------------------------------------

describe("loadHermesJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns array when file contains array format", () => {
    const job1 = makeHermesJob({ id: "j1" });
    const job2 = makeHermesJob({ id: "j2" });
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(JSON.stringify([job1, job2]));

    const result = loadHermesJobs();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("j1");
    expect(result[1].id).toBe("j2");
  });

  it("returns jobs from { jobs: [...] } object format", () => {
    const job1 = makeHermesJob({ id: "j1" });
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue(
      JSON.stringify({ jobs: [job1], updated_at: "2026-01-01T00:00:00Z" }),
    );

    const result = loadHermesJobs();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("j1");
  });

  it("returns [] when file absent (existsSync false)", () => {
    mockedFs.existsSync.mockReturnValue(false);

    const result = loadHermesJobs();
    expect(result).toEqual([]);
  });

  it("returns [] on JSON parse error", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockReturnValue("corrupted json{{");

    const result = loadHermesJobs();
    expect(result).toEqual([]);
  });

  it("returns [] when readFileSync throws", () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readFileSync.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
    });

    const result = loadHermesJobs();
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// describe: hermesScheduleToCron
// ---------------------------------------------------------------------------

describe("hermesScheduleToCron", () => {
  it("returns cron expr for kind=cron with expr", () => {
    const schedule: HermesSchedule = { kind: "cron", expr: "0 8 * * *", display: "" };
    expect(hermesScheduleToCron(schedule)).toBe("0 8 * * *");
  });

  it("falls back to cron field for kind=cron", () => {
    const schedule: HermesSchedule = { kind: "cron", cron: "0 9 * * 1", display: "" };
    expect(hermesScheduleToCron(schedule)).toBe("0 9 * * 1");
  });

  it("returns daily cron for 1440 minutes", () => {
    const schedule: HermesSchedule = { kind: "interval", minutes: 1440, display: "" };
    expect(hermesScheduleToCron(schedule)).toBe("0 0 * * *");
  });

  it("returns hourly cron for 60 minutes", () => {
    const schedule: HermesSchedule = { kind: "interval", minutes: 60, display: "" };
    expect(hermesScheduleToCron(schedule)).toBe("0 * * * *");
  });

  it("returns */30 cron for 30 minutes", () => {
    const schedule: HermesSchedule = { kind: "interval", minutes: 30, display: "" };
    expect(hermesScheduleToCron(schedule)).toBe("*/30 * * * *");
  });

  it("returns null for 0 minutes", () => {
    const schedule: HermesSchedule = { kind: "interval", minutes: 0, display: "" };
    expect(hermesScheduleToCron(schedule)).toBeNull();
  });

  it("returns null when no expr and no cron", () => {
    const schedule: HermesSchedule = { kind: "cron", display: "" };
    expect(hermesScheduleToCron(schedule)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// describe: hermesJobToJinn
// ---------------------------------------------------------------------------

describe("hermesJobToJinn", () => {
  it("converts a standard hermes job to jinn format", () => {
    const h = makeHermesJob({ id: "job-abc" });
    const result = hermesJobToJinn(h);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("hermes-job-abc");
    expect(result!.engine).toBe("hermes");
    expect((result as Record<string, unknown>)["_source"]).toBe("hermes");
    expect(result!.schedule).toBe("0 8 * * *");
    expect(result!.enabled).toBe(true);
  });

  it("prefixes id with hermes-", () => {
    const h = makeHermesJob({ id: "job-xyz" });
    const result = hermesJobToJinn(h);
    expect(result!.id).toBe("hermes-job-xyz");
  });

  it("returns null when schedule not convertible", () => {
    const h = makeHermesJob({
      schedule: { kind: "interval", minutes: 0, display: "" },
    });
    const result = hermesJobToJinn(h);
    expect(result).toBeNull();
  });

  it("parses deliver string to delivery object", () => {
    const h = makeHermesJob({ deliver: "telegram:@mychan" });
    const result = hermesJobToJinn(h);
    expect(result!.delivery).toEqual({ connector: "telegram", channel: "@mychan" });
  });

  it("returns undefined delivery for local deliver", () => {
    const h = makeHermesJob({ deliver: "local" });
    const result = hermesJobToJinn(h);
    expect(result!.delivery).toBeUndefined();
  });

  it("disabled when state is paused even if enabled=true", () => {
    const h = makeHermesJob({ enabled: true, state: "paused" });
    const result = hermesJobToJinn(h);
    expect(result!.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describe: jinnJobToHermes
// ---------------------------------------------------------------------------

describe("jinnJobToHermes", () => {
  it("converts jinn job to hermes format", () => {
    const j = makeJinnJob({ id: "my-job", name: "Test", schedule: "0 * * * *", prompt: "p" });
    const result = jinnJobToHermes(j);

    expect(result.id).toBe("my-job");
    expect(result.schedule.kind).toBe("cron");
    expect(result.schedule.expr).toBe("0 * * * *");
    expect(result.prompt).toBe("p");
  });

  it("strips hermes- prefix from id", () => {
    const j = makeJinnJob({ id: "hermes-job-abc" });
    const result = jinnJobToHermes(j);
    expect(result.id).toBe("job-abc");
  });

  it("sets state=paused when enabled=false", () => {
    const j = makeJinnJob({ enabled: false });
    const result = jinnJobToHermes(j);
    expect(result.state).toBe("paused");
  });

  it("sets state=scheduled when enabled=true", () => {
    const j = makeJinnJob({ enabled: true });
    const result = jinnJobToHermes(j);
    expect(result.state).toBe("scheduled");
  });

  it("builds deliver string from delivery object", () => {
    const j = makeJinnJob({
      delivery: { connector: "slack", channel: "#general" },
    });
    const result = jinnJobToHermes(j);
    expect(result.deliver).toBe("slack:#general");
  });

  it("sets deliver=local when no delivery", () => {
    const j = makeJinnJob({ delivery: undefined });
    const result = jinnJobToHermes(j);
    expect(result.deliver).toBe("local");
  });
});

// ---------------------------------------------------------------------------
// describe: isHermesJob
// ---------------------------------------------------------------------------

describe("isHermesJob", () => {
  it("returns true when id starts with hermes-", () => {
    const job = makeJinnJob({ id: "hermes-job-123" }) as CronJob & Record<string, unknown>;
    expect(isHermesJob(job)).toBe(true);
  });

  it("returns true when _source === hermes", () => {
    const job = { ...makeJinnJob({ id: "other-id" }), _source: "hermes" } as CronJob &
      Record<string, unknown>;
    expect(isHermesJob(job)).toBe(true);
  });

  it("returns true when engine === hermes", () => {
    const job = { ...makeJinnJob({ id: "some-id" }), engine: "hermes" } as CronJob &
      Record<string, unknown>;
    expect(isHermesJob(job)).toBe(true);
  });

  it("returns false for normal jinn job", () => {
    const job = makeJinnJob({ id: "normal-job-123", engine: "claude" }) as CronJob &
      Record<string, unknown>;
    expect(isHermesJob(job)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describe: saveHermesJobs
// ---------------------------------------------------------------------------

describe("saveHermesJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFs.mkdirSync.mockImplementation(() => undefined);
    mockedFs.writeFileSync.mockImplementation(() => undefined);
  });

  it("writes { jobs, updated_at } format", () => {
    const job1 = makeHermesJob({ id: "j1" });
    const job2 = makeHermesJob({ id: "j2" });

    saveHermesJobs([job1, job2]);

    expect(mockedFs.mkdirSync).toHaveBeenCalledOnce();
    expect(mockedFs.writeFileSync).toHaveBeenCalledOnce();

    // Inspect written content
    const callArgs = mockedFs.writeFileSync.mock.calls[0];
    const writtenContent = callArgs[1] as string;
    const parsed = JSON.parse(writtenContent) as { jobs: HermesCronJob[]; updated_at: string };

    expect(parsed.jobs).toHaveLength(2);
    expect(parsed.jobs[0].id).toBe("j1");
    expect(parsed.jobs[1].id).toBe("j2");
    expect(typeof parsed.updated_at).toBe("string");
    // Basic ISO 8601 check
    expect(parsed.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
