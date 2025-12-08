# Sandbox Mount Model

> **Status**: Implemented in `src/sandbox/mount-sandbox.ts` and `src/sandbox/mount-types.ts`

A simplified sandbox model based on [Docker bind mounts](https://docs.docker.com/engine/storage/bind-mounts/). Paths are consistent across all workers - no translation between parent and child workers, just access restriction.

> **Note**: This model uses Docker's bind mount terminology (`source`, `target`, `readonly`) so users familiar with Docker will feel at home.

## Goals

1. **Simplicity**: One mental model - paths are paths, no mapping confusion
2. **Consistency**: Main worker, sub-workers, and git tools all see the same paths
3. **Security**: Sub-workers can only have equal or more restricted access than parent
4. **Familiarity**: Works like Docker's `-v` flag

## Core Concepts

### Root Mount

Every sandbox has a root mount that maps `/` to a real filesystem path:

```typescript
sandbox: {
  root: "/home/user/project"
}
```

Inside the sandbox:
- `/src/file.ts` → `/home/user/project/src/file.ts`
- `/README.md` → `/home/user/project/README.md`

### Permissions

Like Docker, mounts are read-write by default. Add `readonly: true` for read-only access:

```typescript
// Read-write (default)
{ root: "/home/user/project" }

// Read-only
{ root: "/home/user/project", readonly: true }
```

### Additional Mounts (Optional)

For cases where you need paths outside the root:

```typescript
sandbox: {
  root: "/home/user/project",
  mounts: [
    { source: "/home/user/.npm-cache", target: "/cache", readonly: true },
    { source: "/tmp/build-output", target: "/output" }
  ]
}
```

This mirrors Docker's `--mount` syntax:
```bash
docker run --mount type=bind,source=/home/user/.npm-cache,target=/cache,readonly ...
```

Mounts overlay the root - `/cache/pkg` resolves to `/home/user/.npm-cache/pkg`, not `/home/user/project/cache/pkg`.

### Sub-Worker Restriction

When a worker spawns a sub-worker, it can only:
1. Restrict to a subtree
2. Add `readonly: true`

It cannot:
1. Expand access beyond its own
2. Remove `readonly` restriction

```typescript
// Main worker has full access
mainWorker.sandbox = { root: "/home/user/project" }

// Sub-worker restricted to /src, read-only
callWorker({
  worker: "code-reviewer",
  sandbox: {
    restrict: "/src",
    readonly: true
  }
})
```

The sub-worker sees paths like `/src/file.ts` - the same paths the parent uses - but cannot access `/secrets/` or write anything.

## Path Resolution

### Algorithm

```
resolve(virtualPath):
  1. Normalize the path (resolve .., remove duplicate /)
  2. Check if path starts with any mount's path (longest match wins)
  3. If mount found: realPath = mount.source + remainder
  4. Else: realPath = root + virtualPath
  5. Verify realPath is within allowed boundaries
  6. Return realPath
```

### Examples

Given:
```typescript
sandbox: {
  root: "/home/user/project",
  mounts: [
    { source: "/home/user/.cache", target: "/cache", readonly: true }
  ]
}
```

| Virtual Path | Real Path | Source |
|--------------|-----------|--------|
| `/src/app.ts` | `/home/user/project/src/app.ts` | root |
| `/README.md` | `/home/user/project/README.md` | root |
| `/cache/npm/pkg` | `/home/user/.cache/npm/pkg` | mount |
| `/../etc/passwd` | ERROR: outside sandbox | - |

## Permission Inheritance

### Rules

Like Docker, you can add restrictions but never remove them:

```
Parent         Child Requested    Result
------         ---------------    ------
read-write     (default)          read-write (inherited)
read-write     readonly: true     read-only (allowed - downgrade)
read-only      (default)          read-only (inherited)
read-only      readonly: false    ERROR (cannot upgrade)
```

### Per-Mount Inheritance

Each mount's permission is inherited separately:

```typescript
// Parent
sandbox: {
  root: "/project",
  mounts: [
    { source: "...", target: "/cache", readonly: true }
  ]
}

// Child requests read-only for everything
callWorker({
  worker: "analyzer",
  sandbox: { readonly: true }
})

// Child effective permissions:
// /        → read-only (downgraded from read-write)
// /cache   → read-only (was already read-only)
```

## Git Integration

With this model, git tools use the same paths as the sandbox:

```typescript
// Worker writes a file
writeFile("/src/feature.ts", code)

// Git stages it - same path
gitStage({ files: ["/src/feature.ts"], message: "Add feature" })

// Git push - same path resolution
gitPush({ commitId: "abc123" })
```

The git backend resolves `/src/feature.ts` through the sandbox, gets the real path, and operates on it. No separate path logic needed.

### Git Target Path

For local git targets, the path should typically match the sandbox root:

```typescript
worker: {
  toolsets: {
    git: {
      default_target: {
        type: "local",
        path: "/home/user/project"  // Same as sandbox root
      }
    }
  }
}

sandbox: {
  root: "/home/user/project"
}
```

This ensures git operations happen in the same directory the sandbox is mounted to.

## Configuration Schema

Uses Docker bind mount terminology:

```typescript
interface SandboxConfig {
  /** Real filesystem path to mount at / (like Docker's "source") */
  root: string;

  /** Read-only mount (like Docker's "readonly" option). Default: false */
  readonly?: boolean;

  /** Additional mount points (optional) */
  mounts?: Mount[];
}

interface Mount {
  /** Real filesystem path (Docker: "source" or "src") */
  source: string;

  /** Container/virtual path (Docker: "target" or "dst") */
  target: string;

  /** Read-only mount (Docker: "readonly" or "ro"). Default: false */
  readonly?: boolean;
}

interface SubWorkerSandbox {
  /** Restrict to subtree (e.g., "/src"). Omit for full access. */
  restrict?: string;

  /** Make read-only. Can only add restriction, not remove. */
  readonly?: boolean;
}
```

### Comparison with Docker

| Docker `--mount` | Sandbox Config |
|------------------|----------------|
| `source=/path` | `root: "/path"` or `source: "/path"` |
| `target=/container/path` | `/` (implicit for root) or `target: "/path"` |
| `readonly` | `readonly: true` |

## Zod Schema

```typescript
const MountSchema = z.object({
  source: z.string(),
  target: z.string().startsWith("/"),
  readonly: z.boolean().optional().default(false),
});

const SandboxConfigSchema = z.object({
  root: z.string(),
  readonly: z.boolean().optional().default(false),
  mounts: z.array(MountSchema).optional(),
});

const SubWorkerSandboxSchema = z.object({
  restrict: z.string().startsWith("/").optional(),
  readonly: z.boolean().optional(),
});
```

## Examples

### Simple Project Access

```typescript
// Full read-write access to a project (default)
const sandbox = createSandbox({
  root: "/home/user/my-project"
});
```

### Read-Only Analysis

```typescript
// Analyzer that shouldn't modify anything
const sandbox = createSandbox({
  root: "/home/user/my-project",
  readonly: true
});
```

Equivalent Docker command:
```bash
docker run --mount type=bind,source=/home/user/my-project,target=/,readonly ...
```

### Project with Shared Cache

```typescript
// Project access + read-only npm cache
const sandbox = createSandbox({
  root: "/home/user/my-project",
  mounts: [
    { source: "/home/user/.npm", target: "/npm-cache", readonly: true }
  ]
});
```

Equivalent Docker command:
```bash
docker run \
  --mount type=bind,source=/home/user/my-project,target=/ \
  --mount type=bind,source=/home/user/.npm,target=/npm-cache,readonly \
  ...
```

### Sub-Worker for Code Review

```typescript
// Main worker has full access
const mainSandbox = createSandbox({
  root: "/home/user/my-project"
});

// Spawn read-only reviewer restricted to /src
callWorker({
  worker: "code-reviewer",
  sandbox: {
    restrict: "/src",
    readonly: true
  }
});

// Reviewer sees /src/app.ts, /src/utils.ts
// Cannot see /secrets/api-key.txt
// Cannot write anything
```

### Git Workflow

```typescript
const worker: WorkerDefinition = {
  name: "feature-worker",
  toolsets: {
    filesystem: {},
    git: {
      default_target: { type: "local", path: "/home/user/project" }
    }
  }
};

const runtime = createWorkerRuntime({
  worker,
  sandbox: {
    root: "/home/user/project"
  }
});

// Worker can now:
// 1. Write /src/feature.ts (sandbox resolves to /home/user/project/src/feature.ts)
// 2. Stage /src/feature.ts (git uses same path)
// 3. Push commit (git operates on /home/user/project)
// All paths consistent!
```

## Migration from Zones

Current zone-based config:
```typescript
sandbox: {
  type: "local",
  basePath: "/tmp/sandbox",
  zones: {
    workspace: { path: "project", writable: true },
    cache: { path: "cache", writable: false }
  }
}
```

Equivalent mount-based config:
```typescript
sandbox: {
  root: "/tmp/sandbox/project",
  mounts: [
    { source: "/tmp/sandbox/cache", target: "/cache", readonly: true }
  ]
}
```

Key differences:
1. No zone name in path (`/file.ts` not `/workspace/file.ts`)
2. Explicit root instead of basePath + default zone
3. Mounts use Docker terminology (`source`, `target`, `readonly`)

## Security Considerations

1. **Path Traversal**: Always normalize paths and verify resolved path is within allowed boundaries
2. **Symlink Following**: Decide policy - follow symlinks (convenient) or reject (secure)
3. **Permission Escalation**: Sub-workers cannot upgrade permissions
4. **Mount Shadowing**: Later mounts can shadow earlier ones - document this behavior

## Implementation Notes

### Sandbox Interface

```typescript
interface Sandbox {
  /** Resolve virtual path to real path, checking permissions */
  resolve(virtualPath: string): string;

  /** Check if path is readable */
  canRead(virtualPath: string): boolean;

  /** Check if path is writable */
  canWrite(virtualPath: string): boolean;

  /** Create restricted sandbox for sub-worker */
  restrict(config: SubWorkerSandbox): Sandbox;

  /** Get the effective config (for debugging/logging) */
  getConfig(): SandboxConfig;
}
```

### File Operations

All file tools use the sandbox:

```typescript
class FileTools {
  constructor(private sandbox: Sandbox) {}

  readFile(path: string): string {
    const realPath = this.sandbox.resolve(path);  // Throws if not readable
    return fs.readFileSync(realPath, "utf-8");
  }

  writeFile(path: string, content: string): void {
    if (!this.sandbox.canWrite(path)) {
      throw new Error(`Write denied: ${path}`);
    }
    const realPath = this.sandbox.resolve(path);
    fs.writeFileSync(realPath, content);
  }
}
```

### Git Backend Integration

```typescript
class GitBackend {
  constructor(private sandbox: Sandbox) {}

  stageFiles(files: string[]): void {
    for (const file of files) {
      const realPath = this.sandbox.resolve(file);
      // Use realPath for git operations
    }
  }
}
```
