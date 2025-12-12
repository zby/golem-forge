# golem-forge: Concept and Design

## Core Idea

**Workers are functions. Programs compose workers.**

Just like programs compose focused functions, LLM workflows compose focused workers. Each worker does one thing well with tight context—no bloated multi-purpose prompts.

| Programming | golem-forge |
|-------------|-------------|
| Program | Program directory |
| `main()` | `main.worker` |
| Function | `.worker` file |
| Function call | Worker as tool (e.g., `greeter(input: "...")`) |

A **program** is a directory with a `main.worker` entry point. A **worker** is a prompt template + configuration + tools, packaged as an executable unit that the LLM interprets.

## Terminology

### Naming Hierarchy

golem-forge uses three levels of abstraction:

| Level | Term | Analogy | Description |
|-------|------|---------|-------------|
| 1 | **Worker** | Function | Smallest executable unit. A prompt + tools + config. |
| 2 | **Program** | Program | A runnable composition of workers implementing a user-facing capability. |
| 3 | **Project** | Workspace | Top-level container with programs, shared workers, docs, tests. |

**Worker** is the building block. **Program** is what you run. **Project** is how you organize multiple programs (future).

### Why "Worker" (Not "Agent")

We use **worker** as our core term instead of "agent" because:

1. **Precision**: "Agent" is overloaded in the AI space—sometimes meaning a single LLM call with tools, sometimes an autonomous loop with goals/memory/planning, sometimes multi-agent swarms. "Worker" is precise.

2. **Mental model**: "Worker" signals it does work on behalf of the user, closer to function/job/task than "semi-autonomous being". No implication of autonomy or "will".

3. **Consistency**: Workers are functions. Programs are compositions. This analogy is clean and understandable.

For those coming from other frameworks:

> **Worker** (called "agent" in some frameworks)
>
> A worker is a prompt + tools + config, treated as an executable function.
> Workers can call other workers, but they don't run autonomously or indefinitely.

We reserve "agent" for potential future use: a control loop around workers that maintains memory, decides next calls, and stops when a goal is satisfied.

## Run Anywhere

golem-forge is designed from the start to run in two environments:

| Platform | Capabilities | Use Cases |
|----------|--------------|-----------|
| **CLI** | Filesystem access, shell commands, local tools | Development, automation, pipelines |
| **Browser Extension** | Web APIs, DOM interaction, page context | In-browser workflows, web scraping, user tools |

The same `.worker` files work in both environments. Platform-specific tools (filesystem vs web APIs) are available through toolsets that adapt to the runtime.

## What Is a Program?

A **program** is a directory that packages workers together:

```
my-program/
├── main.worker           # Entry point (required)
├── golem-forge.config.yaml  # Shared config (optional)
├── tools.ts              # Program-wide TypeScript tools (optional)
├── templates/            # Shared templates (optional)
├── workers/              # Helper workers (optional)
│   ├── analyzer.worker
│   └── formatter/
│       ├── worker.worker
│       └── tools.ts      # Worker-specific tools
├── input/                # Input sandbox (convention)
└── output/               # Output sandbox (convention)
```

**Configuration inheritance**: `golem-forge.config.yaml` provides defaults (model, sandbox, toolsets) inherited by all workers. Workers can override.

## What Is a Worker?

A **worker** is an executable prompt artifact: a persisted configuration that defines *how* to run an LLM-backed task (instructions, tools, sandboxes, models, outputs) rather than *what code to call*.

Workers live as `.worker` files (YAML front matter + instructions) and can be:
- Created by humans or LLMs
- Version-controlled like source code
- Locked to prevent accidental edits
- Composed (workers can call other workers)

**Two forms** with different trade-offs:

| Form | Path | Capabilities |
|------|------|--------------|
| **Single-file** | `name.worker` | Portable - one file, no dependencies. Built-in tools only. |
| **Directory** | `name/worker.worker` | Full power - custom TypeScript tools (`tools.ts`), templates. |

Single-file workers are intentionally limited to enable **truly portable LLM executables** - copy one `.worker` file and it works anywhere. For custom tools or worker-specific templates, use the directory model.

### Authoring Conventions (Skill Card + Playbook)

Workers have two audiences:

- **Orchestrators / parent workers** see only the worker **tool name** and its front‑matter `description` when deciding what to call.
- **Executors** see the full worker body as the system prompt when running the task.

To make workers feel like SKILLS docs, standardize on:

1. **A short “skill card” in `description`** for selection and delegation.
2. **A detailed execution playbook in the body** for how to perform the task.

Recommended `description` format (multi‑line YAML string):

```yaml
description: |
  **Purpose**: What this worker does in one sentence.
  **Use When**: The situations it should handle.
  **Don’t Use When**: Clear counterexamples / handoff rules.
  **Inputs**: What `input`, `instructions`, and attachments mean (if relevant).
  **Outputs**: Shape, format, length, schema expectations.
  **Requires Tools**: High‑level toolsets/capabilities needed (if any).
  **Example**: worker_name({ input: "…", attachments: ["…"] })
```

Recommended body outline (executor‑visible):

```markdown
## Role / Mindset
Briefly set the persona and constraints.

## Process
1. Step‑by‑step approach, referencing tools where helpful.

## Output Rules
- Required format, length, or schema.

## Edge Cases
- How to handle missing/conflicting info.

## Examples
- A few concrete input/output patterns.
```

Avoid enumerating tool lists or sandbox mounts in the body unless needed for behavior; tool schemas are injected automatically, and sandbox rules are enforced by runtime.
If a worker is intended to run with no text input (operate purely on sandbox contents), set `allow_empty_input: true` in front matter.

### Lifecycle

1. **Definition** - `.worker` file describes instructions, sandbox boundaries, tool policies
2. **Loading** - Registry resolves prompts, validates configuration
3. **Invocation** - Runtime builds execution context (sandboxes, approvals, tools)
4. **Execution** - LLM runs with worker's instructions and constraints
5. **Result** - Structured output with message logs

### Why Workers? (vs Raw LLM Calls)

| Worker | Raw LLM Call |
| --- | --- |
| Persistent artifact (YAML) | Inline code |
| Encodes security policy (sandbox, approvals) | No built-in policy layer |
| LLMs can create/edit workers | No persistence semantics |
| Version-controllable, lockable | Managed by developer code |
| Structured execution results | Returns raw output |

**The worker abstraction packages the rules and artifacts that make LLM execution safe, repeatable, and composable.**

## Why This Matters

**The LLM context problem**: LLM behavior is context-sensitive. Unlike traditional compilers where unused code is ignored, adding more text to an LLM prompt can degrade results. Large prompts bloat, drift, and fail unpredictably. When you batch everything into a single prompt, the LLM loses focus.

**The solution**: Workers with isolated contexts, connected through three mechanisms:

1. **Worker delegation** — Each allowed worker becomes a directly callable tool (e.g., `analyzer(input: "...")`, `formatter(input: "...")`). Decompose workflows into focused sub-calls. Each worker handles one unit of work with its own instructions, model, and tools. No bloated catch-all prompts.

2. **Autonomous worker creation** (`worker_create`) — Workers propose specialized sub-workers when needed. This is same-language metaprogramming: the LLM that executes workers also writes them. Created definitions are saved to disk for review.

3. **Progressive hardening** — Refine created workers over time: edit prompts, add schemas, lock allowlists, extract logic to TypeScript. Orchestrators delegate to vetted workers instead of fragile inline instructions.

**What this enables**:
- **Composability**: Recursive calls feel like function calls, not orchestration glue
- **Autonomy**: Workers identify when they need specialized handlers and create them
- **Control**: Approval gates, security boundaries (sandboxes, tool rules), progressive refinement
- **Reproducibility**: Every sub-call is explicit, loggable, auditable

## Key Capabilities

Four primitives implement these mechanisms:

### 1. Sandboxed File Access
Workers read/write files through explicitly configured sandboxes. Security by construction:
- Root directory and access mode (read-only or writable) declared per sandbox
- Path escapes (`..`, absolute paths) blocked by design
- File size limits prevent resource exhaustion
- Suffix filters control which file types can be read/written

### 2. Worker-to-Worker Delegation
Each allowed worker becomes a directly callable tool with enforcement layers:
- Allowlists restrict which workers can be called (each becomes a named tool)
- Attachment validation (count, size, extensions) happens before execution
- Model validated against worker's `compatible_models` constraints
- Tool access NOT inherited—each worker declares its own
- Results can be structured (validated JSON) or freeform text
- Fallback `call_worker` tool available for dynamic worker discovery

### 3. Tool Approval System
Configurable control over which operations require human approval:
- **Pre-approved**: Benign operations execute automatically
- **Approval-required**: Consequential operations require explicit user approval
- **Session approvals**: Approve once for repeated identical calls
- **Secure by default**: Custom tools require approval unless explicitly pre-approved

### 4. Autonomous Worker Creation
The `worker_create` tool, subject to approval:
- Worker proposes: name, instructions, optional schema/model
- User reviews definition, can edit or reject before saving
- Created workers start with minimal permissions (principle of least privilege)
- Saved definition is immediately executable and refinable

## Progressive Hardening

Workers start flexible, then harden as patterns stabilize:

1. **Autonomous creation** — Worker creates sub-worker, user approves saved definition
2. **Testing** — Run tasks, observe behavior
3. **Iteration** — Edit definition: refine prompts, add schemas, tune models
4. **Locking** — Pin orchestrators to vetted workers via allowlists
5. **Migration** — Extract deterministic operations to tested TypeScript

**Example**:
- **Day 1**: Orchestrator creates `evaluator`, user approves
- **Week 1**: Test runs reveal drift, refine prompt
- **Week 2**: Add structured output schema
- **Week 3**: Extract scoring logic to TypeScript toolbox with tests
- **Week 4**: Worker calls `computeScore()`, math is now deterministic

## Design Principles

1. **Programs as executables** — A program directory is the executable unit, `main.worker` is the entry point

2. **Workers as functions** — Focused, composable units that do one thing well

3. **Workers as artifacts** — Saved to disk, version controlled, auditable, refinable by programmers

4. **Guardrails by construction** — Sandboxes, attachment validation, approval enforcement happen in code, guarding against LLM mistakes (not security against attackers)

5. **Explicit configuration** — Tool access and worker allowlists declared in definitions, not inherited

6. **Recursive composability** — Workers calling workers should feel like function calls

7. **Progressive hardening** — Start with prompts for flexibility, extract deterministic logic to TypeScript as patterns stabilize

8. **Platform agnostic** — Same worker definitions run in CLI and browser extension, with platform-appropriate toolsets

## Architecture Overview

Built on [lemmy](https://github.com/badlogic/lemmy) for LLM provider abstraction and tool handling.

**Core modules** (planned):
- `runtime/` — Worker orchestration, delegation, creation lifecycle
- `worker/` — Worker parsing, loading, template rendering
- `tools/` — Tool registration (sandboxes, delegation, custom tools)
- `registry/` — Worker definition loading and persistence
- `types.ts` — Type definitions and schemas

**Key patterns**:
- Platform abstraction enables CLI and browser extension targets
- Security boundaries enforced in code (sandboxes, attachments, approvals)
- Workers as first-class executables with standard invocation
