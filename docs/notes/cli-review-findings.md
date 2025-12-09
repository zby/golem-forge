# CLI Review Findings

Context: packages/cli code review focusing on bugs, safety issues, and inconsistencies.

**Last verified:** 2025-12-09

## Architecture Note

There are two `WorkerRuntime` implementations:
- `packages/core/src/runtime/worker.ts` - Platform-agnostic, expects **tools to be injected**
- `packages/cli/src/runtime/worker.ts` - CLI-specific, **creates tools from toolsets config**

The CLI uses its own version. The bugs below apply to `packages/cli/src/runtime/worker.ts`.

## Findings

### 1. Attachment policies bypassed by non-CLI callers ⚠️ STILL PRESENT

- `enforceAttachmentPolicy` is only executed in `src/cli/run.ts:461`, before the CLI hands work to the runtime.
- Delegated executions (`tools/worker-call.ts:258`) read attachments via `readAttachments()` and pass them directly to child workers without policy enforcement.
- Risk: workers that depend on policy limits (max attachments, suffix allow/deny lists) can be fed arbitrary files, defeating the safety contract.

### 2. Custom tool modules cannot be resolved relative to worker files ⚠️ PARTIALLY FIXED

- Resolution logic added to `runtime/worker.ts:451-464` - checks `workerFilePath` then falls back to `programRoot`.
- **However:**
  - CLI `run.ts:542-551` never passes `workerFilePath` to `createWorkerRuntime()`
  - `WorkerCallToolset` (`worker-call.ts:302-317`) doesn't pass it when creating child runtimes
- Result: relative module paths still fail for main worker and delegated workers.

### 3. Manual-only tools are still exposed to the LLM ❌ STILL PRESENT

- Tools mark UI-only operations via `manualExecution.mode: "manual"` (e.g., `git_push`), and the UI helpers respect that flag.
- The runtime passes ALL tools to `generateText` (`worker.ts:619-623`):
  ```typescript
  tools: hasTools ? this.tools : undefined,
  ```
- `getLLMTools()` filter exists in `ui/tool-info.ts:67-82` but is **never called** before `generateText()`.
- Risk: LLM can auto-call `git_push` and other manual-only tools, defeating the safety boundary.

### 4. Delegated worker runtimes never call dispose() ❌ STILL PRESENT

- `WorkerRuntime` installs UI event subscriptions in `setupUISubscriptions()` and only removes them in `dispose()`.
- Neither the CLI (`run.ts:574`) nor `WorkerCallToolset` (`worker-call.ts:328`) call `dispose()` after execution.
- Impact: leaked subscriptions, potential duplicate tool executions, memory/resource leaks over long sessions.

## Open Questions

1. Should attachment policy enforcement move into `WorkerRuntime.run`, or should worker-call explicitly re-check policies before forwarding attachments?
2. What is the desired manual-tool contract? Should the runtime filter tools using `getLLMTools` before exposing them to the model, or should tool authors be warned that manual mode is advisory only?
3. What lifecycle API should callers use to guarantee runtime cleanup? Should `createWorkerRuntime` (and `WorkerCallToolset`) own disposal automatically?

## Code Duplication Note

`packages/core/src/runtime/worker.ts` and `packages/cli/src/runtime/worker.ts` share ~600 lines of nearly identical code. The CLI version adds `registerTools()` which creates tools from the worker's `toolsets` config.

**Resolution:** See `docs/plans/core-runtime-refactor.md` - the plan is to:
1. Fix bugs in Core's WorkerRuntime (manual tools, dispose, etc.)
2. Create `cli/src/runtime/factory.ts` that assembles tools and calls Core's runtime
3. Delete CLI's duplicate `runtime/worker.ts`

The bugs above should be fixed in **Core's WorkerRuntime**, not CLI's copy, since CLI's copy will be deleted.
