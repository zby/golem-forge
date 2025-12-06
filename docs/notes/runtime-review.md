# Runtime Module Review

**Status:** Fixed (2024-12-06)

## Fixes Applied

- Deleted broken `worker.integration.test.ts` (user action)
- Fixed `totalIterations` bug in error catch - now tracks actual iteration count
- Fixed event type mismatch - added `RuntimeEventData` type for events without timestamp
- Unknown toolsets now throw error instead of silently skipping
- Added `initialize()` guard in `run()` - throws if not initialized
- Added `dispose()` method (no-op for now, hook for future cleanup)
- Added `BACKCOMPAT` marker to `getToolArgs` for AI SDK version compat
- Added tests for new behaviors (32 tests in runtime, 384 total)
- Added "fail early" principle to AGENTS.md

## Original Summary

Code review of `src/runtime/` identified issues across several categories:

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Bug | 2 |
| Inconsistency | 2 |
| Missing functionality | 2 |
| Test coverage gap | 4 |
| Minor | 4 |

## Critical Issues

### 1. Broken Integration Test (`worker.integration.test.ts`)

The integration test file is completely non-functional:

```typescript
// These imports don't exist:
import { Context, defineTool, toToolResults } from '@mariozechner/lemmy';
import { textResponse, toolCallResponse, getTestClient } from '../testing/index.js';
```

Problems:
- `@mariozechner/lemmy` is not in project dependencies
- `textResponse`, `toolCallResponse`, `getTestClient` are not exported from testing module
- File is excluded from test runner (`src/**/*.integration.test.ts` in exclude pattern)
- Tests a different system entirely, not `WorkerRuntime`

**Decision:** Delete the file.

## Bugs

### 2. Wrong `totalIterations` in Error Catch (`worker.ts:679`)

```typescript
} catch (err) {
  this.emit({
    type: "execution_error",
    totalIterations: 0,  // BUG: always 0, should track actual count
    ...
  });
}
```

The loop variable `iteration` is scoped to the for-loop and not accessible in the catch block. If `generateText` fails mid-execution, the iteration count is lost.

**Fix:** Track iteration count in a variable declared before the try block.

### 3. Event Type Mismatch (`worker.ts:285`)

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
private emit(event: any): void {
  if (this.onEvent) {
    this.onEvent({ ...event, timestamp: new Date() });
  }
}
```

Events passed to `emit()` don't have `timestamp`, but `BaseEvent` interface requires it. The `any` type hides this mismatch.

**Fix:** Create a separate `EventWithoutTimestamp` type or use `Omit<RuntimeEvent, 'timestamp'>`.

## Inconsistencies

### 4. Incomplete Cached Approval Tracking (`worker.ts:591`)

```typescript
this.emit({
  type: "approval_decision",
  cached: false, // TODO: detect if cached from controller
  ...
});
```

TODO left in production code. The `ApprovalController` should expose whether a decision was cached.

### 5. Silent Toolset Skipping (`worker.ts:398-399`)

```typescript
default:
  // Silently skip unknown toolsets - they may be handled elsewhere
  break;
```

Configuration typos (e.g., `filesytem` instead of `filesystem`) fail silently.

**Decision:** Throw error. Per AGENTS.md "fail early" principle.

## Missing Functionality

### 6. No Cleanup/Dispose Method

`WorkerRuntime` creates resources:
- Sandbox (potentially with temp directories)
- Approval controller

No way to release them. Potential memory/file leaks in long-running processes.

**Add:**
```typescript
async dispose(): Promise<void> {
  if (this.sandbox && !this.options.sharedSandbox) {
    await this.sandbox.cleanup?.();
  }
}
```

### 7. No `initialize()` Guard in `run()`

If someone calls `run()` without calling `initialize()` first:
- Tools won't be registered
- Execution proceeds with empty tool set
- No warning

**Decision:** Throw error if not initialized. Per AGENTS.md "fail early" principle.

## Test Coverage Gaps

### 8. Missing Tests For:

1. **Attachment handling** (`worker.ts:430-449`) - multimodal input with images/PDFs
2. **Event emission system** - verify all event types emit correctly
3. **Shared controller/sandbox** - delegation scenarios with `sharedApprovalController` and `sharedSandbox`
4. **Google provider** (`worker.ts:219-222`) - only Anthropic and OpenAI are implicitly tested

## Minor Issues

### 9. Multiple `eslint-disable` for `any` Types

Lines 284, 526-527, 654-655 use `eslint-disable` for `any`. Indicates type misalignment with AI SDK.

Consider creating proper type definitions or updating to match AI SDK v6 types.

### 10. Verbose Zone Approval Config Building (`worker.ts:338-358`)

```typescript
const zoneApprovalConfig: ZoneApprovalMap = {};
const zones = this.worker.sandbox?.zones;
if (zones) {
  for (const zone of zones) {
    if (zone.approval) {
      zoneApprovalConfig[zone.name] = {
        write: zone.approval.write,
        delete: zone.approval.delete,
      };
    }
  }
}
```

Could be simplified to:
```typescript
const zoneApprovalConfig = Object.fromEntries(
  (this.worker.sandbox?.zones ?? [])
    .filter(z => z.approval)
    .map(z => [z.name, { write: z.approval!.write, delete: z.approval!.delete }])
);
```

### 11. Backcompat Code Missing Removal Marker (`worker.ts:120-124`)

```typescript
function getToolArgs(toolCall: { args?: unknown; input?: unknown }): Record<string, unknown> {
  // AI SDK v6 uses 'input', earlier versions used 'args'
  const rawArgs = toolCall.input ?? toolCall.args ?? {};
  return rawArgs as Record<string, unknown>;
}
```

Comment explains the compatibility, but doesn't indicate when it can be removed. Should include something like `// TODO: Remove args fallback once AI SDK <6 support dropped`.

### 12. Inconsistent Error Truncation (`worker.ts:620-638`)

Normal output truncated at 1000 chars for events, but error output is not truncated. Could lead to very long error messages in trace output.

## File Quality Summary

| File | Status |
|------|--------|
| `events.ts` | Clean, well-structured |
| `index.ts` | Clean re-export |
| `worker.ts` | Functional but needs fixes |
| `worker.test.ts` | Good coverage, missing some scenarios |
| `worker.integration.test.ts` | **Broken, delete or rewrite** |

## Recommended Priority

1. **Immediate:** Delete or fix `worker.integration.test.ts` (provides false confidence)
2. **High:** Fix `totalIterations` bug in error handling
3. **Medium:** Add `dispose()` method, add `initialize()` guard
4. **Low:** Address type safety, add missing tests
