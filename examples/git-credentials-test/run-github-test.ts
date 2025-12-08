#!/usr/bin/env npx tsx
/**
 * GitHub Credentials Test (Scoped Token)
 *
 * Tests GitHub API integration with a scoped fine-grained PAT.
 * Uses explicit mode to ensure only the provided token is used.
 *
 * Required environment variables:
 *   GOLEM_TEST_GITHUB_TOKEN - Fine-grained PAT scoped to test repo
 *   GOLEM_TEST_GITHUB_REPO  - Repository in "owner/repo" format
 *
 * Setup:
 *   1. Create test repo on GitHub
 *   2. Create fine-grained PAT at https://github.com/settings/tokens?type=beta
 *      - Repository access: "Only select repositories" → your test repo
 *      - Permissions: Contents (Read and write)
 *
 * Run:
 *   export GOLEM_TEST_GITHUB_TOKEN="github_pat_xxxx"
 *   export GOLEM_TEST_GITHUB_REPO="your-user/golem-test"
 *   npx tsx examples/git-credentials-test/run-github-test.ts
 */

import * as readline from "readline";
import { createWorkerRuntime } from "../../src/runtime/index.js";
import { ToolExecutor } from "../../src/runtime/tool-executor.js";
import type { WorkerDefinition } from "../../src/worker/index.js";
import { createCLIApprovalCallback } from "../../src/cli/approval.js";
import { ApprovalController } from "../../src/approval/index.js";

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_TOKEN = process.env.GOLEM_TEST_GITHUB_TOKEN;
const GITHUB_REPO = process.env.GOLEM_TEST_GITHUB_REPO;

// ============================================================================
// Helpers
// ============================================================================

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
  console.log("║         Git Credentials Test (GitHub Scoped Token)         ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\nThis test verifies scoped GitHub credentials work correctly.");
  console.log("Uses explicit mode - only the provided token is used.");

  // Check environment
  if (!GITHUB_TOKEN) {
    console.error("\n❌ GOLEM_TEST_GITHUB_TOKEN not set.");
    console.error("   Create a fine-grained PAT scoped to your test repo.");
    console.error("   See: https://github.com/settings/tokens?type=beta");
    process.exit(1);
  }

  if (!GITHUB_REPO) {
    console.error("\n❌ GOLEM_TEST_GITHUB_REPO not set.");
    console.error('   Set to your test repo, e.g., "your-user/golem-test"');
    process.exit(1);
  }

  print("\nConfiguration:");
  print(`  Repository: ${GITHUB_REPO}`);
  print(`  Token:      ${GITHUB_TOKEN.substring(0, 15)}...`);
  print(`  Mode:       explicit (no credential inheritance)`);

  await waitForEnter("Press Enter to start the test...");

  // ========================================================================
  // Step 1: Create Worker Runtime with explicit credentials
  // ========================================================================

  step(1, "Initialize Worker Runtime (Explicit Mode)");

  print("\nCreating worker with explicit credential mode...");
  print("This prevents any host credentials from being used.");

  const worker: WorkerDefinition = {
    name: "github-credential-test-worker",
    instructions: "You are a helpful assistant that can use git.",
    toolsets: {
      filesystem: {},
      git: {
        default_target: {
          type: "github",
          repo: GITHUB_REPO,
        },
        credentials: {
          mode: "explicit", // Don't inherit host credentials
          env: {
            GITHUB_TOKEN: GITHUB_TOKEN,
            GIT_AUTHOR_NAME: "Golem Test Bot",
            GIT_AUTHOR_EMAIL: "golem-test@example.com",
          },
        },
      },
    },
  };

  const runtime = await createWorkerRuntime({
    worker,
    model: "anthropic:claude-haiku-4-5",
    sandboxConfig: {
      type: "memory",
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
  print("  Tools: " + Object.keys(tools).join(", "));

  // ========================================================================
  // Step 2: Write a test file to sandbox
  // ========================================================================

  step(2, "Write Test File to Sandbox");

  const timestamp = new Date().toISOString();
  const testContent = `# GitHub Credential Test

This file was created by the git credentials test.

Timestamp: ${timestamp}
Repository: ${GITHUB_REPO}
Mode: explicit (scoped token)

If you see this in the repo, scoped credentials are working!
`;

  print("\nWriting test file to memory sandbox...");

  const writeResult = await tools.write_file.execute(
    { path: "/workspace/github-credential-test.md", content: testContent },
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
        files: ["/workspace/github-credential-test.md"],
        message: `Test scoped GitHub credentials - ${timestamp}`,
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
  // Step 5: Push to GitHub
  // ========================================================================

  step(5, "Push to GitHub (requires approval)");

  print("\nPushing to GitHub via API...");
  print("Using scoped token - can only access: " + GITHUB_REPO);
  print("\n⚠️  This will create a real commit on GitHub!\n");

  const pushExecResult = await toolExecutor.execute(
    {
      toolCallId: "test_4",
      toolName: "git_push",
      toolArgs: {
        commitId,
        target: { type: "github", repo: GITHUB_REPO },
      },
    },
    { messages: [], iteration: 1 }
  );

  print("\nResult: " + JSON.stringify(pushExecResult.output, null, 2));

  if (pushExecResult.isError) {
    print("\n❌ Push failed.");
    print("\nPossible issues:");
    print("  - Token doesn't have write access to repo");
    print("  - Token is expired");
    print("  - Repo doesn't exist");
    rl.close();
    return;
  }

  // ========================================================================
  // Done
  // ========================================================================

  header("Test Complete");

  print("\n✓ GitHub scoped credentials are working!");
  print("\nWhat was tested:");
  print("  - Explicit credential mode (no inheritance)");
  print("  - Scoped fine-grained PAT");
  print("  - GitHub API push via Octokit");
  print("\nVerify the commit at:");
  print(`  https://github.com/${GITHUB_REPO}/commits`);

  rl.close();
}

main().catch((error) => {
  console.error("\n❌ Test failed:", error);
  rl.close();
  process.exit(1);
});
