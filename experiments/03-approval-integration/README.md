# Experiment 1.3: Tool Interception with Approval

## Goal

Integrate the approval system with lemmy's tool execution, creating the glue layer that enables approval-gated tool execution.

## Status: COMPLETE

## Files

```
src/
├── approved-executor.ts      # Main integration class
├── approved-executor.test.ts # Tests
└── index.ts                  # Exports

demo.ts                       # Mock demo (no API calls)
demo-live.ts                  # Live demo with real LLM (optional)
```

## Running

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run mock demo
npm run demo

# Run live demo (requires ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=sk-ant-... npm run demo:live
```

## Key Concepts

### ApprovedExecutor

Wraps lemmy's `Context.executeTool()` with approval checking:

```typescript
const executor = new ApprovedExecutor({
  context,                  // lemmy Context with tools
  approvalController,       // ApprovalController (modes: interactive/approve_all/strict)
  toolset,                  // Optional: custom approval rules
});

// Execute with approval checking
const results = await executor.executeTools(toolCalls);
```

### Toolset Integration

Toolsets can implement `SupportsNeedsApproval` for custom approval logic:

```typescript
class MyToolset implements SupportsNeedsApproval {
  needsApproval(name: string, args: Record<string, unknown>): ApprovalResult {
    if (name === "read_file") return ApprovalResult.preApproved();
    if (name === "delete_system") return ApprovalResult.blocked("Forbidden");
    return ApprovalResult.needsApproval();
  }
}
```

### Execution Flow

```
Tool Call from LLM
        │
        ▼
┌───────────────────┐
│ ApprovedExecutor  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐     ┌─────────────┐
│ Check Approval    │────▶│   Toolset   │ (optional)
│ (via toolset or   │     │ needsApproval()
│  default)         │     └─────────────┘
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌───────┐   ┌───────────┐   ┌─────────────┐
│Blocked│   │Pre-Approved│   │Needs Approval│
└───┬───┘   └─────┬─────┘   └──────┬──────┘
    │             │                │
    │             │                ▼
    │             │      ┌─────────────────┐
    │             │      │ApprovalController│
    │             │      │ requestApproval()│
    │             │      └────────┬────────┘
    │             │               │
    │             │         ┌─────┴─────┐
    │             │         │           │
    │             │         ▼           ▼
    │             │     ┌───────┐   ┌───────┐
    │             │     │Approved│   │Denied │
    │             │     └───┬───┘   └───┬───┘
    │             │         │           │
    ▼             ▼         ▼           ▼
┌───────┐   ┌───────────┐ ┌───────┐ ┌───────┐
│ Error │   │  Execute  │ │Execute│ │ Error │
│Result │   │   Tool    │ │ Tool  │ │Result │
└───────┘   └───────────┘ └───────┘ └───────┘
```

### Result Types

```typescript
interface ApprovedExecuteResult extends ExecuteToolResult {
  blocked?: boolean;     // Tool was blocked by policy
  denied?: boolean;      // Tool was denied by user
  preApproved?: boolean; // Tool was pre-approved (no prompt)
}
```

## Success Criteria

- [x] Tool calls route through approval system
- [x] Blocked tools never execute
- [x] Pre-approved tools execute immediately
- [x] Needs-approval tools wait for callback
- [x] Denied tools return useful error to LLM
- [x] Session caching works for repeated calls
- [x] All tests passing (7 tests)

## Integration with Full Pipeline

This is how the executor fits into the full LLM loop:

```typescript
// Full tool execution loop with approval
let result = await client.ask("Do something", { context });

while (result.message.toolCalls?.length) {
  // Use ApprovedExecutor instead of context.executeTools()
  const toolResults = await executor.executeTools(result.message.toolCalls);
  result = await client.ask({ toolResults: toToolResults(toolResults) }, { context });
}
```

## Next Steps

→ After validation, move to `src/tools/approved-executor.ts`
→ Experiment 1.4: Minimal worker definition (.worker parsing)
