# CLI Review Findings

Context: packages/cli code review focusing on bugs, safety issues, and inconsistencies.

**Last verified:** 2025-12-10

## Architecture Note

The CLI now uses Core's `WorkerRuntime` (packages/core/src/runtime/worker.ts) via a factory pattern:
- `packages/cli/src/runtime/factory.ts` - Creates tools from worker config and injects into Core's runtime
- The duplicate `packages/cli/src/runtime/worker.ts` has been **deleted**

## Findings Status

### 1. Attachment policies ✅ FIXED

- `enforceAttachmentPolicy` is now called in Core's `WorkerRuntime.addUserMessage()` (worker.ts:821)
- All callers (CLI, worker delegation) go through this path
- Policy is enforced regardless of entry point

### 2. Custom tool module resolution ✅ FIXED

- Resolution logic in `cli/runtime/factory.ts:239-251` checks `workerFilePath` then falls back to `programRoot`
- CLI `run.ts` passes `workerFilePath` when calling the factory
- `WorkerCallToolset` (worker-call.ts:263,311) extracts child worker's `filePath` from registry lookup and passes to child runtime

### 3. Manual-only tools ✅ FIXED

- Core's `WorkerRuntime` now filters tools with `getLLMTools()` before passing to `generateText()` (worker.ts:485)
- Only tools with `mode='llm'` or `mode='both'` (or no config) are exposed to the LLM
- Manual-only tools (`mode='manual'`) are correctly excluded

### 4. Runtime dispose() ✅ FIXED

- CLI `run.ts:523` calls `runtime.dispose()` in finally block
- `WorkerCallToolset` (worker-call.ts:334) calls `childRuntime.dispose()` in finally block
- All runtime paths now clean up properly

## Open Questions

1. Should we add integration tests verifying attachment policy enforcement in delegated workers?

## Code Duplication Note

The duplicate CLI runtime has been deleted. All runtime logic is now in Core's `WorkerRuntime`.
Tool creation remains in CLI's `factory.ts` which is the appropriate separation of concerns.
