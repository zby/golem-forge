# golem-forge

Build composable LLM workflows using workers - focused, reusable prompt execution units.

## Why golem-forge?

**Tight context.** Each worker does one thing well. No bloated multi-purpose prompts that try to handle everything.

**Composability.** Workers call other workers like functions. Build complex workflows from simple, focused pieces.

**Guardrails by construction.** Sandboxes limit file access, attachment policies cap resources, tool approvals gate dangerous operations. Guards against LLM mistakes, enforced in code rather than prompt instructions.

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

A **project** is a directory with a `main.worker` entry point. Workers are focused prompt units that compose like functions:

| Programming | golem-forge |
|-------------|-------------|
| Program | Project directory |
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

# Run a project
npx golem-forge ./examples/greeter "Tell me a joke" --model anthropic:claude-haiku-4-5
```

That's it. The CLI finds `main.worker` in the project directory and runs it.

### Attach files

Send reference images along with your prompt:

```bash
npx golem-forge ./examples/greeter --attach assets/spec.png --attach ../shared/logo.jpg "Describe these images"
```

`--attach` can be repeated. Relative paths resolve against the worker directory first, then your current working directory. Workers can further constrain attachments through their `attachment_policy`, and actual LLM support depends on the provider/model you run against.

## Project Structure

Projects grow organically from simple to complex:

**Minimal** - just an entry point:
```
my-project/
└── main.worker
```

**With helpers** - main delegates to focused workers:
```
my-project/
├── main.worker               # Orchestrator
├── golem-forge.config.yaml   # Project config (model, sandbox zones)
└── workers/
    ├── analyzer.worker       # Focused worker
    └── formatter.worker      # Another focused worker
```

**With hardened operations** - extract reliable logic to TypeScript:
```
my-project/
├── main.worker
├── project.yaml
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

## Running Projects

```bash
# Run project (finds main.worker)
npx golem-forge ./my-project "input message" --model anthropic:claude-haiku-4-5

# Run with different entry point
npx golem-forge ./my-project --entry analyzer "input" --model anthropic:claude-haiku-4-5

# Run single worker file directly
npx golem-forge ./standalone.worker "input" --model anthropic:claude-haiku-4-5

# Override config at runtime
npx golem-forge ./my-project "input" --model anthropic:claude-sonnet-4 --set locked=true
```

Create a new project:
```bash
npx golem-forge init my-project
```

## Workers

Workers are `.worker` files: YAML front matter (config) + body (instructions). They call other workers directly as tools - each allowed worker becomes a callable tool (e.g., `greeter`, `analyzer`), making worker delegation feel like function calls.

Add custom tools by creating `tools.ts` in your project root:

```typescript
// tools.ts
export function sanitizeFilename(name: string): string {
  /** Remove special characters from filename. */
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
```

Functions become LLM-callable tools. Reference them in your worker's toolsets config.

## Key Features

- **Sandboxed file access** - Workers only access declared zones with permission controls
- **Worker delegation** - Workers call other workers, with allowlists
- **Custom tools** - TypeScript functions in `tools.ts` become LLM-callable tools
- **Template support** - Compose prompts from reusable templates
- **Tool approvals** - Gate dangerous operations for human review
- **Attachment policies** - Control file inputs (size, count, types)
- **Config inheritance** - `golem-forge.config.yaml` provides defaults, workers override

## Project Configuration

Create a `golem-forge.config.yaml` in your project root to configure sandbox zones and other settings:

```yaml
# golem-forge.config.yaml

# Default model for all workers
model: anthropic:claude-haiku-4-5

# Sandbox configuration
sandbox:
  mode: sandboxed           # or 'direct'
  root: .sandbox            # relative to project root
  zones:
    cache:
      path: ./cache
      mode: rw
    workspace:
      path: ./workspace
      mode: rw
    data:
      path: ./data
      mode: ro              # read-only

# Approval settings
approval:
  mode: interactive         # or 'approve_all', 'auto_deny'

# Delegation limits
delegation:
  maxDepth: 5
```

Workers declare which zones they need access to:

```yaml
# workers/analyzer.worker
---
name: analyzer
description: Analyzes data files
sandbox:
  zones:
    - name: data
      mode: ro              # only needs to read
    - name: workspace
      mode: rw              # writes results
---

You analyze data from the /data/ zone and write results to /workspace/.
```

**Key principles:**
- Workers only get access to zones they explicitly declare
- Child workers cannot exceed parent's access level
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

## Status

**Experimental** - Built on [Vercel AI SDK](https://ai-sdk.dev/). APIs may change.

**Caveats:** Sandboxes and approvals reduce risk but aren't guarantees. Prompt injection can trick LLMs into misusing granted tools. Treat these as mitigations, not proof of security.

## Contributing

PRs welcome! Run `npm test` before committing. See [`AGENTS.md`](AGENTS.md).

## License

MIT
