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
  return {
    getEffectiveConfig: mockGetEffectiveConfig,
    __mockGetEffectiveConfig: mockGetEffectiveConfig,
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

    it("should pass trust level option", async () => {
      await runCLI([
        "node",
        "cli",
        workerDir,
        "--trust",
        "workspace",
        "--input",
        "test",
      ]);

      expect(getEffectiveConfig).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ trustLevel: "workspace" })
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

      await runCLI(["node", "cli", workerDir, "--input", "test"]);

      expect(consoleLogSpy).toHaveBeenCalledWith("Hello from worker");
    });

    it("should output verbose stats when --verbose flag is set", async () => {
      mockRun.mockResolvedValue({
        success: true,
        response: "Response",
        toolCallCount: 3,
        tokens: { input: 100, output: 50 },
        cost: 0.0123,
      });

      await runCLI(["node", "cli", workerDir, "--verbose", "--input", "test"]);

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
        runCLI(["node", "cli", workerDir, "--input", "test"])
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
              type: "image",
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

    it("should reject unsupported attachment types", async () => {
      const notesPath = path.join(workerDir, "notes.txt");
      await fs.writeFile(notesPath, "notes");

      await expect(
        runCLI([
          "node",
          "cli",
          workerDir,
          "--input",
          "describe",
          "--attach",
          "notes.txt",
        ])
      ).rejects.toThrow("process.exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unsupported attachment type")
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
          model: "anthropic:claude-haiku-4-5",
          approvalMode: "approve_all",
          trustLevel: "workspace",
        })
      );
    });
  });

  describe("option validation", () => {
    it("should reject invalid trust level", async () => {
      await expect(
        runCLI(["node", "cli", workerDir, "--trust", "invalid", "--input", "test"])
      ).rejects.toThrow("Invalid trust level: invalid");
    });

    it("should reject invalid approval mode", async () => {
      await expect(
        runCLI(["node", "cli", workerDir, "--approval", "invalid", "--input", "test"])
      ).rejects.toThrow("Invalid approval mode: invalid");
    });

    it("should accept valid trust levels", async () => {
      const validLevels = ["untrusted", "session", "workspace", "full"];

      for (const level of validLevels) {
        vi.clearAllMocks();
        mockRun.mockResolvedValue({
          success: true,
          response: "OK",
          toolCallCount: 0,
        });
        mockCreateWorkerRuntime.mockResolvedValue({ run: mockRun });

        await runCLI(["node", "cli", workerDir, "--trust", level, "--input", "test"]);

        expect(getEffectiveConfig).toHaveBeenCalledWith(
          undefined,
          expect.objectContaining({ trustLevel: level })
        );
      }
    });

    it("should accept valid approval modes", async () => {
      const validModes = ["interactive", "approve_all", "strict"];

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
});
