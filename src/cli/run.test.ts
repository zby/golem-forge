/**
 * Tests for CLI Entry Point
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Mock modules
vi.mock("../runtime/index.js", () => {
  const mockRun = vi.fn();
  const mockCreateWorkerRuntime = vi.fn().mockResolvedValue({
    run: mockRun,
  });
  return {
    createWorkerRuntime: mockCreateWorkerRuntime,
    __mockRun: mockRun,
    __mockCreateWorkerRuntime: mockCreateWorkerRuntime,
  };
});

vi.mock("./approval.js", () => ({
  createCLIApprovalCallback: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("./project.js", () => {
  const mockGetEffectiveConfig = vi.fn().mockReturnValue({
    model: "anthropic:claude-haiku-4-5",
    trustLevel: "session",
    approvalMode: "interactive",
    workerPaths: ["workers"],
  });
  const mockFindProjectRoot = vi.fn().mockResolvedValue(null);
  const mockResolveSandboxConfig = vi.fn().mockImplementation((projectRoot, config) => ({
    mode: config?.mode ?? "sandboxed",
    root: projectRoot,
    zones: new Map(Object.entries(config?.zones ?? {}).map(([name, zone]) => [
      name,
      { name, absolutePath: `${projectRoot}/${(zone as { path: string }).path}`, relativePath: (zone as { path: string }).path, mode: (zone as { mode: string }).mode },
    ])),
  }));
  return {
    getEffectiveConfig: mockGetEffectiveConfig,
    findProjectRoot: mockFindProjectRoot,
    resolveSandboxConfig: mockResolveSandboxConfig,
    __mockGetEffectiveConfig: mockGetEffectiveConfig,
    __mockFindProjectRoot: mockFindProjectRoot,
  };
});

// Import after mocks
import { runCLI } from "./run.js";
import { getEffectiveConfig } from "./project.js";
import * as runtimeModule from "../runtime/index.js";

// Get mock references
const mockRun = (runtimeModule as unknown as { __mockRun: ReturnType<typeof vi.fn> }).__mockRun;
const mockCreateWorkerRuntime = (runtimeModule as unknown as { __mockCreateWorkerRuntime: ReturnType<typeof vi.fn> }).__mockCreateWorkerRuntime;

describe("runCLI", () => {
  let tempDir: string;
  let workerDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  const workerContent = `---
name: test-worker
---
Test instructions
`;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-run-test-"));
    workerDir = path.join(tempDir, "test-worker");
    await fs.mkdir(workerDir);
    await fs.writeFile(path.join(workerDir, "index.worker"), workerContent);

    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    vi.clearAllMocks();

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    // Default mock for successful run
    mockRun.mockResolvedValue({
      success: true,
      response: "Test response",
      toolCallCount: 0,
      tokens: { input: 10, output: 20 },
      cost: 0.001,
    });

    // Reset runtime mock
    mockCreateWorkerRuntime.mockResolvedValue({
      run: mockRun,
    });
  });

  afterEach(async () => {
    cwdSpy?.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("argument parsing", () => {
    it("should run worker from directory with index.worker", async () => {
      await runCLI(["node", "cli", workerDir, "--input", "hello"]);

      expect(mockRun).toHaveBeenCalledWith("hello");
    });

    it("should use current directory as default", async () => {
      // Create index.worker in temp dir
      await fs.writeFile(path.join(tempDir, "index.worker"), workerContent);

      await runCLI(["node", "cli", "--input", "test input"]);

      expect(mockRun).toHaveBeenCalledWith("test input");
    });

    it("should parse input from positional args after directory", async () => {
      await runCLI(["node", "cli", workerDir, "hello", "world"]);

      expect(mockRun).toHaveBeenCalledWith("hello world");
    });

    it("should parse input from --input flag", async () => {
      await runCLI(["node", "cli", workerDir, "--input", "test input"]);

      expect(mockRun).toHaveBeenCalledWith("test input");
    });

    it("should parse input from --file flag", async () => {
      const inputFile = path.join(tempDir, "input.txt");
      await fs.writeFile(inputFile, "file content here");

      await runCLI(["node", "cli", workerDir, "--file", inputFile]);

      expect(mockRun).toHaveBeenCalledWith("file content here");
    });

    it("should pass model option to runtime", async () => {
      await runCLI([
        "node",
        "cli",
        workerDir,
        "--model",
        "openai:gpt-4o-mini",
        "--input",
        "test",
      ]);

      expect(getEffectiveConfig).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ model: "openai:gpt-4o-mini" })
      );
    });

    it("should pass approval mode option", async () => {
      await runCLI([
        "node",
        "cli",
        workerDir,
        "--approval",
        "approve_all",
        "--input",
        "test",
      ]);

      expect(getEffectiveConfig).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ approvalMode: "approve_all" })
      );
    });
  });

  describe("worker directory handling", () => {
    it("should find index.worker in specified directory", async () => {
      await runCLI(["node", "cli", workerDir, "--input", "test"]);

      expect(mockCreateWorkerRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          worker: expect.objectContaining({ name: "test-worker" }),
          projectRoot: workerDir,
        })
      );
    });

    it("should exit with error when directory has no index.worker", async () => {
      const emptyDir = path.join(tempDir, "empty");
      await fs.mkdir(emptyDir);

      await expect(
        runCLI(["node", "cli", emptyDir, "--input", "test"])
      ).rejects.toThrow("process.exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("No index.worker file found")
      );
    });

    it("should exit with error when directory does not exist", async () => {
      await expect(
        runCLI(["node", "cli", "/nonexistent/path", "--input", "test"])
      ).rejects.toThrow("process.exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("No index.worker file found")
      );
    });
  });

  describe("worker execution", () => {
    it("should output successful response", async () => {
      mockRun.mockResolvedValue({
        success: true,
        response: "Hello from worker",
        toolCallCount: 2,
        tokens: { input: 100, output: 50 },
        cost: 0.005,
      });

      await runCLI(["node", "cli", workerDir, "--trace", "quiet", "--input", "test"]);

      expect(consoleLogSpy).toHaveBeenCalledWith("Hello from worker");
    });

    it("should output stats at summary trace level", async () => {
      mockRun.mockResolvedValue({
        success: true,
        response: "Response",
        toolCallCount: 3,
        tokens: { input: 100, output: 50 },
        cost: 0.0123,
      });

      await runCLI(["node", "cli", workerDir, "--trace", "summary", "--input", "test"]);

      expect(consoleLogSpy).toHaveBeenCalledWith("Response");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Tool calls: 3"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Tokens: 100 in / 50 out"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Cost: $0.012300"));
    });

    it("should exit with error on worker failure", async () => {
      mockRun.mockResolvedValue({
        success: false,
        error: "Worker execution failed",
        toolCallCount: 1,
      });

      await expect(
        runCLI(["node", "cli", workerDir, "--trace", "quiet", "--input", "test"])
      ).rejects.toThrow("process.exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Worker failed: Worker execution failed")
      );
    });
  });

  describe("input handling", () => {
    it("should prefer --input over positional args", async () => {
      await runCLI([
        "node",
        "cli",
        workerDir,
        "positional",
        "args",
        "--input",
        "flag input",
      ]);

      expect(mockRun).toHaveBeenCalledWith("flag input");
    });

    it("should prefer --file over positional args", async () => {
      const inputFile = path.join(tempDir, "input.txt");
      await fs.writeFile(inputFile, "from file");

      await runCLI([
        "node",
        "cli",
        workerDir,
        "positional",
        "--file",
        inputFile,
      ]);

      expect(mockRun).toHaveBeenCalledWith("from file");
    });

    it("should error when no input provided in TTY mode", async () => {
      // Save original isTTY
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: true, writable: true });

      try {
        await expect(
          runCLI(["node", "cli", workerDir])
        ).rejects.toThrow("process.exit called");

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("No input provided")
        );
      } finally {
        Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, writable: true });
      }
    });

    it("should allow running sandbox-only workers without input (worker-defined zones)", async () => {
      // Create a worker with sandbox zones
      const sandboxWorker = `---
name: sandbox-processor
sandbox:
  zones:
    - name: workspace
      mode: rw
---
Process files in the workspace zone.
`;
      await fs.writeFile(path.join(workerDir, "index.worker"), sandboxWorker);

      // Save original isTTY
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: true, writable: true });

      try {
        await runCLI(["node", "cli", workerDir]);

        // Should use the sandbox-only default message
        expect(mockRun).toHaveBeenCalledWith(
          "Please proceed with your task using the sandbox contents."
        );
      } finally {
        Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, writable: true });
      }
    });

    it("should allow running sandbox-only workers without input (project-config zones)", async () => {
      // Worker without sandbox zones
      const plainWorker = `---
name: plain-worker
---
Process files.
`;
      await fs.writeFile(path.join(workerDir, "index.worker"), plainWorker);

      // Mock project config with sandbox zones
      vi.mocked(getEffectiveConfig).mockReturnValueOnce({
        model: "anthropic:claude-haiku-4-5",
        trustLevel: "session",
        approvalMode: "interactive",
        workerPaths: ["workers"],
        sandbox: {
          mode: "sandboxed",
          root: "sandbox",
          zones: {
            workspace: { path: "./workspace", mode: "rw" },
          },
        },
      });

      // Save original isTTY
      const originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: true, writable: true });

      try {
        await runCLI(["node", "cli", workerDir]);

        // Should use the sandbox-only default message
        expect(mockRun).toHaveBeenCalledWith(
          "Please proceed with your task using the sandbox contents."
        );
      } finally {
        Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, writable: true });
      }
    });
  });

  describe("attachments", () => {
    it("should pass attachments to the runtime when --attach is provided", async () => {
      const assetsDir = path.join(workerDir, "assets");
      await fs.mkdir(assetsDir);
      const attachmentPath = path.join(assetsDir, "photo.png");
      const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      await fs.writeFile(attachmentPath, pngData);

      await runCLI([
        "node",
        "cli",
        workerDir,
        "--input",
        "describe image",
        "--attach",
        "assets/photo.png",
      ]);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "describe image",
          attachments: [
            expect.objectContaining({
              name: "photo.png",
              mimeType: "image/png",
            }),
          ],
        })
      );

      const runArg = mockRun.mock.calls[0][0] as {
        attachments: Array<{ data: Buffer }>;
      };
      expect(Buffer.isBuffer(runArg.attachments[0].data)).toBe(true);
      expect(runArg.attachments[0].data.equals(pngData)).toBe(true);
    });

    it("should resolve attachments from the current working directory when outside the worker", async () => {
      const sharedPath = path.join(tempDir, "shared.png");
      await fs.writeFile(sharedPath, Buffer.from([0x89]));

      await runCLI([
        "node",
        "cli",
        workerDir,
        "--input",
        "describe",
        "--attach",
        "shared.png",
      ]);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [expect.objectContaining({ name: "shared.png" })],
        })
      );
    });

    it("should enforce attachment policy constraints", async () => {
      const policyWorker = `---
name: policy-worker
attachment_policy:
  max_attachments: 1
  max_total_bytes: 10
  allowed_suffixes:
    - .png
---
Policy instructions
`;
      await fs.writeFile(path.join(workerDir, "index.worker"), policyWorker);

      const assetsDir = path.join(workerDir, "assets");
      await fs.mkdir(assetsDir);
      await fs.writeFile(path.join(assetsDir, "one.png"), Buffer.from([0x89]));
      await fs.writeFile(path.join(assetsDir, "two.png"), Buffer.from([0x89]));

      await expect(
        runCLI([
          "node",
          "cli",
          workerDir,
          "--input",
          "describe",
          "--attach",
          "assets/one.png",
          "--attach",
          "assets/two.png",
        ])
      ).rejects.toThrow("process.exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Attachment policy violation")
      );
    });

    it("should allow attaching arbitrary file types and preserve mime type hints", async () => {
      const docPath = path.join(workerDir, "spec.pdf");
      await fs.writeFile(docPath, "fake pdf content");

      await runCLI([
        "node",
        "cli",
        workerDir,
        "--input",
        "analyze",
        "--attach",
        "spec.pdf",
      ]);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              name: "spec.pdf",
              mimeType: "application/pdf",
            }),
          ],
        })
      );
    });

    it("should enforce allowed suffix restrictions from attachment policy", async () => {
      const restrictedWorker = `---
name: restricted-worker
attachment_policy:
  allowed_suffixes:
    - .png
---
Instructions
`;
      await fs.writeFile(path.join(workerDir, "index.worker"), restrictedWorker);
      await fs.writeFile(path.join(workerDir, "notes.pdf"), "content");

      await expect(
        runCLI([
          "node",
          "cli",
          workerDir,
          "--input",
          "test",
          "--attach",
          "notes.pdf",
        ])
      ).rejects.toThrow("process.exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Attachment policy violation")
      );
    });
  });

  describe("runtime creation", () => {
    it("should pass correct options to createWorkerRuntime", async () => {
      vi.mocked(getEffectiveConfig).mockReturnValue({
        model: "anthropic:claude-haiku-4-5",
        trustLevel: "workspace",
        approvalMode: "approve_all",
        workerPaths: ["workers"],
      });

      await runCLI(["node", "cli", workerDir, "--input", "test"]);

      expect(mockCreateWorkerRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          worker: expect.objectContaining({ name: "test-worker" }),
          model: "anthropic:claude-haiku-4-5",  // resolved from project config
          approvalMode: "approve_all",
        })
      );
    });
  });

  describe("option validation", () => {
    it("should reject invalid approval mode", async () => {
      await expect(
        runCLI(["node", "cli", workerDir, "--approval", "invalid", "--input", "test"])
      ).rejects.toThrow("Invalid approval mode: invalid");
    });

    it("should accept valid approval modes", async () => {
      const validModes = ["interactive", "approve_all", "auto_deny"];

      for (const mode of validModes) {
        vi.clearAllMocks();
        mockRun.mockResolvedValue({
          success: true,
          response: "OK",
          toolCallCount: 0,
        });
        mockCreateWorkerRuntime.mockResolvedValue({ run: mockRun });

        await runCLI(["node", "cli", workerDir, "--approval", mode, "--input", "test"]);

        expect(getEffectiveConfig).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ approvalMode: mode })
        );
      }
    });
  });

  describe("auto-detection of file attachments", () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      // Mock stdin.isTTY to prevent waiting on stdin in tests
      originalIsTTY = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: true, writable: true });
    });

    afterEach(() => {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, writable: true });
    });

    it("should auto-detect PDF files as attachments", async () => {
      const pdfPath = path.join(workerDir, "report.pdf");
      await fs.writeFile(pdfPath, "fake pdf content");

      await runCLI(["node", "cli", workerDir, "report.pdf"]);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Please process the attached file(s).",
          attachments: [
            expect.objectContaining({
              name: "report.pdf",
              mimeType: "application/pdf",
            }),
          ],
        })
      );
    });

    it("should auto-detect image files as attachments", async () => {
      const imgPath = path.join(workerDir, "photo.png");
      await fs.writeFile(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      await runCLI(["node", "cli", workerDir, "photo.png"]);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            expect.objectContaining({
              name: "photo.png",
              mimeType: "image/png",
            }),
          ],
        })
      );
    });

    it("should combine auto-detected files with text input", async () => {
      const pdfPath = path.join(workerDir, "doc.pdf");
      await fs.writeFile(pdfPath, "fake pdf");

      await runCLI(["node", "cli", workerDir, "doc.pdf", "Summarize this"]);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Summarize this",
          attachments: [expect.objectContaining({ name: "doc.pdf" })],
        })
      );
    });

    it("should handle multiple auto-detected files", async () => {
      await fs.writeFile(path.join(workerDir, "a.pdf"), "pdf a");
      await fs.writeFile(path.join(workerDir, "b.png"), Buffer.from([0x89]));

      await runCLI(["node", "cli", workerDir, "a.pdf", "b.png", "analyze these"]);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "analyze these",
          attachments: [
            expect.objectContaining({ name: "a.pdf" }),
            expect.objectContaining({ name: "b.png" }),
          ],
        })
      );
    });

    it("should combine explicit --attach with auto-detected files", async () => {
      await fs.writeFile(path.join(workerDir, "auto.pdf"), "auto");
      await fs.writeFile(path.join(workerDir, "explicit.png"), Buffer.from([0x89]));

      await runCLI([
        "node", "cli", workerDir,
        "--attach", "explicit.png",
        "auto.pdf", "describe"
      ]);

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "describe",
          attachments: [
            expect.objectContaining({ name: "explicit.png" }),
            expect.objectContaining({ name: "auto.pdf" }),
          ],
        })
      );
    });

    it("should treat non-existent files with attachment extensions as text", async () => {
      // nonexistent.pdf doesn't exist, so it should be treated as text
      await runCLI(["node", "cli", workerDir, "--input", "test", "nonexistent.pdf"]);

      // The "nonexistent.pdf" becomes part of text input since file doesn't exist
      expect(mockRun).toHaveBeenCalledWith("test");
    });

    it("should not auto-detect .txt or .md files as attachments", async () => {
      await fs.writeFile(path.join(workerDir, "notes.txt"), "some notes");
      await fs.writeFile(path.join(workerDir, "readme.md"), "# README");

      await runCLI(["node", "cli", workerDir, "notes.txt", "readme.md"]);

      // These should be treated as text, not attachments
      expect(mockRun).toHaveBeenCalledWith("notes.txt readme.md");
    });
  });
});
