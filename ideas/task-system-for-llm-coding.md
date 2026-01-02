# Task System for LLM-Assisted Coding

A lightweight, file-based task/ticketing system designed specifically for LLM coding assistants.

## The Core Insight

Traditional ticketing systems (Jira, GitHub Issues) are built for humans. LLM coding assistants have different needs:

1. **Context recovery** - After crash or context window overflow, the AI needs to resume exactly where it left off
2. **Scoping** - Work must be chunked to fit context windows
3. **Bootstrap** - Key files, commands, and links must be immediately available so work starts without research

## Why Files Beat Issue Trackers

- **No API needed** - LLM reads/writes markdown directly
- **Full context in one read** - No pagination, no separate API calls for comments
- **Decision history preserved** - The "Decision Record" section captures rationale that would be lost in issue comments
- **Current State as checkpoint** - Frequently updated, acts as save point for recovery

## The Pattern

Directory-based organization:
- `active/` - Work in progress
- `backlog/` - Ideas worth tracking
- `completed/` - Finished (can purge periodically)
- `recurring/` - Periodic reviews

Templates ensure consistent structure that LLMs can parse reliably.

## How to Enable

Add instructions to your `AGENTS.md` (or equivalent project instructions file):

```markdown
## Task Management

When working on multi-step tasks, use the task system in `/tasks/`:
- Read `/tasks/README.md` for templates and workflow
- Check `/tasks/active/` for current work before starting
- Create task files for non-trivial work
- Update "Current State" frequently as work progresses
```

This could also be a good fit for the Claude Code SKILLS abstraction - a `/task` skill that reads the README and manages task files. (Not yet implemented.)

## See Also

Working example in `/tasks/` directory with full templates.

Source: llm-do project (`../llm-do/docs/tasks/`)
