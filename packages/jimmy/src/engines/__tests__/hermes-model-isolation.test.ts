/**
 * Regression tests: model isolation — profile owns the model.
 *
 * Ensures that HermesEngine does NOT pass --model to the CLI when no model
 * is explicitly set on the session, and DOES pass --model / --profile when
 * those opts are explicitly provided.
 *
 * Bug history: Jinn was incorrectly forwarding --model even when the session
 * had no model set, overriding the profile's own model selection.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Mocks (must be hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: vi.fn(),
    spawn: vi.fn(),
  };
});

vi.mock("node:fs");

vi.mock("../hermes-webapi.js", () => ({
  HermesWebAPITransport: vi.fn(),
  runViaWebAPI: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { HermesWebAPITransport } from "../hermes-webapi.js";
import { HermesEngine } from "../hermes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid hermes --quiet stdout */
const VALID_OUTPUT = "Hello from hermes\n\nsession_id: 20260330_224512_a1b2c3\n";

/**
 * Build a fake ChildProcess whose stdout/stderr are EventEmitters.
 * Emits data + close after a microtask so listeners are attached first.
 */
function makeSpawnMock(stdoutData = VALID_OUTPUT, exitCode = 0, stderrData = "") {
  const stdoutEmitter = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const stderrEmitter = new EventEmitter() as NodeJS.ReadableStream & EventEmitter;
  const procEmitter = new EventEmitter();

  const proc = Object.assign(procEmitter, {
    stdout: stdoutEmitter,
    stderr: stderrEmitter,
    pid: 12345,
    exitCode: null as number | null,
    killed: false,
    kill: vi.fn(),
  });

  setImmediate(() => {
    if (stdoutData) stdoutEmitter.emit("data", Buffer.from(stdoutData));
    stdoutEmitter.emit("end");
    if (stderrData) stderrEmitter.emit("data", Buffer.from(stderrData));
    stderrEmitter.emit("end");
    proc.exitCode = exitCode;
    procEmitter.emit("close", exitCode);
  });

  return proc;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HermesEngine — model isolation regression", () => {
  const mockExecFileSync = vi.mocked(execFileSync);
  const mockSpawn = vi.mocked(spawn);
  const mockExistsSync = vi.mocked(existsSync);

  beforeEach(() => {
    vi.clearAllMocks();

    // Force CLI path: WebAPI unavailable
    vi.mocked(HermesWebAPITransport).mockImplementation(
      function () {
        return { isAvailable: vi.fn().mockResolvedValue(false) };
      } as unknown as typeof HermesWebAPITransport,
    );

    // execFileSync("which", ["hermes"]) → plain hermes path, no .native
    mockExecFileSync.mockReturnValue(
      "/usr/local/bin/hermes\n" as unknown as ReturnType<typeof execFileSync>,
    );
    // hermes.native does NOT exist → no binary substitution
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. No --model when model is undefined
  // -------------------------------------------------------------------------

  it("does NOT pass --model when model is undefined", async () => {
    const spawnProc = makeSpawnMock();
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    await engine.run({ prompt: "test", sessionId: "s1" });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).not.toContain("--model");
  });

  // -------------------------------------------------------------------------
  // 2. --model IS passed when explicitly set
  // -------------------------------------------------------------------------

  it("passes --model when model is explicitly set", async () => {
    const spawnProc = makeSpawnMock();
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    await engine.run({ prompt: "test", sessionId: "s1", model: "xiaomi/mimo-v2-pro" });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const modelIdx = args.indexOf("--model");
    expect(modelIdx).toBeGreaterThan(-1);
    expect(args[modelIdx + 1]).toBe("xiaomi/mimo-v2-pro");
  });

  // -------------------------------------------------------------------------
  // 3. --profile IS passed when hermesProfile is set
  // -------------------------------------------------------------------------

  it("passes --profile when hermesProfile is set", async () => {
    const spawnProc = makeSpawnMock();
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    await engine.run({ prompt: "test", sessionId: "s1", hermesProfile: "jinn-coo" });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const profileIdx = args.indexOf("--profile");
    expect(profileIdx).toBeGreaterThan(-1);
    expect(args[profileIdx + 1]).toBe("jinn-coo");
  });

  // -------------------------------------------------------------------------
  // Bonus: profile + no model → no --model leaked
  // -------------------------------------------------------------------------

  it("does NOT leak --model when only hermesProfile is set", async () => {
    const spawnProc = makeSpawnMock();
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    await engine.run({ prompt: "test", sessionId: "s1", hermesProfile: "jinn-coo" });

    const args = mockSpawn.mock.calls[0]![1] as string[];
    expect(args).not.toContain("--model");
    expect(args).toContain("--profile");
  });
});
