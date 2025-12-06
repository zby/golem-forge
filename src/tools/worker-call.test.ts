import { describe, it, expect, beforeEach } from "vitest";
import {
  WorkerCallToolset,
  createCallWorkerTool,
  type DelegationContext,
  type WorkerCallToolsetOptions,
} from "./worker-call.js";
import { ApprovalController } from "../approval/index.js";
import { createTestSandbox, type Sandbox } from "../sandbox/index.js";
import { WorkerRegistry } from "../worker/registry.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

describe("WorkerCallToolset", () => {
  let sandbox: Sandbox;
  let registry: WorkerRegistry;
  let approvalController: ApprovalController;
  let tempDir: string;

  beforeEach(async () => {
    sandbox = await createTestSandbox();
    approvalController = new ApprovalController({
      mode: "approve_all",
    });

    // Create temp directory for worker files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "worker-call-test-"));
    registry = new WorkerRegistry({ searchPaths: [tempDir] });
  });

  describe("needsApproval", () => {
    it("always returns true for call_worker", () => {
      const toolset = new WorkerCallToolset({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      expect(toolset.needsApproval("call_worker", { worker: "test", input: "hello" })).toBe(true);
    });

    it("returns true regardless of arguments", () => {
      const toolset = new WorkerCallToolset({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      expect(toolset.needsApproval("call_worker", {})).toBe(true);
      expect(toolset.needsApproval("call_worker", { worker: "x" })).toBe(true);
      expect(toolset.needsApproval("call_worker", { worker: "x", input: "y", instructions: "z" })).toBe(true);
    });
  });

  describe("getApprovalDescription", () => {
    it("shows worker name and input preview", () => {
      const toolset = new WorkerCallToolset({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const desc = toolset.getApprovalDescription("call_worker", {
        worker: "analyzer",
        input: "Please analyze this document",
      });

      expect(desc).toContain("analyzer");
      expect(desc).toContain("Please analyze this document");
    });

    it("truncates long inputs", () => {
      const toolset = new WorkerCallToolset({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const longInput = "A".repeat(100);
      const desc = toolset.getApprovalDescription("call_worker", {
        worker: "test",
        input: longInput,
      });

      expect(desc).toContain("...");
      expect(desc.length).toBeLessThan(longInput.length + 50);
    });

    it("includes delegation path when present", () => {
      const delegationContext: DelegationContext = {
        delegationPath: ["orchestrator", "analyzer"],
        callerModel: "anthropic:claude-haiku-4-5",
      };

      const toolset = new WorkerCallToolset({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
        delegationContext,
      });

      const desc = toolset.getApprovalDescription("call_worker", {
        worker: "formatter",
        input: "Format this",
      });

      expect(desc).toContain("orchestrator");
      expect(desc).toContain("analyzer");
      expect(desc).toContain("formatter");
    });

    it("notes when custom instructions are provided", () => {
      const toolset = new WorkerCallToolset({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const desc = toolset.getApprovalDescription("call_worker", {
        worker: "test",
        input: "test input",
        instructions: "Be extra careful",
      });

      expect(desc).toContain("custom instructions");
    });
  });

  describe("getTools", () => {
    it("returns array with call_worker tool", () => {
      const toolset = new WorkerCallToolset({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const tools = toolset.getTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("call_worker");
    });
  });

  describe("createCallWorkerTool", () => {
    it("has correct name and description", () => {
      const tool = createCallWorkerTool({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      expect(tool.name).toBe("call_worker");
      expect(tool.description).toContain("Call another worker");
    });

    it("returns error for worker not found", async () => {
      const tool = createCallWorkerTool({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const result = await tool.execute(
        { worker: "nonexistent", input: "test" },
        { toolCallId: "test-1", messages: [] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.workerName).toBe("nonexistent");
    });

    it("detects circular delegation", async () => {
      const delegationContext: DelegationContext = {
        delegationPath: ["orchestrator", "analyzer"],
        callerModel: "anthropic:claude-haiku-4-5",
      };

      const tool = createCallWorkerTool({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
        delegationContext,
      });

      // Try to call a worker that's already in the path
      const result = await tool.execute(
        { worker: "orchestrator", input: "test" },
        { toolCallId: "test-1", messages: [] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Circular delegation");
    });

    it("enforces max delegation depth", async () => {
      const delegationContext: DelegationContext = {
        delegationPath: ["a", "b", "c", "d", "e"],
        callerModel: "anthropic:claude-haiku-4-5",
      };

      const tool = createCallWorkerTool({
        registry,
        sandbox,
        approvalController,
        approvalMode: "approve_all",
        delegationContext,
        maxDelegationDepth: 5,
      });

      const result = await tool.execute(
        { worker: "f", input: "test" },
        { toolCallId: "test-1", messages: [] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum delegation depth");
    });
  });
});

describe("WorkerRegistry.getRelativeTo", () => {
  let tempDir: string;
  let registry: WorkerRegistry;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "registry-relative-test-"));
    registry = new WorkerRegistry({ searchPaths: [tempDir] });

    // Create worker files
    await fs.mkdir(path.join(tempDir, "helpers"), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, "parent.worker"),
      `---
name: parent
---
I am the parent worker.`
    );

    await fs.writeFile(
      path.join(tempDir, "helpers", "child.worker"),
      `---
name: child
---
I am the child worker.`
    );
  });

  it("resolves relative paths from caller directory", async () => {
    const callerPath = path.join(tempDir, "parent.worker");
    const result = await registry.getRelativeTo("./helpers/child.worker", callerPath);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.worker.definition.name).toBe("child");
    }
  });

  it("falls back to name lookup for non-relative paths", async () => {
    const callerPath = path.join(tempDir, "parent.worker");
    const result = await registry.getRelativeTo("parent", callerPath);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.worker.definition.name).toBe("parent");
    }
  });

  it("handles ../ in relative paths", async () => {
    const callerPath = path.join(tempDir, "helpers", "child.worker");
    const result = await registry.getRelativeTo("../parent.worker", callerPath);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.worker.definition.name).toBe("parent");
    }
  });
});
