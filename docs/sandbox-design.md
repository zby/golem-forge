# Sandbox Design

## Overview

The sandbox provides a zone-based filesystem abstraction for AI workers, protecting against unintended operations while enabling useful file access.

### What It Protects Against

**Accidental errors** (LLM mistakes) - The LLM writes to the wrong file, runs the wrong command, or accesses something it shouldn't.

- These are normal mistakes, not escape attempts
- User approval catches most issues
- **Application-level checks are sufficient**: zone permissions, approval prompts, shell whitelists

**Adversarial content** (prompt injection) - An attacker embeds malicious instructions in content the LLM processes.

- Creative bypasses, unusual encodings, multi-step attacks
- User may not recognize sophisticated attacks
- **Application-level checks are insufficient** - container isolation required (future)

### Design Principle

Don't try to make application-level checks bulletproof against adversaries. Instead:
- Use app-level checks for UX and catching mistakes (current)
- Use container isolation when processing untrusted content (future)

| Content Source | Isolation Needed |
|----------------|------------------|
| Local files you created | App-level (zones + approval) |
| Files from collaborators | App-level (zones + approval) |
| Downloaded from internet | Container (future) |
| User-provided documents | Container (future) |

See [notes/container-isolation-options.md](notes/container-isolation-options.md) for container implementation.

### Core Model

- **Zone-based access**: Workers see a virtual filesystem with zones like `/input/`, `/output/`
- **Two-level configuration**: Project defines available zones, workers declare what they need
- **Secure by default**: No sandbox declaration = pure function (no file access)
- **Automatic restriction**: Child workers only get what they declare, never more than parent

## Zone System

### Project Configuration

Project-level config defines **available zones**:

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
      mode: ro             # read-only
```

### Worker Declaration

Each worker declares its **sandbox requirements**:

```yaml
# formatter.worker
---
name: formatter
description: Formats data files
sandbox:
  zones:
    - name: data
      mode: rw             # requests read-write access
---
```

### Default Zones

When no project config exists:

| Zone | Purpose | Examples |
|------|---------|----------|
| `/cache/` | External downloads | PDFs, web pages, fetched content |
| `/workspace/` | Working files | Reports, drafts, outputs |

## Approval System

Zones can specify **approval requirements** for write/delete operations, separate from access mode:

```yaml
sandbox:
  zones:
    - name: input
      mode: ro
      # no approval needed - zone is read-only
    - name: drafts
      mode: rw
      approval:
        write: preApproved    # No prompt
        delete: preApproved
    - name: final
      mode: rw
      approval:
        write: ask            # Prompt user
        delete: blocked       # Prevent entirely
```

**Approval types:**
- `preApproved` - Operation proceeds without prompt
- `ask` - User prompted for approval (default)
- `blocked` - Operation blocked entirely

**Why separate from mode?**
- `mode` = **capability** (what sandbox allows)
- `approval` = **consent** (what needs user review)

A zone can be `rw` but still require approval for each write - defense in depth.

## Worker Delegation

When a parent calls a child worker, access is automatically restricted:

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
Error: Child requests 'rw' but parent only has 'ro'
```

```
Parent has: { data: rw, workspace: rw }
Child declares: nothing
    ↓
Child gets: null (pure function - no file access)
```

**Principles:**
- Secure by default - no declaration = no access
- Self-describing - each worker declares what it needs
- Parent is ceiling - child cannot exceed parent's access

## LLM Interface

### Discoverable Filesystem

The LLM sees a standard Unix-like filesystem and discovers available directories:

```
LLM: list_files("/")
→ ["input", "output"]

LLM: list_files("/input")
→ ["data.pdf", "config.json"]

LLM: write_file("/input/new.txt", "content")
→ Error: /input is read-only
```

**Why this design:**
- Self-documenting - LLM discovers what's available
- No special vocabulary - zones are just directories
- Standard errors - "read-only" is universally understood
- Configuration-agnostic - works with any zone setup

**Anti-patterns:**
- Hardcoding zone names in tool descriptions
- Exposing "zone" terminology to LLM
- Requiring LLM to know project configuration

---

## Implementation

### Backend Modes

**Sandboxed mode** (default) - virtual paths map to `.sandbox/`:

```typescript
const sandbox = await createSandbox({
  mode: 'sandboxed',
  root: '.sandbox'
});

// /cache/doc.pdf → .sandbox/cache/doc.pdf
```

**Direct mode** - virtual paths map to real directories:

```typescript
const sandbox = await createSandbox({
  mode: 'direct',
  cache: './downloads',
  workspace: './reports',
});

// /cache/doc.pdf → ./downloads/doc.pdf
```

### Sandbox Interface

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
```

### Backend Interface

```typescript
interface SandboxBackend {
  read(realPath: string): Promise<string>;
  write(realPath: string, content: string): Promise<void>;
  delete(realPath: string): Promise<void>;
  exists(realPath: string): Promise<boolean>;
  list(realPath: string): Promise<string[]>;
  mkdir(realPath: string): Promise<void>;
}
```

**Implementations:**
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

## Future: Git Integration

```
┌─────────────────────────────────────────┐
│              Git (GitHub)               │
│         Persistent storage              │
└─────────────────────────────────────────┘
          ↑                   │
     push │                   │ pull
          │                   ↓
┌─────────────────────────────────────────┐
│           Local Sandbox                 │
│  /cache/     - downloads                │
│  /workspace/ - working files            │
└─────────────────────────────────────────┘
```

**Operations:**
- `gitPull({ repo, paths })` - pull files from repo
- `gitStage({ files, repo, message })` - stage for preview
- `gitPush(commitId)` - push after approval
- `gitDiscard(commitId)` - cancel staged changes

See [notes/git-integration-design.md](notes/git-integration-design.md) for details.

## Future: Container Isolation

For untrusted content, run workers in isolated containers:

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

App-level checks remain for UX; container provides security boundary.

See [notes/container-isolation-options.md](notes/container-isolation-options.md) for options.
