#!/usr/bin/env npx tsx
/**
 * Interactive Git Toolset Demo
 *
 * Demonstrates the git workflow step by step, pausing for user input.
 * This simulates what an LLM would do, letting you see each action.
 *
 * Run: npx tsx examples/git-demo/run.ts
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

// ============================================================================
// Configuration
// ============================================================================

const DEMO_REPO_PATH = "/tmp/golem-git-demo";

// ============================================================================
// Helpers
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
// Setup
// ============================================================================

async function setupDemoRepo(): Promise<void> {
  header("Setting up demo repository");

  print("\nCreating fresh git repo at: " + DEMO_REPO_PATH);

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
  const initialContent = `# Demo Repository

This is a test repository for the git toolset demo.
`;
  await fs.writeFile(path.join(DEMO_REPO_PATH, "README.md"), initialContent);

  // Initial commit
  git("add", "README.md");
  git("commit", "-m", "Initial commit");

  print("\n✓ Created git repo with initial commit");
  print("\n  Files:");
  print("    README.md");
  print("\n  Content:");
  for (const line of initialContent.trim().split("\n")) {
    print(`    ${line}`);
  }
}

// ============================================================================
// Main Demo
// ============================================================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         Interactive Git Toolset Demo                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\nThis demo simulates an LLM modifying a file and committing it.");
  console.log("You'll be prompted to approve git_stage and git_push actions.");

  await waitForEnter("Press Enter to start the demo...");

  // ========================================================================
  // Step 0: Setup
  // ========================================================================

  await setupDemoRepo();

  // ========================================================================
  // Step 1: Create Worker Runtime
  // ========================================================================

  step(1, "Initialize Worker Runtime");

  print("\nCreating worker with filesystem and git toolsets...");

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
    model: "anthropic:claude-haiku-4-5", // Not actually used - we call tools directly
    mountSandboxConfig: {
      root: DEMO_REPO_PATH,
    },
    approvalMode: "interactive",
    approvalCallback: createCLIApprovalCallback(),
  });

  const tools = runtime.getTools();

  // Create a ToolExecutor for calls that need approval
  const approvalController = new ApprovalController({
    mode: "interactive",
    approvalCallback: createCLIApprovalCallback(),
  });
  const toolExecutor = new ToolExecutor({
    tools,
    approvalController,
  });

  print("\n✓ Worker runtime initialized");
  print("  Sandbox base: " + DEMO_REPO_PATH);
  print("  Tools: " + Object.keys(tools).join(", "));

  // ========================================================================
  // Step 2: Write File (simulating LLM action)
  // ========================================================================

  step(2, "LLM writes to file");

  print('\nSimulating LLM calling write_file to add a section to README.md...\n');

  const newContent = `# Demo Repository

This is a test repository for the git toolset demo.

## Added by LLM

This section was added by the mock LLM during the demo.
It demonstrates how the LLM can modify files in the sandbox.
`;

  const writeResult = await tools.write_file.execute(
    { path: "/README.md", content: newContent },
    { toolCallId: "demo_1", messages: [] }
  );

  print("Tool: write_file");
  print("Args: { path: '/README.md', content: '...' }");
  print("\nResult: " + JSON.stringify(writeResult, null, 2));

  // ========================================================================
  // Step 3: Stage File (requires approval)
  // ========================================================================

  step(3, "LLM stages the file (requires your approval)");

  print("\nSimulating LLM calling git_stage...\n");

  // Use ToolExecutor to get approval flow
  const stageExecResult = await toolExecutor.execute(
    {
      toolCallId: "demo_2",
      toolName: "git_stage",
      toolArgs: {
        files: ["/README.md"],
        message: "Add LLM-generated section to README",
      },
    },
    { messages: [], iteration: 1 }
  );

  print("\nResult: " + JSON.stringify(stageExecResult.output, null, 2));

  if (stageExecResult.isError) {
    print("\n❌ Staging was denied or failed. Exiting demo.");
    rl.close();
    return;
  }

  const stageOutput = stageExecResult.output as { commitId: string };
  const commitId = stageOutput.commitId;
  print("\n✓ Staged commit created: " + commitId);

  // ========================================================================
  // Step 4: Check Status
  // ========================================================================

  step(4, "Check git status");

  print("\nCalling git_status to see the staged commit...\n");

  const statusResult = await tools.git_status.execute(
    {},
    { toolCallId: "demo_3", messages: [] }
  );

  print("Result: " + JSON.stringify(statusResult, null, 2));

  // ========================================================================
  // Step 5: Show Diff
  // ========================================================================

  step(5, "Show diff");

  print("\nCalling git_diff to see the changes...\n");

  const diffResult = await tools.git_diff.execute(
    { commitId },
    { toolCallId: "demo_4", messages: [] }
  );

  print((diffResult as { diff: string }).diff);

  // ========================================================================
  // Step 6: Push (requires approval)
  // ========================================================================

  step(6, "Push to repository (requires your approval)");

  print("\nIn real usage, git_push is manual-only (LLM cannot call it).");
  print("The user would run: /tool git_push --commitId " + commitId);
  print("\nSimulating manual push...\n");

  // Use ToolExecutor for approval flow
  const pushExecResult = await toolExecutor.execute(
    {
      toolCallId: "demo_5",
      toolName: "git_push",
      toolArgs: {
        commitId,
        target: { type: "local", path: DEMO_REPO_PATH },
      },
    },
    { messages: [], iteration: 1 }
  );

  print("\nResult: " + JSON.stringify(pushExecResult.output, null, 2));

  if (!pushExecResult.isError) {
    print("\n✓ Commit pushed successfully!");
  } else {
    print("\n❌ Push was denied or failed.");
    rl.close();
    return;
  }

  // ========================================================================
  // Step 7: Verify
  // ========================================================================

  step(7, "Verify the result");

  print("\nChecking the actual git repository...\n");

  const logResult = git("log", "--oneline", "-3");
  print("Git log:");
  for (const line of logResult.output.trim().split("\n")) {
    print("  " + line);
  }

  print("\nFile content (README.md in repo):");
  try {
    const content = await fs.readFile(
      path.join(DEMO_REPO_PATH, "README.md"),
      "utf-8"
    );
    for (const line of content.split("\n")) {
      print("  " + line);
    }
  } catch {
    print("  (file not found at expected path)");
  }

  // ========================================================================
  // Done
  // ========================================================================

  header("Demo Complete!");

  print("\nThe git workflow demonstrated:");
  print("  1. LLM writes file to sandbox (write_file)");
  print("  2. LLM stages changes with message (git_stage) - requires approval");
  print("  3. User pushes to repository (git_push) - manual only");
  print("");
  print("Repository location: " + DEMO_REPO_PATH);
  print("You can inspect it with: cd " + DEMO_REPO_PATH + " && git log");
  print("");

  rl.close();
}

main().catch((err) => {
  console.error("Demo failed:", err);
  rl.close();
  process.exit(1);
});
