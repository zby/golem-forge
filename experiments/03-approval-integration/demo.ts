/**
 * Demo: Approval Integration with Lemmy (Mock)
 *
 * Shows how the ApprovedExecutor integrates with lemmy's tool system.
 * No API calls - uses mock tool calls.
 */

import { Context, defineTool, toToolResults, type ToolCall } from "@mariozechner/lemmy";
import { z } from "zod";
import { ApprovedExecutor } from "./src/approved-executor.js";
import {
  ApprovalController,
  ApprovalResult,
  type ApprovalCallback,
  type SupportsNeedsApproval,
  type SupportsApprovalDescription,
} from "../../src/approval/index.js";

// Define some tools
const readFileTool = defineTool({
  name: "read_file",
  description: "Read a file from the filesystem",
  schema: z.object({ path: z.string() }),
  execute: async (args) => {
    console.log(`    [Tool] Reading file: ${args.path}`);
    return { content: `Contents of ${args.path}` };
  },
});

const writeFileTool = defineTool({
  name: "write_file",
  description: "Write content to a file",
  schema: z.object({
    path: z.string(),
    content: z.string(),
  }),
  execute: async (args) => {
    console.log(`    [Tool] Writing to: ${args.path}`);
    return { success: true, path: args.path };
  },
});

const deleteFileTool = defineTool({
  name: "delete_file",
  description: "Delete a file",
  schema: z.object({ path: z.string() }),
  execute: async (args) => {
    console.log(`    [Tool] Deleting: ${args.path}`);
    return { deleted: true, path: args.path };
  },
});

// Custom toolset with approval rules
class FileToolset implements SupportsNeedsApproval<unknown>, SupportsApprovalDescription<unknown> {
  needsApproval(name: string, args: Record<string, unknown>): ApprovalResult {
    // Reading is pre-approved for /tmp paths
    if (name === "read_file") {
      const path = args.path as string;
      if (path.startsWith("/tmp/")) {
        return ApprovalResult.preApproved();
      }
      return ApprovalResult.needsApproval();
    }

    // Writing needs approval
    if (name === "write_file") {
      return ApprovalResult.needsApproval();
    }

    // Deleting is blocked for system paths
    if (name === "delete_file") {
      const path = args.path as string;
      if (path.startsWith("/etc/") || path.startsWith("/usr/")) {
        return ApprovalResult.blocked("Cannot delete system files");
      }
      return ApprovalResult.needsApproval();
    }

    return ApprovalResult.needsApproval();
  }

  getApprovalDescription(name: string, args: Record<string, unknown>): string {
    if (name === "read_file") return `Read file: ${args.path}`;
    if (name === "write_file") return `Write to: ${args.path}`;
    if (name === "delete_file") return `Delete file: ${args.path}`;
    return `Execute: ${name}`;
  }
}

// Mock approval callback (simulates CLI)
const mockCliCallback: ApprovalCallback = async (request) => {
  console.log(`\n    ⚠️  APPROVAL REQUIRED: ${request.description}`);
  console.log(`    [Mock CLI: Auto-approving]\n`);
  return { approved: true, remember: "session" };
};

async function main() {
  console.log("=== Experiment 1.3: Approval Integration Demo ===\n");

  // Setup
  const context = new Context();
  context.addTool(readFileTool);
  context.addTool(writeFileTool);
  context.addTool(deleteFileTool);

  const toolset = new FileToolset();

  // Simulate tool calls from an LLM
  const mockToolCalls: ToolCall[] = [
    { id: "1", name: "read_file", arguments: { path: "/tmp/test.txt" } },
    { id: "2", name: "read_file", arguments: { path: "/home/user/secret.txt" } },
    { id: "3", name: "write_file", arguments: { path: "/tmp/output.txt", content: "Hello" } },
    { id: "4", name: "delete_file", arguments: { path: "/etc/passwd" } },
    { id: "5", name: "delete_file", arguments: { path: "/tmp/garbage.txt" } },
  ];

  console.log("Simulated tool calls from LLM:");
  for (const tc of mockToolCalls) {
    console.log(`  ${tc.id}. ${tc.name}(${JSON.stringify(tc.arguments)})`);
  }

  // Test 1: Interactive mode with toolset rules
  console.log("\n--- Test 1: Interactive Mode with Toolset Rules ---\n");

  const interactiveController = new ApprovalController({
    mode: "interactive",
    approvalCallback: mockCliCallback,
  });

  const interactiveExecutor = new ApprovedExecutor({
    context,
    approvalController: interactiveController,
    toolset,
  });

  const results1 = await interactiveExecutor.executeTools(mockToolCalls);

  console.log("\nResults:");
  for (let i = 0; i < results1.length; i++) {
    const r = results1[i];
    const tc = mockToolCalls[i];
    if (r.success) {
      const flags = r.preApproved ? " (pre-approved)" : "";
      console.log(`  ✅ ${tc.name}${flags}: ${JSON.stringify(r.result)}`);
    } else {
      const reason = r.blocked ? "BLOCKED" : r.denied ? "DENIED" : "ERROR";
      console.log(`  ❌ ${tc.name} [${reason}]: ${r.error.message}`);
    }
  }

  // Test 2: Show session caching
  console.log("\n--- Test 2: Session Caching ---\n");

  console.log("Repeating write_file call (should use cached approval):");
  const repeatCall: ToolCall = {
    id: "6",
    name: "write_file",
    arguments: { path: "/tmp/output.txt", content: "Hello" },
  };
  const cachedResult = await interactiveExecutor.executeTool(repeatCall);
  console.log(`  Result: ${cachedResult.success ? "✅ executed (from cache)" : "❌ failed"}`);

  // Test 3: What gets sent back to LLM
  console.log("\n--- Test 3: Tool Results for LLM ---\n");

  const toolResults = toToolResults(results1);
  console.log("Results formatted for LLM:");
  for (const tr of toolResults) {
    const preview = tr.content.length > 60 ? tr.content.slice(0, 60) + "..." : tr.content;
    console.log(`  ${tr.toolCallId}: ${preview}`);
  }

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);
