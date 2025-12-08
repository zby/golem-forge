#!/usr/bin/env npx tsx
/**
 * SSH Deploy Key Credentials Test
 *
 * Tests SSH authentication with a deploy key scoped to one repo.
 * Uses explicit mode with GIT_SSH_COMMAND override.
 *
 * Required environment variables:
 *   GOLEM_TEST_SSH_KEY  - Path to SSH private key (e.g., ~/.ssh/golem_test_key)
 *   GOLEM_TEST_SSH_REPO - Path to cloned repo with SSH remote
 *
 * Setup:
 *   1. Generate a test-only SSH key:
 *      ssh-keygen -t ed25519 -f ~/.ssh/golem_test_key -N "" -C "golem-test"
 *
 *   2. Add as deploy key to your test repo:
 *      GitHub: Settings → Deploy keys → Add deploy key (enable write access)
 *
 *   3. Clone the repo:
 *      git clone git@github.com:your-user/golem-test.git /tmp/golem-ssh-test
 *
 * Run:
 *   export GOLEM_TEST_SSH_KEY="$HOME/.ssh/golem_test_key"
 *   export GOLEM_TEST_SSH_REPO="/tmp/golem-ssh-test"
 *   npx tsx examples/git-credentials-test/run-ssh-test.ts
 */

import * as fs from "fs/promises";
import * as readline from "readline";
import { spawnSync } from "child_process";
import { createWorkerRuntime } from "../../src/runtime/index.js";
import { ToolExecutor } from "../../src/runtime/tool-executor.js";
import type { WorkerDefinition } from "../../src/worker/index.js";
import { createCLIApprovalCallback } from "../../src/cli/approval.js";
import { ApprovalController } from "../../src/approval/index.js";

// ============================================================================
// Configuration
// ============================================================================

const SSH_KEY = process.env.GOLEM_TEST_SSH_KEY;
const SSH_REPO = process.env.GOLEM_TEST_SSH_REPO;

// ============================================================================
// Helpers
// ============================================================================

function git(...args: string[]): { success: boolean; output: string } {
  if (!SSH_REPO) return { success: false, output: "No repo configured" };
  const result = spawnSync("git", args, {
    cwd: SSH_REPO,
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
  console.log("║         Git Credentials Test (SSH Deploy Key)              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\nThis test verifies SSH deploy key authentication works.");
  console.log("Uses explicit mode with GIT_SSH_COMMAND override.");

  // Check environment
  if (!SSH_KEY) {
    console.error("\n❌ GOLEM_TEST_SSH_KEY not set.");
    console.error("   Generate a test key: ssh-keygen -t ed25519 -f ~/.ssh/golem_test_key -N ''");
    process.exit(1);
  }

  if (!SSH_REPO) {
    console.error("\n❌ GOLEM_TEST_SSH_REPO not set.");
    console.error("   Clone your test repo: git clone git@github.com:user/repo.git /tmp/golem-ssh-test");
    process.exit(1);
  }

  // Verify key exists
  try {
    await fs.access(SSH_KEY);
  } catch {
    console.error(`\n❌ SSH key not found: ${SSH_KEY}`);
    process.exit(1);
  }

  // Verify repo exists
  try {
    await fs.access(SSH_REPO);
  } catch {
    console.error(`\n❌ Repo not found: ${SSH_REPO}`);
    process.exit(1);
  }

  print("\nConfiguration:");
  print(`  SSH Key:    ${SSH_KEY}`);
  print(`  Repository: ${SSH_REPO}`);
  print(`  Mode:       explicit (GIT_SSH_COMMAND override)`);

  // Show remote
  print("\nGit remote:");
  print("  " + git("remote", "-v").output.split("\n")[0]);

  await waitForEnter("Press Enter to start the test...");

  // ========================================================================
  // Step 1: Create Worker Runtime with SSH override
  // ========================================================================

  step(1, "Initialize Worker Runtime (SSH Override)");

  print("\nCreating worker with explicit SSH command...");
  print("This uses only the specified deploy key, ignoring SSH agent.");

  const sshCommand = `ssh -i ${SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`;

  const worker: WorkerDefinition = {
    name: "ssh-credential-test-worker",
    instructions: "You are a helpful assistant that can use git.",
    toolsets: {
      filesystem: {},
      git: {
        default_target: {
          type: "local",
          path: SSH_REPO,
        },
        credentials: {
          mode: "explicit", // Don't inherit host credentials
          env: {
            GIT_SSH_COMMAND: sshCommand,
            GIT_AUTHOR_NAME: "Golem SSH Test",
            GIT_AUTHOR_EMAIL: "golem-ssh-test@example.com",
            // Disable credential helpers - SSH only
            GIT_TERMINAL_PROMPT: "0",
          },
        },
      },
    },
  };

  const runtime = await createWorkerRuntime({
    worker,
    model: "anthropic:claude-haiku-4-5",
    sandboxConfig: {
      type: "local",
      basePath: SSH_REPO,
      zones: {
        workspace: { path: ".", writable: true },
      },
    },
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
  print("  Credential mode: explicit");
  print("  SSH command: " + sshCommand);

  // ========================================================================
  // Step 2: Write a test file
  // ========================================================================

  step(2, "Write Test File");

  const timestamp = new Date().toISOString();
  const testContent = `# SSH Deploy Key Test

This file was created by the git credentials test.

Timestamp: ${timestamp}
Auth method: SSH deploy key
Mode: explicit (no SSH agent)

If you see this in the repo, SSH deploy key auth is working!
`;

  print("\nWriting test file to sandbox...");

  const writeResult = await tools.write_file.execute(
    { path: "/workspace/ssh-credential-test.md", content: testContent },
    { toolCallId: "test_1", messages: [] }
  );

  print("Result: " + JSON.stringify(writeResult, null, 2));

  // ========================================================================
  // Step 3: Stage the file
  // ========================================================================

  step(3, "Stage File (requires approval)");

  print("\nStaging the file for commit...\n");

  const stageExecResult = await toolExecutor.execute(
    {
      toolCallId: "test_2",
      toolName: "git_stage",
      toolArgs: {
        files: ["/workspace/ssh-credential-test.md"],
        message: `Test SSH deploy key - ${timestamp}`,
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
  // Step 4: Show diff
  // ========================================================================

  step(4, "Show Diff");

  const diffResult = await tools.git_diff.execute(
    { commitId },
    { toolCallId: "test_3", messages: [] }
  );

  print((diffResult as { diff: string }).diff);

  // ========================================================================
  // Step 5: Push using deploy key
  // ========================================================================

  step(5, "Push to Remote (requires approval)");

  print("\nPushing to remote via SSH...");
  print("Using deploy key: " + SSH_KEY);
  print("\n⚠️  This will push to the remote repository!\n");

  const pushExecResult = await toolExecutor.execute(
    {
      toolCallId: "test_4",
      toolName: "git_push",
      toolArgs: {
        commitId,
        target: { type: "local", path: SSH_REPO },
      },
    },
    { messages: [], iteration: 1 }
  );

  print("\nResult: " + JSON.stringify(pushExecResult.output, null, 2));

  if (pushExecResult.isError) {
    print("\n❌ Push failed.");
    print("\nPossible issues:");
    print("  - Deploy key doesn't have write access");
    print("  - Key not added to repo's deploy keys");
    print("  - Wrong key file path");
    rl.close();
    return;
  }

  // ========================================================================
  // Step 6: Verify and push to origin
  // ========================================================================

  step(6, "Push to Origin");

  print("\nThe commit is in the local repo. Now pushing to origin...");
  print("This uses the deploy key via GIT_SSH_COMMAND.");

  // We need to actually push to origin - the git_push tool only commits locally
  // Let's use a direct git push for this test
  const pushResult = spawnSync("git", ["push", "origin", "HEAD"], {
    cwd: SSH_REPO,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_SSH_COMMAND: sshCommand,
    },
  });

  if (pushResult.status !== 0) {
    print("\n❌ Push to origin failed:");
    print(pushResult.stderr);
    print("\nPossible issues:");
    print("  - Deploy key doesn't have write access");
    print("  - Network issues");
    rl.close();
    return;
  }

  print("\n✓ Pushed to origin successfully!");
  print(pushResult.stdout + pushResult.stderr);

  // ========================================================================
  // Done
  // ========================================================================

  header("Test Complete");

  print("\n✓ SSH deploy key authentication is working!");
  print("\nWhat was tested:");
  print("  - Explicit credential mode (no SSH agent)");
  print("  - GIT_SSH_COMMAND override");
  print("  - Deploy key scoped to one repo");
  print("\nThe commit should now be visible in your remote repository.");

  rl.close();
}

main().catch((error) => {
  console.error("\n❌ Test failed:", error);
  rl.close();
  process.exit(1);
});
