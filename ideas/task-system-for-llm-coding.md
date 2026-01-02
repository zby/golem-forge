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

## Queue Maintenance

Ask the LLM to review all active tasks periodically. If you don't have hundreds of tasks, LLMs are fast at tidying up queues:

- Mark completed work as done
- Move stale tasks to backlog
- Merge duplicates
- Update outdated "Current State" sections
- Identify blocked tasks and their dependencies

A simple "review all active tasks and tidy up" prompt goes a long way.

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

Working example in [`/tasks/`](../tasks/README.md) directory with full templates.

Source: llm-do project (`../llm-do/docs/tasks/`)
