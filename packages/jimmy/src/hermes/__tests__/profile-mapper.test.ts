import { describe, it, expect } from "vitest";
import {
  mapEmployeeToHermesInput,
  hermesRunInputToOpts,
  type HermesRunInput,
} from "../profile-mapper.js";
import type { Employee } from "../../shared/types.js";

/** Minimal valid Employee fixture */
function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    name: "test-employee",
    engine: "hermes",
    ...overrides,
  } as Employee;
}

describe("mapEmployeeToHermesInput", () => {
  describe("employee with persona", () => {
    it("should set systemAddition from employee.persona", () => {
      const employee = makeEmployee({ persona: "You are a senior backend engineer." });
      const result = mapEmployeeToHermesInput(employee);

      expect(result.systemAddition).toBe("You are a senior backend engineer.");
    });

    it("should trim whitespace from persona", () => {
      const employee = makeEmployee({ persona: "  You are careful and precise.  " });
      const result = mapEmployeeToHermesInput(employee);

      expect(result.systemAddition).toBe("You are careful and precise.");
    });

    it("should not set systemAddition when persona is empty string", () => {
      const employee = makeEmployee({ persona: "" });
      const result = mapEmployeeToHermesInput(employee);

      expect(result.systemAddition).toBeUndefined();
    });

    it("should not set systemAddition when persona is whitespace only", () => {
      const employee = makeEmployee({ persona: "   " });
      const result = mapEmployeeToHermesInput(employee);

      expect(result.systemAddition).toBeUndefined();
    });

    it("should not set systemAddition when persona is absent", () => {
      const employee = makeEmployee();
      const result = mapEmployeeToHermesInput(employee);

      expect(result.systemAddition).toBeUndefined();
    });
  });

  describe("employee with preferred provider/model", () => {
    it("should propagate employee.model as modelPolicy", () => {
      const employee = makeEmployee({ model: "claude-sonnet-4-5" });
      const result = mapEmployeeToHermesInput(employee);

      expect(result.modelPolicy).toBe("claude-sonnet-4-5");
    });

    it("should override employee model with overrides.model", () => {
      const employee = makeEmployee({ model: "claude-sonnet-4-5" });
      const result = mapEmployeeToHermesInput(employee, { model: "gpt-4o" });

      expect(result.modelPolicy).toBe("gpt-4o");
    });

    it("should propagate overrides.provider as providerPolicy", () => {
      const employee = makeEmployee();
      const result = mapEmployeeToHermesInput(employee, { provider: "openrouter" });

      expect(result.providerPolicy).toBe("openrouter");
    });

    it("should not set providerPolicy when provider override is absent", () => {
      const employee = makeEmployee();
      const result = mapEmployeeToHermesInput(employee);

      expect(result.providerPolicy).toBeUndefined();
    });

    it("should not set modelPolicy when neither employee nor override has model", () => {
      const employee = makeEmployee();
      const result = mapEmployeeToHermesInput(employee);

      expect(result.modelPolicy).toBeUndefined();
    });
  });

  describe("employee without hermes config (defaults)", () => {
    it("should return an empty HermesRunInput for a bare employee", () => {
      const employee = makeEmployee();
      const result = mapEmployeeToHermesInput(employee);

      expect(result.systemAddition).toBeUndefined();
      expect(result.modelPolicy).toBeUndefined();
      expect(result.providerPolicy).toBeUndefined();
      expect(result.mcpEnabled).toBeUndefined();
      expect(result.honchoEnabled).toBeUndefined();
      expect(result.profile).toBeUndefined();
    });

    it("should not throw for a minimal employee object", () => {
      const employee = makeEmployee();
      expect(() => mapEmployeeToHermesInput(employee)).not.toThrow();
    });
  });

  describe("MCP intent propagation", () => {
    it("should set mcpEnabled=true when employee.mcp is defined and not false", () => {
      // employee.mcp is any truthy value (e.g. object or true)
      const employee = makeEmployee({ mcp: {} as any });
      const result = mapEmployeeToHermesInput(employee);

      expect(result.mcpEnabled).toBe(true);
    });

    it("should not set mcpEnabled when employee.mcp is false", () => {
      const employee = makeEmployee({ mcp: false as any });
      const result = mapEmployeeToHermesInput(employee);

      expect(result.mcpEnabled).toBeUndefined();
    });

    it("should not set mcpEnabled when employee.mcp is undefined", () => {
      const employee = makeEmployee({ mcp: undefined });
      const result = mapEmployeeToHermesInput(employee);

      expect(result.mcpEnabled).toBeUndefined();
    });

    it("should override mcp from overrides.mcpEnabled=true", () => {
      const employee = makeEmployee({ mcp: false as any });
      const result = mapEmployeeToHermesInput(employee, { mcpEnabled: true });

      expect(result.mcpEnabled).toBe(true);
    });

    it("should override mcp from overrides.mcpEnabled=false", () => {
      const employee = makeEmployee({ mcp: {} as any });
      const result = mapEmployeeToHermesInput(employee, { mcpEnabled: false });

      // overrides.mcpEnabled=false → false, not truthy → not set
      expect(result.mcpEnabled).toBeUndefined();
    });
  });

  describe("Honcho enabled/disabled", () => {
    it("should set honchoEnabled=true when overrides.honchoEnabled=true", () => {
      const employee = makeEmployee();
      const result = mapEmployeeToHermesInput(employee, { honchoEnabled: true });

      expect(result.honchoEnabled).toBe(true);
    });

    it("should set honchoEnabled=false when overrides.honchoEnabled=false", () => {
      const employee = makeEmployee();
      const result = mapEmployeeToHermesInput(employee, { honchoEnabled: false });

      expect(result.honchoEnabled).toBe(false);
    });

    it("should not set honchoEnabled when overrides.honchoEnabled is absent", () => {
      const employee = makeEmployee();
      const result = mapEmployeeToHermesInput(employee);

      expect(result.honchoEnabled).toBeUndefined();
    });
  });
});

describe("hermesRunInputToOpts", () => {
  it("should map modelPolicy to model", () => {
    const input: HermesRunInput = { modelPolicy: "claude-opus-4" };
    const opts = hermesRunInputToOpts(input);

    expect(opts.model).toBe("claude-opus-4");
  });

  it("should map providerPolicy to hermesProvider", () => {
    const input: HermesRunInput = { providerPolicy: "anthropic" };
    const opts = hermesRunInputToOpts(input);

    expect(opts.hermesProvider).toBe("anthropic");
  });

  it("should map profile to hermesProfile", () => {
    const input: HermesRunInput = { profile: "jinn-cto" };
    const opts = hermesRunInputToOpts(input);

    expect(opts.hermesProfile).toBe("jinn-cto");
  });

  it("should map systemAddition to systemPromptAddition", () => {
    const input: HermesRunInput = { systemAddition: "Be concise." };
    const opts = hermesRunInputToOpts(input);

    expect(opts.systemPromptAddition).toBe("Be concise.");
  });

  it("should omit undefined fields", () => {
    const input: HermesRunInput = {};
    const opts = hermesRunInputToOpts(input);

    expect(opts.hermesProfile).toBeUndefined();
    expect(opts.hermesProvider).toBeUndefined();
    expect(opts.model).toBeUndefined();
    expect(opts.systemPromptAddition).toBeUndefined();
  });

  it("should map all fields when fully populated", () => {
    const input: HermesRunInput = {
      profile: "my-profile",
      providerPolicy: "openrouter",
      modelPolicy: "gpt-4o",
      systemAddition: "You are helpful.",
    };
    const opts = hermesRunInputToOpts(input);

    expect(opts.hermesProfile).toBe("my-profile");
    expect(opts.hermesProvider).toBe("openrouter");
    expect(opts.model).toBe("gpt-4o");
    expect(opts.systemPromptAddition).toBe("You are helpful.");
  });
});
