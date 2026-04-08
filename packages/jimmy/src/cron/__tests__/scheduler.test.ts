/**
 * Tests for cron/scheduler.ts
 *
 * Coverage:
 *  - setCronJobEnabled
 *  - scheduleJobs (skips disabled jobs)
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before module imports
// ---------------------------------------------------------------------------

vi.mock("node:fs");
vi.mock("node-cron", () => ({
  default: {
    validate: vi.fn(() => true),
    schedule: vi.fn(() => ({ stop: vi.fn() })),
  },
}));
vi.mock("../../shared/logger.js", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("../jobs.js", () => ({
  loadJobs: vi.fn(() => []),
  saveJobs: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import fs from "node:fs";
import cron from "node-cron";
import { loadJobs, saveJobs } from "../jobs.js";
import type { CronJob } from "../../shared/types.js";

// ---------------------------------------------------------------------------
// Helpers — typed mock accessors
// ---------------------------------------------------------------------------

const mockedFs = vi.mocked(fs);
const mockedCron = vi.mocked(cron);
const mockedLoadJobs = vi.mocked(loadJobs);
const mockedSaveJobs = vi.mocked(saveJobs);

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: "test-job-1",
    name: "Test Job",
    enabled: true,
    schedule: "0 8 * * *",
    prompt: "Do something",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// describe: setCronJobEnabled
// ---------------------------------------------------------------------------

describe("setCronJobEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("enables a disabled job by id", async () => {
    const job = makeJob({ id: "job-1", name: "Job One", enabled: false });
    mockedLoadJobs.mockReturnValue([job]);

    const { setCronJobEnabled } = await import("../scheduler.js");
    const result = setCronJobEnabled("job-1", true);

    expect(result).toBeDefined();
    expect(result!.enabled).toBe(true);
    expect(mockedSaveJobs).toHaveBeenCalledOnce();
    const savedJobs = mockedSaveJobs.mock.calls[0][0] as CronJob[];
    expect(savedJobs[0].enabled).toBe(true);
  });

  it("disables an enabled job by id", async () => {
    const job = makeJob({ id: "job-2", name: "Job Two", enabled: true });
    mockedLoadJobs.mockReturnValue([job]);

    const { setCronJobEnabled } = await import("../scheduler.js");
    const result = setCronJobEnabled("job-2", false);

    expect(result).toBeDefined();
    expect(result!.enabled).toBe(false);
    expect(mockedSaveJobs).toHaveBeenCalledOnce();
    const savedJobs = mockedSaveJobs.mock.calls[0][0] as CronJob[];
    expect(savedJobs[0].enabled).toBe(false);
  });

  it("finds job by name (case-insensitive)", async () => {
    const job = makeJob({ id: "job-3", name: "My Special Job", enabled: true });
    mockedLoadJobs.mockReturnValue([job]);

    const { setCronJobEnabled } = await import("../scheduler.js");
    const result = setCronJobEnabled("my special job", false);

    expect(result).toBeDefined();
    expect(result!.id).toBe("job-3");
    expect(result!.enabled).toBe(false);
  });

  it("returns undefined for non-existent job", async () => {
    mockedLoadJobs.mockReturnValue([makeJob({ id: "other-job" })]);

    const { setCronJobEnabled } = await import("../scheduler.js");
    const result = setCronJobEnabled("non-existent", true);

    expect(result).toBeUndefined();
    expect(mockedSaveJobs).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// describe: scheduleJobs (skips disabled)
// ---------------------------------------------------------------------------

describe("scheduleJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockedCron.validate.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules enabled jobs", async () => {
    const enabledJob = makeJob({ id: "enabled-1", enabled: true });
    
    const { startScheduler, stopScheduler } = await import("../scheduler.js");
    
    // Mock minimal dependencies for startScheduler
    const mockSessionManager = {} as Parameters<typeof startScheduler>[1];
    const mockConfig = { engines: { default: "hermes" } } as Parameters<typeof startScheduler>[2];
    const mockConnectors = new Map() as Parameters<typeof startScheduler>[3];
    
    startScheduler([enabledJob], mockSessionManager, mockConfig, mockConnectors);
    
    expect(mockedCron.schedule).toHaveBeenCalledOnce();
    expect(mockedCron.schedule).toHaveBeenCalledWith(
      "0 8 * * *",
      expect.any(Function),
      { timezone: undefined }
    );
    
    stopScheduler();
  });

  it("skips disabled jobs", async () => {
    const disabledJob = makeJob({ id: "disabled-1", enabled: false });
    
    const { startScheduler, stopScheduler } = await import("../scheduler.js");
    
    const mockSessionManager = {} as Parameters<typeof startScheduler>[1];
    const mockConfig = { engines: { default: "hermes" } } as Parameters<typeof startScheduler>[2];
    const mockConnectors = new Map() as Parameters<typeof startScheduler>[3];
    
    startScheduler([disabledJob], mockSessionManager, mockConfig, mockConnectors);
    
    expect(mockedCron.schedule).not.toHaveBeenCalled();
    
    stopScheduler();
  });

  it("schedules only enabled jobs when mixed", async () => {
    const enabledJob1 = makeJob({ id: "enabled-1", name: "Enabled One", enabled: true });
    const disabledJob = makeJob({ id: "disabled-1", name: "Disabled One", enabled: false });
    const enabledJob2 = makeJob({ id: "enabled-2", name: "Enabled Two", enabled: true, schedule: "*/30 * * * *" });
    
    const { startScheduler, stopScheduler } = await import("../scheduler.js");
    
    const mockSessionManager = {} as Parameters<typeof startScheduler>[1];
    const mockConfig = { engines: { default: "hermes" } } as Parameters<typeof startScheduler>[2];
    const mockConnectors = new Map() as Parameters<typeof startScheduler>[3];
    
    startScheduler([enabledJob1, disabledJob, enabledJob2], mockSessionManager, mockConfig, mockConnectors);
    
    // Only 2 enabled jobs should be scheduled
    expect(mockedCron.schedule).toHaveBeenCalledTimes(2);
    
    stopScheduler();
  });

  it("skips jobs with invalid cron schedule", async () => {
    const invalidJob = makeJob({ id: "invalid-1", enabled: true, schedule: "invalid cron" });
    mockedCron.validate.mockReturnValue(false);
    
    const { startScheduler, stopScheduler } = await import("../scheduler.js");
    
    const mockSessionManager = {} as Parameters<typeof startScheduler>[1];
    const mockConfig = { engines: { default: "hermes" } } as Parameters<typeof startScheduler>[2];
    const mockConnectors = new Map() as Parameters<typeof startScheduler>[3];
    
    startScheduler([invalidJob], mockSessionManager, mockConfig, mockConnectors);
    
    expect(mockedCron.schedule).not.toHaveBeenCalled();
    
    stopScheduler();
  });
});
