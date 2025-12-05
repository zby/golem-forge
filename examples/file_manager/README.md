# File Manager Example

A file management worker demonstrating filesystem tools with the sandbox.

## Setup

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

```bash
# Run from the examples directory
golem-forge file_manager "List all files in the workspace"

# Or from within the worker directory
cd examples/file_manager
golem-forge . "List all files in the workspace"

# Create a file
golem-forge file_manager "Create a file called hello.txt with the content 'Hello World'"

# Read a file
golem-forge file_manager "Read the contents of hello.txt"

# Get file info
golem-forge file_manager "What's the size of hello.txt?"
```

## Approval Modes

```bash
# Interactive mode (default) - prompts for each tool call
golem-forge file_manager "Create test.txt" --approval interactive

# Auto-approve mode - approves all tool calls automatically
golem-forge file_manager "Create test.txt" --approval approve_all

# Strict mode - denies all tool calls
golem-forge file_manager "Create test.txt" --approval strict
```

## Worker Definition

See `index.worker`:

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
