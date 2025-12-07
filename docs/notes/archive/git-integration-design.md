# Git Integration Design

**Date**: 2025-12-06
**Status**: Design (infrastructure ready, awaiting implementation)
**Updated**: 2025-12-06 - Added references to established ToolContext/ToolExecutor patterns

## Problem

The current sandbox mounts directly to the real filesystem (`.sandbox/` directory or custom paths). This is convenient for testing but creates a security vulnerability:

1. **Prompt injection risk**: A malicious prompt could instruct the LLM to write files anywhere the sandbox has access
2. **No review gate**: Changes go directly to disk without user review
3. **No persistence story**: Users must manually manage files after worker execution

## Vision

**Git as the security boundary**: The sandbox should be isolated (eventually in-memory), with git operations as the only controlled path to persist changes.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Isolated Sandbox (in-memory)                  │
│                                                                  │
│  Worker writes files to /workspace/                              │
│  Files exist only in memory until explicitly pushed              │
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ git_push (requires approval)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Git Targets                                │
│                                                                  │
│  • GitHub/GitLab (remote)                                        │
│  • Local git repo (e.g., current project)                        │
│  • Bare local repo (backup destination)                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Design Goals

1. **Security**: Changes reviewed before leaving sandbox
2. **Flexibility**: Support both remote (GitHub) and local git repos
3. **CLI UX**: Rich diff/review experience in terminal
4. **Incremental**: Works with current filesystem sandbox, enables migration to in-memory

## Architecture

### Phase 1: Git Tools (Current Filesystem)

Add git tools that work with the current filesystem-backed sandbox. Changes are written to `.sandbox/workspace/`, then git tools stage/push them.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Filesystem Sandbox                            │
│                                                                  │
│  .sandbox/workspace/report.md  ←──  write_file tool              │
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ git_stage → git_push
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Git Target                                 │
│                                                                  │
│  Local: /path/to/project (working tree)                          │
│  Remote: github.com/user/repo                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 2: In-Memory Sandbox (Future)

Sandbox uses memory backend by default. Git operations serialize changes to actual storage.

```
┌─────────────────────────────────────────────────────────────────┐
│                    In-Memory Sandbox                             │
│                                                                  │
│  Map<string, Buffer> files                                       │
│  No filesystem access whatsoever                                 │
│                                                                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ git_stage (materializes to temp)
                               │ git_push (commits and cleans up)
                               ▼
```

## Git Tools

### Core Tools

```typescript
interface GitToolset {
  // View what's in the sandbox
  git_status: () => Promise<GitStatus>;

  // Stage changes for commit
  git_stage: (opts: {
    files: string[];           // Sandbox paths to stage
    message: string;           // Commit message
  }) => Promise<StagedCommit>;

  // View staged changes
  git_diff: (opts: {
    commitId?: string;         // Show specific staged commit
  }) => Promise<string>;       // Unified diff output

  // Push staged commit
  git_push: (opts: {
    commitId: string;
    target: GitTarget;
  }) => Promise<PushResult>;

  // Discard staged commit
  git_discard: (opts: {
    commitId: string;
  }) => Promise<void>;

  // Pull from git into sandbox
  git_pull: (opts: {
    source: GitTarget;
    paths: string[];           // Paths to pull
    destZone?: string;         // Default: workspace
  }) => Promise<PullResult>;

  // Three-way merge (for conflict resolution)
  git_merge: (opts: {
    path: string;              // File path (for context)
    base?: string;             // Common ancestor content
    ours: string;              // Sandbox version
    theirs: string;            // Incoming version
  }) => Promise<MergeResult>;

  // List branches (optional, for discovery)
  git_branches: (opts: {
    target: GitTarget;
  }) => Promise<{
    branches: string[];
    current?: string;          // Current branch (for local repos)
  }>;
}
```

### Git Targets

```typescript
type GitTarget =
  | { type: 'github'; repo: string; branch?: string }
  | { type: 'local'; path: string; branch?: string }
  | { type: 'local-bare'; path: string };

// Examples:
// { type: 'github', repo: 'user/reports', branch: 'main' }
// { type: 'local', path: '.', branch: 'feature-x' }
// { type: 'local', path: '/path/to/other/repo' }
```

### Branching

Branches are specified via the `branch` field in `GitTarget`. The git tools support:

**Pushing to existing branch:**
```typescript
git_push({
  commitId: 'abc123',
  target: { type: 'local', path: '.', branch: 'main' }
})
```

**Creating new branch on push:**
```typescript
git_push({
  commitId: 'abc123',
  target: { type: 'local', path: '.', branch: 'feature-report-update' }
})
// Creates branch if it doesn't exist (with user approval noting "new branch")
```

**Pulling from specific branch:**
```typescript
git_pull({
  source: { type: 'local', path: '.', branch: 'templates' },
  paths: ['templates/']
})
```

**Listing branches:**
```typescript
git_branches({ target: { type: 'local', path: '.' } })
// → { branches: ['main', 'develop', 'feature-x'], current: 'main' }
```

**Workflow: Avoid conflicts with feature branches**

Instead of pushing to `main` and risking conflicts:
```
Worker creates unique branch → pushes there → no conflicts possible
User reviews and merges via PR (GitHub) or manual merge (local)
```

Worker frontmatter can suggest default branch naming:
```yaml
git:
  default_target:
    type: local
    path: .
    branch: "worker-{timestamp}"  # Template, expanded at runtime
```

### Staged Commits

```typescript
interface StagedCommit {
  id: string;                  // UUID
  message: string;
  files: StagedFile[];
  createdAt: Date;
}

interface StagedFile {
  sandboxPath: string;         // e.g., /workspace/report.md
  operation: 'create' | 'update' | 'delete';
  contentHash: string;         // For dedup/verification
  size: number;
}

interface GitStatus {
  staged: StagedCommit[];
  unstaged: Array<{
    path: string;
    status: 'new' | 'modified' | 'deleted';
  }>;
}

interface PullResult {
  pulled: string[];            // All paths written to sandbox
  conflicts: string[];         // Paths with conflict markers (subset of pulled)
}

interface MergeResult {
  status: 'clean' | 'conflict';
  content: string;             // Merged content (with markers if conflict)
}

interface PushResult {
  status: 'success' | 'conflict';
  commitSha?: string;          // On success
  conflict?: {
    reason: 'non-fast-forward' | 'other';
    message: string;           // Human-readable explanation
    targetHead?: string;       // Current target SHA (for non-fast-forward)
  };
}
```

## CLI Review Experience

### `git_status` Output

```
Sandbox Status:
  Modified:
    /workspace/report.md (1.2 KB)
    /workspace/analysis.json (0.8 KB)
  New:
    /workspace/charts/revenue.svg (2.1 KB)

Staged Commits:
  [abc123] "Add quarterly report" (3 files)
    + /workspace/report.md
    + /workspace/analysis.json
    + /workspace/charts/revenue.svg
```

### `git_diff` Output

```diff
Staged commit: abc123 "Add quarterly report"

--- /dev/null
+++ /workspace/report.md
@@ -0,0 +1,45 @@
+# Q4 2024 Report
+
+## Summary
+Revenue increased by 15% compared to Q3...

--- a/workspace/analysis.json
+++ b/workspace/analysis.json
@@ -1,5 +1,8 @@
 {
   "period": "Q4-2024",
-  "status": "draft"
+  "status": "final",
+  "metrics": {
+    "revenue": 1500000
+  }
 }
```

### Approval Flow

```
┌────────────────────────────────────────────────────────────────┐
│  git_push                                                       │
│                                                                 │
│  Target: local:/path/to/project (branch: main)                  │
│  Commit: abc123 "Add quarterly report"                          │
│                                                                 │
│  Files:                                                         │
│    + report.md (1.2 KB)                                         │
│    M analysis.json (0.8 KB)                                     │
│    + charts/revenue.svg (2.1 KB)                                │
│                                                                 │
│  [d]iff  [a]pprove  [r]eject  [?]help                          │
└────────────────────────────────────────────────────────────────┘
```

## Implementation

### Existing Infrastructure

The codebase already has foundational infrastructure that git tools will leverage:

**ToolContext pattern** (`src/tools/custom.ts`):
```typescript
export interface ToolContext {
  /** Sandbox for file operations. Undefined if worker has no sandbox. */
  sandbox?: Sandbox;
  /** Unique ID for this tool call */
  toolCallId: string;
}
```

Git tools will receive `ToolContext` as their second argument, providing access to the sandbox for reading staged files.

**ToolExecutor** (`src/runtime/tool-executor.ts`): Centralized tool execution with approval handling, event emission, and dynamic `needsApproval` resolution. Git tools integrate through the standard tool registration pipeline.

**WorkerRunner interface** (`src/runtime/interfaces.ts`): Abstraction for worker execution that provides `getSandbox()` and `getApprovalController()` - both needed by git operations.

### GitBackend Interface

```typescript
interface GitBackend {
  // Staging operations (sandbox → staging area)
  createStagedCommit(opts: {
    files: Array<{ sandboxPath: string; content: Buffer }>;
    message: string;
  }): Promise<StagedCommit>;

  getStagedCommit(id: string): Promise<StagedCommit | null>;
  listStagedCommits(): Promise<StagedCommit[]>;
  discardStagedCommit(id: string): Promise<void>;

  // Push operations (staging → git)
  push(opts: {
    commitId: string;
    target: GitTarget;
  }): Promise<PushResult>;

  // Pull operations (git → sandbox)
  pull(opts: {
    source: GitTarget;
    paths: string[];
  }): Promise<Array<{ path: string; content: Buffer }>>;

  // Diff/status
  diffStagedCommit(id: string): Promise<string>;
}
```

### CLI GitBackend

```typescript
class CLIGitBackend implements GitBackend {
  private stagedCommits: Map<string, StagedCommitData> = new Map();
  private tempDir: string;  // For materializing staged files

  async push(opts: { commitId: string; target: GitTarget }): Promise<PushResult> {
    const staged = this.stagedCommits.get(opts.commitId);
    if (!staged) throw new Error('Staged commit not found');

    if (opts.target.type === 'local') {
      return this.pushToLocal(staged, opts.target);
    } else if (opts.target.type === 'github') {
      return this.pushToGitHub(staged, opts.target);
    }
    // ...
  }

  private async pushToLocal(staged: StagedCommitData, target: LocalTarget): Promise<PushResult> {
    // 1. Copy files from staging to target working tree
    // 2. git add the files
    // 3. git commit with staged.message
    // 4. Optionally git push if tracking remote

    const git = simpleGit(target.path);

    for (const file of staged.files) {
      const destPath = path.join(target.path, file.relativePath);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, file.content);
    }

    await git.add(staged.files.map(f => f.relativePath));
    const result = await git.commit(staged.message);

    return {
      commitSha: result.commit,
      target: target,
    };
  }

  private async pushToGitHub(staged: StagedCommitData, target: GitHubTarget): Promise<PushResult> {
    // Use Octokit to create commit via GitHub API
    // This works for both CLI (with token) and browser extension
  }
}
```

### Worker Configuration

Workers declare git configuration in frontmatter using a simple `git:` key:

```yaml
---
name: report-writer
description: Writes analysis reports

toolsets:
  filesystem: {}
  git:
    default_target:
      type: local
      path: .
      branch: reports

    # Or remote target
    # default_target:
    #   type: github
    #   repo: user/reports

    # Auto-pull these paths at start
    auto_pull:
      - path: templates/
        source:
          type: local
          path: .
---
```

The git toolset self-registers via `ToolsetRegistry`, so worker.ts needs no git-specific code.

## Security Model

### Approval Requirements

| Operation | Approval Required | Rationale |
|-----------|-------------------|-----------|
| `git_status` | No | Read-only, sandbox introspection |
| `git_stage` | No | Just prepares commit, no side effects |
| `git_diff` | No | Read-only, shows staged changes |
| `git_push` | **Yes** | Persists changes outside sandbox |
| `git_discard` | No | Discards prepared changes |
| `git_pull` | No* | Pulls into sandbox only |
| `git_merge` | No | Pure computation, result stays in sandbox |
| `git_branches` | No | Read-only, lists branches |

*`git_pull` might need approval if pulling sensitive files, configurable.

## Conflict Resolution

### Design Principles

1. **Worker resolves conflicts** - Worker LLM has context about the task and can make informed merge decisions
2. **User approves at push** - Final review happens when changes leave the sandbox
3. **Standard git markers** - Use familiar `<<<<<<<` / `=======` / `>>>>>>>` format

### Conflict Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Worker                                                         │
│                                                                 │
│  git_pull({ paths: ['report.md'] })                             │
│  → Conflict detected                                            │
│  → File written with markers:                                   │
│                                                                 │
│    <<<<<<< ours (sandbox)                                       │
│    Revenue increased by 15% in Q4.                              │
│    =======                                                      │
│    Revenue grew 12% compared to Q3.                             │
│    >>>>>>> theirs (incoming)                                    │
│                                                                 │
│  → Returns: { pulled: ['report.md'], conflicts: ['report.md'] } │
│                                                                 │
│  Worker reads file, sees markers, resolves via write_file       │
│  Worker calls git_stage, git_push                               │
│                                                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ User reviews at push
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLI Approval                                                   │
│                                                                 │
│  git_push to local:. (branch: main)                             │
│  Commit: "Update quarterly report"                              │
│                                                                 │
│  --- a/report.md                                                │
│  +++ b/report.md                                                │
│  -Revenue grew 12% compared to Q3.                              │
│  +Revenue increased by 15% in Q4, building on 12% Q3 growth.    │
│                                                                 │
│  [a]pprove  [r]eject  [d]iff  [?]help                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Worker Resolves

| Approach | Pros | Cons |
|----------|------|------|
| Worker resolves | Has task context, simpler | - |
| Out-of-band LLM | Controlled prompts | No task context, extra complexity |
| User manual | Full control | Tedious for simple merges |

The worker already understands what it's trying to accomplish. It can make informed merge decisions. The user still has final say at `git_push` approval.

### Push Conflicts

Push conflicts occur when the target has new commits since the worker started:

```
┌─────────────────────────────────────────────────────────────────┐
│  Worker                                                         │
│                                                                 │
│  git_push({ target: { type: 'local', path: '.' } })             │
│  → { status: 'conflict', conflict: {                            │
│        reason: 'non-fast-forward',                              │
│        message: 'Target has new commits since your base'        │
│      }}                                                         │
│                                                                 │
│  Worker pulls from target to get latest:                        │
│  git_pull({ source: { type: 'local', path: '.' } })             │
│  → Writes conflict markers if files diverged                    │
│                                                                 │
│  Worker resolves conflicts, re-stages, retries push             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The worker handles push conflicts the same way as pull conflicts - by resolving the markers and retrying.

### Trust Levels

Git push uses the dynamic `needsApproval` pattern established in `ToolExecutor`:

```typescript
// In git_push tool definition
export const gitPush: NamedTool = {
  name: 'git_push',
  inputSchema: GitPushInputSchema,
  // Dynamic approval - ToolExecutor resolves this at runtime
  needsApproval: (args) => {
    const { target } = args as GitPushInput;
    // Always require approval for main/production
    if (target.branch === 'main' || target.branch === 'production') {
      return true;
    }
    // Feature branches could be auto-approved based on config
    return true; // Default: require approval
  },
  execute: async (args, options) => { /* ... */ },
};
```

The `ToolExecutor.execute()` method handles this pattern:
```typescript
// From src/runtime/tool-executor.ts
const needsApproval = typeof tool.needsApproval === "function"
  ? await tool.needsApproval(toolArgs, { toolCallId, messages: context.messages })
  : tool.needsApproval;
```

## Authentication

### Strategy by Target Type

| Target | Auth Method |
|--------|-------------|
| Local repo (filesystem) | None needed |
| Local repo → remote | System git (user's SSH/credential helper) |
| GitHub remote | Token (GITHUB_TOKEN or `gh` CLI) |

### Local Repositories

For local git targets, delegate to system git for push operations:

```typescript
// Local push uses git CLI, inherits user's auth config
await exec(`git -C ${targetPath} push origin ${branch}`);
```

This respects user's existing setup (SSH keys, credential helpers, etc.) without us managing credentials.

### GitHub Authentication

Hybrid approach with fallback chain:

```typescript
async function getGitHubAuth(): Promise<{ username: string; password: string }> {
  // 1. Explicit token (CI-friendly)
  if (process.env.GITHUB_TOKEN) {
    return { username: 'oauth2', password: process.env.GITHUB_TOKEN };
  }

  // 2. gh CLI (developer-friendly)
  try {
    const { stdout } = await exec('gh auth token');
    return { username: 'oauth2', password: stdout.trim() };
  } catch {
    // gh not installed or not logged in
  }

  // 3. Fail with helpful message
  throw new GitAuthError(
    'GitHub authentication required.\n' +
    'Either:\n' +
    '  - Set GITHUB_TOKEN environment variable, or\n' +
    '  - Run `gh auth login` to authenticate with GitHub CLI'
  );
}
```

### Usage in GitBackend

```typescript
class CLIGitBackend implements GitBackend {
  async push(opts: { commitId: string; target: GitTarget }): Promise<PushResult> {
    if (opts.target.type === 'local') {
      return this.pushViaGitCLI(opts);      // Uses system git
    } else if (opts.target.type === 'github') {
      const auth = await getGitHubAuth();
      return this.pushViaIsomorphicGit(opts, auth);  // Uses token
    }
  }
}
```

### Scope (Phase 1)

- **GitHub only** - GitLab/Bitbucket deferred to future phases
- **No OAuth flow** - Rely on `gh` CLI or pre-configured token
- **No token storage** - Read from env/gh CLI each time

## Migration Path

### Phase 1: Add Git Tools (Current)

1. Implement `GitBackend` interface
2. Add git tools to toolset
3. CLI can review/approve pushes
4. Sandbox still uses filesystem

### Phase 2: In-Memory Default (Future)

1. Add `MemoryBackend` as default for CLI sandbox
2. `git_push` materializes files from memory → temp → git
3. Filesystem backend becomes opt-in for debugging

### Phase 3: Browser Extension

See [Browser Extension Implementation Plan](implementation-plan.md) for detailed roadmap.

1. OPFS for sandbox storage (Phase 1.2 of extension plan)
2. Octokit for GitHub operations (Phase 2.2 of extension plan)
3. Same git tools, different backend (GitBackend implementation for browser)

## Alternatives Considered

### A: Direct Git Working Tree Access

Let workers read/write directly in a git working tree.

**Rejected**: No isolation. Prompt injection could overwrite `.git/`, run hooks, etc.

### B: Git Worktree Per Session

Create a git worktree for each session.

**Considered**: Good isolation but heavy. May revisit for long-running sessions.

### C: Shadow Filesystem with Git Sync

Filesystem that logs all changes, syncs to git automatically.

**Rejected**: Complex, hides what's being pushed from user review.

## Open Questions

1. ~~**Conflict handling**~~: Resolved - see "Conflict Resolution" section above.
   - `git_pull` writes files with conflict markers when conflicts occur
   - Worker resolves conflicts (has task context)
   - User reviews at `git_push` approval
   - `git_merge` available for algorithmic three-way merge

2. ~~**Large files**~~: Resolved - No LFS support in Phase 1.
   - Large files go directly in repo (works for moderate sizes)
   - Document limitation clearly (see "Limitations" section)
   - Revisit if users report issues with LFS-tracked repos or repo bloat

3. ~~**Branch creation**~~: Resolved - see "Branching" section above.
   - Yes, `git_push` auto-creates branches with approval prompt noting "new branch"
   - Optional `git_branches` tool for listing available branches
   - Worker frontmatter can specify branch naming templates

4. ~~**Credentials**~~: Resolved - see "Authentication" section above.
   - Local repos: delegate to system git (user's existing auth)
   - GitHub: GITHUB_TOKEN env var → `gh auth token` fallback
   - GitHub only for Phase 1 (GitLab/Bitbucket deferred)

## Implementation Plan

### Phase 1 Deliverables

```
src/tools/git/
├── index.ts           # GitToolset class + exports
├── types.ts           # GitTarget, StagedCommit, MergeResult, etc.
├── backend.ts         # GitBackend interface
├── cli-backend.ts     # CLI implementation (isomorphic-git + git CLI)
├── merge.ts           # Three-way merge using diff3/isomorphic-git
├── auth.ts            # GitHub auth (GITHUB_TOKEN / gh CLI)
└── tools.ts           # Git tool definitions (NamedTool objects)

src/tools/
├── registry.ts        # ToolsetRegistry for plugin-style registration (new)
└── index.ts           # Updated to export registry + git toolset

src/cli/
└── git-review.ts      # Interactive diff/approval UI
```

### Toolset Registry Pattern

To minimize coupling, introduce a `ToolsetRegistry` that toolsets self-register with:

```typescript
// src/tools/registry.ts
import type { NamedTool } from './filesystem.js';
import type { Sandbox } from '../sandbox/interface.js';
import type { ApprovalController } from '../approval/index.js';

/**
 * Context passed to toolset factories during registration.
 */
export interface ToolsetContext {
  sandbox?: Sandbox;
  approvalController: ApprovalController;
  workerFilePath?: string;
  projectRoot?: string;
  // Toolset-specific config from worker YAML
  config: Record<string, unknown>;
}

/**
 * Factory function that creates tools for a toolset.
 */
export type ToolsetFactory = (ctx: ToolsetContext) => Promise<NamedTool[]> | NamedTool[];

/**
 * Registry for toolset factories.
 * Toolsets self-register; worker.ts looks up by name.
 */
class ToolsetRegistryImpl {
  private factories = new Map<string, ToolsetFactory>();

  register(name: string, factory: ToolsetFactory): void {
    if (this.factories.has(name)) {
      throw new Error(`Toolset "${name}" already registered`);
    }
    this.factories.set(name, factory);
  }

  get(name: string): ToolsetFactory | undefined {
    return this.factories.get(name);
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  list(): string[] {
    return Array.from(this.factories.keys());
  }
}

export const ToolsetRegistry = new ToolsetRegistryImpl();
```

### Toolset Self-Registration

Each toolset registers itself when its module is imported:

```typescript
// src/tools/git/index.ts
import { ToolsetRegistry } from '../registry.js';
import { GitToolset } from './toolset.js';

// Self-register on module load
ToolsetRegistry.register('git', async (ctx) => {
  const toolset = new GitToolset({
    sandbox: ctx.sandbox,
    config: ctx.config,
  });
  return toolset.getTools();
});

export { GitToolset };
export * from './types.js';
```

### Worker Runtime Integration

Replace the switch statement in `worker.ts` with registry lookup:

```typescript
// src/runtime/worker.ts (updated registerTools)
private async registerTools(): Promise<void> {
  const toolsetsConfig = this.worker.toolsets || {};

  for (const [toolsetName, toolsetConfig] of Object.entries(toolsetsConfig)) {
    const factory = ToolsetRegistry.get(toolsetName);

    if (!factory) {
      throw new Error(
        `Unknown toolset "${toolsetName}" in worker "${this.worker.name}". ` +
        `Valid toolsets: ${ToolsetRegistry.list().join(', ')}`
      );
    }

    const tools = await factory({
      sandbox: this.sandbox,
      approvalController: this.approvalController,
      workerFilePath: this.options.workerFilePath,
      projectRoot: this.options.projectRoot,
      config: toolsetConfig || {},
    });

    for (const tool of tools) {
      this.tools[tool.name] = tool;
    }
  }
}
```

### Built-in Toolset Migration

Existing toolsets migrate to self-registration:

```typescript
// src/tools/filesystem.ts (add at end)
import { ToolsetRegistry } from './registry.js';

ToolsetRegistry.register('filesystem', (ctx) => {
  if (!ctx.sandbox) {
    throw new Error('Filesystem toolset requires a sandbox');
  }
  const toolset = new FilesystemToolset({ sandbox: ctx.sandbox, ... });
  return toolset.getTools();
});
```

This pattern:
- **Minimal coupling**: worker.ts has no knowledge of specific toolsets
- **Self-contained**: each toolset owns its registration
- **Extensible**: new toolsets just register themselves
- **Testable**: registry can be cleared/mocked in tests

### Tool Registration Pattern

Git tools follow the established custom tools pattern:

```typescript
// src/tools/git/tools.ts
import { z } from 'zod';
import type { ToolContext } from '../custom.js';
import type { NamedTool } from '../filesystem.js';

export const gitStatus: NamedTool = {
  name: 'git_status',
  description: 'Show status of sandbox and staged commits',
  inputSchema: z.object({}),
  needsApproval: false,  // Read-only
  execute: async (args, options) => {
    // Implementation
  },
};

export const gitPush: NamedTool = {
  name: 'git_push',
  description: 'Push staged commit to git target',
  inputSchema: GitPushInputSchema,
  needsApproval: (args) => {
    // Higher scrutiny for main/production branches
    const input = args as GitPushInput;
    return input.target.branch === 'main' || input.target.branch === 'production';
  },
  execute: async (args, options) => {
    // Implementation
  },
};
```

### Dependencies

- `isomorphic-git`: Pure JS git implementation (works in browser, enables in-memory operations)
- `diff3`: Three-way merge algorithm
- `@octokit/rest`: GitHub API (optional, for remote push)
- `diff`: For generating unified diffs

**Why `isomorphic-git` over `simple-git`?**
- Works in browser (Phase 3 extension)
- Can operate on in-memory filesystems (Phase 2)
- No shell dependencies
- Built-in merge support

### Tests

Following the project's test patterns (colocated with source):

```
src/tools/git/
├── cli-backend.test.ts    # Local git operations, isomorphic-git
├── tools.test.ts          # Tool schemas and behavior
├── auth.test.ts           # GitHub auth resolution
└── merge.test.ts          # Three-way merge algorithm

src/tools/
└── registry.test.ts       # ToolsetRegistry tests

tests/integration/
└── git.test.ts            # End-to-end with real repos (requires git)
```

## Limitations (Phase 1)

### Git LFS Not Supported

Git Large File Storage (LFS) is not supported in Phase 1.

**Impact:**

| Scenario | Behavior |
|----------|----------|
| Pull file tracked by LFS | Gets pointer file, not actual content |
| Push large binary file | Goes directly to repo (may bloat history) |

**Workarounds:**

1. **Avoid large binaries in worker output** - Generate text formats where possible
2. **External storage for large files** - Worker can write URLs/references instead of actual files
3. **Pre-fetch LFS files** - User can `git lfs pull` before running worker, copy to sandbox manually

**Worker documentation hint:**
```yaml
---
name: report-generator
description: Generates quarterly reports
# Note: Avoid generating files >10MB. Large assets should be
# referenced by URL rather than embedded.
---
```

**Future consideration:** Add LFS read support if users report issues with LFS-tracked repositories.

### GitHub Only (Remote)

Remote git targets only support GitHub in Phase 1.

- GitLab, Bitbucket, and other providers are not supported
- Local git repositories work regardless of their remote origin

### No Interactive Git Operations

Operations requiring interactive input are not supported:

- Interactive rebase
- Merge conflict resolution via editor
- GPG signing prompts

All operations are non-interactive by design.

## Summary

Git integration provides a **controlled escape hatch** from the sandbox:

1. Workers write to sandbox (isolated, ephemeral)
2. `git_stage` prepares changes for review
3. CLI shows diffs, user approves
4. `git_push` persists to local or remote git
5. `git_pull` brings content into sandbox

This model:
- Keeps sandbox isolation intact
- Provides user review before persistence
- Supports both local and remote workflows
- Enables future migration to in-memory sandbox

## Changelog

- **2025-12-06**: Initial design document
- **2025-12-06**: Added references to established infrastructure patterns:
  - ToolContext interface for passing sandbox to tools
  - ToolExecutor for approval handling
  - WorkerRunner interface for execution abstraction
  - Cross-reference to browser extension implementation plan
  - Tool registration pattern following CustomToolset conventions
- **2025-12-06**: Refactored for minimal coupling:
  - Moved git code to `src/tools/git/` (consistent with other toolsets)
  - Added `ToolsetRegistry` pattern for plugin-style registration
  - Removed hardcoded switch statement dependency
  - Simplified worker config to use `git:` under `toolsets:`
