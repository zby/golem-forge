# CLI correctness + consistency fixes (no core moves yet)

## Prerequisites
- [ ] Confirm answers to open questions (or accept recommended defaults)
- [ ] Tests runnable locally: `npm test -w @golem-forge/cli`

## Goal
Fix known bugs and inconsistencies in `packages/cli` (worker delegation paths, git safety/auth behavior, diagnostics, and a couple UI/tool UX mismatches) without moving code into `@golem-forge/core`.

## Tasks
- [ ] Wire `workerPaths` program config into worker delegation registry
  - `workerPaths` is parsed/mapped but currently unused for delegation search.
  - Implement by creating a `WorkerRegistry` in `packages/cli/src/cli/run.ts` configured with resolved search paths and pass it via `CLIWorkerRuntimeOptions.registry` to `createCLIWorkerRuntime`.
- [ ] Make dynamic toolset import errors visible
  - In `packages/cli/src/runtime/factory.ts`, only treat module-not-found as “unknown toolset”; rethrow other import errors with context.
- [ ] Fix git local push branch check ordering + add safety checks
  - In `packages/cli/src/tools/git/cli-backend.ts`, if `target.branch` is set, verify it before writing/committing.
  - Fail early if repo has pre-existing staged changes (and optionally dirty working tree, see Questions).
- [ ] Honor git credential “explicit” mode for GitHub auth (no host leakage)
  - Update `packages/cli/src/tools/git/auth.ts` so GitHub auth can be sourced from injected env (and optionally disallow `gh`/`process.env` in explicit mode).
  - Plumb credentials env/mode from `packages/cli/src/tools/git/index.ts` → `CLIGitBackend` → auth helper.
- [ ] Remove CLI UI type dependency from git backend
  - Replace `packages/cli/src/tools/git/cli-backend.ts` import of `DiffSummary` from `packages/cli/src/ui/types.ts` with a core-sourced type (via `packages/cli/src/tools/git/backend.ts` re-export).
- [ ] Fix diff summary line counting (include blank lines)
  - `packages/cli/src/ui/diff-renderer.ts:getDiffSummary` undercounts by ignoring blank lines; count consistently.
- [ ] Align shell tool approval UX for blocked commands
  - `packages/cli/src/tools/shell.ts`: blocked-by-rule commands should fail fast without prompting (avoid “approve?” then “blocked”).
- [ ] (Optional) Trim unused CLI dependencies
  - Remove or move unused runtime deps: `isomorphic-git`, `ai`, `@ai-sdk/google`, `@ai-sdk/openai` (verify via tests/build).

## Acceptance Criteria
- Delegated workers are discoverable via program config `workerPaths` without requiring `LLM_DO_PATH`.
- Toolset module load failures show the real underlying error (syntax/runtime), not just “Unknown toolset”.
- Local git push never creates a commit on the wrong branch; fails before side effects when branch mismatched.
- GitHub auth respects credentials mode:
  - `explicit` mode uses only provided env vars (no host `process.env`/`gh` fallback).
  - `inherit` mode can fall back to host env/`gh`.
- Git backend no longer depends on CLI UI types.
- Diff summary counts match displayed diff (including blank lines).
- Blocked shell commands do not prompt for approval.

## Test Plan
- Update/add focused unit tests in `packages/cli`:
  - `packages/cli/src/worker/registry.test.ts` (workerPaths delegation discovery)
  - `packages/cli/src/tools/git/credentials.test.ts` (explicit-mode GitHub token behavior)
  - `packages/cli/src/ui/diff-renderer.test.ts` (blank-line counting)
  - Add a test ensuring toolset import errors are surfaced (fixture toolset module that throws)
- Run `npm test -w @golem-forge/cli`

## Current State
- Plan drafted from code review findings; implementation not started.
- Open questions below need confirmation (or accept recommended defaults).

## Notes
- Out of scope for this plan: moving platform-agnostic CLI utilities into `@golem-forge/core` (see next plan).
- Known follow-up: git update/delete intent is incomplete (staged operations always `create`); not addressed unless expanded.

## Open Questions
1) Should `allow_empty_input: true` allow empty input even without sandbox/tool access?
   - Recommended default: **Yes** (explicit opt-in; keep safe defaults elsewhere).
2) Git local push: fail if working tree has unstaged changes, or only if index has staged changes?
   - Recommended default: **Fail on both** (avoids clobber/mixing).
3) Git update/delete detection: expand schemas now (e.g. explicit delete list), or keep current “stage overwrites provided files only” behavior?
   - Recommended default for this plan: **Keep current semantics**; track as a separate follow-up plan if needed.

