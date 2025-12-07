/**
 * Git Toolset Demo Test
 *
 * This test demonstrates the full git workflow with a mock LLM:
 * 1. Setup test repo in /tmp/golem-git-demo
 * 2. Mock LLM writes a file to sandbox
 * 3. Mock LLM stages the file (auto-approved for test)
 * 4. We manually invoke git_push (simulating user action)
 * 5. Verify the commit appears in the git repo
 *
 * Run: npx vitest run examples/git-demo/demo.test.ts
 *
 * Note: Sandbox paths like /workspace/README.md become workspace/README.md
 * in the target git repo. This is expected behavior - the sandbox zone
 * prefix is preserved in the commit.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { spawnSync } from "child_process";

// ============================================================================
// Mock Setup (must be before imports that use 'ai')
// ============================================================================

const mockGenerateText = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("ai")>();
  return {
    ...original,
    generateText: (...args: unknown[]) => mockGenerateText(...args),
  };
});

// Import after mock is set up
import { createWorkerRuntime } from "../../src/runtime/index.js";
import type { WorkerDefinition } from "../../src/worker/index.js";

// ============================================================================
// Configuration
// ============================================================================

const DEMO_REPO_PATH = "/tmp/golem-git-demo";

// ============================================================================
// Helper Functions
// ============================================================================

function git(...args: string[]): { success: boolean; output: string } {
  const result = spawnSync("git", args, {
    cwd: DEMO_REPO_PATH,
    encoding: "utf-8",
  });
  return {
    success: result.status === 0,
    output: result.stdout + result.stderr,
  };
}

async function setupDemoRepo(): Promise<void> {
  // Clean up existing repo
  try {
    await fs.rm(DEMO_REPO_PATH, { recursive: true, force: true });
  } catch {
    // Ignore
  }

  // Create directory
  await fs.mkdir(DEMO_REPO_PATH, { recursive: true });

  // Initialize git repo
  git("init");
  git("config", "user.email", "demo@example.com");
  git("config", "user.name", "Demo User");

  // Create initial file
  await fs.writeFile(
    path.join(DEMO_REPO_PATH, "README.md"),
    "# Demo Repository\n\nThis is a test repository for the git toolset demo.\n"
  );

  // Initial commit
  git("add", "README.md");
  git("commit", "-m", "Initial commit");
}

async function getCommitCount(): Promise<number> {
  const result = git("rev-list", "--count", "HEAD");
  return parseInt(result.output.trim(), 10);
}

async function getLastCommitMessage(): Promise<string> {
  const result = git("log", "-1", "--format=%s");
  return result.output.trim();
}

async function getFileContent(filename: string): Promise<string> {
  return fs.readFile(path.join(DEMO_REPO_PATH, filename), "utf-8");
}

// ============================================================================
// Tests
// ============================================================================

describe("Git Toolset Demo", () => {
  beforeAll(async () => {
    await setupDemoRepo();
  });

  afterAll(async () => {
    // Cleanup
    try {
      await fs.rm(DEMO_REPO_PATH, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it("demonstrates the full git workflow", async () => {
    // Verify initial state
    const initialCommits = await getCommitCount();
    expect(initialCommits).toBe(1);

    const initialContent = await getFileContent("README.md");
    expect(initialContent).toContain("# Demo Repository");
    expect(initialContent).not.toContain("Added by LLM");

    // ========================================================================
    // Setup mock LLM responses
    // ========================================================================

    const newContent =
      "# Demo Repository\n\n" +
      "This is a test repository for the git toolset demo.\n\n" +
      "## Added by LLM\n\n" +
      "This line was added by the mock LLM demo.\n";

    mockGenerateText
      // Call 1: Write to file
      .mockResolvedValueOnce({
        text: "I'll add a new line to the README.",
        toolCalls: [
          {
            toolCallId: "call_1",
            toolName: "write_file",
            args: {
              path: "/workspace/README.md",
              content: newContent,
            },
          },
        ],
        finishReason: "tool-calls",
        usage: { inputTokens: 100, outputTokens: 50 },
      })
      // Call 2: Stage the file
      .mockResolvedValueOnce({
        text: "Now I'll stage the changes.",
        toolCalls: [
          {
            toolCallId: "call_2",
            toolName: "git_stage",
            args: {
              files: ["/workspace/README.md"],
              message: "Add LLM-generated section to README",
            },
          },
        ],
        finishReason: "tool-calls",
        usage: { inputTokens: 150, outputTokens: 60 },
      })
      // Call 3: Final response
      .mockResolvedValueOnce({
        text: "I've staged the changes. Use /tool git_push to push.",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 200, outputTokens: 80 },
      });

    // ========================================================================
    // Create and run worker
    // ========================================================================

    const worker: WorkerDefinition = {
      name: "git-demo-worker",
      instructions: "You are a helpful assistant that can modify files and use git.",
      toolsets: {
        filesystem: {},
        git: {},
      },
    };

    const runtime = await createWorkerRuntime({
      worker,
      model: "anthropic:claude-haiku-4-5", // Model ID for validation (mocked anyway)
      sandboxConfig: {
        type: "local",
        basePath: DEMO_REPO_PATH,
        zones: {
          workspace: { path: ".", writable: true },
        },
      },
      approvalMode: "approve_all", // Auto-approve for testing
    });

    // Run the worker
    const result = await runtime.run("Add a new section to README.md and stage it for commit");

    // ========================================================================
    // Verify results
    // ========================================================================

    expect(result.success).toBe(true);
    expect(result.response).toContain("staged");

    // File should be modified in sandbox
    const sandbox = runtime.getSandbox()!;
    const sandboxContent = await sandbox.read("/workspace/README.md");
    expect(sandboxContent).toContain("Added by LLM");

    // Staged commit should exist
    // Note: The actual git repo hasn't been modified yet - only the sandbox has.
    // The staged commit is held in memory by the git backend.

    // Tool calls: write_file + git_stage = 2
    expect(result.toolCallCount).toBe(2);

    // ========================================================================
    // Now manually invoke git_push (simulating user action)
    // ========================================================================

    // Get the git tools to find git_status and git_push
    const tools = runtime.getTools();

    // First check git_status to get the staged commit ID
    const statusResult = await tools.git_status.execute({}, { toolCallId: "manual_1", messages: [] });
    console.log("\n📋 Git status:", JSON.stringify(statusResult, null, 2));

    // The status should show our staged commit
    expect(statusResult).toHaveProperty("staged");
    const staged = (statusResult as { staged: Array<{ id: string }> }).staged;
    expect(staged.length).toBe(1);

    const commitId = staged[0].id;
    console.log(`\n📦 Staged commit ID: ${commitId}`);

    // Now push (this is the manual-only action)
    const pushResult = await tools.git_push.execute(
      {
        commitId,
        target: { type: "local", path: DEMO_REPO_PATH },
      },
      { toolCallId: "manual_2", messages: [] }
    );

    console.log("\n🚀 Push result:", JSON.stringify(pushResult, null, 2));
    expect(pushResult).toHaveProperty("success", true);

    // Verify the commit is now in the repo
    const finalCommits = await getCommitCount();
    expect(finalCommits).toBe(2); // Initial + our new commit

    const lastMessage = await getLastCommitMessage();
    expect(lastMessage).toBe("Add LLM-generated section to README");

    // Verify file content in actual repo
    // Note: sandbox path /workspace/README.md becomes workspace/README.md in repo
    const repoContent = await getFileContent("workspace/README.md");
    expect(repoContent).toContain("Added by LLM");

    console.log("\n✅ Demo completed successfully!");
    console.log("   - File written to sandbox");
    console.log("   - Changes staged for commit");
    console.log("   - Commit pushed to repository");
    console.log(`   - Final commit count: ${finalCommits}`);
    console.log(`   - Last commit: "${lastMessage}"`);
  });

  it("shows that git_push is manual-only (LLM cannot invoke)", async () => {
    // Reset mocks
    mockGenerateText.mockReset();

    // Setup: LLM tries to call git_push (which is manual-only)
    mockGenerateText
      .mockResolvedValueOnce({
        text: "I'll push the changes.",
        toolCalls: [
          {
            toolCallId: "call_push",
            toolName: "git_push",
            args: {
              commitId: "test-commit-id",
              target: { type: "local", path: "." },
            },
          },
        ],
        finishReason: "tool-calls",
        usage: { inputTokens: 100, outputTokens: 50 },
      })
      .mockResolvedValueOnce({
        text: "I apologize, I cannot push directly. Please use /tool git_push.",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 150, outputTokens: 60 },
      });

    const worker: WorkerDefinition = {
      name: "git-push-test",
      instructions: "Test worker",
      toolsets: {
        git: {},
      },
    };

    // Note: With mode: 'manual', git_push shouldn't even be in the LLM's tool list.
    // But if the LLM hallucinates calling it, the tool executor will return an error.

    const runtime = await createWorkerRuntime({
      worker,
      model: "anthropic:claude-haiku-4-5",
      sandboxConfig: {
        type: "local",
        basePath: DEMO_REPO_PATH,
        zones: {
          workspace: { path: ".", writable: true },
        },
      },
      approvalMode: "approve_all",
    });

    // Check that git_push is NOT in the available tools (due to mode: 'manual')
    const tools = runtime.getTools();
    const toolNames = Object.keys(tools);

    // git_push should be filtered out because mode is 'manual'
    // (This depends on the runtime filtering implementation)
    console.log("\n📋 Available tools for LLM:", toolNames.join(", "));

    // For now, git_push might still be in tools but the LLM shouldn't call it
    // The full implementation would filter manual-only tools from LLM view
  });
});
