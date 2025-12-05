/**
 * Experiment 1.1: Basic Tool Execution (Mock Version)
 *
 * This demonstrates the tool execution flow WITHOUT making real API calls.
 * Shows the exact interception point for approvals.
 */

import { Context, defineTool, toToolResults, type ToolCall, type ExecuteToolResult } from "@mariozechner/lemmy";
import { z } from "zod";

// Define tools
const getWeatherTool = defineTool({
  name: "get_weather",
  description: "Get the current weather for a city",
  schema: z.object({
    city: z.string().describe("The city to get weather for"),
  }),
  execute: async (args) => {
    console.log(`  [Tool Execute] get_weather(${args.city})`);
    return { city: args.city, temperature: 22, conditions: "sunny" };
  },
});

const dangerousTool = defineTool({
  name: "delete_file",
  description: "Delete a file from the filesystem",
  schema: z.object({
    path: z.string().describe("Path to the file to delete"),
  }),
  execute: async (args) => {
    console.log(`  [Tool Execute] delete_file(${args.path})`);
    return { deleted: true, path: args.path };
  },
});

// Simulated approval system (preview of Experiment 1.2)
type ApprovalStatus = "blocked" | "pre_approved" | "needs_approval";

interface ApprovalResult {
  status: ApprovalStatus;
  blockReason?: string;
}

function checkApproval(toolName: string, _args: Record<string, unknown>): ApprovalResult {
  // Simple rule-based approval
  if (toolName === "delete_file") {
    return { status: "needs_approval" };
  }
  if (toolName === "get_weather") {
    return { status: "pre_approved" };
  }
  return { status: "blocked", blockReason: "Unknown tool" };
}

// Mock approval callback (simulates user interaction)
async function mockApprovalCallback(toolName: string, args: Record<string, unknown>): Promise<boolean> {
  console.log(`\n  ⚠️  APPROVAL REQUIRED`);
  console.log(`  Tool: ${toolName}`);
  console.log(`  Args: ${JSON.stringify(args)}`);
  console.log(`  [Mock: Auto-denying dangerous operation]\n`);
  return false; // Deny by default in mock
}

// Tool execution with approval interception
async function executeToolsWithApproval(
  context: Context,
  toolCalls: ToolCall[]
): Promise<ExecuteToolResult[]> {
  const results: ExecuteToolResult[] = [];

  for (const toolCall of toolCalls) {
    console.log(`\n  Processing: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`);

    // 1. Check approval status
    const approval = checkApproval(toolCall.name, toolCall.arguments);
    console.log(`  Approval status: ${approval.status}`);

    if (approval.status === "blocked") {
      results.push({
        success: false,
        toolCallId: toolCall.id,
        error: {
          type: "execution_failed",
          toolName: toolCall.name,
          message: `Tool blocked: ${approval.blockReason}`,
        },
      });
      continue;
    }

    if (approval.status === "needs_approval") {
      // 2. Request approval via callback
      const approved = await mockApprovalCallback(toolCall.name, toolCall.arguments);
      if (!approved) {
        results.push({
          success: false,
          toolCallId: toolCall.id,
          error: {
            type: "execution_failed",
            toolName: toolCall.name,
            message: "Tool execution denied by user",
          },
        });
        continue;
      }
    }

    // 3. Execute the tool
    const result = await context.executeTool(toolCall);
    results.push(result);
  }

  return results;
}

async function main() {
  console.log("=== Experiment 1.1: Tool Execution with Mock Approval ===\n");

  // Setup context with tools
  const context = new Context();
  context.addTool(getWeatherTool);
  context.addTool(dangerousTool);

  // Simulate tool calls from LLM
  const mockToolCalls: ToolCall[] = [
    { id: "call_1", name: "get_weather", arguments: { city: "Paris" } },
    { id: "call_2", name: "delete_file", arguments: { path: "/etc/passwd" } },
    { id: "call_3", name: "unknown_tool", arguments: {} },
  ];

  console.log("Simulated LLM tool calls:");
  for (const tc of mockToolCalls) {
    console.log(`  - ${tc.name}(${JSON.stringify(tc.arguments)})`);
  }

  console.log("\n--- Processing with approval checks ---");

  // Execute with approval
  const results = await executeToolsWithApproval(context, mockToolCalls);

  console.log("\n--- Results ---");
  for (const result of results) {
    if (result.success) {
      console.log(`✅ ${result.toolCallId}: ${JSON.stringify(result.result)}`);
    } else {
      console.log(`❌ ${result.toolCallId}: ${result.error.message}`);
    }
  }

  // Show what would be sent back to LLM
  console.log("\n--- Tool results for LLM ---");
  const toolResults = toToolResults(results);
  for (const tr of toolResults) {
    console.log(`${tr.toolCallId}: ${tr.content.substring(0, 100)}...`);
  }

  console.log("\n=== Experiment Complete ===");
  console.log("Key insight: The approval check happens BETWEEN receiving tool calls");
  console.log("and executing them. This is the perfect interception point.");
}

main().catch(console.error);
