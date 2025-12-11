# Sandbox Design

## Overview

The sandbox provides a controlled environment for AI workers to process content and produce outputs. It protects the user's trusted environment from both accidental errors and adversarial manipulation.

## Trust Model: The Gray Zone

The sandbox operates as a **gray zone**—neither fully trusted nor fully untrusted:

```
┌─────────────────────────────────────────────────────────────────┐
│                         UNTRUSTED                                │
│  Web content, external APIs, user-provided documents             │
│  - Assume adversarial                                            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Intake (container isolation, future)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        GRAY ZONE                                 │
│                        (Sandbox)                                 │
│                                                                  │
│  LLM processes content, does valuable work                       │
│  - Productive but not fully trustworthy                          │
│  - Can be manipulated by prompt injection                        │
│  - Outputs must be reviewed before entering trusted zone         │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Clearance (compression, review, approval)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         TRUSTED                                  │
│  User's git repo, persistent storage, approved outputs           │
│  - Under user control                                            │
└─────────────────────────────────────────────────────────────────┘
```

This model recognizes that:
- **Not untrusted**: The LLM is doing useful work we want
- **Not trusted**: The LLM can be compromised by adversarial input
- **Controlled**: We observe, limit, and gate its actions

## Security Layers

The gray zone model drives a layered security architecture:

| Layer | What It Controls | Threat |
|-------|------------------|--------|
| **Mounts** | What sandbox can access | LLM reading/writing wrong files |
| **Approval** | Which operations need consent | Accidental destructive actions |
| **Execution Mode** | Who can invoke tools (LLM/Manual) | Unauthorized boundary crossings |
| **Container** (future) | OS-level isolation | Code execution, system access |

### Threats and Mitigations

**Accidental errors** (LLM mistakes)—writing wrong files, running wrong commands:
- Mitigated by sandbox paths, approval prompts, and manual tool boundaries
- Application-level checks are sufficient

**Adversarial content** (prompt injection)—malicious instructions embedded in processed content:
- Mitigated by manual-only tools (LLM cannot invoke) and container isolation
- Application-level checks alone are insufficient for sophisticated attacks

| Content Source | Isolation Needed |
|----------------|------------------|
| Local files you created | App-level (sandbox + approval) |
| Files from collaborators | App-level (sandbox + approval) |
| Downloaded from internet | Container (future) |
| User-provided documents | Container (future) |

## Sandbox Model

Golem Forge uses a **mount-based sandbox** with Docker-style bind mount semantics:

- Paths are direct (no virtual zone prefix)
- Mount points map real filesystem paths to sandbox paths
- Sub-workers can have restricted access via the `restrict()` method

---

## Mount-Based Sandbox (Recommended)

The mount-based sandbox uses [Docker bind mount](https://docs.docker.com/engine/storage/bind-mounts/) semantics. This is the recommended approach for new projects.

### How Mounts Work

Workers see a virtual filesystem rooted at `/` that maps to a real directory:

```typescript
// Mount the program at root
const sandbox = createMountSandbox({
  root: "/home/user/program"
});

// Worker paths map directly
// /src/app.ts → /home/user/program/src/app.ts
// /README.md → /home/user/program/README.md
```

The LLM uses simple paths without zone prefixes:

```
LLM: list_files("/")
→ ["src", "package.json", "README.md"]

LLM: read_file("/src/app.ts")
→ (file contents)

LLM: write_file("/src/new-feature.ts", "...")
→ Success
```

### Mount Configuration

```typescript
interface MountSandboxConfig {
  /** Real filesystem path mounted at / */
  root: string;

  /** Read-only access (default: false) */
  readonly?: boolean;

  /** Additional mount points */
  mounts?: Mount[];
}

interface Mount {
  /** Real filesystem path (Docker: "source") */
  source: string;

  /** Virtual path in sandbox (Docker: "target") */
  target: string;

  /** Read-only mount (default: false) */
  readonly?: boolean;
}
```

### Examples

**Simple program access:**
```typescript
const runtime = await createWorkerRuntime({
  worker,
  mountSandboxConfig: {
    root: "/home/user/my-program"
  }
});
```

**Read-only analysis:**
```typescript
const runtime = await createWorkerRuntime({
  worker,
  mountSandboxConfig: {
    root: "/home/user/my-program",
    readonly: true
  }
});
```

**Program with shared cache:**
```typescript
const runtime = await createWorkerRuntime({
  worker,
  mountSandboxConfig: {
    root: "/home/user/my-program",
    mounts: [
      { source: "/home/user/.npm", target: "/cache", readonly: true }
    ]
  }
});
```

### Sub-Worker Restriction

When spawning sub-workers, access can only be restricted—never expanded:

```typescript
// Main worker has full access to /home/user/program
mainWorker.sandbox.root = "/home/user/program";

// Sub-worker restricted to /src subtree, read-only
callWorker({
  worker: "code-reviewer",
  sandbox: {
    restrict: "/src",     // Can only see /src and below
    readonly: true        // Cannot write
  }
});
```

The sub-worker sees the same paths (`/src/app.ts`) but cannot access `/secrets/` or write anything.

### Git Integration with Mounts

With mount-based sandboxes, git tools use the same paths:

```typescript
// Worker writes a file
writeFile("/src/feature.ts", code);

// Git stages it - same path
gitStage({ files: ["/src/feature.ts"], message: "Add feature" });

// Git push works with the same path resolution
gitPush({ commitId: "abc123" });
```

No path translation needed—everything is consistent.

### Security Considerations

1. **Path Traversal**: Always normalize paths and verify resolved path is within allowed boundaries
2. **Symlink Following**: Decide policy - follow symlinks (convenient) or reject (secure)
3. **Permission Escalation**: Sub-workers cannot upgrade permissions
4. **Mount Shadowing**: Later mounts can shadow earlier ones - document this behavior

---

## Clearance Protocol

The sandbox controls what the LLM can access. **Clearance** controls what enters your trusted environment.

### Why Clearance Matters

Without controlled clearance, gray zone outputs flow directly into your trusted storage. A compromised LLM could inject malicious content, corrupted data, or subtle errors. Clearance ensures:

1. **User visibility** - Content can be reviewed before entering trusted zone
2. **Controlled initiation** - Sensitive operations require user action, not just approval
3. **Audit trail** - All clearance operations are logged
4. **Quality gate** - Compression makes review meaningful

Note: Content can also flow from sandbox to untrusted zone (external APIs, web services). That's network egress—a separate concern. Clearance specifically governs what enters *your* trusted environment.

### The Compression Principle

Clearance must be **lower bandwidth than intake**. The LLM acts as a compression layer:

```
┌─────────────────────────────────────────────────────────────────┐
│                      Intake (high bandwidth)                     │
│  PDFs, web pages, images, databases, API responses               │
│  - Hard for humans to review at scale                            │
│  - May contain hidden malicious content                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LLM Processing                               │
│  Extract, summarize, transform, analyze                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Clearance (low bandwidth)                      │
│  Text summaries, structured data, reports                        │
│  - Human-reviewable                                              │
│  - Diff-friendly (works with git)                                │
│  - Harder to hide malicious content                              │
└─────────────────────────────────────────────────────────────────┘
```

| Property | Benefit |
|----------|---------|
| **Reviewability** | Humans can read and verify content |
| **Diff-ability** | Text shows meaningful changes in git |
| **Security** | Harder to smuggle data in plain text |
| **Storage** | Less data to persist and version |

**Examples:**

| Intake | Processing | Clearance |
|--------|------------|-----------|
| PDF document | Extract key points | Text summary |
| Web page | Parse and filter | Structured JSON |
| Image | Analyze content | Description + metadata |
| Database query | Aggregate | Report table |

**Anti-pattern**: Passing binary blobs unchanged—no security benefit, can't review.

**Good pattern**: Extract information as text—reviewable, diffable, exfiltration attempts visible.

### Scanners for Binary Content

When binary output is unavoidable (generated images, compiled artifacts), automated scanners extend clearance:

| Scanner Type | What It Checks |
|--------------|----------------|
| **Malware scanner** | Known malicious patterns |
| **Content scanner** | Embedded text, metadata, steganography |
| **Format validator** | File matches expected type |
| **Size/entropy checker** | Anomalous data patterns |

Scanners don't replace human review—they're defense in depth for content humans can't directly inspect.

### Tool Execution Modes and Clearance

Clearance is implemented through tool execution modes, not a separate system:

| Mode | Who Can Invoke | Use Case |
|------|----------------|----------|
| **LLM** | LLM only | Standard tools (read files, run commands) |
| **Manual** | User only | Clearance operations (push, deploy, export) |
| **Both** | LLM or User | Flexible operations (staging, status checks) |

**Key insight**: For sensitive operations like `git_push`, the tool is configured as `manualExecution: { mode: 'manual' }`. The LLM cannot call it. A prompt injection cannot even *request* that content enter the trusted zone.

Approval is orthogonal: a manual tool can still require confirmation before execution.

### Clearance via Manual Tools

Tools are configured per worker. A worker without manual tools can only return output—it cannot trigger user-invokable actions.

```
Root Worker (has git_push manual tool)
│
├─→ Analysis Worker (read-only tools, no manual tools)
│   └─→ Returns: "Found 3 issues"
│
└─→ Fix Worker (filesystem write, no git tools)
    └─→ Writes files, returns: "Fixed 3 issues"

Root: "I've fixed the issues. Files are modified locally."

User invokes: golem tool git_push --branch main
```

Tool writers define clearance semantics in their tools. The UI provides invocation and input fields derived from the tool's Zod schema.

### Git Clearance

Git is the first clearance protocol—version-controlled persistence with full audit trail.

```
┌─────────────────────────────────────────┐
│         Sandbox (gray zone)             │
│                                         │
│  LLM writes to /workspace/              │
│  LLM calls git_stage, git_status        │
└──────────────────┬──────────────────────┘
                   │
                   │ Manual tool: user invokes git_push
                   ▼
┌─────────────────────────────────────────┐
│     Trusted Zone (git target)           │
│  User's local repo or GitHub            │
└─────────────────────────────────────────┘
```

| Tool | Execution Mode | Description |
|------|----------------|-------------|
| `git_status` | `both` | Check repository state |
| `git_stage` | `both` | Stage files for commit |
| `git_diff` | `both` | View changes |
| `git_pull` | `both` | Fetch from remote |
| `git_discard` | `both` | Discard local changes |
| `git_push` | `manual` | Push to remote (clearance boundary) |

**Example: git_push as manual tool:**
```typescript
export const gitPushTool: NamedTool = {
  name: 'git_push',
  description: 'Push commits to remote repository',

  inputSchema: z.object({
    remote: z.enum(['origin', 'upstream']).default('origin'),
    branch: z.string().describe('Target branch'),
  }),

  execute: async ({ remote, branch }) => {
    return execGit(['push', remote, branch]);
  },

  needsApproval: true,  // Requires confirmation even when manually invoked

  manualExecution: {
    mode: 'manual',           // User only - LLM cannot push
    label: 'Push to Remote',
    category: 'Git Operations',
  },
};
```

**Workflow:**
```
LLM: git_stage({ files: [...], message: "Add report" })
LLM: "Changes staged and ready for your review"

--- User reviews when ready ---

User: golem tool git_diff                    # Review staged changes
User: golem tool git_push --branch main      # Manual clearance into trusted zone
```

See [notes/git-integration-design.md](notes/git-integration-design.md) for implementation details.

### Git Credential Inheritance

For clearance operations like `git_push`, the worker needs access to git credentials. We support **credential inheritance**—using the host's existing git authentication setup.

#### How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                         Host Environment                         │
│                                                                  │
│  SSH Agent ($SSH_AUTH_SOCK)    Git Config (credential.helper)   │
│  GitHub CLI (gh auth token)    Environment (GITHUB_TOKEN)       │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Inherited by git commands
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Git Toolset                              │
│                                                                  │
│  execGit() inherits process.env → uses host credentials         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Default behavior** (no configuration needed):
- SSH keys work via `$SSH_AUTH_SOCK`
- Credential helpers work via git config
- `GITHUB_TOKEN` env var for GitHub API
- `gh auth token` as fallback for GitHub

#### Configuration

Workers can configure credential handling in their toolset config:

```yaml
# worker.yaml
toolsets:
  git:
    default_target:
      type: local
      path: "."
    credentials:
      mode: inherit        # Default: use host credentials
      env:                 # Optional: override specific env vars
        GIT_AUTHOR_NAME: "Golem Worker"
        GIT_AUTHOR_EMAIL: "worker@example.com"
```

**Credential modes:**

| Mode | Behavior | Use Case |
|------|----------|----------|
| `inherit` (default) | Merge explicit env with `process.env` | Normal operation |
| `explicit` | Only use explicitly provided env vars | Container isolation |

**Common environment overrides:**

| Variable | Purpose |
|----------|---------|
| `GIT_AUTHOR_NAME` | Override commit author name |
| `GIT_AUTHOR_EMAIL` | Override commit author email |
| `GIT_SSH_COMMAND` | Custom SSH command/options |
| `GIT_TERMINAL_PROMPT=0` | Disable prompts in automation |
| `GITHUB_TOKEN` | GitHub API authentication |

#### Security Considerations

**Current model** (v1):
- Credentials are inherited from host—simple, works with existing setup
- The manual-only `git_push` tool ensures user controls when pushing happens
- User approval is still required before push executes

**Future model** (with container isolation):
- Use `explicit` mode to prevent credential leakage
- Inject scoped, short-lived tokens at manual tool invocation
- Container cannot access host's SSH agent or credential helpers

### Future Clearance Tools

| Tool | Description | Execution Mode |
|------|-------------|----------------|
| `file_export` | Move files outside sandbox | `manual` |
| `api_send` | Send data to external services | `manual` or `both` |
| `clipboard_copy` | Copy to system clipboard | `manual` |

---

## Implementation

### Mount-Based Sandbox (Recommended)

```typescript
import { createMountSandbox } from './sandbox/mount-sandbox.js';

// Simple program access
const sandbox = createMountSandbox({
  root: '/home/user/program'
});

// With additional mounts
const sandbox = createMountSandbox({
  root: '/home/user/program',
  readonly: false,
  mounts: [
    { source: '/home/user/.cache', target: '/cache', readonly: true }
  ]
});

// Sub-worker restriction
const restricted = sandbox.restrict({
  restrict: '/src',
  readonly: true
});
```

### Interfaces

The sandbox implements the `FileOperations` interface:

```typescript
interface FileOperations {
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
  isValidPath(path: string): boolean;
}
```

Mount-based sandbox adds restriction capability:

```typescript
interface MountSandbox extends FileOperations {
  /** Create restricted sandbox for sub-worker */
  restrict(config: SubWorkerRestriction): MountSandbox;

  /** Check if path is writable */
  canWrite(path: string): boolean;

  /** Get effective configuration */
  getConfig(): MountSandboxConfig;
}
```

**Backend implementations:**
- **CLI**: Node.js `fs`
- **Browser**: OPFS (future)
- **Test**: In-memory maps

### Error Types

```typescript
class SandboxError extends Error {
  constructor(public code: string, message: string, public path?: string);
}

class NotFoundError extends SandboxError { }
class PermissionError extends SandboxError { }
```

---

## Future: Container Isolation

For untrusted content, containers provide OS-level isolation:

```
┌─────────────────────────────────────┐
│              Host OS                │
│  ┌───────────────────────────────┐  │
│  │         Container             │  │
│  │  /input  ← mounted ro         │  │
│  │  /output ← mounted rw         │  │
│  │  - Only sees mounted dirs     │  │
│  │  - No network (optional)      │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

Container isolation hardens the **intake** boundary. Mount-based sandboxing, approval, and clearance remain for UX and defense in depth.

See [notes/container-isolation-options.md](notes/container-isolation-options.md) for implementation options.
