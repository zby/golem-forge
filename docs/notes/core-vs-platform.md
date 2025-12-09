# Architecture Decision: Core vs Platform Packages

**Status:** Accepted
**Date:** 2025-12-09

---

## Summary

**Core = Logic, Platform Packages = Adapters**

The `@golem-forge/core` package owns all runtime logic, tool registries, and shared services.
Platform packages (`@golem-forge/cli`, `@golem-forge/chrome`) must only provide adapters:
sandbox creation, worker registries, UI bridges, and platform-specific backends.

---

## The Boundary Rule

### Core Package (`@golem-forge/core`) Owns:

- **Runtime loop**: `WorkerRuntime`, `createWorkerRuntime`, `ToolExecutor`
- **AI SDK integration**: All imports from `ai` and `@ai-sdk/*` packages
- **Tool registries**: `ToolsetRegistry`, toolset factories
- **Approval system**: `ApprovalController`, `ApprovalMemory`
- **Type definitions**: `NamedTool`, `WorkerRunner`, `RuntimeEvent`, etc.
- **Shared utilities**: `matchModelPattern`, worker parsing, sandbox types

### Platform Packages Must Only Provide:

- **Sandbox implementations**: `createMountSandbox` (CLI), `createOPFSSandbox` (Chrome)
- **Worker registries**: File-based (CLI), bundled (Chrome)
- **UI adapters**: Ink terminal UI (CLI), React web UI (Chrome)
- **Backend implementations**: Git CLI backend (CLI), isomorphic-git with OPFS (Chrome)
- **Factory functions**: `createCLIWorkerRuntime`, `createBrowserRuntime` that call core

---

## Allowed vs Disallowed Code

### ✅ Allowed in Platform Packages

```typescript
// Good: Import runtime from core, use it
import { createWorkerRuntime, WorkerRuntime } from "@golem-forge/core";

// Good: Create platform-specific sandbox
const sandbox = createMountSandbox({ root: programRoot });

// Good: Call core's runtime with injected tools
const runtime = await createWorkerRuntime({
  worker,
  tools: platformTools,
  sandbox,
});

// Good: Implement platform-specific backends
class CLIGitBackend implements GitBackend { ... }
```

### ❌ Disallowed in Platform Packages

```typescript
// Bad: Direct AI SDK imports (should be in core only)
import { streamText, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

// Bad: Reimplementing runtime loop
class BrowserWorkerRuntime {
  async run() {
    const result = await streamText({ ... }); // Should use core's runtime
  }
}

// Bad: Duplicating core utilities
export function matchModelPattern() { ... } // Already in core

// Bad: Defining runtime types that belong in core
interface WorkerRunner { ... } // Already in core
```

---

## Checklist: When Adding New Code

Ask these questions before adding a new service or feature:

1. **Can this live in core?** If it's not platform-specific, it belongs in core.
2. **Does this call AI SDK directly?** If yes, it must be in core.
3. **Is this reimplementing something core already does?** If yes, use core's version.
4. **Is this a platform-specific adapter?** If yes, it can be in the platform package.

### Quick Reference

| I want to...                          | Goes in...    | Why                                 |
| ------------------------------------- | ------------- | ----------------------------------- |
| Call `generateText`/`streamText`      | `core`        | AI SDK integration is core's job    |
| Create a new toolset                  | `core`        | Tools are portable across platforms |
| Implement sandbox for a new platform  | Platform pkg  | Sandboxes are platform-specific     |
| Add a new approval mode               | `core`        | Approval logic is shared            |
| Create UI components                  | Platform pkg  | UI is platform-specific             |
| Add model provider support            | `core`        | Provider factories belong in core   |
| Implement worker file loading         | Platform pkg  | File access is platform-specific    |

---

## Backcompat Exemptions

Current known exemptions that need future refactoring:

### `packages/chrome/src/services/browser-runtime.ts`

**Issue:** Contains full runtime loop with `streamText` calls.
**Reason:** Chrome extension was built before core's runtime was abstracted.
**Plan:** Refactor to use `createWorkerRuntime` from core with a streaming adapter.
**Tracking:** TODO - create issue for browser runtime consolidation.

### `packages/cli/src/ai/types.ts`

**Issue:** Imports `Tool` type directly from `ai`.
**Reason:** Type re-export convenience.
**Plan:** Re-export `Tool` type from core's public API.

---

## Enforcement

This boundary is enforced by:

1. **ESLint rules** - Flag imports from `ai` and `@ai-sdk/*` in platform packages
2. **Static checker** - CI script that scans for forbidden patterns
3. **Code review** - PRs touching platform packages should verify no runtime duplication

See `scripts/check-architecture.ts` for the automated checks.

---

## Open Questions

- Should Chrome's `ai-service.ts` (model creation) move to core with a pluggable provider registry?
- Should we create a streaming adapter interface in core that both platforms implement?
