# Code Review Notes - 2025-12-05

Review of golem-forge codebase (excluding sandbox module which is being reworked).

## Bugs Found

### 1. AI SDK v6 property inconsistency in `worker.ts:543-562`

The code accesses tool call arguments inconsistently:
```typescript
// Line 547: uses tc.input
args: (tc as { input?: unknown }).input ?? {},
// Line 562: also uses tc.input via cast
args: ((tc as { input?: unknown }).input ?? {}) as Record<string, unknown>,
```

The AI SDK v6 uses `input` for tool arguments, but our internal `ToolCall` type uses `args`. The code works but relies on type casts - fragile if the SDK changes.

### 2. `worker.ts:197` - Non-null assertion after cache check

```typescript
return { found: true, worker: this.cache.get(absolutePath)! };
```

Uses `!` assertion assuming `loadWorker` always populates cache on success. If the implementation changes, this could cause runtime errors.

## Inconsistencies

### 1. Approval mode naming: "strict" vs expected "auto_deny"

- `controller.ts:18`: `ApprovalMode = "interactive" | "approve_all" | "strict"`
- `approval.ts`: exports `createAutoDenyCallback()`

The name "strict" is unclear - "auto_deny" would be more descriptive and match the callback name.

### 2. Model resolution differs between CLI and runtime

- `worker.ts:167-218`: `resolveModel()` has careful priority logic
- `run.ts:332`: `model: options.model || workerDefinition.model || effectiveConfig.model`

The CLI doesn't use `resolveModel()` - it has its own inline logic that may diverge.

### 3. Tool `needsApproval` property was unused (FIXED)

`filesystem.ts` defined `needsApproval: true` on `stage_for_commit`, but `worker.ts` never checked this property. All approval logic went through `ApprovedExecutor` → `FilesystemToolset.needsApproval()`.

**Resolution**: Refactored to use `boolean` return + `BlockedError` pattern matching SDK v6.

### 4. `ToolCall.args` vs SDK's `input`

Our `ai/types.ts:25` defines:
```typescript
args: Record<string, unknown>;
```

But AI SDK v6 uses `input`. We convert between them with casts throughout `worker.ts`.

## Potential Improvements

### 1. Large file protection missing in `run.ts:103-141`

`loadAttachments()` reads entire files into memory without size checks first:
```typescript
data = await fs.readFile(candidate);  // Could be GB-sized
```

The policy check happens *after* loading. Should stat the file first.

### 2. Registry uses `fs` directly instead of abstraction

`registry.ts` uses Node.js `fs` throughout. This works for CLI but won't port to browser extension. Consider:
- Accept a file reader interface
- Or document this is CLI-only

### 3. Error messages could include more context

`parser.ts:39`: `error: "Invalid worker definition"` - doesn't include the file path.

## Minor Overengineering (addressed)

### 1. `ApprovalResult` class with factory pattern (REMOVED)

`types.ts:25-66` had a class with private constructor and static factories for 3 states.

**Resolution**: Replaced with simpler `boolean` return + `BlockedError` throw pattern.

### 2. `ApprovalMemory.stableStringify()` handles circular references

`memory.ts:128-146` - Implements full circular reference detection. Tool args are typically simple JSON. Could be YAGNI but harmless.

## Good Patterns Observed

1. **Zod schemas** for worker definition validation - catches errors early
2. **Separation of concerns** - parser/registry/runtime are cleanly separated
3. **Approval system design** - runtime-agnostic callbacks work well
4. **Error types** - custom error classes with meaningful messages
5. **Factory functions** over constructors for complex setup

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Bugs | 2 | Low-Medium |
| Inconsistencies | 4 | Low |
| Improvements | 3 | Low |
| Overengineering | 2 | Trivial (1 fixed) |

The codebase is generally well-structured. Main issues are around AI SDK v6 type handling and some naming inconsistencies.

## Actions Taken

1. Replaced `ApprovalResult` class with `boolean` + `BlockedError` pattern
2. Added test for hallucinated tool calls
3. Updated all approval-related tests
