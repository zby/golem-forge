import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  WorkerCallToolset,
  createCallWorkerTool,
  createNamedWorkerTool,
  checkToolNameConflict,
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
    it("call_worker tool has needsApproval=true", async () => {
      const toolset = await WorkerCallToolset.create({
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

    it("named worker tools have needsApproval=true", async () => {
      const toolset = await WorkerCallToolset.create({
        registry,
        allowedWorkers: ["greeter"],
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const tools = toolset.getTools();
      const greeterTool = tools.find(t => t.name === "greeter");
      expect(greeterTool?.needsApproval).toBe(true);
    });
  });

  describe("getTools", () => {
    it("returns named tools for each allowed worker plus call_worker fallback", async () => {
      const toolset = await WorkerCallToolset.create({
        registry,
        allowedWorkers: ["greeter", "analyzer"],
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const tools = toolset.getTools();

      // Should have: greeter, analyzer, call_worker
      expect(tools).toHaveLength(3);
      expect(tools.map(t => t.name).sort()).toEqual(["analyzer", "call_worker", "greeter"]);
    });

    it("createSync only returns call_worker (legacy behavior)", () => {
      const toolset = WorkerCallToolset.createSync({
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

  describe("createNamedWorkerTool", () => {
    it("creates tool with worker name as tool name", () => {
      const tool = createNamedWorkerTool({
        registry,
        workerName: "greeter",
        workerDescription: "A friendly greeter",
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      expect(tool.name).toBe("greeter");
      expect(tool.description).toBe("A friendly greeter");
      expect(tool.needsApproval).toBe(true);
    });

    it("uses default description when not provided", () => {
      const tool = createNamedWorkerTool({
        registry,
        workerName: "analyzer",
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      expect(tool.name).toBe("analyzer");
      expect(tool.description).toContain("analyzer");
      expect(tool.description).toContain("Delegate");
    });

    it("detects circular delegation", async () => {
      const delegationContext: DelegationContext = {
        delegationPath: ["orchestrator", "analyzer"],
      };

      const tool = createNamedWorkerTool({
        registry,
        workerName: "orchestrator",
        sandbox,
        approvalController,
        approvalMode: "approve_all",
        delegationContext,
      });

      const result = await tool.execute(
        { input: "test" },
        { toolCallId: "test-1", messages: [] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Circular delegation");
    });

    it("enforces max delegation depth", async () => {
      const delegationContext: DelegationContext = {
        delegationPath: ["a", "b", "c", "d", "e"],
      };

      const tool = createNamedWorkerTool({
        registry,
        workerName: "f",
        sandbox,
        approvalController,
        approvalMode: "approve_all",
        delegationContext,
        maxDelegationDepth: 5,
      });

      const result = await tool.execute(
        { input: "test" },
        { toolCallId: "test-1", messages: [] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum delegation depth");
    });

    it("returns error for worker not found in registry", async () => {
      const tool = createNamedWorkerTool({
        registry,
        workerName: "nonexistent",
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const result = await tool.execute(
        { input: "test" },
        { toolCallId: "test-1", messages: [] }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.workerName).toBe("nonexistent");
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

describe("checkToolNameConflict", () => {
  it("returns true for reserved tool names", () => {
    expect(checkToolNameConflict("read_file")).toBe(true);
    expect(checkToolNameConflict("write_file")).toBe(true);
    expect(checkToolNameConflict("list_files")).toBe(true);
    expect(checkToolNameConflict("call_worker")).toBe(true);
    expect(checkToolNameConflict("bash")).toBe(true);
  });

  it("returns false for non-reserved names", () => {
    expect(checkToolNameConflict("greeter")).toBe(false);
    expect(checkToolNameConflict("analyzer")).toBe(false);
    expect(checkToolNameConflict("my_custom_worker")).toBe(false);
  });
});

describe("WorkerCallToolset.create edge cases", () => {
  let sandbox: Sandbox;
  let registry: WorkerRegistry;
  let approvalController: ApprovalController;
  let tempDir: string;

  beforeEach(async () => {
    sandbox = await createTestSandbox();
    approvalController = new ApprovalController({
      mode: "approve_all",
    });
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "worker-call-edge-test-"));
    registry = new WorkerRegistry({ searchPaths: [tempDir] });
  });

  it("logs warning for tool name conflicts with reserved names", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await WorkerCallToolset.create({
      registry,
      allowedWorkers: ["read_file"], // conflicts with reserved name
      sandbox,
      approvalController,
      approvalMode: "approve_all",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("conflicts with reserved tool name")
    );
    warnSpy.mockRestore();
  });

  it("logs warning when worker not found in registry at init time", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await WorkerCallToolset.create({
      registry,
      allowedWorkers: ["nonexistent_worker"],
      sandbox,
      approvalController,
      approvalMode: "approve_all",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("not found in registry at init time")
    );
    warnSpy.mockRestore();
  });

  it("still creates tool even when worker not found (lazy creation support)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const toolset = await WorkerCallToolset.create({
      registry,
      allowedWorkers: ["lazy_worker"],
      sandbox,
      approvalController,
      approvalMode: "approve_all",
    });

    const tools = toolset.getTools();
    const lazyWorkerTool = tools.find(t => t.name === "lazy_worker");
    expect(lazyWorkerTool).toBeDefined();
    expect(lazyWorkerTool?.needsApproval).toBe(true);
  });

  it("uses worker description from registry when available", async () => {
    // Create a worker file with a description
    await fs.writeFile(
      path.join(tempDir, "described.worker"),
      `---
name: described
description: A worker with a custom description
---
I am a described worker.`
    );

    const toolset = await WorkerCallToolset.create({
      registry,
      allowedWorkers: ["described"],
      sandbox,
      approvalController,
      approvalMode: "approve_all",
    });

    const tools = toolset.getTools();
    const describedTool = tools.find(t => t.name === "described");
    expect(describedTool?.description).toBe("A worker with a custom description");
  });

  it("handles duplicate worker names in allowedWorkers", async () => {
    const toolset = await WorkerCallToolset.create({
      registry,
      allowedWorkers: ["greeter", "greeter", "analyzer"],
      sandbox,
      approvalController,
      approvalMode: "approve_all",
    });

    const tools = toolset.getTools();
    // Should have: greeter (twice), analyzer, call_worker = 4 tools
    // This documents current behavior - duplicates are allowed
    expect(tools.filter(t => t.name === "greeter")).toHaveLength(2);
  });
});
