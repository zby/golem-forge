# Sandbox Design

## Overview

The sandbox provides a secure, zone-based filesystem abstraction for AI workers.

**Phase 1 (current):** Direct filesystem access with real directories
**Phase 2 (future):** Git integration for persistent storage and collaboration

**Core model:**
- Local sandbox with configurable zones (default: cache + workspace)
- Two-level configuration: project defines available zones, workers declare what they need
- Secure by default: no sandbox declaration = pure function (no file access)
- Automatic restriction: child workers only get what they declare, never more

## Two-Level Sandbox Configuration

### Level 1: Project Configuration

Project-level config (`golem-forge.config.yaml`) defines **available zones**:

```yaml
# golem-forge.config.yaml
sandbox:
  mode: sandboxed          # or 'direct'
  root: .sandbox           # relative to project root
  zones:
    cache:
      path: ./cache
      mode: rw
    workspace:
      path: ./workspace
      mode: rw
    data:
      path: ./data
      mode: ro             # read-only by default
```

### Level 2: Worker Declaration

Each worker declares its **own sandbox requirements** in its `.worker` file:

```yaml
# formatter.worker
---
name: formatter
description: Formats data files
sandbox:
  zones:
    - name: data
      mode: rw
---
```

### Level 3: Zone Approval Configuration

Zones can also specify **approval requirements** for write/delete operations. This is separate from `mode` (capability) and controls whether user approval is needed:

```yaml
# document-processor.worker
---
name: document_processor
description: Processes documents with draft and final outputs
sandbox:
  zones:
    - name: input
      mode: ro
      # no approval needed - zone is read-only anyway
    - name: drafts
      mode: rw
      approval:
        write: preApproved    # No prompt for writes
        delete: preApproved   # No prompt for deletes
    - name: final
      mode: rw
      approval:
        write: ask            # Prompt before each write
        delete: blocked       # Prevent all deletes
---
```

Approval decision types:
- `preApproved` - Operation proceeds without user prompt
- `ask` - User is prompted for approval (default if not specified)
- `blocked` - Operation is blocked entirely

**Why separate from `mode`?**
- `mode` is about **capability** - what the sandbox physically allows
- `approval` is about **consent** - what operations need user review

A zone can be `rw` (writes possible) but still require approval for each write. This provides defense-in-depth: even if the sandbox allows an operation, the user can still review it.

### Runtime Enforcement

When a parent worker calls a child worker:

```
Parent has: { data: rw, workspace: rw, cache: rw }
Child declares: { data: rw }
    ↓
Child gets: { data: rw }  (only what it declared)
```

```
Parent has: { data: ro }
Child declares: { data: rw }
    ↓
Error: Child requests 'rw' on 'data' but parent only has 'ro'
```

```
Parent has: { data: rw, workspace: rw }
Child declares: nothing
    ↓
Child gets: null (no sandbox - pure function)
```

### Key Principles

- **Secure by default** - No sandbox declaration = no sandbox access
- **Self-describing workers** - Each worker declares what it needs
- **Automatic restriction** - Child only gets what it declares, never more
- **Parent is the ceiling** - Child cannot exceed parent's access

## Architecture

### Phase 1: Direct Filesystem

```
┌─────────────────────────────────────────┐
│           Local Sandbox                 │
│                                         │
│  /cache/     → ./downloads/             │
│  /workspace/ → ./reports/               │
│                                         │
└─────────────────────────────────────────┘
```

### Phase 2: Git Integration (future)

```
┌─────────────────────────────────────────┐
│              Git (GitHub)               │
│         Persistent report storage       │
└─────────────────────────────────────────┘
          ↑                   │
     push │                   │ pull
          │                   ↓
┌─────────────────────────────────────────┐
│           Local Sandbox                 │
│                                         │
│  /cache/     - external downloads       │
│  /workspace/ - working files            │
│                                         │
└─────────────────────────────────────────┘
```

## Zones

Default zones (used when no project config exists):

| Zone | Purpose | Examples |
|------|---------|----------|
| `/cache/` | External downloads | PDFs, web pages, fetched content |
| `/workspace/` | Working files | Reports pulled from git, drafts, outputs |

Custom zones can be defined in project configuration. Both zones are ephemeral. Git is used for persistence and collaboration.

## RestrictedSandbox

When workers delegate to child workers, access is restricted using a `RestrictedSandbox` wrapper:

```typescript
// Parent has full access to workspace, cache, data
const parentSandbox = await createSandbox({
  mode: 'sandboxed',
  root: '.sandbox',
  zones: {
    workspace: { path: './workspace', mode: 'rw' },
    cache: { path: './cache', mode: 'rw' },
    data: { path: './data', mode: 'rw' },
  }
});

// Child worker declares it only needs workspace (ro)
// Runtime creates a restricted sandbox:
const childSandbox = createRestrictedSandbox(parentSandbox, new Map([
  ['workspace', 'ro']
]));

// Child can read workspace, but NOT cache or data
await childSandbox.read('/workspace/file.txt');  // OK
await childSandbox.read('/cache/file.txt');       // ERROR: Zone not available
await childSandbox.write('/workspace/file.txt', 'x');  // ERROR: Zone is read-only
```

## CLI Backend Modes

### Sandboxed Mode (default)

Virtual paths map to a `.sandbox/` directory:

```typescript
const sandbox = await createSandbox({
  mode: 'sandboxed',
  root: '.sandbox'
});

// /cache/doc.pdf     → .sandbox/cache/doc.pdf
// /workspace/report.md → .sandbox/workspace/report.md
```

### Direct Mode

Virtual paths map to real directories for easier integration:

```typescript
const sandbox = await createSandbox({
  mode: 'direct',
  cache: './downloads',
  workspace: './reports',
});

// /cache/doc.pdf     → ./downloads/doc.pdf
// /workspace/report.md → ./reports/report.md
```

### Custom Zones Mode

Define custom zones with specific paths and access modes:

```typescript
const sandbox = await createSandbox({
  mode: 'sandboxed',
  root: '.sandbox',
  zones: {
    input: { path: './input', mode: 'ro' },
    output: { path: './output', mode: 'rw' },
    temp: { path: './temp', mode: 'rw' },
  },
});

// /input/data.json   → .sandbox/input/data.json (read-only)
// /output/result.txt → .sandbox/output/result.txt (read-write)
// /temp/scratch.txt  → .sandbox/temp/scratch.txt (read-write)
```

## Interface

### Phase 1: File Operations

```typescript
interface Sandbox {
  // File operations
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  write(path: string, content: string): Promise<void>;
  writeBinary(path: string, content: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;

  // Path operations
  resolve(path: string): string;
  getZone(path: string): Zone;
  isValidPath(path: string): boolean;

  // Zone access (for restriction enforcement)
  getZoneAccess(zoneName: string): 'ro' | 'rw' | undefined;
  getAvailableZones(): string[];
}
```

### Phase 2: Git Operations (future)

```typescript
interface Sandbox {
  // ... Phase 1 methods ...

  gitPull(opts: {
    repo: string;           // e.g., 'user/reports'
    paths: string[];        // paths in repo to pull
    branch?: string;        // default: 'main'
  }): Promise<void>;

  gitStage(opts: {
    files: string[];        // local paths to stage
    repo: string;
    branch?: string;
    message: string;
  }): Promise<StagedCommit>;

  gitPush(commitId: string): Promise<PushResult>;
  gitDiscard(commitId: string): Promise<void>;
  gitListStaged(): Promise<StagedCommit[]>;
}

interface StagedCommit {
  id: string;
  repo: string;
  branch: string;
  message: string;
  files: Array<{
    path: string;
    diff: string;
    operation: 'create' | 'update' | 'delete';
  }>;
  createdAt: Date;
}

interface PushResult {
  commitSha: string;
  url: string;
}
```

## Workflow Examples

### Phase 1: Direct Filesystem

```typescript
const sandbox = createSandbox({
  mode: 'direct',
  cache: './downloads',
  workspace: './reports',
});

// 1. Fetch external content
await sandbox.writeBinary('/cache/paper.pdf', pdfBytes);

// 2. Read existing report (if editing)
const existing = await sandbox.read('/workspace/topic.md');

// 3. Analyze and write result
const updated = await analyzeAndUpdate(existing, '/cache/paper.pdf');
await sandbox.write('/workspace/topic.md', updated);

// Files are now in ./reports/topic.md - user can view, edit, commit manually
```

### Phase 2: Git Integration (future)

```typescript
// 1. Pull existing report from git
await sandbox.gitPull({
  repo: 'user/reports',
  paths: ['analyses/topic.md']
});

// 2. Edit
const existing = await sandbox.read('/workspace/analyses/topic.md');
await sandbox.write('/workspace/analyses/topic.md', updated);

// 3. Stage for preview
const preview = await sandbox.gitStage({
  files: ['/workspace/analyses/topic.md'],
  repo: 'user/reports',
  message: 'Update analysis with new paper'
});

// 4. User reviews preview.files[].diff, then approves
await sandbox.gitPush(preview.id);
```

## Vercel AI SDK Integration

### Phase 1: File Tools

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export function createSandboxTools(sandbox: Sandbox) {
  return {
    readFile: tool({
      description: 'Read a file from the sandbox',
      parameters: z.object({
        path: z.string().describe('Path to read (e.g., /workspace/report.md)'),
      }),
      execute: async ({ path }) => sandbox.read(path),
    }),

    writeFile: tool({
      description: 'Write a file to the sandbox',
      parameters: z.object({
        path: z.string().describe('Path to write'),
        content: z.string().describe('Content to write'),
      }),
      execute: async ({ path, content }) => {
        await sandbox.write(path, content);
        return { success: true, path };
      },
    }),

    listFiles: tool({
      description: 'List files in a directory',
      parameters: z.object({
        path: z.string().describe('Directory path'),
      }),
      execute: async ({ path }) => sandbox.list(path),
    }),

    deleteFile: tool({
      description: 'Delete a file',
      parameters: z.object({
        path: z.string().describe('Path to delete'),
      }),
      execute: async ({ path }) => {
        await sandbox.delete(path);
        return { success: true, path };
      },
    }),
  };
}
```

### Phase 2: Git Tools (future)

```typescript
// Additional tools for git integration
const gitTools = {
  pullFromGit: tool({
    description: 'Pull files from a git repository',
    parameters: z.object({
      repo: z.string().describe('Repository (e.g., user/reports)'),
      paths: z.array(z.string()).describe('Paths to pull'),
    }),
    execute: async ({ repo, paths }) => {
      await sandbox.gitPull({ repo, paths });
      return { success: true, pulled: paths };
    },
  }),

  stageForPush: tool({
    description: 'Stage files for pushing to git (returns preview)',
    parameters: z.object({
      files: z.array(z.string()).describe('Local paths to stage'),
      repo: z.string().describe('Target repository'),
      message: z.string().describe('Commit message'),
    }),
    execute: async ({ files, repo, message }) => {
      const preview = await sandbox.gitStage({ files, repo, message });
      return {
        commitId: preview.id,
        files: preview.files.map(f => ({
          path: f.path,
          operation: f.operation,
        })),
      };
    },
  }),
};
```

## Browser Backend (Future)

For browser support, the same interface with OPFS storage:

```typescript
const sandbox = createBrowserSandbox({
  workspaceId: 'my-workspace'
});

// /cache/     → OPFS: /workspaces/{id}/cache/
// /workspace/ → OPFS: /workspaces/{id}/workspace/
```

Git operations would use the GitHub API (Octokit) instead of local git.

## Backend Interface

```typescript
interface SandboxBackend {
  read(realPath: string): Promise<string>;
  readBinary(realPath: string): Promise<Uint8Array>;
  write(realPath: string, content: string): Promise<void>;
  writeBinary(realPath: string, content: Uint8Array): Promise<void>;
  delete(realPath: string): Promise<void>;
  exists(realPath: string): Promise<boolean>;
  list(realPath: string): Promise<string[]>;
  mkdir(realPath: string): Promise<void>;
}

interface GitBackend {
  pull(opts: GitPullOpts): Promise<void>;
  stage(opts: GitStageOpts): Promise<StagedCommit>;
  push(commitId: string): Promise<PushResult>;
  discard(commitId: string): Promise<void>;
  listStaged(): Promise<StagedCommit[]>;
}
```

Implementations:
- **CLI**: Node.js `fs` + `git` CLI or GitHub API
- **Browser**: OPFS + Octokit
- **Test**: In-memory maps

## Error Types

```typescript
class SandboxError extends Error {
  constructor(public code: string, message: string, public path?: string) {
    super(message);
  }
}

class NotFoundError extends SandboxError {
  constructor(path: string) {
    super('NOT_FOUND', `File not found: ${path}`, path);
  }
}

class GitError extends SandboxError {
  constructor(message: string, public operation: string) {
    super('GIT_ERROR', message);
  }
}
```

## LLM Interface Design

### Principle: Hide Implementation Details

The sandbox presents a **standard Unix-like filesystem** to the LLM, not an implementation-specific "zone" abstraction.

**Why this matters:**

```
# Bad - Tool descriptions expose internal concepts:
path: "Use /workspace or /cache prefixes"

# Good - Standard filesystem semantics:
path: "Absolute path (use list_files('/') to discover directories)"
```

### Discoverable Interface

The LLM discovers available directories by exploring:

```
LLM: list_files("/")
→ ["input", "output"]

LLM: list_files("/input")
→ ["data.pdf", "config.json"]

LLM: write_file("/input/new.txt", "content")
→ Error: /input is read-only
```

### Benefits

1. **Self-documenting** - LLM discovers what's available
2. **No special vocabulary** - zones are just directories
3. **Standard error handling** - "read-only" is universally understood
4. **Configuration-agnostic** - works with any zone setup

### Implementation Requirements

1. **`list_files("/")`** must return available zone names as directories
2. **Tool descriptions** must not hardcode zone names
3. **Error messages** must be clear and actionable ("read-only", "not found")

### Anti-patterns

- Hardcoding `/workspace` or `/cache` in tool descriptions
- Exposing "zone" terminology to the LLM
- Requiring LLM to know project configuration

## Summary

### Phase 1 (current)
- **Default zones**: `/cache/` (downloads), `/workspace/` (working files)
- **Custom zones**: Define project-specific zones in `golem-forge.config.yaml`
- **Three-level config**:
  1. Project defines available zones and paths
  2. Workers declare which zones they need and access mode
  3. Workers can configure per-zone approval (preApproved/ask/blocked)
- **Restricted sandbox**: Child workers only get access to zones they declare
- **Secure by default**: No sandbox declaration = pure function (no file access)
- **Zone approval**: Per-zone control over which operations need user consent
- **Direct mode**: Map zones to real directories for easy integration
- **File ops**: read, write, delete, list, exists, stat, resolve
- **Zone ops**: getZoneAccess, getAvailableZones for restriction enforcement
- **Vercel AI SDK**: Tools for file operations with zone-aware approval

### Phase 2 (future)
- **Git ops**: `pull`, `stage`, `push`, `discard`
- **Staging**: preview with diffs before push, user approval gate
- **Browser backend**: OPFS storage, Octokit for git
