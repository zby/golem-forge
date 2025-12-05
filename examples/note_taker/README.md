# Note Taker Example

A note-taking worker that demonstrates write approval. Each write operation requires user confirmation in interactive mode.

## Setup

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

```bash
cd examples/note_taker

# Add a note (will prompt for approval)
npx golem-forge main "Remember to review the PR tomorrow"

# Add another note
npx golem-forge main "Meeting with team at 3pm"

# Read all notes
npx golem-forge main "Show me all my notes"
```

## Approval Flow

When running in interactive mode (default), you'll see prompts like:

```
──────────────────────────────────────────────────────
APPROVAL REQUEST
──────────────────────────────────────────────────────
Trust: [Session]
Tool: write_file
Description: Write 45 bytes to: /session/.../notes/activity.log
Arguments:
  path: /session/.../notes/activity.log
  content: 2024-01-15 14:30 - Remember to review the PR tomorrow
──────────────────────────────────────────────────────
Approve? [y]es / [n]o / [r]emember:
```

Options:
- `y` or `yes` - Approve this operation
- `n` or `no` - Deny this operation
- `r` or `remember` - Approve and remember for this session

## Worker Definition

See `main.worker`:

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
