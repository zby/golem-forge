# Worker Tools, Attachments, and Typed I/O (Current + Ideas)

**Date**: 2025-12-12  
**Status**: Draft / Notes

This note captures how “workers as tools” are currently wired, especially around attachments, and sketches likely next steps for typed inputs/outputs and typed attachment expectations. It complements the archived note `docs/notes/archive/workers-as-tools.md`.

## Current behavior: how a worker becomes a tool

**Where tools come from**

- A worker can delegate only if its frontmatter includes:
  ```yaml
  toolsets:
    workers:
      allowed_workers:
        - pdf_analyzer
        - other_worker
  ```
- Platform runtimes (CLI and Chrome) read `toolsets.workers.allowed_workers` during initialization and construct a `WorkerCallToolset`.
  - CLI path: `packages/cli/src/runtime/factory.ts` creates the toolset and registers each named tool.
  - Chrome path: similar logic in browser runtime.

**How the named tool is created**

- Core provides `WorkerCallToolset.create(...)`, which:
  - Looks up each allowed worker in the registry (for description).
  - Creates a named tool for it via `createNamedWorkerTool(...)`.
- The **tool name equals the worker name** (e.g., tool `pdf_analyzer`).
- Every named worker tool uses the same input schema:
  - `NamedWorkerInputSchema` in `packages/core/src/tools/worker-call.ts`.
  - Fields:
    - `input: string` (required)
    - `instructions?: string`
    - `attachments?: string[]` (sandbox paths)

**Why attachments appear in the schema**

- The tool JSON schema exposed to the LLM is derived directly from the Zod `inputSchema`.
- Since `createNamedWorkerTool` always attaches `NamedWorkerInputSchema`, **all worker-tools have an optional `attachments` parameter** today. There is no per-worker override.

## Current behavior: what happens to attachments

**Call site**

- The LLM calls the tool like:
  ```js
  pdf_analyzer({
    input: "Analyze this document",
    attachments: ["/input/deck.pdf"],
    instructions: "This is a pitch deck; focus on..."
  })
  ```
- `attachments` entries are **virtual sandbox paths**, not host paths.

**Delegation**

- When executing a worker-tool:
  - If `attachments` are provided but the parent has no sandbox, delegation fails early.
  - Otherwise, the parent sandbox reads each path:
    - Binary via `readBinary`, text via `read`.
    - MIME type is inferred from file extension.
    - Attachment `name` is set to the basename of the sandbox path.
  - The child worker is run with:
    ```ts
    { content: input, attachments: Attachment[] }
    ```

**Child enforcement**

- The child runtime enforces its own `attachment_policy`:
  - `max_attachments`, `max_total_bytes`, `allowed_suffixes`, `denied_suffixes`.
  - This is where a worker can currently “reject attachments” (e.g., `max_attachments: 0`), but the tool schema still advertises the parameter.

## Gaps / friction we’ve seen

- **Schema is generic**: all worker tools look the same to the LLM, even if a worker expects a specific structured input or only accepts certain attachments.
- **`input` is required** for delegation tools. Workers that are attachment-only still need a dummy string.
- **Attachment expectation is implicit**. A worker can enforce limits at runtime, but can’t describe “I need exactly one PDF” in the tool schema itself.

## Ideas: typed inputs, outputs, and typed attachments

### 1. Worker-declared input types

Add frontmatter support for an input schema (parallel to `output_schema_ref`):

```yaml
input_schema_ref: "./schemas/pitchdeck-input.json"
```

Or inline:

```yaml
input_schema:
  type: object
  required: [company, questions]
  properties:
    company: { type: string }
    questions: { type: array, items: { type: string } }
```

**Effect on worker-tools**

- When generating named tools, prefer the child’s input schema over the generic `NamedWorkerInputSchema`.
- We likely keep stable top-level keys (`input`, `instructions`, `attachments`) for ergonomics, but `input` could become:
  - `string | object` depending on schema.
  - or renamed to `input` as an object with a `content` field.

### 2. Worker-declared output types

We already have `output_schema_ref`; extend usage so:

- The runtime can validate structured output when present.
- The tool description can surface output shape (“returns `{type, summary, bullets}`”).
- Delegating workers can rely on typed output rather than parsing freeform text.

### 3. Declaring attachment expectations

Build on `attachment_policy` to add a declarative “attachment spec” that feeds into tool schema:

Option A: simple expectations

```yaml
attachments:
  required: true
  allowed_suffixes: [".pdf"]
  max_attachments: 1
```

Option B: typed slots (more flexible)

```yaml
attachments:
  slots:
    - name: document
      required: true
      allowed_suffixes: [".pdf"]
      description: "Primary PDF to analyze"
```

**Effect on worker-tools**

- Tool schema could:
  - mark `attachments` required when needed.
  - narrow allowed file types in descriptions (or via enum of suffixes / MIME types).
  - allow multiple typed slots in a stable order.

### 4. Attachment-only workers and optional `input`

Tie delegation schema to child config:

- If child sets `allow_empty_input: true` or declares required attachments, then named tool input could allow `input` to be optional or empty string.
- This requires loosening `NamedWorkerInputSchema` or making it per-worker.

## Open questions

- **Schema format**: JSON Schema only? Zod-in-TS? Both with a build step?  
  (Must respect core/platform boundary: core should own validation logic; platforms provide file loading.)
- **Where schemas live**: near workers, or shared in core? How to resolve paths in both CLI and browser sandboxes?
- **Backcompat**: do we keep generic tools and add “typed mode,” or switch all tools to per-worker schemas?
- **Multiple attachments**: should ordering matter, or do we need named slots to avoid ambiguity?
- **Provider limits**: some models accept only certain MIME types; should compatibility be validated at init?

