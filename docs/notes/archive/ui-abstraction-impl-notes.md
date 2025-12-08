# UI Abstraction Layer - Implementation Notes

Review notes for commit 0ba42c2 (feat(ui): add UI abstraction layer).

## Bugs Fixed

### 1. Case-sensitivity inconsistency in `classifyCommand` ✅

**Problem:** Direct tool invocation used original case while built-in commands used lowercase.

**Fix:** Added case-insensitive tool matching using `find()` with lowercase comparison. Returns the original tool name from the available tools list to preserve canonical casing.

### 2. Negative number arguments mishandled ✅

**Problem:** A value like `-5` was treated as a flag, not a number value.

**Fix:** Added `isNegativeNumber()` and `isValueToken()` helper functions that detect numeric patterns like `-5`, `-3.14`, `-.5`. Now `/tool foo --count -5` correctly sets `count: "-5"`.

### 3. Unclosed quote handling ✅

**Problem:** The tokenizer silently produced unexpected results for unclosed quotes.

**Fix:** Added `CommandParseError` class. Tokenizer now throws with descriptive messages including the position of the unclosed quote or trailing backslash.

### 4. Interruption timing ✅

**Problem:** Interruption check happened after `currentIteration` was incremented.

**Fix:** Moved the interruption check before `currentIteration` assignment. Now `totalIterations` correctly reports 0 if interrupted before the first iteration starts.

### 5. Depth validation ✅

**Problem:** Worker depth accepted negative values without validation.

**Fix:** Added validation in `WorkerRuntime` constructor that throws if depth is negative or non-integer.

---

## Placeholder Features (Keep As-Is)

### `displayDiff` - Placeholder Implementation

The diff display in `cli-adapter.ts:373-394` just prints:
```typescript
output.write(pc.dim("(diff display)") + "\n");
output.write(diff.modified + "\n");
```

**Status:** This is intentional - proper diff display is planned for Phase 4. The placeholder allows the interface to be complete while the full implementation is deferred.

### `enableRawMode` - Not Yet Implemented

The `CLIAdapterOptions.enableRawMode` option exists but doesn't actually enable raw mode. The code comment explains:
```typescript
// Note: Full implementation would use raw mode to capture Esc
// For now, we use readline's 'close' event as a proxy for Ctrl+C
```

**Why it exists:** The option is part of the interface design for future Esc key handling. True raw mode requires careful handling of terminal state and is complex to implement correctly. The current Ctrl+C proxy works for basic interruption.

**Future work:** Implement raw mode with proper terminal state management, Esc key detection, and cleanup on exit.

### `WorkerInfo.id` - Reserved for Future Use

The `WorkerInfo` interface has an `id` field that isn't currently displayed in approval dialogs (only `task` is shown). This field is reserved for:
- Future worker tree visualization
- Debugging/tracing worker delegation chains
- Correlation with runtime events

---

## Architecture Decisions

### ApprovalController vs UIAdapter.requestApproval

**Current state:** Two approval mechanisms exist:
1. `ApprovalController` (in `src/approval/`) - handles tool approval with modes (interactive, approve_all, auto_deny) and session memory
2. `UIAdapter.requestApproval` (in `src/ui/`) - UI-layer approval display

**Relationship:** These serve different purposes:
- `ApprovalController` is the **approval logic** - decides whether to prompt, caches decisions, handles modes
- `UIAdapter.requestApproval` is the **approval UI** - displays the prompt, collects user input

**Integration path:** The `ApprovalController` should use `UIAdapter` as its presentation layer:
```typescript
// In ApprovalController (conceptual)
if (this.mode === "interactive") {
  const result = await this.uiAdapter.requestApproval({
    type: "tool_call",
    description: formatToolDescription(request),
    details: request.toolArgs,
    risk: assessRisk(request),
    workerPath: buildWorkerPath(delegationContext),
  });
  return convertUIResultToDecision(result);
}
```

**Recommendation:** Keep both, but wire them together:
- `ApprovalController` remains the source of truth for approval logic
- Add optional `UIAdapter` injection to `ApprovalController`
- When UI adapter is present, use it for interactive prompts
- This allows headless mode (no UI adapter) and custom UIs (browser, etc.)

### WorkerResult vs CallWorkerResult vs ToolResult

Three similar-but-different result types exist:

| Type | Location | Purpose |
|------|----------|---------|
| `WorkerResult` | `runtime/interfaces.ts` | Return type of `WorkerRunner.run()` |
| `CallWorkerResult` | `tools/worker-call.ts` | Return type of worker delegation tools |
| `ToolResult<T>` | `ui/types.ts` | Generic discriminated union for any tool |

**Differences:**
- `WorkerResult`: has `cost?` field
- `CallWorkerResult`: has `workerName` field, no `cost`
- `ToolResult<T>`: discriminated union with `type: "success" | "error" | "interrupted"`

**Is WorkerResult still needed?**

Yes, but consider consolidation:
- `WorkerResult` is the interface contract for `WorkerRunner`
- `CallWorkerResult` could potentially extend `WorkerResult` and add `workerName`
- `ToolResult<T>` is a different pattern (discriminated union) for UI-layer handling

The new `ToolResult<T>` in UI types is actually useful for UI code that needs to handle all three states uniformly. It doesn't replace `WorkerResult`.

**Recommendation:**
- Keep `WorkerResult` as the runtime interface
- Consider having `CallWorkerResult` extend `WorkerResult` to reduce duplication
- `ToolResult<T>` serves a different purpose and should stay separate

---

## Missing Tests

The commit claims 59 tests but lacks coverage for:
- `CLIAdapter` class (the main implementation)
- Edge cases in tokenizer (unclosed quotes, empty strings, escape at end)
- Integration between `UIAdapter` and existing approval flow

---

## Minor Issues

- `groupBy` helper in `cli-adapter.ts:43-53` is inline and untested - consider moving to a utils module
- `ToolCall` interface in `types.ts` is defined but unused in this commit
- `depth` parameter accepts negative values without validation
- Repeated `as NodeJS.WriteStream` casts in `cli-adapter.ts` - should be a helper method
