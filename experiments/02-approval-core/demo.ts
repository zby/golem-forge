/**
 * Demo: Approval System Core
 *
 * Shows the approval system working with different modes and callbacks.
 */

import {
  ApprovalController,
  ApprovalResult,
  type ApprovalRequest,
  type ApprovalDecision,
  type ApprovalCallback,
} from "./src/index.js";

// Simulate different runtime callbacks

// CLI callback (would use readline in real implementation)
const cliCallback: ApprovalCallback = async (request) => {
  console.log(`  [CLI] Approval requested: ${request.description}`);
  console.log(`  [CLI] Tool: ${request.toolName}`);
  console.log(`  [CLI] Args: ${JSON.stringify(request.toolArgs)}`);
  console.log(`  [CLI] (Auto-approving for demo)`);
  return { approved: true, remember: "session" };
};

// Browser callback (would use chrome.* APIs in real implementation)
const browserCallback: ApprovalCallback = async (request) => {
  console.log(`  [Browser] Showing popup for: ${request.description}`);
  console.log(`  [Browser] (Auto-approving for demo)`);
  return { approved: true, remember: "session" };
};

async function main() {
  console.log("=== Approval System Core Demo ===\n");

  // Test request
  const request: ApprovalRequest = {
    toolName: "write_file",
    toolArgs: { path: "/tmp/test.txt", content: "Hello" },
    description: "Write to /tmp/test.txt",
  };

  // 1. Test approve_all mode
  console.log("1. Mode: approve_all");
  const approveAllController = new ApprovalController({ mode: "approve_all" });
  const result1 = await approveAllController.requestApproval(request);
  console.log(`   Result: approved=${result1.approved}\n`);

  // 2. Test strict mode
  console.log("2. Mode: strict");
  const strictController = new ApprovalController({ mode: "strict" });
  const result2 = await strictController.requestApproval(request);
  console.log(`   Result: approved=${result2.approved}, note="${result2.note}"\n`);

  // 3. Test interactive mode with CLI callback
  console.log("3. Mode: interactive (CLI callback)");
  const cliController = new ApprovalController({
    mode: "interactive",
    approvalCallback: cliCallback,
  });
  const result3 = await cliController.requestApproval(request);
  console.log(`   Result: approved=${result3.approved}, remember=${result3.remember}\n`);

  // 4. Session caching
  console.log("4. Session caching (second request uses cache)");
  console.log("   Requesting same tool again...");
  const result4 = await cliController.requestApproval(request);
  console.log(`   Result: approved=${result4.approved} (from cache, no callback called)\n`);

  // 5. Test with browser callback
  console.log("5. Mode: interactive (Browser callback)");
  const browserController = new ApprovalController({
    mode: "interactive",
    approvalCallback: browserCallback,
  });
  const result5 = await browserController.requestApproval(request);
  console.log(`   Result: approved=${result5.approved}\n`);

  // 6. ApprovalResult usage
  console.log("6. ApprovalResult factory methods");
  const blocked = ApprovalResult.blocked("Dangerous operation");
  const preApproved = ApprovalResult.preApproved();
  const needsApproval = ApprovalResult.needsApproval();

  console.log(`   blocked: status=${blocked.status}, reason=${blocked.blockReason}`);
  console.log(`   preApproved: status=${preApproved.status}`);
  console.log(`   needsApproval: status=${needsApproval.status}\n`);

  console.log("=== Demo Complete ===");
  console.log("\nKey insight: The same ApprovalController works with different");
  console.log("ApprovalCallback implementations (CLI, browser, VS Code, etc.)");
  console.log("This is the foundation for multi-runtime support.");
}

main().catch(console.error);
