# Workers as Direct Tool Calls

**Date**: 2025-12-06
**Status**: Implementing

## Problem

The current `call_worker` tool requires specifying the worker name as a parameter:

```
Tool: call_worker
Parameters: { worker: "greeter", input: "Hello" }
```

This creates non-uniform semantics - the tool name (`call_worker`) doesn't represent the action being taken. The actual action (which worker to call) is buried in parameters.

## Proposed Solution

Make each allowed worker a first-class tool:

```
Tool: greeter
Parameters: { input: "Hello" }
```

### Benefits

1. **Uniform tool semantics** - Tool name always represents the action (`read_file`, `write_file`, `greeter`)
2. **Simpler UI/tracing** - No need to parse parameters to understand what's happening
3. **Better LLM ergonomics** - Workers appear as peers to other tools
4. **Richer descriptions** - Each worker tool uses the worker's own `description` field
5. **Validation at registration** - Missing workers caught at init, not runtime

### Schema Change

```typescript
// Before: 4 parameters
{ worker, input, instructions, attachments }

// After: 3 parameters (worker is now the tool name)
{ input, instructions, attachments }
```

## Design Options Considered

### Option A: Static Registration
Register all worker tools at `initialize()` time. Simple but all workers must exist at startup.

### Option B: Lazy Registration
Create placeholder tools, resolve actual worker on first use. More flexible but errors at call time.

### Option C: Discovery Tool + Dynamic Registration
A `discover_workers` tool that scans for workers and dynamically registers them. Very flexible but adds complexity.

### Option D: Hybrid (Chosen)
Named tools for statically-known workers + fallback `call_worker` for dynamic cases.

## Decision: Option D

We chose the hybrid approach because:

1. `allowed_workers` in frontmatter defines the known set at design time
2. Named tools provide better UX for the common case
3. `call_worker` remains available for dynamic discovery (e.g., worker bootstrapping)
4. AI SDK supports changing tools between `generateText` iterations if needed

### Dynamic Tools in AI SDK

The AI SDK supports several approaches for runtime tool registration:
- Tools are passed per `generateText` call - can change between iterations
- `dynamicTool` function (SDK 5) for tools not known at compile time
- `jsonSchema` function for runtime JSON schema instead of static Zod

For our use case, modifying `this.tools` between iterations is sufficient for future dynamic needs.

## Implementation

1. `WorkerCallToolset` creates one tool per `allowedWorkers` entry
2. Each tool is named after the worker (e.g., `greeter`, `analyzer`)
3. Tool description comes from worker's `description` field in frontmatter
4. The generic `call_worker` tool remains as fallback
5. Schema for worker tools removes the `worker` parameter

## Future Considerations

- Worker bootstrapping: When an orchestrator discovers/creates workers at runtime, it could use `call_worker` or we could add a `register_worker` mechanism
- Tool name conflicts: Worker names should not collide with other tool names (filesystem tools, etc.)
