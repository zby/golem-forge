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
| **Zones** | What sandbox can access | LLM reading/writing wrong files |
| **Approval** | Which operations need consent | Accidental destructive actions |
| **Execution Mode** | Who can invoke tools (LLM/Manual) | Unauthorized boundary crossings |
| **Container** (future) | OS-level isolation | Code execution, system access |

### Threats and Mitigations

**Accidental errors** (LLM mistakes)—writing wrong files, running wrong commands:
- Mitigated by zones, approval prompts, and manual tool boundaries
- Application-level checks are sufficient

**Adversarial content** (prompt injection)—malicious instructions embedded in processed content:
- Mitigated by manual-only tools (LLM cannot invoke) and container isolation
- Application-level checks alone are insufficient for sophisticated attacks

| Content Source | Isolation Needed |
|----------------|------------------|
| Local files you created | App-level (zones + approval) |
| Files from collaborators | App-level (zones + approval) |
| Downloaded from internet | Container (future) |
| User-provided documents | Container (future) |

## Zone System

Zones define what the sandbox can access—the **intake** boundary.

### How Zones Work

Workers see a virtual filesystem with named zones:

```
LLM: list_files("/")
→ ["cache", "workspace"]

LLM: list_files("/workspace")
→ ["draft.md", "notes.txt"]

LLM: write_file("/cache/new.txt", "content")
→ Error: /cache is read-only
```

The LLM discovers available directories naturally—no special vocabulary needed.

### Project Configuration

Projects define available zones:

```yaml
# golem-forge.config.yaml
sandbox:
  mode: sandboxed
  root: .sandbox
  zones:
    cache:
      path: ./cache
      mode: ro              # read-only
    workspace:
      path: ./workspace
      mode: rw              # read-write
```

### Worker Declaration

Workers declare what they need:

```yaml
# analyzer.worker
---
name: analyzer
sandbox:
  zones:
    - name: workspace
      mode: rw
---
```

**Principles:**
- **Secure by default**: No declaration = no file access
- **Self-describing**: Each worker declares its requirements
- **Least privilege**: Workers get only what they declare, never more

### Default Zones

When no project config exists:

| Zone | Purpose | Examples |
|------|---------|----------|
| `/cache/` | External downloads | PDFs, web pages, fetched content |
| `/workspace/` | Working files | Reports, drafts, outputs |

### Worker Delegation

Child workers can't exceed parent access:

```
Parent has: { workspace: rw, cache: ro }
Child declares: { workspace: rw }
Child gets: { workspace: rw }  ✓

Parent has: { cache: ro }
Child declares: { cache: rw }
→ Error: exceeds parent access  ✗
```

### Approval Within Zones

Zones can require approval for writes, separate from access mode:

```yaml
zones:
  - name: drafts
    mode: rw
    approval:
      write: preApproved      # No prompt needed
      delete: preApproved
  - name: final
    mode: rw
    approval:
      write: ask              # Prompt user
      delete: blocked         # Prevent entirely
```

- `mode` = **capability** (what's technically allowed)
- `approval` = **consent** (what needs user review)

## Clearance Protocol

Zones control what enters the sandbox. **Clearance** controls what enters your trusted environment.

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

### Future Clearance Tools

| Tool | Description | Execution Mode |
|------|-------------|----------------|
| `file_export` | Move files outside sandbox | `manual` |
| `api_send` | Send data to external services | `manual` or `both` |
| `clipboard_copy` | Copy to system clipboard | `manual` |

---

## Implementation

### Backend Modes

**Sandboxed mode** (default)—virtual paths map to `.sandbox/`:

```typescript
const sandbox = await createSandbox({
  mode: 'sandboxed',
  root: '.sandbox'
});
// /cache/doc.pdf → .sandbox/cache/doc.pdf
```

**Direct mode**—virtual paths map to real directories:

```typescript
const sandbox = await createSandbox({
  mode: 'direct',
  cache: './downloads',
  workspace: './reports',
});
// /cache/doc.pdf → ./downloads/doc.pdf
```

### Interfaces

```typescript
interface Sandbox {
  // File operations
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;

  // Zone operations
  getZoneAccess(zoneName: string): 'ro' | 'rw' | undefined;
  getAvailableZones(): string[];
}

interface SandboxBackend {
  read(realPath: string): Promise<string>;
  write(realPath: string, content: string): Promise<void>;
  delete(realPath: string): Promise<void>;
  exists(realPath: string): Promise<boolean>;
  list(realPath: string): Promise<string[]>;
  mkdir(realPath: string): Promise<void>;
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

Container isolation hardens the **intake** boundary. Zones, approval, and clearance remain for UX and defense in depth.

See [notes/container-isolation-options.md](notes/container-isolation-options.md) for implementation options.
