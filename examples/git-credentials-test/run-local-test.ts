#!/usr/bin/env npx tsx
/**
 * Local Git Credentials Test
 *
 * Tests git credential inheritance using a local bare repo.
 * No network access - safe for testing.
 *
 * Setup:
 *   ./examples/git-credentials-test/setup-local.sh
 *
 * Run:
 *   npx tsx examples/git-credentials-test/run-local-test.ts
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as readline from "readline";
import { spawnSync } from "child_process";
import { createWorkerRuntime } from "../../src/runtime/index.js";
import { ToolExecutor } from "../../src/runtime/tool-executor.js";
import type { WorkerDefinition } from "../../src/worker/index.js";
import { createCLIApprovalCallback } from "../../src/cli/approval.js";
import { ApprovalController } from "../../src/approval/index.js";
import type { MountSandboxConfig } from "../../src/sandbox/index.js";

// ============================================================================
// Configuration
// ============================================================================

const TEST_DIR = "/tmp/golem-git-test";
const REPO_DIR = path.join(TEST_DIR, "repo");
const REMOTE_DIR = path.join(TEST_DIR, "remote.git");

// ============================================================================
// Helpers
// ============================================================================

function git(...args: string[]): { success: boolean; output: string } {
  const result = spawnSync("git", args, {
    cwd: REPO_DIR,
    encoding: "utf-8",
  });
  return {
    success: result.status === 0,
    output: result.stdout + result.stderr,
  };
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function waitForEnter(prompt: string = "Press Enter to continue..."): Promise<void> {
  return new Promise((resolve) => {
    rl.question(`\n${prompt}`, () => resolve());
  });
}

function print(msg: string): void {
  console.log(msg);
}

function header(title: string): void {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function step(num: number, title: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Step ${num}: ${title}`);
  console.log("─".repeat(60));
}

// ============================================================================
// Main Test
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         Git Credentials Test (Local Bare Repo)             ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\nThis test verifies git credential inheritance works correctly.");
  console.log("It uses a local bare repo - no network access needed.");

  // Check if setup was run
  try {
    await fs.access(REMOTE_DIR);
    await fs.access(REPO_DIR);
  } catch {
    console.error("\n❌ Test repos not found. Run setup first:");
    console.error("   ./examples/git-credentials-test/setup-local.sh");
    process.exit(1);
  }

  await waitForEnter("Press Enter to start the test...");

  // ========================================================================
  // Step 1: Show current state
  // ========================================================================

  step(1, "Current Repository State");

  print("\nRepo:   " + REPO_DIR);
  print("Remote: " + REMOTE_DIR);
  print("\nCurrent commits:");
  print(git("log", "--oneline", "-5").output);
  print("Git config (author):");
  print("  user.name:  " + git("config", "user.name").output.trim());
  print("  user.email: " + git("config", "user.email").output.trim());

  // ========================================================================
  // Step 2: Create Worker Runtime
  // ========================================================================

  step(2, "Initialize Worker Runtime");

  print("\nCreating worker with filesystem and git toolsets...");
  print("Using default credential mode (inherit)...");

  const worker: WorkerDefinition = {
    name: "credential-test-worker",
    instructions: "You are a helpful assistant that can modify files and use git.",
    toolsets: {
      filesystem: {},
      git: {
        default_target: {
          type: "local",
          path: REPO_DIR,  // Git operations happen in the repo directory
        },
        // credentials not specified = inherit mode (uses host git config)
      },
    },
  };

  // Mount-based sandbox config (Docker-style)
  // Much simpler: mount the repo directory at /
  // Paths in sandbox = paths in repo: /credential-test.md -> REPO_DIR/credential-test.md
  const mountSandboxConfig: MountSandboxConfig = {
    root: REPO_DIR,  // Mount the repo at /
  };

  const runtime = await createWorkerRuntime({
    worker,
    model: "anthropic:claude-haiku-4-5", // Not actually used - we call tools directly
    mountSandboxConfig,
    approvalMode: "interactive",
    approvalCallback: createCLIApprovalCallback(),
  });

  const tools = runtime.getTools();

  const approvalController = new ApprovalController({
    mode: "interactive",
    approvalCallback: createCLIApprovalCallback(),
  });
  const toolExecutor = new ToolExecutor({
    tools,
    approvalController,
  });

  print("\n✓ Worker runtime initialized");
  print("  Tools: " + Object.keys(tools).join(", "));

  // ========================================================================
  // Step 3: Write a test file
  // ========================================================================

  step(3, "Write Test File");

  const timestamp = new Date().toISOString();
  const testContent = `# Credential Test

This file was created by the git credentials test.

Timestamp: ${timestamp}

If you see this in git log, credentials are working!
`;

  print("\nWriting test file to sandbox...");
  print("(Mount-based sandbox: /credential-test.md -> " + REPO_DIR + "/credential-test.md)");

  const writeResult = await tools.write_file.execute(
    { path: "/credential-test.md", content: testContent },
    { toolCallId: "test_1", messages: [] }
  );

  print("Result: " + JSON.stringify(writeResult, null, 2));

  // Verify the file was written to the right place
  const realPath = path.join(REPO_DIR, "credential-test.md");
  try {
    await fs.access(realPath);
    print(`\n✓ File exists at: ${realPath}`);
  } catch {
    print(`\n❌ File NOT found at: ${realPath}`);
  }

  // ========================================================================
  // Step 4: Stage the file
  // ========================================================================

  step(4, "Stage File (requires approval)");

  print("\nStaging the file for commit...");
  print("You'll be prompted to approve.\n");

  const stageExecResult = await toolExecutor.execute(
    {
      toolCallId: "test_2",
      toolName: "git_stage",
      toolArgs: {
        files: ["/credential-test.md"],  // Simple path - no zone prefix needed
        message: `Test credential inheritance - ${timestamp}`,
      },
    },
    { messages: [], iteration: 1 }
  );

  if (stageExecResult.isError) {
    print("\n❌ Staging was denied or failed.");
    print("Result: " + JSON.stringify(stageExecResult.output, null, 2));
    rl.close();
    return;
  }

  const stageOutput = stageExecResult.output as { commitId: string };
  const commitId = stageOutput.commitId;
  print("\n✓ Staged commit created: " + commitId);

  // ========================================================================
  // Step 5: Show diff
  // ========================================================================

  step(5, "Show Diff");

  const diffResult = await tools.git_diff.execute(
    { commitId },
    { toolCallId: "test_3", messages: [] }
  );

  print((diffResult as { diff: string }).diff);

  // ========================================================================
  // Step 6: Push to local repo
  // ========================================================================

  step(6, "Push (requires approval)");

  print("\nPushing staged commit to local repo...");
  print("This tests that credentials (git config) are inherited.\n");

  const pushExecResult = await toolExecutor.execute(
    {
      toolCallId: "test_4",
      toolName: "git_push",
      toolArgs: {
        commitId,
        target: { type: "local", path: REPO_DIR },  // Push to the repo directory
      },
    },
    { messages: [], iteration: 1 }
  );

  print("\nResult: " + JSON.stringify(pushExecResult.output, null, 2));

  if (pushExecResult.isError) {
    print("\n❌ Push was denied or failed.");
    rl.close();
    return;
  }

  // ========================================================================
  // Step 7: Verify
  // ========================================================================

  step(7, "Verify Results");

  print("\nChecking git log in repo:");
  print(git("log", "--oneline", "-3").output);

  print("Checking git log in remote (bare repo):");
  const remoteLog = spawnSync("git", ["log", "--oneline", "-3"], {
    cwd: REMOTE_DIR,
    encoding: "utf-8",
  });
  print(remoteLog.stdout);

  print("Checking commit author:");
  print(git("log", "-1", "--format=Author: %an <%ae>").output);

  print("Checking file location:");
  const files = await fs.readdir(REPO_DIR);
  print("  Files in repo: " + files.join(", "));

  // ========================================================================
  // Done
  // ========================================================================

  header("Test Complete");

  print("\n✓ Git credential inheritance is working!");
  print("\nWhat was tested:");
  print("  - Sandbox file writing");
  print("  - Git staging with approval");
  print("  - Git push to local repo");
  print("  - Author identity from git config");
  print("\nThe commit was pushed using your inherited git configuration.");

  rl.close();
}

main().catch((error) => {
  console.error("\n❌ Test failed:", error);
  rl.close();
  process.exit(1);
});
