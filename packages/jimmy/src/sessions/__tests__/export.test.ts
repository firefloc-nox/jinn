import { describe, it, expect, beforeEach, vi } from "vitest";
import { exportSession, type ExportFormat, type ExportedTranscript } from "../export.js";

// Mock the registry module
vi.mock("../registry.js", () => ({
  getSession: vi.fn(),
  getMessages: vi.fn(),
}));

import { getSession, getMessages } from "../registry.js";

const mockGetSession = vi.mocked(getSession);
const mockGetMessages = vi.mocked(getMessages);

describe("exportSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSession = {
    id: "test-session-123",
    engine: "hermes",
    engineSessionId: null,
    source: "web",
    sourceRef: "web:123",
    connector: "web",
    sessionKey: "web:123",
    replyContext: null,
    messageId: null,
    transportMeta: null,
    employee: "alice",
    model: "claude-3-opus",
    title: "Test Session",
    parentSessionId: null,
    status: "idle" as const,
    effortLevel: null,
    totalCost: 0.0125,
    totalTurns: 3,
    createdAt: "2024-01-15T10:00:00.000Z",
    lastActivity: "2024-01-15T10:05:00.000Z",
    lastError: null,
  };

  const mockMessages = [
    {
      id: "msg-1",
      role: "user",
      content: "Hello, how are you?",
      timestamp: 1705312800000, // 2024-01-15T10:00:00.000Z
    },
    {
      id: "msg-2",
      role: "assistant",
      content: "I'm doing well, thank you for asking!",
      timestamp: 1705312810000, // 2024-01-15T10:00:10.000Z
    },
    {
      id: "msg-3",
      role: "user",
      content: "Can you help me with a task?",
      timestamp: 1705312820000, // 2024-01-15T10:00:20.000Z
    },
  ];

  describe("returns null for non-existent session", () => {
    it("should return null when session is not found", () => {
      mockGetSession.mockReturnValue(undefined);

      const result = exportSession("non-existent-id", "markdown");

      expect(result).toBeNull();
      expect(mockGetSession).toHaveBeenCalledWith("non-existent-id");
    });
  });

  describe("markdown format", () => {
    it("should export session as markdown", () => {
      mockGetSession.mockReturnValue(mockSession);
      mockGetMessages.mockReturnValue(mockMessages);

      const result = exportSession("test-session-123", "markdown");

      expect(result).not.toBeNull();
      expect(result).toContain("# Session Transcript");
      expect(result).toContain("## Metadata");
      expect(result).toContain("**Session ID:** test-session-123");
      expect(result).toContain("**Title:** Test Session");
      expect(result).toContain("**Engine:** hermes");
      expect(result).toContain("**Model:** claude-3-opus");
      expect(result).toContain("**Employee:** alice");
      expect(result).toContain("**Total Cost:** $0.0125");
      expect(result).toContain("**Total Turns:** 3");
      expect(result).toContain("## Conversation");
      expect(result).toContain("### 👤 User");
      expect(result).toContain("### 🤖 Assistant");
      expect(result).toContain("Hello, how are you?");
      expect(result).toContain("I'm doing well, thank you for asking!");
    });

    it("should handle sessions without optional fields", () => {
      const minimalSession = {
        ...mockSession,
        title: null,
        model: null,
        employee: null,
        totalCost: 0,
        totalTurns: 0,
      };
      mockGetSession.mockReturnValue(minimalSession);
      mockGetMessages.mockReturnValue([]);

      const result = exportSession("test-session-123", "markdown");

      expect(result).not.toBeNull();
      expect(result).not.toContain("**Title:**");
      expect(result).not.toContain("**Model:**");
      expect(result).not.toContain("**Employee:**");
      expect(result).not.toContain("**Total Cost:**");
      expect(result).not.toContain("**Total Turns:**");
    });
  });

  describe("json format", () => {
    it("should export session as valid JSON", () => {
      mockGetSession.mockReturnValue(mockSession);
      mockGetMessages.mockReturnValue(mockMessages);

      const result = exportSession("test-session-123", "json");

      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!) as ExportedTranscript;

      expect(parsed.sessionId).toBe("test-session-123");
      expect(parsed.title).toBe("Test Session");
      expect(parsed.model).toBe("claude-3-opus");
      expect(parsed.engine).toBe("hermes");
      expect(parsed.employee).toBe("alice");
      expect(parsed.totalCost).toBe(0.0125);
      expect(parsed.totalTurns).toBe(3);
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0].content).toBe("Hello, how are you?");
    });

    it("should format JSON with indentation", () => {
      mockGetSession.mockReturnValue(mockSession);
      mockGetMessages.mockReturnValue(mockMessages);

      const result = exportSession("test-session-123", "json");

      expect(result).toContain("\n");
      expect(result).toContain("  ");
    });
  });

  describe("txt format", () => {
    it("should export session as plain text", () => {
      mockGetSession.mockReturnValue(mockSession);
      mockGetMessages.mockReturnValue(mockMessages);

      const result = exportSession("test-session-123", "txt");

      expect(result).not.toBeNull();
      expect(result).toContain("SESSION TRANSCRIPT");
      expect(result).toContain("Session ID: test-session-123");
      expect(result).toContain("Title: Test Session");
      expect(result).toContain("Engine: hermes");
      expect(result).toContain("Model: claude-3-opus");
      expect(result).toContain("Employee: alice");
      expect(result).toContain("Total Cost: $0.0125");
      expect(result).toContain("Total Turns: 3");
      expect(result).toContain("CONVERSATION");
      expect(result).toContain("[USER]");
      expect(result).toContain("[ASSISTANT]");
      expect(result).toContain("Hello, how are you?");
    });

    it("should use separator lines", () => {
      mockGetSession.mockReturnValue(mockSession);
      mockGetMessages.mockReturnValue(mockMessages);

      const result = exportSession("test-session-123", "txt");

      expect(result).toContain("=".repeat(60));
      expect(result).toContain("-".repeat(40));
    });
  });

  describe("format validation", () => {
    it("should default to JSON for unknown formats", () => {
      mockGetSession.mockReturnValue(mockSession);
      mockGetMessages.mockReturnValue(mockMessages);

      // Cast to bypass TypeScript type checking for testing
      const result = exportSession("test-session-123", "unknown" as ExportFormat);

      // Should fallback to JSON
      expect(() => JSON.parse(result!)).not.toThrow();
    });
  });

  describe("timestamp formatting", () => {
    it("should format timestamps as ISO strings", () => {
      mockGetSession.mockReturnValue(mockSession);
      mockGetMessages.mockReturnValue(mockMessages);

      const result = exportSession("test-session-123", "markdown");

      // Should contain ISO formatted timestamps
      expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("empty messages", () => {
    it("should handle sessions with no messages", () => {
      mockGetSession.mockReturnValue(mockSession);
      mockGetMessages.mockReturnValue([]);

      const mdResult = exportSession("test-session-123", "markdown");
      const jsonResult = exportSession("test-session-123", "json");
      const txtResult = exportSession("test-session-123", "txt");

      expect(mdResult).not.toBeNull();
      expect(jsonResult).not.toBeNull();
      expect(txtResult).not.toBeNull();

      const parsed = JSON.parse(jsonResult!) as ExportedTranscript;
      expect(parsed.messages).toHaveLength(0);
    });
  });
});
