/**
 * Tests for CLI Entry Point
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

// Mock modules - factories must not reference external variables
vi.mock("../worker/index.js", () => {
  const mockGet = vi.fn();
  const mockAddSearchPath = vi.fn();
  return {
    WorkerRegistry: vi.fn().mockImplementation(() => ({
      get: mockGet,
      addSearchPath: mockAddSearchPath,
    })),
    __mockGet: mockGet,
    __mockAddSearchPath: mockAddSearchPath,
  };
});

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
  const mockFindProjectRoot = vi.fn().mockResolvedValue(null);
  const mockGetEffectiveConfig = vi.fn().mockReturnValue({
    trustLevel: "session",
    approvalMode: "interactive",
    workerPaths: ["workers"],
  });
  const mockResolveWorkerPaths = vi.fn().mockImplementation((root: string, paths: string[]) =>
    paths.map((p: string) => path.join(root, p))
  );
  return {
    findProjectRoot: mockFindProjectRoot,
    getEffectiveConfig: mockGetEffectiveConfig,
    resolveWorkerPaths: mockResolveWorkerPaths,
    __mockFindProjectRoot: mockFindProjectRoot,
    __mockGetEffectiveConfig: mockGetEffectiveConfig,
  };
});

// Import after mocks
import { runCLI } from "./run.js";
import { findProjectRoot, getEffectiveConfig } from "./project.js";
import * as workerModule from "../worker/index.js";
import * as runtimeModule from "../runtime/index.js";

// Get mock references
const mockGet = (workerModule as unknown as { __mockGet: ReturnType<typeof vi.fn> }).__mockGet;
const mockAddSearchPath = (workerModule as unknown as { __mockAddSearchPath: ReturnType<typeof vi.fn> }).__mockAddSearchPath;
const mockRun = (runtimeModule as unknown as { __mockRun: ReturnType<typeof vi.fn> }).__mockRun;
const mockCreateWorkerRuntime = (runtimeModule as unknown as { __mockCreateWorkerRuntime: ReturnType<typeof vi.fn> }).__mockCreateWorkerRuntime;

describe("runCLI", () => {
  let tempDir: string;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-run-test-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);

    vi.clearAllMocks();

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    // Default mock for successful worker lookup
    mockGet.mockResolvedValue({
      found: true,
      worker: {
        filePath: "/test/worker.worker",
        definition: {
          name: "test-worker",
          instructions: "Test instructions",
        },
        mtime: Date.now(),
      },
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
    process.chdir(originalCwd);
    await fs.rm(tempDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("argument parsing", () => {
    it("should parse worker name and input from positional args", async () => {
      await runCLI(["node", "cli", "my-worker", "hello", "world"]);

      expect(mockGet).toHaveBeenCalledWith("my-worker");
      expect(mockRun).toHaveBeenCalledWith("hello world");
    });

    it("should parse input from --input flag", async () => {
      await runCLI(["node", "cli", "my-worker", "--input", "test input"]);

      expect(mockRun).toHaveBeenCalledWith("test input");
    });

    it("should parse input from --file flag", async () => {
      const inputFile = path.join(tempDir, "input.txt");
      await fs.writeFile(inputFile, "file content here");

      await runCLI(["node", "cli", "my-worker", "--file", inputFile]);

      expect(mockRun).toHaveBeenCalledWith("file content here");
    });

    it("should pass model option to runtime", async () => {
      await runCLI([
        "node",
        "cli",
        "my-worker",
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
        "my-worker",
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
        "my-worker",
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

  describe("worker lookup", () => {
    it("should look up worker by name", async () => {
      await runCLI(["node", "cli", "my-worker", "--input", "test"]);

      expect(mockGet).toHaveBeenCalledWith("my-worker");
    });

    it("should look up worker by file path", async () => {
      await runCLI(["node", "cli", "/path/to/worker.worker", "--input", "test"]);

      expect(mockGet).toHaveBeenCalledWith("/path/to/worker.worker");
    });

    it("should exit with error when worker not found", async () => {
      mockGet.mockResolvedValue({
        found: false,
        error: "Worker 'unknown' not found",
      });

      await expect(
        runCLI(["node", "cli", "unknown", "--input", "test"])
      ).rejects.toThrow("process.exit called");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Worker 'unknown' not found")
      );
    });
  });

  describe("project detection", () => {
    it("should use project root from --project flag", async () => {
      const projectDir = path.join(tempDir, "my-project");
      await fs.mkdir(projectDir);

      await runCLI([
        "node",
        "cli",
        "my-worker",
        "--project",
        projectDir,
        "--input",
        "test",
      ]);

      expect(findProjectRoot).toHaveBeenCalledWith(projectDir);
    });

    it("should detect project root automatically", async () => {
      vi.mocked(findProjectRoot).mockResolvedValue({
        root: "/detected/project",
        detectedBy: ".golem-forge.json",
        config: { model: "test:model" },
      });

      await runCLI(["node", "cli", "my-worker", "--input", "test"]);

      expect(findProjectRoot).toHaveBeenCalled();
      expect(getEffectiveConfig).toHaveBeenCalledWith(
        { model: "test:model" },
        expect.anything()
      );
    });

    it("should add worker paths to registry", async () => {
      await runCLI(["node", "cli", "my-worker", "--input", "test"]);

      expect(mockAddSearchPath).toHaveBeenCalled();
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

      await runCLI(["node", "cli", "my-worker", "--input", "test"]);

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

      await runCLI(["node", "cli", "my-worker", "--verbose", "--input", "test"]);

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
        runCLI(["node", "cli", "my-worker", "--input", "test"])
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
        "my-worker",
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
        "my-worker",
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
          runCLI(["node", "cli", "my-worker"])
        ).rejects.toThrow("process.exit called");

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("No input provided")
        );
      } finally {
        Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, writable: true });
      }
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

      await runCLI(["node", "cli", "my-worker", "--input", "test"]);

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
        runCLI(["node", "cli", "my-worker", "--trust", "invalid", "--input", "test"])
      ).rejects.toThrow("Invalid trust level: invalid");
    });

    it("should reject invalid approval mode", async () => {
      await expect(
        runCLI(["node", "cli", "my-worker", "--approval", "invalid", "--input", "test"])
      ).rejects.toThrow("Invalid approval mode: invalid");
    });

    it("should accept valid trust levels", async () => {
      const validLevels = ["untrusted", "session", "workspace", "full"];

      for (const level of validLevels) {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({
          found: true,
          worker: {
            filePath: "/test/worker.worker",
            definition: { name: "test-worker", instructions: "Test" },
            mtime: Date.now(),
          },
        });
        mockRun.mockResolvedValue({
          success: true,
          response: "OK",
          toolCallCount: 0,
        });
        mockCreateWorkerRuntime.mockResolvedValue({ run: mockRun });

        await runCLI(["node", "cli", "my-worker", "--trust", level, "--input", "test"]);

        expect(getEffectiveConfig).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ trustLevel: level })
        );
      }
    });

    it("should accept valid approval modes", async () => {
      const validModes = ["interactive", "approve_all", "strict"];

      for (const mode of validModes) {
        vi.clearAllMocks();
        mockGet.mockResolvedValue({
          found: true,
          worker: {
            filePath: "/test/worker.worker",
            definition: { name: "test-worker", instructions: "Test" },
            mtime: Date.now(),
          },
        });
        mockRun.mockResolvedValue({
          success: true,
          response: "OK",
          toolCallCount: 0,
        });
        mockCreateWorkerRuntime.mockResolvedValue({ run: mockRun });

        await runCLI(["node", "cli", "my-worker", "--approval", mode, "--input", "test"]);

        expect(getEffectiveConfig).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ approvalMode: mode })
        );
      }
    });
  });
});
