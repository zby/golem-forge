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
| **Clearance** | What enters trusted zone | Malicious/corrupted outputs |
| **Container** (future) | OS-level isolation | Code execution, system access |

### Threats and Mitigations

**Accidental errors** (LLM mistakes)—writing wrong files, running wrong commands:
- Mitigated by zones, approval prompts, and clearance review
- Application-level checks are sufficient

**Adversarial content** (prompt injection)—malicious instructions embedded in processed content:
- Mitigated by clearance compression and container isolation
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

### Three Clearance Modes

| Mode | Who Initiates | Approval | Use Case |
|------|---------------|----------|----------|
| **Autonomous** | LLM | Pre-cleared | Low-risk prep (staging, status) |
| **Supervised** | LLM | Requires clearance | Medium-risk operations |
| **Manual** | User only | User-initiated | High-risk boundary crossings |

**Key insight**: For sensitive operations like `git_push`, the LLM has no tool to call. The operation exists only in CLI/UI. A prompt injection cannot even *request* that content enter the trusted zone.

### Clearance Architecture

Each clearance protocol has three layers:

```
src/clearance/<protocol>/
├── operations.ts     # Core logic (shared)
├── tools.ts          # LLM-callable (autonomous/supervised)
└── commands.ts       # CLI/UI only (manual)
```

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
                   │ Manual: user runs CLI command
                   ▼
┌─────────────────────────────────────────┐
│     Trusted Zone (git target)           │
│  User's local repo or GitHub            │
└─────────────────────────────────────────┘
```

| Operation | Autonomous | Supervised | Manual |
|-----------|------------|------------|--------|
| `git_status` | ✓ | - | ✓ |
| `git_stage` | ✓ | - | ✓ |
| `git_diff` | ✓ | - | ✓ |
| `git_pull` | ✓ | - | ✓ |
| `git_discard` | ✓ | - | ✓ |
| `git_push` | - | - | ✓ |

**Workflow:**
```
LLM: git_stage({ files: [...], message: "Add report" })
LLM: "Changes staged and ready for your review"

--- User reviews when ready ---

User: golem git diff           # Review staged changes
User: golem git push           # Manual clearance into trusted zone
```

See [notes/git-integration-design.md](notes/git-integration-design.md) for implementation details.

### Future Clearance Protocols

| Protocol | Description | Mode |
|----------|-------------|------|
| **File Export** | Move files outside sandbox | Manual |
| **API Clearance** | Send data to external services | Supervised/Manual |
| **Clipboard** | Copy to system clipboard | Manual |

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
