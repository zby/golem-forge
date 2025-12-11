# Why Golem-Forge Bypasses Vercel AI SDK Agent Features

**Status**: Verified analysis - potential SDK enhancement opportunity

## Summary

Golem-forge uses Vercel AI SDK purely for `generateText()` as a single-step LLM call, then implements its own agent loop. The SDK's built-in agent features don’t currently provide a clean way to block for approval *before* tool execution, so using them would bypass Golem-forge’s approval model.

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

## Broader Solution Space (Not Just One Fix)

There are several plausible ways to reconcile “SDK-managed loop” with “approval before side effects.” Some require SDK changes; others can be implemented purely in Golem-forge with tradeoffs.

### 1) SDK Pre‑Execution Hook (API Change)
**Idea**: Add `onBeforeToolExecution` (or similar) so the SDK pauses and waits for approval.

- Pros: Keeps SDK loop; approval is first‑class; minimal glue code for adopters.
- Cons: Requires upstream change; needs to define semantics for “skip vs abort vs modify.”

### 2) Deferred / Non‑Side‑Effect Tool Pattern (No SDK Change)
**Idea**: Register tools that *don’t execute real side effects*. Instead they return a structured “execution request” (e.g., `{needsApproval: true, toolCall: …}`) which the model can acknowledge. The outer runtime then:
1) asks for approval,
2) runs the real tool outside the SDK loop,
3) re-enters the SDK loop with a synthetic tool result message.

- Pros: Can use `maxSteps` / `Agent` today; no upstream dependency; ensures no side effects happen without approval.
- Cons: **Does not actually block the SDK loop** — the SDK will continue to the next step immediately after the “request” tool returns, so approval happens *out-of-band*. The model sees an artificial tool response; prompt discipline needed so the model doesn’t treat requests as completed results; adds a “two-pass” feel to tool usage.

### 3) Two‑Phase Tools (Plan Then Execute)
**Idea**: Expose tools as a pair: `tool.plan()` (safe, no side effects) and `tool.execute()` (requires approval). The model first calls `plan`, user approves, then the model calls `execute` with the planned args.

- Pros: Clear separation of intent vs effects; approval UX can show the plan; avoids ambiguous “deferred” placeholders.
- Cons: Doubles tool surface area; model may skip `plan` unless strongly prompted; requires careful tool naming and instruction.

### 4) “Confirm/Commit” Meta‑Tool (Approval as a Tool)
**Idea**: Let the model draft a batch of tool calls, but require an explicit `confirm` tool call to run them. Runtime only executes side‑effect tools after a successful `confirm`.

- Pros: One approval gate for many calls; keeps tool API stable; user sees a clean “commit” step.
- Cons: Needs strong prompting so the model doesn’t hallucinate confirmation; adds another concept for model/tooling to learn.

### 5) Partial Use of SDK Loop + Manual Pause/Resume
**Idea**: Use the SDK to get tool calls for a step, then *stop* before execution, ask approval, execute manually, and resume by calling the SDK again with appended tool results. This is close to what Golem-forge already does, but could still leverage SDK helpers for step bookkeeping.

- Pros: Incremental migration path; may reduce custom loop surface.
- Cons: Still effectively a custom loop; SDK “automatic” execution is unused.

### 6) Local SDK Fork / Patch (Short‑Term Escape Hatch)
**Idea**: Patch the SDK’s tool executor to call into an approval callback, maintaining a private fork.

- Pros: Immediate access to SDK agent loop semantics with approvals.
- Cons: Ongoing maintenance burden; diverges from upstream; not ideal unless the API change is clearly imminent.

## Why We Still Prefer a Custom Loop Today

Given current SDK constraints, a custom loop is the smallest, most explicit approach:
- approval is enforced at a single choke point (`ToolExecutor.executeBatch()`),
- side effects are never run without a decision,
- failure modes are obvious and testable.

If the SDK adds step‑level hooks or pre‑execution callbacks, we can revisit adopting more of its loop machinery.

## References

- Vercel AI SDK docs: https://sdk.vercel.ai/docs
- Golem-forge worker.ts: `packages/core/src/runtime/worker.ts`
- ApprovalController: `packages/core/src/approval/index.ts`

---

*Note: This analysis was verified against the codebase on 2025-12-11. Consider as potential contribution to Vercel AI SDK.*
