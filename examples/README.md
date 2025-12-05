# Golem Forge Examples

Example workers demonstrating golem-forge features.

## Prerequisites

```bash
# Build the project
npm run build

# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export OPENAI_API_KEY="sk-..."
```

## Examples

### 1. Greeter (Simple Chat)

A minimal conversational worker with no tools.

```bash
cd examples/greeter
npx golem-forge main "Hello, how are you?"
```

[View greeter README](./greeter/README.md)

### 2. File Manager (Filesystem Tools)

Demonstrates filesystem tools with the sandbox.

```bash
cd examples/file_manager
npx golem-forge main "Create a file called test.txt with 'Hello World'"
```

[View file_manager README](./file_manager/README.md)

### 3. Note Taker (Write Approval)

Shows the approval flow for write operations.

```bash
cd examples/note_taker
npx golem-forge main "Remember to buy groceries"
```

[View note_taker README](./note_taker/README.md)

## CLI Options

```bash
npx golem-forge <worker> [input] [options]

Options:
  -m, --model <model>      Model to use (e.g., anthropic:claude-haiku-4-5)
  -t, --trust <level>      Trust level: untrusted, session, workspace, full
  -a, --approval <mode>    Approval mode: interactive, approve_all, strict
  -i, --input <text>       Input text (alternative to positional args)
  -f, --file <path>        Read input from file
  -p, --project <path>     Project root directory
  -v, --verbose            Verbose output
```

## Trust Levels

| Level | Description |
|-------|-------------|
| `untrusted` | Web content, highest restrictions |
| `session` | Single session (default) |
| `workspace` | Persistent workspace access |
| `full` | Complete access (dangerous) |

## Approval Modes

| Mode | Description |
|------|-------------|
| `interactive` | Prompt for each tool call (default) |
| `approve_all` | Auto-approve all operations |
| `strict` | Auto-deny all operations |

## Creating Your Own Worker

Create a `.worker` file with YAML frontmatter and markdown instructions:

```yaml
---
name: my_worker
description: What this worker does
model: anthropic:claude-haiku-4-5
toolsets:
  filesystem: {}
---

You are an assistant that...

Instructions for the LLM go here.
```

Place in a `workers/` directory or specify with full path.
