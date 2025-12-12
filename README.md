# golem-forge

Build composable, agentic LLM workflows using workers—focused, reusable prompt execution units.

## Why golem-forge?

**Tight context.** Each worker does one thing well. When delegating, the LLM crafts focused context for sub-workers—agentic context engineering.

**Composability.** Workers call other workers like functions. Build complex workflows from simple, focused pieces.

**Guardrails by construction.** Sandboxes limit file access, approvals gate dangerous operations, clearance controls what exits. Manual-only tools can't be invoked by the LLM, even under prompt injection—git is the first implementation: LLM stages, humans push.

**Progressive hardening.** Start with prompts for flexibility. As patterns stabilize, extract deterministic logic to tested TypeScript code.

**Run anywhere.** The same worker definitions run both as a CLI tool and in a browser extension - write once, deploy to terminal or browser.

## Platforms

golem-forge targets two runtime environments from the same codebase:

| Platform | Use Case |
|----------|----------|
| **CLI** | Local development, automation, CI/CD pipelines |
| **Browser Extension** | In-browser workflows, web page interaction, user-facing tools |

Workers are platform-agnostic. The same `.worker` files run in both environments, with platform-specific capabilities (filesystem vs web APIs) available through toolsets.

## The Model

A **program** is a directory with a `main.worker` entry point. Workers are focused prompt units that compose like functions:

| Programming | golem-forge |
|-------------|-------------|
| Program | Program directory |
| `main()` | `main.worker` |
| Function | `.worker` file |
| Function call | Worker as tool (e.g., `greeter`, `analyzer`) |
| Arguments | Input payload |
| Return value | Structured output |

## Quick Start (CLI)

```bash
# Install
npm install golem-forge

# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."  # or OPENAI_API_KEY

# Set default model (optional - can also use --model flag)
export GOLEM_FORGE_MODEL="anthropic:claude-haiku-4-5"

# Run a program
npx golem-forge ./examples/greeter "Tell me a joke"

# Or specify model explicitly
npx golem-forge ./examples/greeter "Tell me a joke" --model anthropic:claude-haiku-4-5
```

That's it. The CLI finds `main.worker` in the program directory and runs it.

### Attach files

Send reference images along with your prompt:

```bash
npx golem-forge ./examples/greeter --attach assets/spec.png --attach ../shared/logo.jpg "Describe these images"
```

`--attach` can be repeated. Relative paths resolve against the worker directory first, then your current working directory. Workers can further constrain attachments through their `attachment_policy`, and actual LLM support depends on the provider/model you run against.

## Program Structure

Programs grow organically from simple to complex:

**Minimal** - just an entry point:
```
my-program/
└── main.worker
```

**With helpers** - main delegates to focused workers:
```
my-program/
├── main.worker               # Orchestrator
├── golem-forge.config.yaml   # Program config (model, sandbox mounts)
└── workers/
    ├── analyzer.worker       # Focused worker
    └── formatter.worker      # Another focused worker
```

**With hardened operations** - extract reliable logic to TypeScript:
```
my-program/
├── main.worker
├── golem-forge.config.yaml
├── tools.ts              # Deterministic operations as functions
├── workers/
│   └── specialist/
│       ├── worker.worker
│       └── tools.ts      # Worker-specific tools
├── templates/            # Shared templates
├── input/
└── output/
```

This progression reflects **progressive hardening**: initially you might prompt the LLM to "rename the file to remove special characters". Once you see it works, extract that to a TypeScript function - deterministic, testable, no LLM variability.

## Running Programs

```bash
# Run program (finds main.worker)
npx golem-forge ./my-program "input message" --model anthropic:claude-haiku-4-5

# Run with different entry point
npx golem-forge ./my-program --entry analyzer "input" --model anthropic:claude-haiku-4-5

# Run single worker file directly
npx golem-forge ./standalone.worker "input" --model anthropic:claude-haiku-4-5

# Override config at runtime
npx golem-forge ./my-program "input" --model anthropic:claude-sonnet-4 --set locked=true
```

Create a new program:
```bash
npx golem-forge init my-program
```

## Workers

Workers are `.worker` files—just YAML with a special `prompt` field. Front matter style (`---` delimiters) lets you write the prompt as the document body instead of a quoted string. Workers call other workers as tools, making delegation feel like function calls.

See `docs/concept.md` for the standard worker template (structured `description` skill card + body playbook).

Add custom tools by creating `tools.ts` in your program directory:

```typescript
// tools.ts
export function sanitizeFilename(name: string): string {
  /** Remove special characters from filename. */
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
```

Functions become LLM-callable tools. Reference them in your worker's toolsets config.

## Key Features

- **Sandboxed file access** - Workers only access mounted paths
- **Worker delegation** - Workers call other workers, with allowlists
- **Custom tools** - TypeScript functions in `tools.ts` become LLM-callable tools
- **Template support** - Compose prompts from reusable templates
- **Tool approvals** - Gate dangerous operations for human review
- **Attachment policies** - Control file inputs (size, count, types)
- **Config inheritance** - `golem-forge.config.yaml` provides defaults, workers override

## Model Configuration

Models are configured with a simple priority system:

1. **CLI flag** (`--model`) - highest priority, overrides everything
2. **Environment variable** (`GOLEM_FORGE_MODEL`) - default for all programs
3. **Program config** (`golem-forge.config.yaml`) - program-specific default

```bash
# Set globally via environment
export GOLEM_FORGE_MODEL="anthropic:claude-haiku-4-5"

# Override per-run
npx golem-forge ./my-program "input" --model openai:gpt-4o
```

Workers can constrain which models they support using `compatible_models`:

```yaml
# workers/analyzer.worker
---
name: analyzer
description: Requires Anthropic models for best results
compatible_models:
  - "anthropic:*"          # Any Anthropic model
  - "openai:gpt-4o"        # Or this specific OpenAI model
---
```

If the user's model doesn't match a worker's constraints, the CLI errors with a helpful message showing compatible patterns.

To require a specific model, use a single exact entry:
```yaml
compatible_models:
  - "anthropic:claude-sonnet-4"  # Only this model allowed
```

## Program Configuration

Create a `golem-forge.config.yaml` in your program directory:

```yaml
# golem-forge.config.yaml

# Default model for this program (overridden by GOLEM_FORGE_MODEL or --model)
model: anthropic:claude-haiku-4-5

# Sandbox configuration (Docker-style mount at /)
sandbox:
  root: ./workspace         # only workspace dir visible to LLM

# Approval settings
approval:
  mode: interactive         # or 'approve_all', 'auto_deny'

# Delegation limits
delegation:
  maxDepth: 5
```

Sub-workers can be restricted to subtrees:

```yaml
# workers/analyzer.worker
---
name: analyzer
description: Analyzes data files
sandbox:
  restrict: /src            # only sees /src and below (i.e., workspace/src on disk)
  readonly: true            # cannot write
---

You analyze code in the /src/ directory.
```

**Key principles:**
- Paths use Docker bind mount semantics—simple paths, no zone prefixes
- Sub-workers can only restrict access, never expand it
- No sandbox declaration = pure function (no file access)

## Examples

See [`examples/`](examples/) for working code.

## Documentation

- **[`docs/concept.md`](docs/concept.md)** - Design philosophy

<!-- TODO: Add these docs as implementation progresses
- `docs/cli.md` - CLI reference
- `docs/worker_delegation.md` - Worker-to-worker calls
- `docs/architecture.md` - Internal design
- `docs/browser_extension.md` - Browser extension usage
-->

## Packages

golem-forge is organized as a monorepo with three packages:

| Package | Description |
|---------|-------------|
| [`@golem-forge/core`](packages/core/) | Shared types and utilities (sandbox types, error classes) |
| [`@golem-forge/cli`](packages/cli/) | CLI tool and Node.js runtime (worker execution, filesystem sandbox) |
| [`@golem-forge/chrome`](packages/chrome/) | Chrome extension (OPFS storage, web UI) |

### Development

```bash
# Install all dependencies
npm install

# Build core and cli packages
npm run build

# Build all packages (including extension)
npm run build:all

# Run all tests
npm test

# Run tests for specific package
npm run test:cli
npm run test:chrome
```

## Status

**Experimental** - Built on [Vercel AI SDK](https://ai-sdk.dev/). APIs may change.

**Caveats:** Sandboxes and approvals reduce risk but aren't guarantees. Prompt injection can trick LLMs into misusing granted tools. Treat these as mitigations, not proof of security.

## Contributing

PRs welcome! Run lint and tests before committing:

```bash
npm run lint && npm test
```

See [`AGENTS.md`](AGENTS.md).

## License

MIT
