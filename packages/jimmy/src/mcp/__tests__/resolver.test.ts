/**
 * Tests for MCP resolver — resolveMcpServers, buildAvailableServers, gateway path
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveMcpServers, writeMcpConfigFile, cleanupMcpConfigFile } from "../resolver.js";
import type { McpGlobalConfig, Employee } from "../../shared/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ─── resolveMcpServers ───────────────────────────────────────────────────────

describe("resolveMcpServers", () => {
  it("returns empty servers when no globalMcp", () => {
    const result = resolveMcpServers(undefined);
    expect(result.mcpServers).toEqual({});
  });

  it("returns empty servers when employee.mcp is false", () => {
    const config: McpGlobalConfig = { browser: { enabled: true, provider: "playwright" } };
    const employee = { name: "test", mcp: false } as unknown as Employee;
    const result = resolveMcpServers(config, employee);
    expect(result.mcpServers).toEqual({});
  });

  it("returns only requested servers when employee.mcp is an array", () => {
    const config: McpGlobalConfig = {
      browser: { enabled: true, provider: "playwright" },
      fetch: { enabled: true },
    };
    const employee = { name: "test", mcp: ["fetch"] } as unknown as Employee;
    const result = resolveMcpServers(config, employee);
    expect(result.mcpServers).toHaveProperty("fetch");
    expect(result.mcpServers).not.toHaveProperty("browser");
  });

  it("warns when employee requests missing MCP server", () => {
    const config: McpGlobalConfig = { fetch: { enabled: true } };
    const employee = { name: "bob", mcp: ["nonexistent"] } as unknown as Employee;
    const result = resolveMcpServers(config, employee);
    expect(result.mcpServers).not.toHaveProperty("nonexistent");
  });

  it("returns all enabled servers when employee.mcp is undefined (default)", () => {
    const config: McpGlobalConfig = {
      fetch: { enabled: true },
      browser: { enabled: true, provider: "playwright" },
    };
    const employee = { name: "test" } as unknown as Employee;
    const result = resolveMcpServers(config, employee);
    expect(result.mcpServers).toHaveProperty("fetch");
    expect(result.mcpServers).toHaveProperty("browser");
  });
});

// ─── search apiKey resolution ────────────────────────────────────────────────

describe("search server apiKey resolution", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("includes search server when enabled and apiKey is set in config", () => {
    const config: McpGlobalConfig = {
      search: { enabled: true, apiKey: "test-brave-key" },
    };
    const result = resolveMcpServers(config);
    expect(result.mcpServers).toHaveProperty("search");
    expect(result.mcpServers.search).toMatchObject({
      command: "npx",
      args: ["-y", "brave-search-mcp"],
    });
    expect((result.mcpServers.search as any).env?.BRAVE_API_KEY).toBe("test-brave-key");
  });

  it("includes search server when BRAVE_API_KEY env var is set", () => {
    process.env.BRAVE_API_KEY = "env-brave-key";
    const config: McpGlobalConfig = {
      search: { enabled: true, apiKey: "${BRAVE_API_KEY}" },
    };
    const result = resolveMcpServers(config);
    expect(result.mcpServers).toHaveProperty("search");
    expect((result.mcpServers.search as any).env?.BRAVE_API_KEY).toBe("env-brave-key");
  });

  it("omits search server when enabled but no apiKey configured", () => {
    delete process.env.BRAVE_API_KEY;
    const config: McpGlobalConfig = {
      search: { enabled: true },
    };
    const result = resolveMcpServers(config);
    expect(result.mcpServers).not.toHaveProperty("search");
  });

  it("omits search server when not enabled", () => {
    const config: McpGlobalConfig = {
      search: { enabled: false, apiKey: "key" },
    };
    const result = resolveMcpServers(config);
    expect(result.mcpServers).not.toHaveProperty("search");
  });
});

// ─── gateway server path ─────────────────────────────────────────────────────

describe("gateway server path resolution", () => {
  it("includes gateway server with a valid node command", () => {
    const config: McpGlobalConfig = {
      gateway: { enabled: true },
    };
    const result = resolveMcpServers(config);
    expect(result.mcpServers).toHaveProperty("gateway");
    const gateway = result.mcpServers.gateway as any;
    expect(gateway.command).toBe("node");
    expect(Array.isArray(gateway.args)).toBe(true);
    expect(gateway.args[0]).toContain("gateway-server.js");
  });

  it("gateway script path ends with gateway-server.js and exists or is a valid path", () => {
    const config: McpGlobalConfig = {
      gateway: { enabled: true },
    };
    const result = resolveMcpServers(config);
    const gateway = result.mcpServers.gateway as any;
    const scriptPath = gateway.args[0] as string;
    // Must end with gateway-server.js
    expect(scriptPath).toMatch(/gateway-server\.js$/);
    // Must be an absolute path
    expect(path.isAbsolute(scriptPath)).toBe(true);
    // Must NOT contain double 'dist/dist'
    expect(scriptPath).not.toContain("dist/dist");
    // Must NOT go outside the project root
    expect(scriptPath).not.toMatch(/^\/Users\/[^/]+\/dist\//);
  });

  it("omits gateway server when disabled", () => {
    const config: McpGlobalConfig = {
      gateway: { enabled: false },
    };
    const result = resolveMcpServers(config);
    expect(result.mcpServers).not.toHaveProperty("gateway");
  });

  it("gateway env contains JINN_GATEWAY_URL", () => {
    const config: McpGlobalConfig = { gateway: { enabled: true } };
    const result = resolveMcpServers(config);
    const gateway = result.mcpServers.gateway as any;
    expect(gateway.env?.JINN_GATEWAY_URL).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });
});

// ─── browser/fetch servers ───────────────────────────────────────────────────

describe("browser and fetch servers", () => {
  it("adds playwright browser server by default", () => {
    const config: McpGlobalConfig = { browser: { enabled: true } };
    const result = resolveMcpServers(config);
    expect(result.mcpServers.browser).toMatchObject({
      command: "npx",
      args: ["-y", "@anthropic-ai/mcp-server-playwright"],
    });
  });

  it("adds puppeteer browser server when provider is puppeteer", () => {
    const config: McpGlobalConfig = { browser: { enabled: true, provider: "puppeteer" } };
    const result = resolveMcpServers(config);
    expect(result.mcpServers.browser).toMatchObject({
      command: "npx",
      args: ["-y", "@anthropic-ai/mcp-server-puppeteer"],
    });
  });

  it("adds fetch server when enabled", () => {
    const config: McpGlobalConfig = { fetch: { enabled: true } };
    const result = resolveMcpServers(config);
    expect(result.mcpServers.fetch).toMatchObject({
      command: "npx",
      args: ["-y", "@anthropic-ai/mcp-server-fetch"],
    });
  });
});

// ─── writeMcpConfigFile / cleanupMcpConfigFile ───────────────────────────────

describe("writeMcpConfigFile / cleanupMcpConfigFile", () => {
  it("writes a valid JSON config file and cleans it up", () => {
    const config = { mcpServers: { fetch: { command: "npx", args: ["-y", "@anthropic-ai/mcp-server-fetch"] } } };
    const sessionId = `test-session-${Date.now()}`;
    const filePath = writeMcpConfigFile(config, sessionId);
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(parsed).toEqual(config);
    cleanupMcpConfigFile(sessionId);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
