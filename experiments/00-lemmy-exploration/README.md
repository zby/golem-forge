# Experiment 00: Lemmy API Exploration

## Status: VALIDATED

## Goal

Understand lemmy's API to validate assumptions from the port plan.

## Key Findings

### 1. Tool Definition ✅

Lemmy uses `defineTool()` with Zod schemas - exactly what we need:

```typescript
import { defineTool } from "@mariozechner/lemmy";
import { z } from "zod";

const myTool = defineTool({
  name: "get_weather",
  description: "Get current weather for a city",
  schema: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async (args) => {
    return { temperature: 22, conditions: "sunny" };
  },
});
```

### 2. Manual Tool Handling ✅ (Critical for Approvals!)

**Lemmy does NOT auto-execute tools.** The `ask()` method returns an `AskResult` with `message.toolCalls` if the LLM wants to use tools. The caller is responsible for:

1. Checking if `message.toolCalls` exists
2. Executing the tools (this is where we intercept for approval!)
3. Sending results back via `ask({ toolResults: [...] })`

This is **perfect** for our approval system. The tool execution loop looks like:

```typescript
const context = new Context();
context.addTool(myTool);
context.setSystemMessage("You are helpful.");

let result = await client.ask("What's the weather in Paris?", { context });

while (result.type === "success" && result.message.toolCalls?.length) {
  // ⭐ INTERCEPTION POINT FOR APPROVALS ⭐
  // We can check approval BEFORE executing

  const toolResults = await context.executeTools(result.message.toolCalls);
  result = await client.ask({ toolResults: toToolResults(toolResults) }, { context });
}
```

### 3. Tool Execution via Context ✅

Tools are registered on `Context` and executed through it:

```typescript
// Add tools
context.addTool(tool1);
context.addTool(tool2);

// Execute single tool
const result = await context.executeTool(toolCall);

// Execute multiple in parallel
const results = await context.executeTools(toolCalls);
```

### 4. Error Handling ✅

`ExecuteToolResult` is a discriminated union:

```typescript
type ExecuteToolResult =
  | { success: true; toolCallId: string; result: unknown }
  | { success: false; toolCallId: string; error: ToolError };
```

And `toToolResult()` / `toToolResults()` convert these to `ToolResult[]` for sending back to LLM.

### 5. Key Types

| Type | Purpose |
|------|---------|
| `ToolDefinition<T, R>` | Tool with schema and execute function |
| `ToolCall` | LLM's request to execute a tool |
| `ToolResult` | Result to send back to LLM |
| `ExecuteToolResult` | Internal result with error handling |
| `Context` | Manages messages, tools, execution |

## Validation of Plan Assumptions

| Assumption | Status | Notes |
|------------|--------|-------|
| Manual tool handling | ✅ | Perfect - full control over execution |
| Zod schema tools | ✅ | `defineTool()` uses Zod |
| Tool interception point | ✅ | Between `ask()` response and `executeTool()` |
| Error handling to LLM | ✅ | `toToolResult()` formats errors nicely |
| Multi-provider | ✅ | Same API for Anthropic, OpenAI, Google |

## Approval Integration Point

The approval system integrates cleanly:

```typescript
// Pseudo-code for tool execution with approval
async function executeWithApproval(
  context: Context,
  toolCalls: ToolCall[],
  approvalController: ApprovalController,
  approvalCallback: ApprovalCallback
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const toolCall of toolCalls) {
    // 1. Check if approval needed
    const approvalResult = await approvalController.checkApproval(
      toolCall.name,
      toolCall.arguments
    );

    if (approvalResult.status === "blocked") {
      results.push({ toolCallId: toolCall.id, content: `Blocked: ${approvalResult.blockReason}` });
      continue;
    }

    if (approvalResult.status === "needs_approval") {
      // 2. Request approval via runtime callback
      const decision = await approvalCallback({
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        description: `Execute: ${toolCall.name}`,
      });

      if (!decision.approved) {
        results.push({ toolCallId: toolCall.id, content: "Tool execution denied by user" });
        continue;
      }

      // Remember if requested
      if (decision.remember === "session") {
        approvalController.remember(toolCall.name, toolCall.arguments);
      }
    }

    // 3. Execute the tool
    const execResult = await context.executeTool(toolCall);
    results.push(toToolResult(execResult));
  }

  return results;
}
```

## Conclusion

**Lemmy is well-suited for golem-forge.** The manual tool handling design is exactly what we need for runtime-agnostic approval. We can proceed with Experiment 1.1.

## Next Steps

1. ✅ Experiment 00 complete
2. → Experiment 1.1: Create working tool execution example
3. → Experiment 1.2: Port approval system core types
