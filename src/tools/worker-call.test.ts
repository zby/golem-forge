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

  describe("needsApproval on tool (SDK native pattern)", () => {
    it("call_worker tool has needsApproval=true", () => {
      const toolset = new WorkerCallToolset({
        registry,
        allowedWorkers: ["test"],
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const tools = toolset.getTools();
      const callWorkerTool = tools.find(t => t.name === "call_worker");
      expect(callWorkerTool?.needsApproval).toBe(true);
    });
  });

  describe("getTools", () => {
    it("returns array with call_worker tool", () => {
      const toolset = new WorkerCallToolset({
        registry,
        allowedWorkers: ["test"],
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
    it("has correct name and description with allowed workers", () => {
      const tool = createCallWorkerTool({
        registry,
        allowedWorkers: ["greeter", "analyzer"],
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      expect(tool.name).toBe("call_worker");
      expect(tool.description).toContain("Call another worker");
      expect(tool.description).toContain("greeter");
      expect(tool.description).toContain("analyzer");
    });

    it("returns error for worker not in allowed list", async () => {
      const tool = createCallWorkerTool({
        registry,
        allowedWorkers: ["allowed-worker"],
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const result = await tool.execute(
        { worker: "not-allowed", input: "test" },
        { toolCallId: "test-1", messages: [] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not in the allowed workers list");
      expect(result.error).toContain("allowed-worker");
      expect(result.workerName).toBe("not-allowed");
    });

    it("returns error for worker not found in registry", async () => {
      const tool = createCallWorkerTool({
        registry,
        allowedWorkers: ["nonexistent"],
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
        allowedWorkers: ["orchestrator"],
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
        allowedWorkers: ["f"],
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
