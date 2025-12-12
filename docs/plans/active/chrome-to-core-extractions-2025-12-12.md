# Chrome → Core Extractions (2025-12-12)

## Prerequisites
- [ ] Confirm core/platform boundary for runtime logic (see `docs/notes/core-vs-platform.md`)
- [ ] Decide whether Chrome should use `streamText` (streaming) or `generateText` (non-streaming) as the primary execution engine

## Goal
Reduce duplication and drift by moving platform-agnostic runtime/parsing/approval glue into `@golem-forge/core`, leaving Chrome as adapters (OPFS, Chrome storage, UI wiring).

## Tasks
- [ ] Add a streaming-capable core runtime that mirrors Chrome’s needs
  - Inputs: `RunInput` (incl. attachments), `tools`, `ApprovalController`, optional `RuntimeUI`
  - Engine: `streamText` + `ToolExecutor` (so needsApproval + approvals + message context are correct everywhere)
  - Outputs: `WorkerResult` + consistent UI events for streaming/tool calls
- [ ] Add a core helper to build an approval callback from `RuntimeUI`
  - Something like `createApprovalCallbackFromRuntimeUI(runtimeUI, workerPath, defaultRisk)`
  - Avoid Chrome’s ad-hoc `IApprovalController` + shim object (`packages/chrome/src/services/browser-runtime.ts`)
- [ ] Add a core “error sanitization” utility usable by both CLI and Chrome
  - Keep provider-specific patterns configurable/extendable
  - Avoid copying `sanitizeErrorMessage()` logic between platforms
- [ ] Consolidate worker parsing usage across platforms
  - Chrome should call core `parseWorkerString()` (already platform-agnostic via `yaml`)
  - Delete Chrome’s duplicate YAML/frontmatter parser and keep parser tests in core

## Current State
- Chrome duplicates worker parsing (`packages/chrome/src/services/worker-manager.ts`) even though core is already platform-agnostic (`packages/core/src/frontmatter.ts`, `packages/core/src/worker-parser.ts`).
- Chrome runtime duplicates tool execution/approval logic, and its `RunInput` path diverges dangerously from the main `run()` loop (`packages/chrome/src/services/browser-runtime.ts:958`).

## Notes
- This plan intentionally does not move platform adapters (OPFS sandbox, OPFS git adapter, Chrome storage) into core.
- If remote custom tools are truly desired in-browser, MV3’s “no remote code” constraint likely requires a different approach than `import("https://...")`.

