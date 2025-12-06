# Tool Approval Design

## Overview

Golem Forge uses the Vercel AI SDK v6's native `needsApproval` pattern for tool approval. This document explains the design decisions and how the system works.

## The Pattern

Tools declare their approval requirements directly on the tool object:

```typescript
const writeTool: NamedTool = {
  name: 'write_file',
  description: 'Write content to a file',
  inputSchema: writeFileSchema,
  needsApproval: true,  // or a function: (args) => boolean
  execute: async (args, options) => { ... },
};
```

The `needsApproval` property can be:
- `boolean` - static approval requirement
- `(args, options) => boolean | Promise<boolean>` - dynamic based on arguments

## Why Not ApprovedExecutor?

We initially built an `ApprovedExecutor` class that wrapped tool execution with approval checking. This was based on the `pydantic-ai-blocking-approval` Python pattern.

We removed it because:

1. **SDK Native Pattern**: Vercel AI SDK v6 has first-class support for `needsApproval` on tools. Using the native pattern means less custom code and better SDK compatibility.

2. **Simpler Architecture**: Instead of wrapping tool execution, we check `tool.needsApproval` directly in `WorkerRuntime.run()`. This is more straightforward and easier to understand.

3. **No Interface Proliferation**: The old pattern required `SupportsNeedsApproval` and `SupportsApprovalDescription` interfaces on toolsets. Now tools are self-describing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        WorkerRuntime                             │
│                                                                  │
│  1. LLM returns tool calls                                       │
│  2. For each tool call:                                          │
│     ┌──────────────────────────────────────────────────────┐    │
│     │  tool.needsApproval?                                  │    │
│     │    ├─ false → execute immediately                     │    │
│     │    └─ true  → ApprovalController.requestApproval()    │    │
│     │               ├─ approved → execute                   │    │
│     │               └─ denied → return error result         │    │
│     └──────────────────────────────────────────────────────┘    │
│  3. Feed results back to LLM                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Tools with needsApproval

Each tool declares whether it needs approval:

```typescript
// Read operations: no approval needed
createReadFileTool(sandbox)           // needsApproval: undefined (falsy)

// Write operations: approval required
createWriteFileTool(sandbox)          // needsApproval: true

// Worker calls: always need approval
createCallWorkerTool(options)         // needsApproval: true
```

### ApprovalConfig (Declarative, Per-Tool)

For toolsets that want declarative configuration at the tool level:

```typescript
const config: ApprovalConfig = {
  read_file: { preApproved: true },
  write_file: { preApproved: false },  // needs approval
  dangerous_tool: { blocked: true, blockReason: "Disabled" },
};

const toolset = new FilesystemToolset({ sandbox, approvalConfig: config });
```

The `FilesystemToolset` converts `preApproved: true` → `needsApproval: false` and vice versa.

### Zone-Aware Approval (Declarative, Per-Zone)

For more granular control, approval can be configured per-zone. This allows different directories to have different approval requirements:

```yaml
# In worker file
sandbox:
  zones:
    - name: scratch
      mode: rw
      approval:
        write: preApproved    # No prompt for writes to /scratch/*
        delete: preApproved   # No prompt for deletes from /scratch/*
    - name: output
      mode: rw
      approval:
        write: ask            # Prompt before each write to /output/*
        delete: blocked       # Block all deletes from /output/*
```

Approval decision types:
- `preApproved` - No user prompt needed
- `ask` - Prompt user for approval (default if not specified)
- `blocked` - Operation blocked entirely

This creates a dynamic `needsApproval` function that checks the target path:

```typescript
const toolset = new FilesystemToolset({
  sandbox,
  zoneApprovalConfig: {
    scratch: { write: 'preApproved', delete: 'preApproved' },
    output: { write: 'ask', delete: 'blocked' },
  },
});

// The write_file tool now has needsApproval as a function:
// - write_file({ path: '/scratch/temp.txt' }) → no approval needed
// - write_file({ path: '/output/report.md' }) → prompts user
```

**Design rationale**: Zone approval is separate from zone `mode` (ro/rw) because:
- `mode` is about **capability** - what the sandbox allows
- `approval` is about **consent** - what the user must approve

A zone can be `rw` (writes are possible) but still require approval for each write.

### ApprovalController

The controller handles the actual approval decision:

```typescript
const controller = new ApprovalController({
  mode: 'interactive',  // or 'approve_all', 'auto_deny'
  approvalCallback: async (request) => {
    // Show UI, get user decision
    return { approved: true, remember: 'session' };
  },
});
```

Modes:
- `approve_all` - auto-approve everything (for testing, trusted contexts)
- `auto_deny` - deny everything that needs approval
- `interactive` - call the callback for user decision

### ApprovalMemory

Session-scoped cache for approval decisions:

```typescript
// If user approves "write_file" with args {path: "/workspace/foo.txt"}
// and selects "remember for session", subsequent identical calls skip the prompt
```

## Manual Tool Execution

We execute tools ourselves rather than using the SDK's `maxSteps` because:

1. **CLI Experience**: We need synchronous approval prompts before tool execution
2. **Testing**: Easier to mock and verify behavior
3. **Flexibility**: Can add logging, metrics, error handling

```typescript
// In WorkerRuntime.run()
for (const tc of response.toolCalls) {
  const tool = this.tools[tc.toolName];

  // Check approval
  const needsApproval = typeof tool.needsApproval === 'function'
    ? await tool.needsApproval(tc.args, options)
    : tool.needsApproval;

  if (needsApproval) {
    const decision = await this.approvalController.requestApproval({
      toolName: tc.toolName,
      toolArgs: tc.args,
      description: `Execute tool: ${tc.toolName}`,
    });

    if (!decision.approved) {
      // Return denial as tool result
      toolResults.push({ toolCallId: tc.toolCallId, output: '[DENIED]...' });
      continue;
    }
  }

  // Execute the tool
  const output = await tool.execute(tc.args, options);
  toolResults.push({ toolCallId: tc.toolCallId, output });
}
```

## BlockedError

For operations that should never be allowed (not even presented for approval):

```typescript
if (config.blocked) {
  throw new BlockedError(toolName, config.blockReason || 'Blocked by policy');
}
```

This is different from denial - blocked operations are policy violations, not user choices.

## Summary

| Concept | Implementation |
|---------|----------------|
| Tool approval requirement | `tool.needsApproval: boolean \| function` |
| Per-tool config | `ApprovalConfig` with `preApproved`, `blocked` |
| Per-zone config | `ZoneApprovalConfig` with `write`, `delete` per zone |
| User interaction | `ApprovalController` with modes + callback |
| Session cache | `ApprovalMemory` with deep equality matching |
| Policy violations | `BlockedError` thrown before execution |

The key insight is that the SDK's native pattern (`needsApproval` on tools) is sufficient. We don't need wrapper classes or toolset interfaces - just tools that know their own approval requirements and a controller that enforces them.

Zone-aware approval extends this by making `needsApproval` a function that inspects the tool arguments, allowing fine-grained control based on where files are being written.
