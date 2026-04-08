import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { HonchoClient, resolveHonchoUrl } from "../client.js";

// ---------------------------------------------------------------------------
// Mock http.request
// ---------------------------------------------------------------------------

vi.mock("node:http", () => ({
  default: {
    request: vi.fn(),
  },
}));

const mockRequest = http.request as ReturnType<typeof vi.fn>;

function mockHttpResponse(
  statusCode: number,
  body: unknown,
  onRequest?: (options: http.RequestOptions) => void
) {
  mockRequest.mockImplementation((options: http.RequestOptions, callback: (res: http.IncomingMessage) => void) => {
    if (onRequest) onRequest(options);

    const mockRes = {
      statusCode,
      on: vi.fn((event: string, handler: (data?: Buffer) => void) => {
        if (event === "data") {
          handler(Buffer.from(JSON.stringify(body)));
        }
        if (event === "end") {
          handler();
        }
      }),
    };

    setTimeout(() => callback(mockRes as unknown as http.IncomingMessage), 0);

    return {
      on: vi.fn(),
      setTimeout: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HonchoClient", () => {
  let client: HonchoClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new HonchoClient(8000, "127.0.0.1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("uses default port and host", () => {
      const defaultClient = new HonchoClient();
      expect(defaultClient).toBeDefined();
    });

    it("accepts custom port and host", () => {
      const customClient = new HonchoClient(9000, "localhost");
      expect(customClient).toBeDefined();
    });
  });

  describe("checkHealth", () => {
    it("returns true when API responds", async () => {
      mockHttpResponse(200, []);

      const result = await client.checkHealth();

      expect(result).toBe(true);
      expect(client.healthy).toBe(true);
    });

    it("returns false when API fails", async () => {
      mockRequest.mockImplementation((_options: http.RequestOptions, _callback: unknown) => {
        return {
          on: vi.fn((event: string, handler: (err: Error) => void) => {
            if (event === "error") {
              setTimeout(() => handler(new Error("Connection refused")), 0);
            }
          }),
          setTimeout: vi.fn(),
          write: vi.fn(),
          end: vi.fn(),
        };
      });

      const result = await client.checkHealth();

      expect(result).toBe(false);
      expect(client.healthy).toBe(false);
    });
  });

  describe("listWorkspaces", () => {
    it("returns workspaces from API", async () => {
      const mockWorkspaces = [
        { id: "ws-1", name: "Default" },
        { id: "ws-2", name: "Test" },
      ];
      mockHttpResponse(200, mockWorkspaces);

      const result = await client.listWorkspaces();

      expect(result).toEqual(mockWorkspaces);
    });

    it("returns empty array on null response", async () => {
      mockHttpResponse(200, null);

      const result = await client.listWorkspaces();

      expect(result).toEqual([]);
    });
  });

  describe("listConclusions", () => {
    it("fetches conclusions for workspace", async () => {
      const mockConclusions = [
        {
          id: "c-1",
          content: "User fact",
          observer_id: "agent-1",
          observed_id: "user-1",
          session_id: null,
          created_at: "2024-01-15T10:00:00Z",
        },
      ];
      mockHttpResponse(200, mockConclusions);

      const result = await client.listConclusions("ws-1");

      expect(result.items).toEqual(mockConclusions);
    });

    it("handles pagination options", async () => {
      let capturedPath = "";
      mockHttpResponse(200, [], (options) => {
        capturedPath = options.path ?? "";
      });

      await client.listConclusions("ws-1", { limit: 10, offset: 20 });

      expect(capturedPath).toContain("/v3/workspaces/ws-1/conclusions/list");
    });
  });

  describe("queryConclusions", () => {
    it("performs semantic search", async () => {
      const searchResults = [
        {
          id: "c-1",
          content: "Matching fact",
          observer_id: "agent-1",
          observed_id: "user-1",
          session_id: null,
          created_at: "2024-01-15T10:00:00Z",
        },
      ];
      mockHttpResponse(200, searchResults);

      const result = await client.queryConclusions("ws-1", "search query", 5);

      expect(result).toEqual(searchResults);
    });
  });

  describe("deleteConclusion", () => {
    it("deletes conclusion by ID", async () => {
      let capturedMethod = "";
      let capturedPath = "";
      mockHttpResponse(204, {}, (options) => {
        capturedMethod = options.method ?? "";
        capturedPath = options.path ?? "";
      });

      await client.deleteConclusion("ws-1", "c-1");

      expect(capturedMethod).toBe("DELETE");
      expect(capturedPath).toContain("/conclusions/c-1");
    });
  });

  describe("createConclusions", () => {
    it("creates new conclusions", async () => {
      const newConclusions = [
        {
          content: "New fact",
          observer_id: "agent-1",
          observed_id: "user-1",
        },
      ];
      const createdConclusions = [
        {
          ...newConclusions[0],
          id: "c-new",
          session_id: null,
          created_at: "2024-01-16T12:00:00Z",
        },
      ];
      mockHttpResponse(200, createdConclusions);

      const result = await client.createConclusions("ws-1", newConclusions);

      expect(result).toEqual(createdConclusions);
    });
  });
});

describe("resolveHonchoUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default when HONCHO_URL not set", () => {
    delete process.env.HONCHO_URL;
    const result = resolveHonchoUrl();
    expect(result).toEqual({ host: "127.0.0.1", port: 8000 });
  });

  it("parses HONCHO_URL environment variable", () => {
    process.env.HONCHO_URL = "http://honcho.local:9000";
    const result = resolveHonchoUrl();
    expect(result).toEqual({ host: "honcho.local", port: 9000 });
  });

  it("handles invalid URL gracefully", () => {
    process.env.HONCHO_URL = "not-a-valid-url";
    const result = resolveHonchoUrl();
    expect(result).toEqual({ host: "127.0.0.1", port: 8000 });
  });
});
