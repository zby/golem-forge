# Golem Forge Examples

Example workers demonstrating golem-forge features.

## Quick Start

```bash
# Build the project and link CLI
npm run build
npm link

# Set your API key and model
export ANTHROPIC_API_KEY="sk-ant-..."
export GOLEM_FORGE_MODEL="anthropic:claude-haiku-4-5"

# Run an example
golem-forge greeter "Hello, how are you?"
```

Alternative providers:
```bash
export OPENAI_API_KEY="sk-..."
export GOLEM_FORGE_MODEL="openai:gpt-4o-mini"
```

## Examples

### 1. Greeter (Simple Chat)

A minimal conversational worker with no tools.

```bash
golem-forge greeter "Hello, how are you?"
```

[View greeter README](./greeter/README.md)

### 2. File Manager (Filesystem Tools)

Demonstrates filesystem tools with the sandbox.

```bash
golem-forge file_manager "Create a file called test.txt with 'Hello World'"
```

[View file_manager README](./file_manager/README.md)

### 3. Note Taker (Write Approval)

Shows the approval flow for write operations.

```bash
golem-forge note_taker "Remember to buy groceries"
```

[View note_taker README](./note_taker/README.md)

### 4. Calculator (LLM Reasoning)

Mathematical calculations using LLM reasoning with optional scratch storage.

```bash
golem-forge calculator "What is the 20th Fibonacci number?"
golem-forge calculator "Find the prime factors of 360"
```

[View calculator README](./calculator/README.md)

### 5. Code Analyzer (File-based Analysis)

Analyze codebases using filesystem tools to explore and read files.

```bash
# Put code in codebase/, then:
golem-forge code_analyzer "Analyze the project structure"
```

[View code_analyzer README](./code_analyzer/README.md)

### 6. Whiteboard Planner (Image Analysis + Delegation)

Convert whiteboard photos into structured project plans using worker delegation.

```bash
# Put whiteboard images in input/, then:
golem-forge whiteboard_planner "Process all whiteboards"
```

[View whiteboard_planner README](./whiteboard_planner/README.md)

### 7. PDF Analyzer (Document Analysis + Orchestration)

Analyze PDF documents with specialized workers. Requires a vision-capable model.

```bash
export GOLEM_FORGE_MODEL="anthropic:claude-sonnet-4-20250514"
golem-forge pdf_analyzer
```

[View pdf_analyzer README](./pdf_analyzer/README.md)

### 8. Orchestrator (Worker Delegation)

Demonstrates delegating tasks to other workers.

```bash
golem-forge orchestrator "Say hello to everyone"
```

## CLI Options

```bash
golem-forge <directory> [input] [options]

Options:
  -m, --model <model>      Override GOLEM_FORGE_MODEL (e.g., anthropic:claude-haiku-4-5)
  -a, --approval <mode>    Approval mode: interactive, approve_all, auto_deny
  -i, --input <text>       Input text (alternative to positional args)
  -f, --file <path>        Read input from file
  --attach <path>          Attach a file (image, PDF, etc.)
  --trace <level>          Trace level: quiet, summary, full, debug
```

## Approval Modes

| Mode | Description |
|------|-------------|
| `interactive` | Prompt for each tool call (default) |
| `approve_all` | Auto-approve all operations |
| `auto_deny` | Auto-deny all operations |

## Creating Your Own Worker

Create a `.worker` file with YAML frontmatter and markdown instructions:

```yaml
---
name: my_worker
description: What this worker does
toolsets:
  filesystem: {}
sandbox:
  zones:
    - name: workspace
      mode: rw
---

You are an assistant that...

Instructions for the LLM go here.
```

Run with:
```bash
golem-forge /path/to/worker/directory "Your input"
```
