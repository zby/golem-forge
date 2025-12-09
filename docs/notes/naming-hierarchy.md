# Naming Hierarchy: Worker, Program, Project

## Overview

This document clarifies the naming hierarchy in golem-forge and establishes terminology conventions for documentation and code.

## Three-Level Hierarchy

golem-forge uses three levels of abstraction:

| Level | Term | Analogy | Description |
|-------|------|---------|-------------|
| 1 | **Worker** | Function | Smallest executable unit. A prompt + tools + config. |
| 2 | **Program** | Program | A runnable composition of workers implementing a user-facing capability. |
| 3 | **Project** | Workspace/Repo | Top-level container with programs, shared workers, docs, and tests. |

### Worker (Smallest Unit)

A **worker** is the smallest executable unit - a prompt template + configuration + tools, packaged as an executable unit that the LLM interprets.

- Lives as a `.worker` file
- Can be called directly or by other workers
- Analogous to a function in programming
- Has tight, focused context

### Program (Runnable Unit)

A **program** is a directory with a `main.worker` entry point that implements a user-facing capability.

- What users execute via `golem-forge <program-dir> ...`
- Composes one or more workers
- Has its own configuration (`golem-forge.config.yaml`)
- Analogous to a program with a `main()` function

### Project (Container)

A **project** or **workspace** is the top-level container:

- Contains multiple programs
- Contains shared workers that programs can reuse
- Contains docs, specs, tests
- Analogous to a Git repository or IDE project

## Current Structure vs Terminology

The current golem-forge implementation primarily supports the first two levels:

```
my-program/
├── main.worker               # Entry point (program level)
├── golem-forge.config.yaml   # Program config
├── workers/                  # Helper workers
│   ├── analyzer.worker
│   └── formatter.worker
└── tools.ts                  # Custom tools
```

The third level (project/workspace with multiple programs) is a future organizational concern not yet implemented.

## Worker vs Agent Terminology

### Why "Worker" over "Agent"

**Worker** is the precise, internal term for golem-forge's core abstraction. We deliberately chose it over "agent" because:

1. **Precision**: "Agent" is overloaded in the AI space
   - Sometimes means: one LLM call with tools
   - Sometimes: autonomous loop with goals/memory/planning
   - Sometimes: multi-agent swarms

2. **Mental model alignment**: "Worker" signals:
   - It does work on behalf of the user
   - It's closer to function/job/task than "semi-autonomous being"
   - No implication of autonomy or "will"

3. **Consistency with analogy**: Workers are functions. Programs are compositions. This is clean and understandable.

### Using "Agent" as Translation

For onboarding and SEO, we can reference "agent" as the popular analog:

> **Worker** (sometimes called an "agent" in other frameworks)
>
> A worker is a prompt + tools + schema, treated as an executable function.
> It's the basic unit of computation in golem-forge.
> Workers can call other workers, but they don't run autonomously or indefinitely.

### Reserving "Agent" for Future Use

If golem-forge ever needs true autonomous loops (goals, memory, planning), the term "agent" remains available:

| Term | Description |
|------|-------------|
| Worker | Single task, one run. May call tools or sub-workers, but no endless loop. |
| Program | Composition/graph of workers. |
| Agent (future) | Control loop around workers: decides next calls, maintains memory, stops when goal satisfied. |

## File Naming Conventions

| File | Purpose |
|------|---------|
| `main.worker` | Entry point of a program (required) |
| `*.worker` | Worker definition files |
| `golem-forge.config.yaml` | Program/project configuration |
| `tools.ts` | Custom TypeScript tools |

## CLI Conventions

```bash
# Run a program (finds main.worker in directory)
npx golem-forge ./my-program "input"

# List available workers in a program
npx golem-forge list workers ./my-program

# Inspect a specific worker
npx golem-forge inspect worker ./my-program/workers/analyzer.worker
```

## Open Questions

1. **Multiple programs in one project**: Should golem-forge support a workspace structure with multiple programs? What would the directory layout look like?

2. **Shared worker libraries**: How should reusable workers be packaged and distributed across projects?

3. **Agent concept**: If/when we add true autonomous agents, how do they interact with the worker/program hierarchy?

## References

- External feedback on naming hierarchy (2024)
- `docs/concept.md` - Core design philosophy
- `README.md` - User-facing documentation
