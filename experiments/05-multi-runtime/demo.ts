/**
 * Demo: Multi-Runtime Approval
 *
 * Demonstrates that the same approval system works with different runtime callbacks.
 * Uses mock callbacks to show the pattern without requiring interactive input.
 */

import {
  ApprovalController,
  type ApprovalRequest,
} from "../../src/approval/index.js";
import { createAutoApprovalCallback } from "./src/cli-callback.js";
import {
  MockBrowserEnvironment,
  createBrowserApprovalCallback,
} from "./src/browser-callback.js";

// Sample tool calls that need approval
const toolCalls: ApprovalRequest[] = [
  {
    toolName: "write_file",
    toolArgs: { path: "/tmp/notes.txt", content: "Hello World" },
    description: "Write 'Hello World' to /tmp/notes.txt",
  },
  {
    toolName: "run_command",
    toolArgs: { command: "ls -la" },
    description: "Execute shell command: ls -la",
  },
  {
    toolName: "write_file",
    toolArgs: { path: "/tmp/notes.txt", content: "Updated" },
    description: "Write 'Updated' to /tmp/notes.txt",
  },
];

async function runWithCallback(
  name: string,
  controller: ApprovalController
): Promise<void> {
  console.log(`\n--- ${name} ---\n`);

  for (const request of toolCalls) {
    const decision = await controller.requestApproval(request);

    const status = decision.approved ? "✅ APPROVED" : "❌ DENIED";
    const cached = decision.remember === "session" ? " (will cache)" : "";
    console.log(`${request.toolName}: ${status}${cached}`);
  }
}

async function main() {
  console.log("=== Experiment 1.5: Multi-Runtime Approval Demo ===");
  console.log("\nThis demo shows the same approval flow working with different runtimes.\n");

  // ===== CLI Runtime (auto-approve for demo) =====
  console.log("1. CLI Runtime (using auto-approve callback)");
  const cliController = new ApprovalController({
    mode: "interactive",
    approvalCallback: createAutoApprovalCallback(true, "session"),
  });
  await runWithCallback("CLI Runtime", cliController);

  // Show session caching
  console.log("\n   Repeating same calls (should use cache):");
  for (const request of toolCalls) {
    const decision = await cliController.requestApproval(request);
    console.log(`   ${request.toolName}: ${decision.approved ? "✅" : "❌"} (from cache)`);
  }

  // ===== Browser Runtime (mock) =====
  console.log("\n2. Browser Runtime (using mock browser environment)");
  const browserEnv = new MockBrowserEnvironment();
  // Simulate: first two approved, third denied
  let callCount = 0;
  browserEnv.setAutoResponse({ approved: true, remember: "session" }, 0);

  const browserController = new ApprovalController({
    mode: "interactive",
    approvalCallback: createBrowserApprovalCallback(browserEnv),
  });

  await runWithCallback("Browser Runtime", browserController);

  // Show what the browser saw
  console.log("\n   Browser notifications created:");
  for (const notif of browserEnv.getNotifications()) {
    console.log(`   - ${notif.title}: "${notif.message}"`);
  }

  // ===== Strict Mode (no callback needed) =====
  console.log("\n3. Strict Mode (denies all, no callback)");
  const strictController = new ApprovalController({ mode: "strict" });
  await runWithCallback("Strict Mode", strictController);

  // ===== Approve All Mode (no callback needed) =====
  console.log("\n4. Approve All Mode (approves all, no callback)");
  const approveAllController = new ApprovalController({ mode: "approve_all" });
  await runWithCallback("Approve All Mode", approveAllController);

  // ===== Key Takeaway =====
  console.log("\n" + "=".repeat(60));
  console.log("KEY INSIGHT: Same ApprovalController works with any callback.");
  console.log("The core has no knowledge of CLI vs Browser - it just calls");
  console.log("the callback and receives an ApprovalDecision back.");
  console.log("=".repeat(60));

  console.log("\n=== Demo Complete ===\n");
}

main().catch(console.error);
