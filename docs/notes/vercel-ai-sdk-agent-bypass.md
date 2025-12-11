# Why Golem-Forge Bypasses Vercel AI SDK Agent Features

**Status**: Verified analysis - potential SDK enhancement opportunity

## Summary

Golem-forge uses Vercel AI SDK purely for `generateText()` as a single-step LLM call, then implements its own agent loop. The SDK's built-in agent features are incompatible with blocking approval before tool execution.

## What Vercel AI SDK Offers for Agents

```typescript
// Vercel's Agent class - handles the loop automatically
const agent = new Agent({
  model,
  tools,
  stopWhen: stepCountIs(20),  // Automatic loop termination
});

// Or with generateText + maxSteps
const result = await generateText({
  model,
  messages,
  tools,
  maxSteps: 10,  // SDK handles the loop
});
```

The SDK can automatically:
- Execute tools and append results to messages
- Loop until text response or max steps
- Use `prepareStep` to adjust tools/prompts per iteration

## What Golem-Forge Actually Does

Location: `packages/core/src/runtime/worker.ts`

```typescript
// worker.ts - implements its OWN loop, ignores SDK's agent features
for (let iteration = 0; iteration < maxIterations; iteration++) {

  // Single-step generateText - NO maxSteps, NO agent loop
  const result = await generateText({
    model: this.model,
    messages,
    tools: hasTools ? llmTools : undefined,
    // Notice: no maxSteps, no stopWhen
  });

  const toolCalls = result.toolCalls;

  if (!toolCalls || toolCalls.length === 0) {
    // Done - return response
    return { success: true, response: result.text };
  }

  // Manual tool execution with approval - SDK never sees this
  const executionResults = await this.toolExecutor!.executeBatch(executorCalls, context);

  // Manually append results to messages
  messages.push({ role: "tool", content: toolResultMessages });

  // Loop continues...
}
```

## Why We Bypass It

If we used `maxSteps` or the `Agent` class, the SDK would automatically execute tools - there's no hook to inject approval before execution. The SDK's agent loop assumes tools run immediately.

## Feature Comparison

| Feature            | Vercel SDK Agent                 | Golem-Forge                  |
|--------------------|----------------------------------|------------------------------|
| Loop               | SDK-managed (maxSteps, stopWhen) | Custom for loop              |
| Tool execution     | Automatic by SDK                 | Manual via ToolExecutor      |
| Approval hook      | None (deferred pattern only)     | Blocks before tool.execute() |
| Message management | SDK appends results              | Manual messages.push()       |

## Potential SDK Enhancement

The Vercel AI SDK could support a pre-execution hook for tool approval:

```typescript
// Proposed API
const result = await generateText({
  model,
  messages,
  tools,
  maxSteps: 10,
  onBeforeToolExecution: async (toolCall) => {
    // Return true to proceed, false to skip, or throw to abort
    const approved = await showApprovalDialog(toolCall);
    if (!approved) {
      return { skip: true, reason: "User denied" };
    }
    return { proceed: true };
  },
});
```

This would allow:
1. Interactive approval before tool execution
2. Selective tool skipping without aborting the loop
3. Custom approval policies (always approve, always deny, ask user)

## References

- Vercel AI SDK docs: https://sdk.vercel.ai/docs
- Golem-forge worker.ts: `packages/core/src/runtime/worker.ts`
- ApprovalController: `packages/core/src/approval/index.ts`

---

*Note: This analysis was verified against the codebase on 2025-12-11. Consider as potential contribution to Vercel AI SDK.*
