# Core Runtime Fixes (Post-Review)

## Prerequisites
- [ ] None

## Goal
Stabilize `@golem-forge/core` runtime (`packages/core/src/runtime`) by fixing P0 bugs, aligning model/tool plumbing, and trimming/relocating overgrown APIs to match core/platform boundaries.

## Tasks
- [ ] **P0** Make `ToolExecutor` robust to `undefined` and non‑serializable tool outputs.
  - [ ] Add safe stringify helper (handles `undefined`, circular, BigInt).
  - [ ] Ensure event/UI output paths never assume `.length` on non‑strings.
  - [ ] Add vitest cases: `undefined` return, circular object, BigInt.
- [ ] **P0** Honor delegated sandbox via `sharedSandbox` in `WorkerRuntime`.
  - [ ] Prefer `options.sandbox ?? options.sharedSandbox` when setting runtime sandbox.
  - [ ] Add/adjust test asserting `getSandbox()` reflects `sharedSandbox`.
- [ ] **P1** Apply `ProviderOptions.headers` to OpenAI/OpenRouter model creation.
  - [ ] Thread headers through `createOpenAI` calls.
  - [ ] Add tests (mock provider creation) verifying headers are passed.
- [ ] **P1** Remove misleading comments about AI SDK tool/approval handling in `WorkerRuntime`.
- [ ] **P1** Fix observability mismatch: `message_send.toolCount` should report LLM‑invokable tools count.
- [ ] **P2** Audit unused `WorkerRunnerOptions` fields.
  - [ ] Either implement intended behavior in core runtime, or move to platform-only types.
  - [ ] Remove/mark dead fields to reduce confusion.
- [ ] **P2** Remove env‑based model creation duplication.
  - [ ] Prefer `ModelFactory`/injected model path for core agnosticism.
  - [ ] Keep env model creation in platform factory if still needed for CLI.

## Current State
- Review completed; issues identified and prioritized.
- No fixes applied yet.

## Notes
- Critical crash: `ToolExecutor` uses `JSON.stringify(output)` then `.length` without guarding; `undefined` or circular outputs will throw.
- Delegation inconsistency: `sharedSandbox` exists in options but is ignored by runtime constructor.
- Headers only applied to Anthropic; OpenAI/OpenRouter silently drop them.
- Runtime claims AI SDK handles tool execution/approval, but core does manual execution; comments need correction.
- `WorkerRunnerOptions` is broader than core runtime behavior; likely needs split or cleanup.
