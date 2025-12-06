# Sandbox Configuration Analysis

**Date:** 2025-12-06
**Status:** Analysis only - no code changes

## Current Behavior

Sandbox is currently passed from parent worker to child worker as a **shared reference**:

```
CLI Entry (run.ts)
└─ Create WorkerRuntime
   └─ Initialize()
      └─ Create Sandbox (mode: 'sandboxed', root: `${projectRoot}/.sandbox`)
         └─ Register Tools
            └─ Create call_worker Tool
               └─ Child WorkerRuntime
                  └─ sharedSandbox = parent's sandbox (same instance)
```

### Key Code Locations

| File | Lines | Purpose |
|------|-------|---------|
| `src/runtime/worker.ts` | 340-356 | Sandbox creation with priority logic |
| `src/tools/worker-call.ts` | 235-246 | Child worker creation with shared sandbox |
| `src/cli/run.ts` | 320-329 | CLI entry point passing projectRoot |
| `src/worker/schema.ts` | 17-35 | Worker sandbox config schema (parsed but unused) |

## Issues Found

### 1. Per-Worker Sandbox Config is Defined but Not Enforced

The `.worker` file schema supports sandbox configuration:

```yaml
sandbox:
  paths:
    cache:
      root: "./cache"
      mode: "rw"
      suffixes: [".json", ".txt"]
```

But this is **never used** - all child workers get the entire shared sandbox.

### 2. Sandbox Mode is Hardcoded

Only `sandboxed` mode is used in CLI (line 348 in worker.ts):
```typescript
this.sandbox = await createSandbox({
  mode: 'sandboxed',
  root: `${this.options.projectRoot}/.sandbox`,
});
```

The `direct` mode exists but isn't exposed.

### 3. No Sandbox Isolation Between Workers

- Child workers share the **same sandbox instance** as parent
- Files written by one worker are visible to all downstream workers
- No per-worker zone restrictions

### 4. Configuration is Implicit, Not Declarative

Currently:
- Sandbox root is auto-detected from project root
- Mode is always `sandboxed`
- No way to customize without code changes

## Proposal: Two-Level Sandbox Configuration

### Level 1: Per-Project Config (Initial Sandbox)

A project-level config file (YAML) sets up the **available sandbox zones**:

```yaml
# golem-forge.config.yaml

sandbox:
  mode: sandboxed  # or 'direct'
  root: .sandbox   # relative to project root

  zones:
    cache:
      path: ./cache
      mode: rw
    workspace:
      path: ./workspace
      mode: rw
    data:
      path: ./data
      mode: ro        # read-only by default

# Other project-level settings
approval:
  mode: auto  # or 'manual', 'tool'

delegation:
  maxDepth: 5
```

This defines the **maximum sandbox** available to the entry-point worker.

### Level 2: Per-Worker Config (Self-Declared Requirements)

Each worker declares its **own sandbox requirements** in its `.worker` file:

```yaml
# formatter.worker
---
name: formatter
description: Formats data files

# What sandbox access THIS worker needs
sandbox:
  zones:
    - name: data
      mode: rw
---
```

```yaml
# validator.worker
---
name: validator
description: Validates data structure (pure function)

# No sandbox declaration = no sandbox access (pure function)
---
```

```yaml
# report-generator.worker
---
name: report-generator
description: Generates reports from data

sandbox:
  zones:
    - name: data
      mode: ro       # only needs to read data
    - name: workspace
      mode: rw       # writes reports here
---
```

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
- **No `child_sandbox` config** - Restrictions derived from child's own declaration

### Pure Function Workers

A worker with no sandbox declaration is a pure function:

```yaml
# validator.worker
---
name: validator
description: Validates data structure (pure function, no I/O)
# No sandbox section = no file access
---
```

The worker:
- Cannot read files
- Cannot write files
- Only operates on data passed via tool arguments
- Returns result via tool response

### Access Inheritance Chain

```
Project Config (defines zones + modes)
    ↓
Entry Worker (gets full project sandbox)
    ↓ calls child
Child Worker (declares needs, gets intersection)
    ↓ calls grandchild
Grandchild Worker (declares needs, gets intersection with child's access)
```

Each level can only **equal or reduce** capabilities, never increase.

### Benefits

1. **Project owner controls available zones** - Via project config
2. **Workers are self-describing** - Declare their own requirements
3. **Automatic least privilege** - Workers only get what they declare
4. **Pure functions are natural** - Just don't declare sandbox
5. **No coordination needed** - Parent doesn't need to know child's needs

## Implementation Considerations

### 1. Project Config Loading
- Config file: `golem-forge.config.yaml` (YAML format)
- Location: Same detection logic as `findProjectRoot()`
- Merge strategy: CLI flags > project config > defaults
- **Breaking change**: No backwards compatibility, just implement new behavior

### 2. Project Config Schema

```typescript
const ProjectConfigSchema = z.object({
  sandbox: z.object({
    mode: z.enum(['sandboxed', 'direct']).default('sandboxed'),
    root: z.string().default('.sandbox'),
    zones: z.record(z.string(), z.object({
      path: z.string(),
      mode: z.enum(['ro', 'rw']).default('rw'),
    })),
  }).optional(),

  approval: z.object({
    mode: z.enum(['auto', 'manual', 'tool']).optional(),
  }).optional(),

  delegation: z.object({
    maxDepth: z.number().positive().default(5),
  }).optional(),
});
```

### 3. Worker Schema Update
Update `src/worker/schema.ts` - worker declares its own sandbox needs:

```typescript
const WorkerSandboxSchema = z.object({
  zones: z.array(z.object({
    name: z.string(),
    mode: z.enum(['ro', 'rw']).optional(),  // default: 'rw'
  })),
});

const WorkerDefinitionSchema = z.object({
  // ... existing fields
  sandbox: WorkerSandboxSchema.optional(),  // No sandbox = pure function
});
```

### 4. Sandbox Restriction (Wrapper Class)

```typescript
class RestrictedSandbox implements Sandbox {
  constructor(
    private parent: Sandbox,
    private allowedZones: Map<string, 'ro' | 'rw'>
  ) {}

  resolvePath(zone: string, filename: string, mode: 'ro' | 'rw') {
    const allowed = this.allowedZones.get(zone);
    if (!allowed) {
      throw new Error(`Zone '${zone}' not available to this worker`);
    }
    if (mode === 'rw' && allowed === 'ro') {
      throw new Error(`Zone '${zone}' is read-only for this worker`);
    }
    return this.parent.resolvePath(zone, filename, mode);
  }
}
```

### 5. Enforcement in call_worker
In `src/tools/worker-call.ts`, when creating child runtime:

```typescript
// Get child worker's declared sandbox requirements
const childSandboxDecl = childWorkerDefinition.sandbox;

// No declaration = pure function (no sandbox)
if (!childSandboxDecl?.zones?.length) {
  childSandbox = null;
} else {
  // Validate and create restricted sandbox
  const allowedZones = new Map<string, 'ro' | 'rw'>();

  for (const zone of childSandboxDecl.zones) {
    const parentAccess = parentSandbox.getZoneAccess(zone.name);
    const requestedMode = zone.mode ?? 'rw';

    if (!parentAccess) {
      throw new Error(`Child requests zone '${zone.name}' but parent doesn't have it`);
    }
    if (requestedMode === 'rw' && parentAccess === 'ro') {
      throw new Error(`Child requests 'rw' on '${zone.name}' but parent only has 'ro'`);
    }

    allowedZones.set(zone.name, requestedMode);
  }

  childSandbox = new RestrictedSandbox(parentSandbox, allowedZones);
}

const childRuntime = new WorkerRuntime({
  // ...
  sharedSandbox: childSandbox,
});
```

## Related Files to Modify

| File | Changes |
|------|---------|
| `src/cli/run.ts` | Load project config, create initial sandbox from config |
| `src/runtime/worker.ts` | Accept sandbox from config, pass to tools |
| `src/sandbox/impl.ts` | Add `RestrictedSandbox` class, `getZoneAccess()` method |
| `src/worker/schema.ts` | Update `sandbox` field schema (worker's own requirements) |
| `src/tools/worker-call.ts` | Validate child's requirements against parent, create restricted sandbox |
| NEW: `src/config/project.ts` | Project config loading and schema |

## Resolved Questions

| # | Question | Resolution |
|---|----------|------------|
| 1 | Config file format | YAML |
| 2 | Default restriction | No sandbox by default (secure) |
| 3 | Zone references | By name (validated against project config) |
| 4 | Sandbox.restrict() API | Wrapper class |
| 5 | Migration | Breaking change, no backwards compat |
| 6 | Design model | Workers self-declare needs, runtime enforces |
