# Plan: Portable Toolsets for Browser

## Goal

Enable the same tool plugin system in browser (Chrome extension) as in CLI. Tools that can work in browser (filesystem, git, workers, custom) should be shared from Core. Shell cannot work in browser and remains CLI-only.

## Implementation Status

> **Last Updated**: 2024-12-09
>
> **Phase 1**: ✅ COMPLETE - Filesystem toolset moved to core
> **Phase 2**: ✅ COMPLETE - Worker-call toolset moved to core
> **Phase 3**: ✅ COMPLETE - Custom toolset moved to core
> **Phase 4**: ✅ COMPLETE - Git types, backend interface, merge utils, and tools moved to core
> **Phase 5**: ✅ PARTIAL - Chrome uses registry (filesystem works, git/workers/custom skipped until impl)
> **Phase 6**: ⏳ PENDING - Testing

## Current State

| Toolset | CLI | Chrome | Browser-Compatible? |
|---------|-----|--------|---------------------|
| Filesystem | ✅ `core/src/tools/filesystem.ts` | ✅ Uses ToolsetRegistry | Yes |
| Git | ✅ `core/src/tools/git/` (types, tools, merge) | ⚠️ Skipped (needs IsomorphicGitBackend) | Yes (needs `IsomorphicGitBackend`) |
| Workers | ✅ `core/src/tools/worker-call.ts` | ⚠️ Skipped (needs WorkerRegistry impl) | Yes (pure runtime delegation) |
| Custom | ✅ `core/src/tools/custom.ts` | ⚠️ Skipped (needs module loader impl) | Yes (ESM dynamic import) |
| Shell | `cli/src/tools/shell.ts` | N/A (skipped with warning) | No (needs `child_process`) |

## Target State

```
@golem-forge/core
├── tools/
│   ├── base.ts (existing - NamedTool, ToolsetContext, etc.)
│   ├── registry.ts (existing - ToolsetRegistry)
│   ├── filesystem.ts (moved from CLI, uses FileOperations)
│   ├── worker-call.ts (moved from CLI, pure delegation)
│   ├── custom.ts (moved from CLI, dynamic import)
│   └── git/
│       ├── index.ts (GitToolset, abstract backend)
│       ├── types.ts (GitBackend interface)
│       └── isomorphic.ts (isomorphic-git implementation)

@golem-forge/cli
├── tools/
│   ├── shell.ts (CLI-only, unchanged)
│   └── git/
│       └── cli-backend.ts (CLIGitBackend, spawns git process)

@golem-forge/chrome
├── Uses ToolsetRegistry from core
├── Registers filesystem, git, workers, custom
└── Skips shell (not available)
```

---

## Phase 1: Move Filesystem Toolset to Core

**Risk**: Low - already abstracted via `FileOperations` interface

### 1.1 Copy FilesystemToolset to Core

**From**: `cli/src/tools/filesystem.ts`
**To**: `core/src/tools/filesystem.ts`

The toolset already uses `FileOperations` interface (sandbox abstraction), so it works with both Node.js filesystem and OPFS.

Changes needed:
- Update imports to use core's types
- Self-register with ToolsetRegistry

### 1.2 Update CLI to Import from Core

```typescript
// cli/src/tools/index.ts
export { FilesystemToolset } from "@golem-forge/core/tools";
```

### 1.3 Update Chrome to Use Registry

Replace hardcoded tools in `browser-runtime.ts` with:

```typescript
import { ToolsetRegistry } from "@golem-forge/core/tools";

const factory = ToolsetRegistry.get('filesystem');
const tools = await factory(context);
```

### 1.4 Delete Chrome's Hardcoded Filesystem Tools

Remove `createFilesystemTools()` function from `browser-runtime.ts`.

---

## Phase 2: Move Worker-Call Toolset to Core

**Risk**: Low - pure delegation logic, no platform dependencies

### 2.1 Copy WorkerCallToolset to Core

**From**: `cli/src/tools/worker-call.ts`
**To**: `core/src/tools/worker-call.ts`

This toolset creates tools that delegate to other workers. It's pure runtime logic.

Dependencies to handle:
- `WorkerRunner` interface - already in core
- `WorkerRegistry` - needs to be passed via context

### 2.2 Extend ToolsetContext

Add fields needed for worker delegation:

```typescript
// core/src/tools/base.ts
export interface ToolsetContext {
  // Existing fields...

  // For worker delegation
  workerRunner?: WorkerRunner;
  workerRegistry?: WorkerRegistry;
  delegationDepth?: number;
}
```

### 2.3 Update CLI and Chrome

Both platforms provide `workerRunner` and `workerRegistry` in context.

---

## Phase 3: Move Custom Toolset to Core

**Risk**: Medium - dynamic imports work differently in bundled environments

### 3.1 Copy CustomToolset to Core

**From**: `cli/src/tools/custom.ts`
**To**: `core/src/tools/custom.ts`

### 3.2 Abstract Module Loading

The current implementation uses `import()` which works in both Node.js and browser ESM. However, bundlers may handle this differently.

```typescript
// core/src/tools/custom.ts
export interface ModuleLoader {
  load(specifier: string): Promise<Record<string, unknown>>;
}

// Default implementation using dynamic import
export const defaultModuleLoader: ModuleLoader = {
  async load(specifier) {
    return import(specifier);
  }
};
```

### 3.3 Add ModuleLoader to ToolsetContext

```typescript
export interface ToolsetContext {
  // Existing fields...
  moduleLoader?: ModuleLoader;
}
```

CLI and Chrome can provide custom loaders if needed for their bundling strategy.

---

## Phase 4: Abstract Git Backend

**Risk**: Medium - requires new isomorphic-git integration

### 4.1 Create GitBackend Interface in Core

**File**: `core/src/tools/git/types.ts`

```typescript
export interface GitBackend {
  status(repoPath: string): Promise<GitStatusResult>;
  stage(repoPath: string, files: string[]): Promise<void>;
  diff(repoPath: string, options?: GitDiffOptions): Promise<string>;
  commit(repoPath: string, message: string): Promise<string>;
  push(repoPath: string, options?: GitPushOptions): Promise<void>;
  pull(repoPath: string, options?: GitPullOptions): Promise<void>;
  // ... other operations
}
```

### 4.2 Move GitToolset to Core

**From**: `cli/src/tools/git/index.ts`
**To**: `core/src/tools/git/index.ts`

Refactor to accept `GitBackend` via context:

```typescript
export interface GitToolsetContext extends ToolsetContext {
  gitBackend: GitBackend;
}
```

### 4.3 Keep CLIGitBackend in CLI

**File**: `cli/src/tools/git/cli-backend.ts`

This spawns `git` processes and remains CLI-only.

### 4.4 Create IsomorphicGitBackend (Future Work)

**File**: `core/src/tools/git/isomorphic.ts`

Uses `isomorphic-git` library for pure-JS git operations.

**Important**: isomorphic-git does NOT support SSH protocol. Authentication options:
- Personal Access Tokens (PAT)
- OAuth2 tokens ("Login with GitHub")
- Fine-grained GitHub tokens

SSH keys will NOT work in browser. Users must configure a GitHub PAT in extension settings.

```typescript
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';

export class IsomorphicGitBackend implements GitBackend {
  constructor(
    private fs: FileOperations,
    private authToken?: string  // GitHub PAT or OAuth token
  ) {}

  async push(input: PushInput): Promise<PushResult> {
    await git.push({
      fs: this.fs,
      http,
      dir: '/',
      onAuth: () => ({ username: 'token', password: this.authToken }),
    });
    // ...
  }
}
```

### 4.5 Platform Registration

```typescript
// CLI startup
ToolsetRegistry.register('git', (ctx) => {
  const backend = new CLIGitBackend();
  return createGitToolset({ ...ctx, gitBackend: backend });
});

// Chrome startup
ToolsetRegistry.register('git', (ctx) => {
  const backend = new IsomorphicGitBackend(ctx.sandbox);
  return createGitToolset({ ...ctx, gitBackend: backend });
});
```

---

## Phase 5: Update Chrome to Use ToolsetRegistry

### 5.1 Refactor browser-runtime.ts

Replace the hardcoded switch/case with registry pattern:

```typescript
private async registerTools(): Promise<void> {
  const toolsetsConfig = this.worker.toolsets || {};

  for (const [toolsetName, toolsetConfig] of Object.entries(toolsetsConfig)) {
    if (toolsetName === 'shell') {
      console.warn('Shell toolset not available in browser');
      continue;
    }

    const factory = ToolsetRegistry.get(toolsetName);
    if (!factory) {
      console.warn(`Unknown toolset "${toolsetName}"`);
      continue;
    }

    const context: ToolsetContext = {
      sandbox: this.sandbox,
      approvalController: this.approvalController,
      workerFilePath: this.workerFilePath,
      programRoot: this.programRoot,
      config: toolsetConfig,
      // For worker delegation
      workerRunner: this.createWorkerRunner(),
      workerRegistry: this.workerRegistry,
    };

    const tools = await factory(context);
    for (const tool of tools) {
      this.tools[tool.name] = tool;
    }
  }
}
```

### 5.2 Register Toolsets at Chrome Startup

```typescript
// chrome/src/index.ts or similar entry point
import { ToolsetRegistry } from '@golem-forge/core/tools';
import {
  filesystemToolsetFactory,
  workerCallToolsetFactory,
  customToolsetFactory,
  gitToolsetFactory,
} from '@golem-forge/core/tools';

// Register browser-compatible toolsets
ToolsetRegistry.register('filesystem', filesystemToolsetFactory);
ToolsetRegistry.register('workers', workerCallToolsetFactory);
ToolsetRegistry.register('custom', customToolsetFactory);
ToolsetRegistry.register('git', gitToolsetFactory); // Uses isomorphic backend
```

---

## Phase 6: Testing

### 6.1 Unit Tests in Core

Move/create tests for each toolset in core:
- `core/src/tools/filesystem.test.ts`
- `core/src/tools/worker-call.test.ts`
- `core/src/tools/custom.test.ts`
- `core/src/tools/git/index.test.ts`

Use mock `FileOperations` and `GitBackend` for isolation.

### 6.2 Integration Tests

- CLI: Verify toolsets still work after importing from core
- Chrome: Verify toolsets work with OPFS sandbox

### 6.3 E2E Tests

- Test worker with filesystem + git + custom tools in Chrome extension
- Verify worker delegation works in browser

---

## Implementation Order

| Phase | Description | Risk | Dependencies |
|-------|-------------|------|--------------|
| 1 | Filesystem to Core | Low | None |
| 2 | Worker-Call to Core | Low | Phase 1 (for testing patterns) |
| 3 | Custom to Core | Medium | None |
| 4 | Git Backend Abstraction | Medium | isomorphic-git dependency |
| 5 | Chrome Registry Integration | Low | Phases 1-4 |
| 6 | Testing | Low | All phases |

---

## Dependencies to Add

### Core package.json

```json
{
  "dependencies": {
    "isomorphic-git": "^1.27.1"
  }
}
```

Note: isomorphic-git is ~300KB minified. Consider lazy loading if bundle size is a concern.

---

## Success Criteria

1. All existing CLI tests pass
2. Chrome extension can run workers with filesystem, git, workers, and custom toolsets
3. Git operations work in browser via isomorphic-git
4. Worker delegation works in browser
5. Custom tools can be loaded in browser
6. Shell toolset gracefully skipped in browser with warning

---

## Future Work (Out of Scope)

- Runtime consolidation (CLI using Core's WorkerRuntime)
- Lazy loading of toolsets for bundle size optimization
- Web worker execution for heavy git operations
