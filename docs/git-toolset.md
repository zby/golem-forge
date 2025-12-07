# Git Toolset

The git toolset provides controlled git operations with user approval gates. All changes are staged in memory before being pushed, ensuring users can review and approve before persisting.

## Overview

```
Sandbox Files → git_stage → Staged Commit → git_push → Git Repository
                    ↓              ↓
               (approval)    git_diff (review)
```

**Key Concepts:**

- **Staged Commits**: Changes are held in memory until explicitly pushed
- **Approval Gates**: `git_stage` requires user confirmation, `git_push` is user-only
- **Sandbox Isolation**: Files are read from sandbox, not the real filesystem

## Tools Reference

### git_status

Show status of sandbox files and staged commits.

| Property | Value |
|----------|-------|
| Mode | `both` |
| Approval | No |

```typescript
// No arguments required
git_status({})

// Returns
{
  staged: [{ id, message, fileCount, files, createdAt }],
  unstaged: [{ path, status }],
  hint: "..."
}
```

---

### git_stage

Stage sandbox files for commit. Creates a staged commit that can be reviewed and pushed.

| Property | Value |
|----------|-------|
| Mode | `both` |
| Approval | **Yes** (assisted) |

The LLM can suggest files to stage, but the user must approve. The approval dialog shows the file list and commit message.

```typescript
git_stage({
  files: ["/workspace/src/index.ts", "/workspace/src/utils.ts"],
  message: "Add new feature"
})

// Returns
{
  commitId: "abc123",
  message: "Add new feature",
  fileCount: 2,
  files: [{ path, operation, size }],
  hint: "Staged commit abc123 created..."
}
```

**Approval Display:**
```
Files to stage:
  /workspace/src/index.ts
  /workspace/src/utils.ts

Commit message: "Add new feature"
```

---

### git_diff

Show unified diff for staged commits.

| Property | Value |
|----------|-------|
| Mode | `both` |
| Approval | No |

```typescript
// Show diff for specific commit
git_diff({ commitId: "abc123" })

// Show all staged diffs
git_diff({})

// Returns
{
  diff: "--- a/src/index.ts\n+++ b/src/index.ts\n..."
}
```

---

### git_push

Push a staged commit to a git repository. **User-only** - the LLM cannot invoke this tool.

| Property | Value |
|----------|-------|
| Mode | `manual` |
| Approval | **Yes** |

```typescript
git_push({
  commitId: "abc123",
  target: { type: "local", path: "." }
})

// Or push to GitHub
git_push({
  commitId: "abc123",
  target: { type: "github", repo: "owner/repo", branch: "main" }
})

// Returns
{
  commitSha: "def456...",
  target: { ... },
  hint: "Successfully pushed to ..."
}
```

**Target Types:**
- `local`: Local git repository (uses native git CLI)
- `github`: GitHub repository (uses Octokit API)
- `local-bare`: Bare repository (not yet implemented)

---

### git_discard

Discard a staged commit without pushing.

| Property | Value |
|----------|-------|
| Mode | `both` |
| Approval | No |

```typescript
git_discard({ commitId: "abc123" })

// Returns
{ discarded: "abc123" }
```

---

### git_pull

Pull files from a git repository into the sandbox.

| Property | Value |
|----------|-------|
| Mode | `both` |
| Approval | No |

```typescript
git_pull({
  source: { type: "local", path: "." },
  paths: ["src/index.ts", "src/utils.ts"],
  destZone: "workspace"  // optional, defaults to "workspace"
})

// Returns
{
  pulled: ["/workspace/src/index.ts", ...],
  conflicts: [],  // paths with merge conflicts
  hint: "Pulled 2 file(s) successfully."
}
```

If pulled files conflict with existing sandbox files, three-way merge is attempted and conflict markers are inserted.

---

### git_merge

Perform a three-way merge on text content. Pure computation, no side effects.

| Property | Value |
|----------|-------|
| Mode | `both` |
| Approval | No |

```typescript
git_merge({
  ours: "local content",
  theirs: "incoming content",
  base: "common ancestor"  // optional for two-way merge
})

// Returns
{
  status: "clean" | "conflict",
  content: "merged content...",
  hasConflicts: false
}
```

---

### git_branches

List branches in a git repository.

| Property | Value |
|----------|-------|
| Mode | `both` |
| Approval | No |

```typescript
git_branches({
  target: { type: "local", path: "." }
})

// Returns
{
  branches: ["main", "feature/x", "fix/y"],
  current: "main",
  count: 3
}
```

## Execution Modes Summary

| Tool | Mode | Approval | Use Case |
|------|------|----------|----------|
| `git_status` | both | no | View current state |
| `git_stage` | both | **yes** | LLM suggests, user confirms |
| `git_diff` | both | no | Review changes |
| `git_push` | **manual** | yes | User explicitly pushes |
| `git_discard` | both | no | Clean up |
| `git_pull` | both | no | Fetch files |
| `git_merge` | both | no | Resolve conflicts |
| `git_branches` | both | no | List branches |

## Workflow Example

```
User: "Update the README with the new API docs"

LLM: [edits /workspace/README.md via write_file]
LLM: [calls git_stage({ files: ["/workspace/README.md"], message: "Update API docs" })]

System: [shows approval dialog]
  Files to stage:
    /workspace/README.md
  Commit message: "Update API docs"
  Approve? [y]es / [n]o / [r]emember:

User: y

LLM: "I've staged the changes. You can review with /tool git_diff or push with /tool git_push"

User: /tool git_push --commitId abc123 --target '{"type":"local","path":"."}'

System: [shows approval, executes push]
```

## Authentication

**Local repositories**: Uses system git configuration (SSH keys, credential helpers).

**GitHub**: Authentication via:
1. `GITHUB_TOKEN` environment variable
2. `gh auth token` (GitHub CLI)

## Diff Summary Display

When staging or reviewing, diffs are shown in compact format:

```
A /workspace/src/new-file.ts (+25)
M /workspace/src/index.ts (+10 -3)
D /workspace/src/old-file.ts (-42)
```

- `A` = Added (create)
- `M` = Modified (update)
- `D` = Deleted

## Configuration

Enable git toolset in worker YAML:

```yaml
toolsets:
  git:
    default_target:
      type: local
      path: "."
```

## Limitations

- No Git LFS support
- GitHub only for remote operations (no GitLab/Bitbucket)
- No interactive git operations (rebase -i, etc.)
- Binary files not supported for diff display
