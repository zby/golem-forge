# Chrome Extension Code Review (2025-12-12)

## Prerequisites
- [ ] Decide whether “Program” == bundled demo or user-managed stored program
- [ ] Decide whether remote custom tools are supported (MV3 CSP constraints)
- [ ] Confirm desired approval semantics for attachments + delegation

## Goal
Eliminate correctness/security bugs, reduce dead/inconsistent code, and align Chrome runtime behavior with `@golem-forge/core` expectations.

## Tasks

### P0 (Security / Correctness)
- [ ] Remove approval bypass in `BrowserWorkerRuntime.runWithInput()` (`packages/chrome/src/services/browser-runtime.ts:958`)
  - Ensure object `RunInput` (attachments) uses the same approval + needsApproval flow as `run()`
  - Ensure delegated worker calls (which use `runWithInput`) can’t execute tools without approval
  - Ensure tool `needsApproval()` and `execute()` get real `messages` (not `[]`)
- [ ] Add a regression test that proves “attachments cannot bypass approvals”
  - Suggested shape: a fake tool with `needsApproval: true` and a `runtimeUI`/controller that denies; assert tool never executes

### P1 (Consistency / Missing Wiring)
- [ ] Make “open program” navigation actually work or delete it
  - Background stores `pendingProgramId` (`packages/chrome/src/background.ts:100`) but UI never reads it (`packages/chrome/src/contexts/ChromeUIStateContext.tsx:126`)
- [ ] Resolve “two program models” inconsistency
  - `chrome.storage` programs (“projects”) are created and managed (`packages/chrome/src/background.ts:42`, `packages/chrome/src/storage/program-manager.ts:33`)
  - Chat UI only uses bundled programs (`packages/chrome/src/components/ChatTab.tsx:234`)
  - Decide on one source of truth; remove the other path or wire it fully
- [ ] Stop duplicating worker parsing in Chrome
  - Chrome reimplements parsing (`packages/chrome/src/services/worker-manager.ts:32`) while core already provides `parseWorkerString` (`packages/core/src/worker-parser.ts:19`)
  - Switch Chrome to import `parseWorkerString` from core; delete/retire the local YAML parser + tests that only exist to validate it
- [ ] Persist GitHub-synced workers (currently memory-only)
  - `githubWorkerCache` is in-memory and cleared on reload (`packages/chrome/src/services/worker-manager.ts:595`)
  - Either store worker source content in OPFS under the program/source, or store in `chrome.storage.local` with size limits in mind

### P2 (Sandbox / Mount Semantics)
- [ ] Fix mount matching for the root mount target `/`
  - `findMount()` does not treat `target: "/"` as a prefix (`packages/chrome/src/services/opfs-sandbox.ts:437`)
  - This makes a root mount effectively only match the literal `/`, not `/foo`
- [ ] Fail early on invalid mount targets in `createOPFSSandbox()`
  - `mount.target` is not normalized/validated as absolute (`packages/chrome/src/services/opfs-sandbox.ts:480`)

### P3 (Overengineering / Permissions / Docs Drift)
- [ ] Remove or justify unused permissions
  - `identity` is in `packages/chrome/src/manifest.json` but appears unused (no `chrome.identity` usage)
- [ ] Correct `browser-module-loader` design/docs for MV3 CSP
  - It advertises loading tools from full URLs (`packages/chrome/src/services/browser-module-loader.ts:6`), which conflicts with “no remote code” extension policy
  - Either remove URL loading support or make it explicit that only bundled modules are supported
- [ ] Reduce duplicated defaults and init paths
  - Default settings/program are created in background (`packages/chrome/src/background.ts:19`) and again ensured in UI (`packages/chrome/src/sidepanel.tsx`, `packages/chrome/src/storage/program-manager.ts:95`)

## Current State
- `BrowserWorkerRuntime.runWithInput()` has a “simplified” tool execution path that skips approvals entirely (and is used by worker delegation).
- Chrome worker parsing duplicates core parsing and intentionally swallows YAML parse failures (falls back to `{}`), which can hide config errors.
- “Programs” exist both as storage entities and as bundled demos; navigation/messages suggest stored programs, but chat selects bundled programs only.
- GitHub worker syncing is implemented via GitHub Contents API but cached only in-memory, so it’s effectively non-functional across reloads.
- The module loader implies remote ESM loading, which likely can’t work under MV3 CSP.

## Notes
- Core already has the right primitives to reduce drift: `parseWorkerString` (`packages/core/src/worker-parser.ts`) and `ToolExecutor` (`packages/core/src/runtime/tool-executor.ts`).
- For proposed core extractions (streaming runtime, approval callback helpers), see `docs/plans/active/chrome-to-core-extractions-2025-12-12.md`.

