# File Manager Example

A file management worker demonstrating filesystem tools with the sandbox.

## Setup

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

```bash
cd examples/file_manager

# List files in workspace
npx golem-forge main "List all files in the workspace"

# Create a file
npx golem-forge main "Create a file called hello.txt with the content 'Hello World'"

# Read a file
npx golem-forge main "Read the contents of hello.txt"

# Get file info
npx golem-forge main "What's the size of hello.txt?"
```

## Approval Modes

```bash
# Interactive mode (default) - prompts for each tool call
npx golem-forge main "Create test.txt" --approval interactive

# Auto-approve mode - approves all tool calls automatically
npx golem-forge main "Create test.txt" --approval approve_all

# Strict mode - denies all tool calls
npx golem-forge main "Create test.txt" --approval strict
```

## Worker Definition

See `main.worker`:

```yaml
name: file_manager
description: Manage files in a sandboxed workspace directory
toolsets:
  filesystem: {}
```

**Key points:**
- Uses `filesystem` toolset for file operations
- All operations are sandboxed
- Supports different approval modes
