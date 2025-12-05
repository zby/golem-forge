# Sandbox Design

## Overview

The sandbox provides a simple filesystem abstraction for AI workers.

**Phase 1 (current):** Direct filesystem access with real directories
**Phase 2 (future):** Git integration for persistent storage and collaboration

**Core model:**
- Local sandbox with two zones (cache + workspace)
- Phase 1: Real directories, user manages persistence
- Phase 2: Git as source of truth, staging for preview before push

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

| Zone | Purpose | Examples |
|------|---------|----------|
| `/cache/` | External downloads | PDFs, web pages, fetched content |
| `/workspace/` | Working files | Reports pulled from git, drafts, outputs |

Both zones are ephemeral. Git is used for persistence and collaboration.

## CLI Backend Modes

### Sandboxed Mode (default)

Virtual paths map to a `.sandbox/` directory:

```typescript
const sandbox = createSandbox({
  mode: 'sandboxed',
  root: '.sandbox'
});

// /cache/doc.pdf     → .sandbox/cache/doc.pdf
// /workspace/report.md → .sandbox/workspace/report.md
```

### Direct Mode

Virtual paths map to real directories for easier integration:

```typescript
const sandbox = createSandbox({
  mode: 'direct',
  cache: './downloads',
  workspace: './reports',
});

// /cache/doc.pdf     → ./downloads/doc.pdf
// /workspace/report.md → ./reports/report.md
```

### Single Directory Mode

Everything in one directory:

```typescript
const sandbox = createSandbox({
  mode: 'direct',
  workspace: '.',
});

// /workspace/report.md → ./report.md
// /cache/ operations would fail or use a subdirectory
```

## Interface

### Phase 1: File Operations

```typescript
interface Sandbox {
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  write(path: string, content: string): Promise<void>;
  writeBinary(path: string, content: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<string[]>;

  // Resolve virtual path to real path (useful for external tools)
  resolve(path: string): string;
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

## Summary

### Phase 1 (current)
- **2 zones**: `/cache/` (downloads), `/workspace/` (working files)
- **Direct mode**: Map zones to real directories for easy integration
- **File ops**: read, write, delete, list, exists, resolve
- **Vercel AI SDK**: Tools for file operations

### Phase 2 (future)
- **Git ops**: `pull`, `stage`, `push`, `discard`
- **Staging**: preview with diffs before push, user approval gate
- **Browser backend**: OPFS storage, Octokit for git
