# Git Integration Design

**Date**: 2025-12-06
**Status**: Design

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

Workers can declare git targets in frontmatter:

```yaml
---
name: report-writer
description: Writes analysis reports

git:
  # Default push target
  default_target:
    type: local
    path: .
    branch: reports

  # Or remote
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

*`git_pull` might need approval if pulling sensitive files, configurable.

### Trust Levels

```typescript
// In approval callback
if (toolName === 'git_push') {
  const target = args.target as GitTarget;

  // Higher scrutiny for pushing to production/main
  if (target.branch === 'main' || target.branch === 'production') {
    return {
      ...request,
      severity: 'high',
      warning: 'Pushing directly to main branch',
    };
  }
}
```

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

1. OPFS for sandbox storage
2. Octokit for GitHub operations
3. Same git tools, different backend

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

1. **Conflict handling**: What if pulled file conflicts with sandbox file?
   - Option A: Fail pull, require explicit overwrite
   - Option B: Create `.conflict` file for manual resolution
   - Option C: Let LLM resolve (dangerous?)

2. **Large files**: Should we support LFS?
   - Probably not in Phase 1, add based on user feedback

3. **Branch creation**: Should `git_push` auto-create branches?
   - Yes, with approval prompt mentioning new branch

4. **Credentials**: How to handle GitHub auth?
   - CLI: `gh` CLI or GITHUB_TOKEN env var
   - Browser: OAuth flow in extension popup

## Implementation Plan

### Phase 1 Deliverables

```
src/git/
├── types.ts           # GitTarget, StagedCommit, etc.
├── backend.ts         # GitBackend interface
├── cli-backend.ts     # CLI implementation (simple-git + Octokit)
└── tools.ts           # Git tool definitions

src/cli/
└── git-review.ts      # Interactive diff/approval UI
```

### Dependencies

- `simple-git`: Local git operations
- `@octokit/rest`: GitHub API (optional, for remote push)
- `diff`: For generating unified diffs

### Tests

```
src/git/
├── cli-backend.test.ts    # Local git operations
├── tools.test.ts          # Tool schemas and behavior
└── integration.test.ts    # End-to-end with real repos
```

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
