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
npx golem-forge . "Hello, how are you?"
```

[View greeter README](./greeter/README.md)

### 2. File Manager (Filesystem Tools)

Demonstrates filesystem tools with the sandbox.

```bash
cd examples/file_manager
npx golem-forge . "Create a file called test.txt with 'Hello World'"
```

[View file_manager README](./file_manager/README.md)

### 3. Note Taker (Write Approval)

Shows the approval flow for write operations.

```bash
cd examples/note_taker
npx golem-forge . "Remember to buy groceries"
```

[View note_taker README](./note_taker/README.md)

### 4. Calculator (LLM Reasoning)

Mathematical calculations using LLM reasoning with optional scratch storage.

```bash
cd examples/calculator
npx golem-forge . "What is the 20th Fibonacci number?"
npx golem-forge . "Find the prime factors of 360"
```

[View calculator README](./calculator/README.md)

### 5. Code Analyzer (File-based Analysis)

Analyze codebases using filesystem tools to explore and read files.

```bash
cd examples/code_analyzer
# Put code in codebase/, then:
npx golem-forge . "Analyze the project structure"
```

[View code_analyzer README](./code_analyzer/README.md)

### 6. Whiteboard Planner (Image Analysis + Delegation)

Convert whiteboard photos into structured project plans using worker delegation.

```bash
cd examples/whiteboard_planner
# Put whiteboard images in input/, then:
npx golem-forge . "Process all whiteboards"
```

[View whiteboard_planner README](./whiteboard_planner/README.md)

### 7. PDF Analyzer (Document Analysis + Orchestration)

Analyze PDF documents with specialized workers.

```bash
cd examples/pdf_analyzer
npx golem-forge . input/document.pdf
```

[View pdf_analyzer README](./pdf_analyzer/README.md)

### 8. Orchestrator (Worker Delegation)

Demonstrates delegating tasks to other workers.

```bash
cd examples/orchestrator
npx golem-forge . "Say hello to everyone"
```

## CLI Options

```bash
npx golem-forge <directory> [input] [options]

Options:
  -m, --model <model>      Model to use (e.g., anthropic:claude-haiku-4-5)
  -a, --approval <mode>    Approval mode: interactive, approve_all, auto_deny
  -i, --input <text>       Input text (alternative to positional args)
  -f, --file <path>        Read input from file
  --attach <path>          Attach a file (image, PDF, etc.)
  --trace <level>          Trace level: quiet, summary, verbose
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
npx golem-forge /path/to/worker/directory "Your input"
```
