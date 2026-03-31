/**
 * Tests for engines/hermes.ts
 *
 * Coverage:
 *  - parseHermesOutput (exported)
 *  - HermesEngine.run() — CLI fallback path (WebAPI mocked to unavailable)
 *  - resolveBin / resolveHermesModel tested indirectly via run()
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any import of the module under test
// ---------------------------------------------------------------------------

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync: vi.fn(),
    spawn: vi.fn(),
  };
});

// Auto-mock node:fs so named exports (existsSync) become vi.fn()
vi.mock("node:fs");

// HermesWebAPITransport is called with `new` inside HermesEngine.run().
// Must use class-based mockImplementation so the constructor works.
const mockIsAvailable = vi.fn().mockResolvedValue(false);
vi.mock("../hermes-webapi.js", () => ({
  HermesWebAPITransport: vi.fn().mockImplementation(class {
    isAvailable = mockIsAvailable;
    static invalidateAvailabilityCache = vi.fn();
  }),
  runViaWebAPI: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks are registered
// ---------------------------------------------------------------------------

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { parseHermesOutput, HermesEngine } from "../hermes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake ChildProcess-like object whose stdout/stderr are EventEmitters.
 * After a microtask tick, data is emitted on stdout/stderr then the proc
 * emits a 'close' event with the given exitCode.
 */
function makeSpawnMock(stdoutData: string, exitCode = 0, stderrData = "") {
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

  // Emit events asynchronously so the caller has time to attach listeners
  setImmediate(() => {
    if (stdoutData) {
      stdoutEmitter.emit("data", Buffer.from(stdoutData));
    }
    stdoutEmitter.emit("end");

    if (stderrData) {
      stderrEmitter.emit("data", Buffer.from(stderrData));
    }
    stderrEmitter.emit("end");

    proc.exitCode = exitCode;
    procEmitter.emit("close", exitCode);
  });

  return proc;
}

// ---------------------------------------------------------------------------
// describe: parseHermesOutput
// ---------------------------------------------------------------------------

describe("parseHermesOutput", () => {
  it("parses plain text without metadata", () => {
    const { result, sessionId, hermesMeta } = parseHermesOutput("Hello world\n");
    expect(result).toBe("Hello world");
    expect(sessionId).toBe("");
    expect(hermesMeta).toEqual({});
  });

  it("parses session_id from last lines", () => {
    const stdout = "My answer\n\nsession_id: 20260330_224512_a1b2c3\n";
    const { result, sessionId, hermesMeta } = parseHermesOutput(stdout);
    expect(result).toBe("My answer");
    expect(sessionId).toBe("20260330_224512_a1b2c3");
    expect(hermesMeta.hermesSessionId).toBe("20260330_224512_a1b2c3");
  });

  it("parses session_id + provider + model", () => {
    const stdout =
      "Answer\n\nsession_id: abc123\nprovider: anthropic\nmodel: claude-sonnet-4-5\n";
    const { result, sessionId, hermesMeta } = parseHermesOutput(stdout);
    expect(result).toBe("Answer");
    expect(sessionId).toBe("abc123");
    expect(hermesMeta.hermesSessionId).toBe("abc123");
    expect(hermesMeta.providerUsed).toBe("anthropic");
    expect(hermesMeta.modelUsed).toBe("claude-sonnet-4-5");
  });

  it("strips Rich box-drawing lines", () => {
    const stdout = [
      "╭─ ✦ Lain ───╮",
      "│ Here is my answer │",
      "╰────────────────╯",
      "",
      "The actual answer",
      "",
      "session_id: sess1",
      "",
    ].join("\n");

    const { result } = parseHermesOutput(stdout);
    expect(result).not.toMatch(/[╭╰│╮╯─┤├]/);
    expect(result).toContain("The actual answer");
  });

  it("uses fallbackSessionId when no session_id in output", () => {
    const { sessionId } = parseHermesOutput("Just some text\n", "fallback-id");
    expect(sessionId).toBe("fallback-id");
  });

  it("graceful with empty stdout", () => {
    const { result, sessionId, hermesMeta } = parseHermesOutput("");
    expect(result).toBe("");
    expect(sessionId).toBe("");
    expect(hermesMeta).toEqual({});
  });

  it("stores activeProfile in hermesMeta", () => {
    const { hermesMeta } = parseHermesOutput("Some answer\n", undefined, "myprofile");
    expect(hermesMeta.activeProfile).toBe("myprofile");
  });

  it("parses honcho: active", () => {
    const stdout = "Answer\n\nsession_id: abc\nhoncho: active\n";
    const { hermesMeta } = parseHermesOutput(stdout);
    expect(hermesMeta.honchoActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// describe: HermesEngine — CLI fallback path
// ---------------------------------------------------------------------------

describe("HermesEngine — CLI fallback path", () => {
  const mockExecFileSync = vi.mocked(execFileSync);
  const mockSpawn = vi.mocked(spawn);
  const mockExistsSync = vi.mocked(existsSync);

  beforeEach(() => {
    vi.clearAllMocks();
    // Force isAvailable to false so HermesEngine always falls back to CLI
    mockIsAvailable.mockResolvedValue(false);
    // Default: execFileSync returns a path for 'which hermes'
    mockExecFileSync.mockReturnValue(
      "/usr/local/bin/hermes\n" as unknown as ReturnType<typeof execFileSync>,
    );
    // Default: hermes.native does NOT exist
    mockExistsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves to hermes.native when wrapper exists", async () => {
    mockExecFileSync.mockReturnValue(
      "/usr/local/bin/hermes\n" as unknown as ReturnType<typeof execFileSync>,
    );
    mockExistsSync.mockReturnValue(true);

    const spawnProc = makeSpawnMock("Native result\nsession_id: native1\n", 0);
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    await engine.run({ prompt: "hello", sessionId: "test-sess", cwd: "/tmp" });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const calledBin = mockSpawn.mock.calls[0]![0];
    expect(calledBin).toBe("/usr/local/bin/hermes.native");
  });

  it("falls back to hermes when hermes.native absent", async () => {
    mockExecFileSync.mockReturnValue(
      "/usr/local/bin/hermes\n" as unknown as ReturnType<typeof execFileSync>,
    );
    mockExistsSync.mockReturnValue(false);

    const spawnProc = makeSpawnMock("Result\nsession_id: s1\n", 0);
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    await engine.run({ prompt: "hello", sessionId: "test-sess", cwd: "/tmp" });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const calledBin = mockSpawn.mock.calls[0]![0];
    // Falls back to plain which result (trimmed)
    expect(calledBin).toBe("/usr/local/bin/hermes");
  });

  it("resolves model short name to anthropic/claude-sonnet", async () => {
    mockExistsSync.mockReturnValue(false);
    const spawnProc = makeSpawnMock("Result\nsession_id: s2\n", 0);
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    await engine.run({ prompt: "hello", model: "sonnet", sessionId: "test-sess", cwd: "/tmp" });

    expect(mockSpawn).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[0]![1] as string[];
    const modelIdx = args.indexOf("--model");
    expect(modelIdx).toBeGreaterThan(-1);
    expect(args[modelIdx + 1]).toBe("anthropic/claude-sonnet");
  });

  it("passes through fully-qualified model", async () => {
    mockExistsSync.mockReturnValue(false);
    const spawnProc = makeSpawnMock("Result\nsession_id: s3\n", 0);
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    await engine.run({
      prompt: "hello",
      model: "anthropic/claude-sonnet-4.6",
      sessionId: "test-sess",
      cwd: "/tmp",
    });

    const args = mockSpawn.mock.calls[0]![1] as string[];
    const modelIdx = args.indexOf("--model");
    expect(modelIdx).toBeGreaterThan(-1);
    expect(args[modelIdx + 1]).toBe("anthropic/claude-sonnet-4.6");
  });

  it("returns result from stdout", async () => {
    mockExistsSync.mockReturnValue(false);
    const spawnProc = makeSpawnMock("Hello\nsession_id: sess123\n", 0);
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    const result = await engine.run({ prompt: "hi", sessionId: "test-sess", cwd: "/tmp" });

    expect(result.result).toBe("Hello");
    expect(result.sessionId).toBe("sess123");
    expect(result.error).toBeUndefined();
  });

  it("returns error on non-zero exit", async () => {
    mockExistsSync.mockReturnValue(false);
    const spawnProc = makeSpawnMock("", 1, "something failed");
    mockSpawn.mockReturnValue(spawnProc as unknown as ReturnType<typeof spawn>);

    const engine = new HermesEngine();
    const result = await engine.run({ prompt: "hi", sessionId: "test-sess", cwd: "/tmp" });

    expect(result.error).toBeDefined();
    expect(result.error).toContain("Hermes exited with code 1");
  });
});
