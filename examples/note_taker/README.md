# Note Taker Example

A note-taking worker that demonstrates write approval. Each write operation requires user confirmation in interactive mode.

## Setup

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

```bash
# Run from the examples directory
golem-forge note_taker "Remember to review the PR tomorrow"

# Or from within the worker directory
cd examples/note_taker
golem-forge . "Remember to review the PR tomorrow"

# Add another note
golem-forge note_taker "Meeting with team at 3pm"

# Read all notes
golem-forge note_taker "Show me all my notes"
```

## Approval Flow

When running in interactive mode (default), you'll see prompts like:

```
──────────────────────────────────────────────────────
APPROVAL REQUEST
──────────────────────────────────────────────────────
Trust: [Session]
Tool: write_file
Description: Write 45 bytes to: notes/activity.log
Arguments:
  path: notes/activity.log
  content: 2024-01-15 14:30 - Remember to review the PR tomorrow
──────────────────────────────────────────────────────
Approve? [y]es / [n]o / [r]emember:
```

Options:
- `y` or `yes` - Approve this operation
- `n` or `no` - Deny this operation
- `r` or `remember` - Approve and remember for this session

## Worker Definition

See `index.worker`:

```yaml
name: note_taker
description: Save timestamped notes to a log file with write approval
toolsets:
  filesystem: {}
```

**Key points:**
- Demonstrates write approval flow
- Shows how notes persist across invocations
- Uses filesystem toolset for read/write operations
