import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  WorkerCallToolset,
  createNamedWorkerTool,
  checkToolNameConflict,
  type DelegationContext,
  _internal,
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
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Suppress console.warn for tests that use non-existent workers
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    sandbox = await createTestSandbox();
    approvalController = new ApprovalController({
      mode: "approve_all",
    });

    // Create temp directory for worker files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "worker-call-test-"));
    registry = new WorkerRegistry({ searchPaths: [tempDir] });
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe("needsApproval on tool (SDK native pattern)", () => {
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
    it("returns only named tools for allowed workers (no call_worker)", async () => {
      const toolset = await WorkerCallToolset.create({
        registry,
        allowedWorkers: ["greeter", "analyzer"],
        sandbox,
        approvalController,
        approvalMode: "approve_all",
      });

      const tools = toolset.getTools();

      // Should have only named tools: greeter, analyzer (call_worker is not exposed)
      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name).sort()).toEqual(["analyzer", "greeter"]);
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
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Suppress console.warn by default - tests that verify warnings will override
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    sandbox = await createTestSandbox();
    approvalController = new ApprovalController({
      mode: "approve_all",
    });
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "worker-call-edge-test-"));
    registry = new WorkerRegistry({ searchPaths: [tempDir] });
  });

  afterEach(() => {
    warnSpy.mockRestore();
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

describe("isBinaryMimeType", () => {
  const { isBinaryMimeType } = _internal;

  it("returns true for image types", () => {
    expect(isBinaryMimeType("image/png")).toBe(true);
    expect(isBinaryMimeType("image/jpeg")).toBe(true);
    expect(isBinaryMimeType("image/gif")).toBe(true);
    expect(isBinaryMimeType("image/webp")).toBe(true);
    expect(isBinaryMimeType("image/svg+xml")).toBe(true);
  });

  it("returns true for PDF", () => {
    expect(isBinaryMimeType("application/pdf")).toBe(true);
  });

  it("returns true for audio types", () => {
    expect(isBinaryMimeType("audio/mpeg")).toBe(true);
    expect(isBinaryMimeType("audio/wav")).toBe(true);
  });

  it("returns true for video types", () => {
    expect(isBinaryMimeType("video/mp4")).toBe(true);
    expect(isBinaryMimeType("video/webm")).toBe(true);
  });

  it("returns true for octet-stream", () => {
    expect(isBinaryMimeType("application/octet-stream")).toBe(true);
  });

  it("returns false for text types", () => {
    expect(isBinaryMimeType("text/plain")).toBe(false);
    expect(isBinaryMimeType("text/html")).toBe(false);
    expect(isBinaryMimeType("text/css")).toBe(false);
  });

  it("returns false for JSON", () => {
    expect(isBinaryMimeType("application/json")).toBe(false);
  });

  it("returns false for XML", () => {
    expect(isBinaryMimeType("application/xml")).toBe(false);
  });
});

describe("getMediaType", () => {
  const { getMediaType } = _internal;

  it("returns correct MIME type for common extensions", () => {
    expect(getMediaType("file.txt")).toBe("text/plain");
    expect(getMediaType("file.md")).toBe("text/plain");
    expect(getMediaType("file.json")).toBe("application/json");
    expect(getMediaType("file.pdf")).toBe("application/pdf");
    expect(getMediaType("file.png")).toBe("image/png");
    expect(getMediaType("file.jpg")).toBe("image/jpeg");
    expect(getMediaType("file.jpeg")).toBe("image/jpeg");
    expect(getMediaType("file.gif")).toBe("image/gif");
    expect(getMediaType("file.svg")).toBe("image/svg+xml");
  });

  it("returns octet-stream for unknown extensions", () => {
    expect(getMediaType("file.xyz")).toBe("application/octet-stream");
    expect(getMediaType("file.bin")).toBe("application/octet-stream");
    expect(getMediaType("file")).toBe("application/octet-stream");
  });

  it("handles paths with directories", () => {
    expect(getMediaType("/path/to/file.pdf")).toBe("application/pdf");
    expect(getMediaType("./relative/path/image.png")).toBe("image/png");
  });

  it("is case-insensitive for extensions", () => {
    expect(getMediaType("file.PDF")).toBe("application/pdf");
    expect(getMediaType("file.PNG")).toBe("image/png");
    expect(getMediaType("file.Json")).toBe("application/json");
  });
});

describe("readAttachments", () => {
  const { readAttachments } = _internal;
  let sandbox: Sandbox;

  beforeEach(async () => {
    sandbox = await createTestSandbox();
  });

  it("returns empty array when sandbox is undefined", async () => {
    const result = await readAttachments(undefined, ["/workspace/file.txt"]);
    expect(result).toEqual([]);
  });

  it("returns empty array when paths is undefined", async () => {
    const result = await readAttachments(sandbox, undefined);
    expect(result).toEqual([]);
  });

  it("returns empty array when paths is empty", async () => {
    const result = await readAttachments(sandbox, []);
    expect(result).toEqual([]);
  });

  it("reads text files as strings", async () => {
    await sandbox.write("/workspace/test.txt", "Hello, world!");

    const result = await readAttachments(sandbox, ["/workspace/test.txt"]);

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("text/plain");
    expect(result[0].data).toBe("Hello, world!");
  });

  it("reads JSON files as strings", async () => {
    await sandbox.write("/workspace/data.json", '{"key": "value"}');

    const result = await readAttachments(sandbox, ["/workspace/data.json"]);

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("application/json");
    expect(result[0].data).toBe('{"key": "value"}');
  });

  it("reads binary files (PDF) as Buffer", async () => {
    // Create fake PDF binary content (PDF magic bytes + some data)
    const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
    await sandbox.writeBinary("/workspace/document.pdf", pdfContent);

    const result = await readAttachments(sandbox, ["/workspace/document.pdf"]);

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("application/pdf");
    expect(Buffer.isBuffer(result[0].data)).toBe(true);
    expect(result[0].data).toEqual(Buffer.from(pdfContent));
  });

  it("reads binary files (PNG) as Buffer", async () => {
    // PNG magic bytes
    const pngContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    await sandbox.writeBinary("/workspace/image.png", pngContent);

    const result = await readAttachments(sandbox, ["/workspace/image.png"]);

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("image/png");
    expect(Buffer.isBuffer(result[0].data)).toBe(true);
    expect(result[0].data).toEqual(Buffer.from(pngContent));
  });

  it("reads multiple attachments with mixed types", async () => {
    await sandbox.write("/workspace/readme.txt", "Some text");
    const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    await sandbox.writeBinary("/workspace/doc.pdf", pdfContent);
    await sandbox.write("/workspace/config.json", '{"enabled": true}');

    const result = await readAttachments(sandbox, [
      "/workspace/readme.txt",
      "/workspace/doc.pdf",
      "/workspace/config.json",
    ]);

    expect(result).toHaveLength(3);

    // Text file
    expect(result[0].mimeType).toBe("text/plain");
    expect(result[0].data).toBe("Some text");

    // PDF file (binary)
    expect(result[1].mimeType).toBe("application/pdf");
    expect(Buffer.isBuffer(result[1].data)).toBe(true);

    // JSON file (text)
    expect(result[2].mimeType).toBe("application/json");
    expect(result[2].data).toBe('{"enabled": true}');
  });

  it("skips files that cannot be read", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await sandbox.write("/workspace/exists.txt", "I exist");

    const result = await readAttachments(sandbox, [
      "/workspace/exists.txt",
      "/workspace/nonexistent.txt",
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].data).toBe("I exist");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Could not read attachment /workspace/nonexistent.txt")
    );
    warnSpy.mockRestore();
  });

  it("preserves binary content integrity for non-ASCII bytes", async () => {
    // Create content with bytes that would be corrupted by UTF-8 encoding
    const binaryContent = new Uint8Array([
      0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD, 0x80, 0x81,
      0xC0, 0xC1, 0xD0, 0xD1, 0xE0, 0xE1, 0xF0, 0xF1
    ]);
    await sandbox.writeBinary("/workspace/binary.bin", binaryContent);

    const result = await readAttachments(sandbox, ["/workspace/binary.bin"]);

    expect(result).toHaveLength(1);
    expect(result[0].mimeType).toBe("application/octet-stream");
    expect(Buffer.isBuffer(result[0].data)).toBe(true);

    // Verify each byte is preserved
    const resultBuffer = result[0].data as Buffer;
    expect(resultBuffer.length).toBe(binaryContent.length);
    for (let i = 0; i < binaryContent.length; i++) {
      expect(resultBuffer[i]).toBe(binaryContent[i]);
    }
  });
});
