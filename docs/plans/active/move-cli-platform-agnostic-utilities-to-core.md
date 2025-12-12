# Move CLI platform-agnostic utilities into `@golem-forge/core`

## Prerequisites
- [ ] Complete `cli-correctness-and-consistency-fixes.md` first (this plan assumes those fixes are already merged)
- [ ] `npm run check:arch` available and passing baseline

## Goal
Move reusable, platform-agnostic logic/types currently living in `packages/cli/src/ui/*` and related helpers into `@golem-forge/core`, leaving `packages/cli` with platform adapters only (Ink UI, Node-specific backends).

## Tasks
- [ ] Identify portable modules to relocate (no Ink/Node deps)
  - Candidate modules:
    - `packages/cli/src/ui/command-parser.ts`
    - `packages/cli/src/ui/schema-to-fields.ts`
    - `packages/cli/src/ui/result-utils.ts` (especially `toTypedToolResult`)
    - `packages/cli/src/ui/tool-info.ts` (or split: keep only UI mapping if core already has filtering)
    - `packages/cli/src/ui/interrupt.ts`
    - `packages/cli/src/ui/headless-adapter.ts`
    - Platform-agnostic type definitions in `packages/cli/src/ui/types.ts` (ManualTool*, UIApproval*, TypedToolResult, etc.)
- [ ] Move code into `packages/core` with stable exports
  - Add/adjust exports in `packages/core` so CLI and Chrome can import without pulling Ink/Node dependencies.
- [ ] Update CLI imports + re-export shims
  - Keep minimal re-export files in `packages/cli` where needed to avoid churn, but prefer direct core imports.
- [ ] Enforce architecture boundary
  - Run and fix `npm run check:arch` violations.
- [ ] Verify both CLI and Chrome compile
  - CLI: `npm test -w @golem-forge/cli`
  - Chrome: `npm run build -w @golem-forge/chrome` (or targeted checks used by the repo)

## Acceptance Criteria
- Portable utilities/types are owned by `@golem-forge/core` and imported by CLI/Chrome from there.
- `packages/cli/src/ui/ink/**` remains as CLI-only adapter code.
- `npm run check:arch` passes.
- CLI tests pass unchanged (or updated only for import paths).

## Current State
- Plan drafted; intended to be executed after the CLI fixes plan is complete.

## Notes
- Watch for circular deps: core must not import CLI or Ink.
- `@golem-forge/ui-react` integration should remain UI-layer; only move pure logic/types into core.

