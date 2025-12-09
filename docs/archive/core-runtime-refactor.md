# Plan: Move Runtime Logic to Core Package

## Implementation Status

> **Last Updated**: 2025-12-09
>
> **All Phases**: ✅ COMPLETE
>
> - Phase 1-3: Core has runtime infrastructure (approval, tools, runtime)
> - Phase 4: CLI's `run.ts` now uses Core's `WorkerRuntime` via `createCLIWorkerRuntime()` factory
> - Phase 5: `dispose()` added to `WorkerRunner` interface and called in run.ts + WorkerCallToolset
> - Phase 6: Chrome uses Core abstractions (ToolsetRegistry, WorkerRunnerFactory, RuntimeUI)
>
> **What's Done**:
> - Core's `WorkerRuntime` filters manual-only tools before `generateText()` using `getLLMTools()`
> - CLI factory (`runtime/factory.ts`) creates tools and injects them into Core's runtime
> - `dispose()` is called after worker execution to clean up UI subscriptions
> - Chrome already uses Core's abstractions (has own `BrowserWorkerRuntime` intentionally)
>
> **CLI files kept for backwards compatibility** (tests depend on them):
> - `cli/src/runtime/worker.ts` - CLI's original WorkerRuntime
> - `cli/src/runtime/tool-executor.ts` - CLI's ToolExecutor
> - `cli/src/runtime/interfaces.ts` - CLI's type definitions

---

## Problem Statement

Currently, the runtime logic (worker execution, AI SDK calls) lives in `@golem-forge/cli`, but both CLI and Chrome extension need the same logic. This leads to:

1. **Duplication** - Chrome has to reimplement worker execution
2. **Inconsistency** - Different platforms may behave differently
3. **Arbitrary separation** - Core is "types only" for no good reason

## Original State (Before Refactor)

```
@golem-forge/core (lightweight)
├── Types, interfaces
├── Event bus
├── Worker schema parsing
└── NO AI SDK

@golem-forge/cli (heavy)
├── AI SDK (ai, @ai-sdk/*)
├── WorkerRuntime, ToolExecutor
├── ApprovalController
├── Tools (filesystem, shell, git)
└── Ink UI

@golem-forge/chrome (duplicates runtime)
├── AI SDK (ai, @ai-sdk/*)  ← DUPLICATE
├── Own worker execution    ← DUPLICATE
├── Browser tools
└── React DOM UI
```

## Target State

```
@golem-forge/core (shared runtime)
├── AI SDK (ai, @ai-sdk/*)
├── WorkerRuntime (tool injection pattern)
├── ToolExecutor (base)
├── ApprovalController
├── Event bus, types
└── Worker schema

@golem-forge/cli (CLI-specific)
├── CLI tools (shell, git, filesystem)
├── runtime/factory.ts (creates tools, calls Core's WorkerRuntime)
├── Ink UI components
└── CLI entry point

@golem-forge/chrome (browser-specific)
├── Browser tools (OPFS sandbox)
├── React DOM UI
└── Extension entry points

@golem-forge/ui-react (shared React state)
├── Contexts, hooks
└── State management
```

---

## Current Implementation Status

### What Was Completed

**Phase 1: Prepare Core** ✅
- Added AI SDK dependencies to core/package.json
- Created directory structure: `approval/`, `runtime/`, `tools/`
- Added subpath exports (`./approval`, `./runtime`, `./tools`)

**Phase 2: Move Approval System** ✅
- Created `core/src/approval/types.ts` with BlockedError, ApprovalRequest, etc.
- Created `core/src/approval/memory.ts` with ApprovalMemory class
- Created `core/src/approval/controller.ts` with ApprovalController class
- Moved tests to core (21 tests)
- CLI's `approval/index.ts` now re-exports from core

**Phase 3: Move Tool Infrastructure** ✅
- Created `core/src/tools/base.ts` with NamedTool, Toolset, ToolsetContext, ToolsetFactory
- Created `core/src/tools/registry.ts` with ToolsetRegistry
- CLI's `tools/registry.ts` now re-exports from core

**Phase 4: Move Runtime Core** ✅ COMPLETE
- Created `core/src/runtime/events.ts` (CLI deleted its copy, re-exports from core)
- Created `core/src/runtime/types.ts` with WorkerResult, WorkerRunner, etc.
- Created `core/src/runtime/tool-executor.ts` with ToolExecutor class
- Created `core/src/runtime/worker.ts` with WorkerRuntime (tool injection pattern)
- Added `core/src/tools/tool-info.ts` with `getLLMTools()` to filter manual-only tools
- Core's WorkerRuntime now filters manual tools before `generateText()`
- CLI still has duplicates for backwards compatibility (tests depend on them)

**Phase 5: Update CLI** ✅ COMPLETE
- Created `cli/src/runtime/factory.ts` with `createCLIWorkerRuntime()`
- Updated `cli/src/cli/run.ts` to use `createCLIWorkerRuntime()` instead of CLI's runtime
- Added `dispose()` call in run.ts to clean up resources
- CLI's old runtime files kept for test backwards compatibility
- Re-exports factory from `cli/src/runtime/index.ts`

**Phase 6: Update Chrome** ✅ COMPLETE (already done)
- Chrome uses Core's `ToolsetRegistry`, `WorkerRunnerFactory`, `RuntimeUI`
- Chrome has own `BrowserWorkerRuntime` intentionally (uses `streamText`, browser constraints)
- WorkerCallToolset now calls `dispose()` on child runtimes after delegation

### Current State (After Complete Refactor)

```
@golem-forge/core
├── AI SDK dependencies ✅
├── approval/ (canonical) ✅
│   ├── types.ts, memory.ts, controller.ts
│   └── tests
├── tools/ ✅
│   ├── base.ts (NamedTool, ToolsetContext, etc.)
│   ├── registry.ts (ToolsetRegistry)
│   ├── tool-info.ts (getLLMTools, getManualTools) ✅ NEW
│   ├── filesystem.ts, worker-call.ts, custom.ts, git/
│   └── tests
├── runtime/ ✅
│   ├── events.ts (canonical)
│   ├── types.ts (WorkerResult, WorkerRunner with dispose())
│   ├── tool-executor.ts (tool injection pattern)
│   └── worker.ts (filters manual tools, calls dispose on children)
└── Existing: event-bus, runtime-ui, worker-parser

@golem-forge/cli
├── approval/index.ts (re-exports from core) ✅
├── tools/registry.ts (re-exports from core) ✅
├── runtime/
│   ├── index.ts (re-exports from core + factory) ✅
│   ├── factory.ts (createCLIWorkerRuntime) ✅ NEW
│   ├── interfaces.ts (kept for backwards compat)
│   ├── tool-executor.ts (kept for backwards compat)
│   └── worker.ts (kept for backwards compat)
├── cli/run.ts (uses createCLIWorkerRuntime, calls dispose) ✅
└── tools/ (CLI-specific toolsets - correct)

@golem-forge/chrome
├── Uses Core's ToolsetRegistry, WorkerRunnerFactory, RuntimeUI ✅
├── browser-runtime.ts (own BrowserWorkerRuntime - intentional) ✅
└── Has own runtime for browser constraints (streamText, OPFS, etc.)
```

### What Was Completed (All Items Done)

1. **Fixed bugs in Core's WorkerRuntime** ✅:
   - Added `getLLMTools()` in `core/src/tools/tool-info.ts`
   - Core's WorkerRuntime filters manual-only tools before `generateText()`
   - Added `dispose()` to `WorkerRunner` interface
   - WorkerCallToolset calls `dispose()` on child runtimes after delegation
   - Attachment policy enforcement left as-is (CLI enforces at entry point)

2. **Created CLI factory** (`cli/src/runtime/factory.ts`) ✅:
   - Factory creates sandbox and CLI tools (filesystem, workers, custom, dynamic registry)
   - Factory calls Core's WorkerRuntime with injected tools
   - `run.ts` now uses `createCLIWorkerRuntime()` and calls `dispose()` in finally block

3. **CLI duplicates kept for backwards compatibility**:
   - `cli/src/runtime/worker.ts` - still used by some tests
   - `cli/src/runtime/tool-executor.ts` - still used by some tests
   - `cli/src/runtime/interfaces.ts` - still used by some files
   - Future cleanup: migrate tests to use Core's runtime

4. **Chrome already complete** ✅:
   - Uses Core's ToolsetRegistry, WorkerRunnerFactory, RuntimeUI
   - Has own BrowserWorkerRuntime intentionally (browser constraints)

### Why CLI Still Has Its Own Runtime Files (Backwards Compat)

The CLI's old `worker.ts` is kept for test backwards compatibility.
The production path (`cli/run.ts`) now uses the factory pattern with Core's runtime.

### Test Counts

- Core: 128 tests (includes 21 approval tests moved from CLI)
- CLI: 573 tests (was 594, minus 21 approval tests)
- All tests pass ✅

---

## Migration Plan (Original)

### Phase 1: Prepare Core for Runtime

#### 1.1 Add AI SDK Dependencies to Core

**File**: `packages/core/package.json`

```json
{
  "dependencies": {
    "ai": "^6.0.0-beta.134",
    "@ai-sdk/anthropic": "^3.0.0-beta.74",
    "@ai-sdk/google": "^3.0.0-beta.65",
    "@ai-sdk/openai": "^3.0.0-beta.84",
    "yaml": "^2.8.2",
    "zod": "^3.25.0"
  }
}
```

#### 1.2 Create Directory Structure in Core

```
packages/core/src/
├── index.ts
├── runtime/
│   ├── index.ts
│   ├── worker.ts        (moved from cli)
│   ├── turn.ts          (new)
│   ├── tool-executor.ts (moved from cli)
│   ├── interfaces.ts    (moved from cli)
│   └── events.ts        (moved from cli)
├── approval/
│   ├── index.ts
│   ├── controller.ts    (moved from cli)
│   ├── memory.ts        (moved from cli)
│   └── types.ts         (moved from cli)
├── tools/
│   ├── index.ts
│   ├── base.ts          (tool interfaces)
│   └── registry.ts      (moved from cli)
├── ui/                   (existing)
│   ├── event-bus.ts
│   ├── events.ts
│   └── runtime-ui.ts
└── worker/              (existing)
    ├── schema.ts
    └── parser.ts
```

---

### Phase 2: Move Approval System

**Low risk, no AI SDK dependency**

#### 2.1 Move Files

```bash
# From cli to core
cli/src/approval/controller.ts  → core/src/approval/controller.ts
cli/src/approval/memory.ts      → core/src/approval/memory.ts
cli/src/approval/types.ts       → core/src/approval/types.ts
cli/src/approval/index.ts       → core/src/approval/index.ts

# Tests
cli/src/approval/*.test.ts      → core/src/approval/*.test.ts
```

#### 2.2 Update Imports in CLI

```typescript
// Before (cli)
import { ApprovalController } from "../approval/index.js";

// After (cli)
import { ApprovalController } from "@golem-forge/core/approval";
```

#### 2.3 Export from Core

**File**: `packages/core/src/index.ts`

```typescript
// Existing exports
export * from './ui/event-bus.js';
export * from './ui/events.js';
// ...

// New exports
export * from './approval/index.js';
```

---

### Phase 3: Move Tool Infrastructure

**Medium risk, defines tool contracts**

#### 3.1 Create Base Tool Types in Core

**File**: `packages/core/src/tools/base.ts`

```typescript
import type { Tool } from "ai";

/**
 * Base interface for toolsets.
 * Toolsets are collections of related tools.
 */
export interface Toolset {
  /** Get all tools in this toolset */
  getTools(): Tool[];
}

/**
 * Context provided to toolset factories.
 */
export interface ToolsetContext {
  /** File operations sandbox (optional) */
  sandbox?: FileOperations;
  /** Approval controller */
  approvalController?: ApprovalController;
  /** Path to worker file */
  workerFilePath?: string;
  /** Program root directory */
  programRoot?: string;
  /** Toolset-specific config */
  config?: Record<string, unknown>;
}

/**
 * Factory function for creating toolsets.
 */
export type ToolsetFactory = (context: ToolsetContext) => Promise<Tool[]>;
```

#### 3.2 Move Registry

```bash
cli/src/tools/registry.ts → core/src/tools/registry.ts
```

The registry is pure logic (Map of factories), no platform dependencies.

---

### Phase 4: Move Runtime Core

**Higher risk, core functionality**

#### 4.1 Move Interfaces First

```bash
cli/src/runtime/interfaces.ts → core/src/runtime/interfaces.ts
cli/src/runtime/events.ts     → core/src/runtime/events.ts
```

#### 4.2 Create Abstract ToolExecutor

The current ToolExecutor depends on concrete tools. Create an abstract version:

**File**: `packages/core/src/runtime/tool-executor.ts`

```typescript
import type { Tool } from "ai";

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  output: unknown;
  isError: boolean;
}

export interface ExecutionContext {
  messages: unknown[];
  iteration: number;
}

/**
 * Executes tool calls with approval checking.
 */
export class ToolExecutor {
  constructor(options: {
    tools: Record<string, Tool>;
    approvalController: ApprovalController;
    onEvent?: RuntimeEventCallback;
    runtimeUI?: RuntimeUI;
  }) { ... }

  async executeBatch(
    calls: ToolCall[],
    context: ExecutionContext
  ): Promise<ToolResult[]> { ... }
}
```

#### 4.3 Move WorkerRuntime

This is the main class. It needs refactoring to:
1. Accept tools as injection (not create them)
2. Use abstract sandbox interface

**File**: `packages/core/src/runtime/worker.ts`

```typescript
/**
 * Options for WorkerRuntime.
 * Tools and sandbox are injected, not created.
 */
export interface WorkerRuntimeOptions {
  worker: WorkerDefinition;
  model?: string;

  // Injected dependencies (platform provides these)
  tools: Record<string, Tool>;
  sandbox?: FileOperations;

  // Shared across delegated workers
  approvalController?: ApprovalController;

  // Callbacks
  onEvent?: RuntimeEventCallback;
  runtimeUI?: RuntimeUI;

  // Execution limits
  maxIterations?: number;
  interruptSignal?: InterruptSignal;
}
```

Key change: **Tools are injected**, not created by WorkerRuntime. This lets:
- CLI inject filesystem/shell/git tools
- Chrome inject OPFS/browser tools

#### 4.4 Create Platform-Specific Factories

**File**: `packages/cli/src/runtime/factory.ts`

```typescript
import { WorkerRuntime, type WorkerRuntimeOptions } from "@golem-forge/core";
import { FilesystemToolset, ShellToolset, GitToolset } from "../tools/index.js";

/**
 * CLI-specific factory that creates runtime with CLI tools.
 */
export async function createCLIWorkerRuntime(
  options: CLIWorkerRuntimeOptions
): Promise<WorkerRuntime> {
  // Create CLI-specific tools
  const tools: Record<string, Tool> = {};

  if (options.worker.toolsets?.filesystem) {
    const fs = new FilesystemToolset({ sandbox: options.sandbox });
    for (const tool of fs.getTools()) {
      tools[tool.name] = tool;
    }
  }

  if (options.worker.toolsets?.shell) {
    const shell = new ShellToolset({ ... });
    for (const tool of shell.getTools()) {
      tools[tool.name] = tool;
    }
  }

  // Create runtime with injected tools
  return new WorkerRuntime({
    ...options,
    tools,
  });
}
```

**File**: `packages/chrome/src/runtime/factory.ts`

```typescript
import { WorkerRuntime } from "@golem-forge/core";
import { OPFSToolset } from "../tools/opfs.js";

/**
 * Chrome-specific factory that creates runtime with browser tools.
 */
export async function createChromeWorkerRuntime(
  options: ChromeWorkerRuntimeOptions
): Promise<WorkerRuntime> {
  const tools: Record<string, Tool> = {};

  if (options.worker.toolsets?.filesystem) {
    const opfs = new OPFSToolset({ ... });
    for (const tool of opfs.getTools()) {
      tools[tool.name] = tool;
    }
  }

  return new WorkerRuntime({
    ...options,
    tools,
  });
}
```

---

### Phase 5: Update CLI Package

#### 5.1 Remove Moved Code

Delete from `packages/cli/src/`:
- `approval/` (moved to core)
- `runtime/worker.ts` (moved to core)
- `runtime/tool-executor.ts` (moved to core)
- `runtime/interfaces.ts` (moved to core)
- `runtime/events.ts` (moved to core)
- `tools/registry.ts` (moved to core)

#### 5.2 Keep CLI-Specific Code

Keep in `packages/cli/src/`:
- `tools/filesystem.ts` - Node.js file operations
- `tools/shell.ts` - Node.js child_process
- `tools/git/` - isomorphic-git with Node.js backend
- `tools/custom.ts` - dynamic module loading
- `sandbox/` - Node.js mount sandbox
- `ui/ink/` - Ink components
- `cli/` - CLI entry point

#### 5.3 Update CLI Imports

```typescript
// Before
import { WorkerRuntime } from "./runtime/worker.js";
import { ApprovalController } from "./approval/index.js";

// After
import { WorkerRuntime, ApprovalController } from "@golem-forge/core";
import { createCLIWorkerRuntime } from "./runtime/factory.js";
```

---

### Phase 6: Update Chrome Package

#### 6.1 Remove Duplicated Code

The Chrome package likely has its own worker execution. Remove it and use core.

#### 6.2 Create Chrome Factory

See Phase 4.4 above.

#### 6.3 Update Chrome Imports

```typescript
import { WorkerRuntime, ApprovalController } from "@golem-forge/core";
import { createChromeWorkerRuntime } from "./runtime/factory.js";
```

---

## Dependency Graph (After)

```
                    @golem-forge/core
                    ├── ai, @ai-sdk/*
                    ├── WorkerRuntime
                    ├── ApprovalController
                    └── ToolExecutor
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   @golem-forge/cli  @golem-forge/chrome  @golem-forge/ui-react
   ├── CLI tools     ├── Browser tools    ├── React contexts
   ├── Ink UI        ├── React DOM UI     └── Hooks
   └── CLI entry     └── Extension entry
```

---

## Testing Strategy

### Phase 2 Tests (Approval)
- Move existing tests from cli to core
- All tests should pass unchanged

### Phase 3 Tests (Tools)
- Test registry in core
- Test base types

### Phase 4 Tests (Runtime)
- Create mock tools for testing WorkerRuntime in core
- Test Turn class independently
- Integration tests in cli/chrome with real tools

### Regression Testing
- Run full test suite after each phase
- Manual testing of CLI and Chrome extension

---

## Rollback Plan

Each phase is independent. If issues arise:

1. **Phase 2 fails**: Revert approval move, keep in cli
2. **Phase 3 fails**: Revert registry move
3. **Phase 4 fails**: Keep WorkerRuntime in cli, just share interfaces

---

## Implementation Order

| Phase | Description | Risk | Effort |
|-------|-------------|------|--------|
| 1 | Prepare core | Low | Low |
| 2 | Move approval | Low | Low |
| 3 | Move tool infra | Medium | Medium |
| 4 | Move runtime | High | High |
| 5 | Update CLI | Medium | Medium |
| 6 | Update Chrome | Medium | Medium |

**Total estimate**: Significant refactor, do incrementally.

---

## Success Criteria

1. All existing tests pass
2. CLI works exactly as before
3. Chrome extension uses shared runtime
4. No duplicate AI SDK code between packages
5. Clear separation: core = runtime, cli/chrome = platform tools + UI

---

## Design Decisions

1. **Model creation**: **Hybrid** - Accept both string ID and LanguageModel instance
   ```typescript
   interface WorkerRuntimeOptions {
     model: string | LanguageModel;  // Either works
   }
   ```

2. **Sandbox interface**: **Already solved** - `FileOperations` and `MountSandbox` interfaces from core work for both Node.js and OPFS (Chrome already uses them)

3. **Tool registration**: **Static registration** - No dynamic `import()`, platforms register toolsets upfront
   ```typescript
   // CLI startup
   ToolsetRegistry.register('filesystem', FilesystemToolset.create);
   ToolsetRegistry.register('shell', ShellToolset.create);

   // Chrome startup
   ToolsetRegistry.register('filesystem', OPFSToolset.create);
   ```

---

## Files Summary

### New Files in Core
- `src/runtime/index.ts`
- `src/runtime/worker.ts`
- `src/runtime/turn.ts`
- `src/runtime/tool-executor.ts`
- `src/runtime/interfaces.ts`
- `src/runtime/events.ts`
- `src/approval/index.ts`
- `src/approval/controller.ts`
- `src/approval/memory.ts`
- `src/approval/types.ts`
- `src/tools/index.ts`
- `src/tools/base.ts`
- `src/tools/registry.ts`

### Deleted from CLI
- `src/approval/*` (moved)
- `src/runtime/worker.ts` (moved)
- `src/runtime/tool-executor.ts` (moved)
- `src/tools/registry.ts` (moved)

### New in CLI
- `src/runtime/factory.ts` (CLI-specific factory)

### Modified in CLI
- All files importing moved modules
