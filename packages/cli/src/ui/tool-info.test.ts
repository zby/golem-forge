/**
 * Tool Info Tests
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { NamedTool } from "@golem-forge/core";
import {
  extractManualToolInfo,
  getManualTools,
  getLLMTools,
  isManualTool,
  isLLMTool,
} from "./tool-info.js";

// Helper to create a mock tool
function createMockTool(overrides: Partial<NamedTool>): NamedTool {
  return {
    name: "test_tool",
    description: "A test tool",
    inputSchema: z.object({ path: z.string() }),
    execute: async () => ({ success: true }),
    ...overrides,
  };
}

describe("extractManualToolInfo", () => {
  it("returns null for LLM-only tools", () => {
    const tool = createMockTool({
      manualExecution: { mode: "llm" },
    });
    expect(extractManualToolInfo(tool)).toBe(null);
  });

  it("returns null for tools without manualExecution config", () => {
    const tool = createMockTool({});
    expect(extractManualToolInfo(tool)).toBe(null);
  });

  it("extracts info for manual tools", () => {
    const tool = createMockTool({
      name: "git_push",
      description: "Push commits to remote",
      inputSchema: z.object({
        branch: z.string().describe("Target branch"),
      }),
      manualExecution: {
        mode: "manual",
        label: "Push to Remote",
        category: "Git Operations",
      },
    });

    const info = extractManualToolInfo(tool);
    expect(info).toEqual({
      name: "git_push",
      label: "Push to Remote",
      description: "Push commits to remote",
      category: "Git Operations",
      fields: [
        {
          name: "branch",
          description: "Target branch",
          type: "text",
          required: true,
        },
      ],
    });
  });

  it("extracts info for 'both' mode tools", () => {
    const tool = createMockTool({
      name: "deploy",
      description: "Deploy to production",
      manualExecution: {
        mode: "both",
        label: "Deploy",
      },
    });

    const info = extractManualToolInfo(tool);
    expect(info).not.toBe(null);
    expect(info?.name).toBe("deploy");
    expect(info?.label).toBe("Deploy");
  });

  it("uses tool name as default label", () => {
    const tool = createMockTool({
      name: "my_tool",
      manualExecution: { mode: "manual" },
    });

    const info = extractManualToolInfo(tool);
    expect(info?.label).toBe("my_tool");
  });
});

describe("getManualTools", () => {
  it("returns only manual and both mode tools", () => {
    const tools: Record<string, NamedTool> = {
      read_file: createMockTool({ name: "read_file" }), // No config = LLM
      write_file: createMockTool({
        name: "write_file",
        manualExecution: { mode: "llm" },
      }),
      git_push: createMockTool({
        name: "git_push",
        manualExecution: { mode: "manual" },
      }),
      deploy: createMockTool({
        name: "deploy",
        manualExecution: { mode: "both" },
      }),
    };

    const manualTools = getManualTools(tools);
    expect(manualTools).toHaveLength(2);
    expect(manualTools.map((t) => t.name)).toEqual(["git_push", "deploy"]);
  });
});

describe("getLLMTools", () => {
  it("returns only LLM and both mode tools", () => {
    const tools: Record<string, NamedTool> = {
      read_file: createMockTool({ name: "read_file" }), // No config = LLM
      write_file: createMockTool({
        name: "write_file",
        manualExecution: { mode: "llm" },
      }),
      git_push: createMockTool({
        name: "git_push",
        manualExecution: { mode: "manual" },
      }),
      deploy: createMockTool({
        name: "deploy",
        manualExecution: { mode: "both" },
      }),
    };

    const llmTools = getLLMTools(tools);
    expect(Object.keys(llmTools)).toHaveLength(3);
    expect(Object.keys(llmTools)).toEqual(["read_file", "write_file", "deploy"]);
    expect(llmTools["git_push"]).toBeUndefined();
  });
});

describe("isManualTool", () => {
  it("returns true for manual mode", () => {
    const tool = createMockTool({
      manualExecution: { mode: "manual" },
    });
    expect(isManualTool(tool)).toBe(true);
  });

  it("returns true for both mode", () => {
    const tool = createMockTool({
      manualExecution: { mode: "both" },
    });
    expect(isManualTool(tool)).toBe(true);
  });

  it("returns false for llm mode", () => {
    const tool = createMockTool({
      manualExecution: { mode: "llm" },
    });
    expect(isManualTool(tool)).toBe(false);
  });

  it("returns false for no config", () => {
    const tool = createMockTool({});
    expect(isManualTool(tool)).toBe(false);
  });
});

describe("isLLMTool", () => {
  it("returns true for llm mode", () => {
    const tool = createMockTool({
      manualExecution: { mode: "llm" },
    });
    expect(isLLMTool(tool)).toBe(true);
  });

  it("returns true for both mode", () => {
    const tool = createMockTool({
      manualExecution: { mode: "both" },
    });
    expect(isLLMTool(tool)).toBe(true);
  });

  it("returns true for no config (default is LLM)", () => {
    const tool = createMockTool({});
    expect(isLLMTool(tool)).toBe(true);
  });

  it("returns false for manual mode", () => {
    const tool = createMockTool({
      manualExecution: { mode: "manual" },
    });
    expect(isLLMTool(tool)).toBe(false);
  });
});
