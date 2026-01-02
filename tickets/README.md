# Tickets

Operational documents for tracking work in progress. Managed via the `tickets` skill.

## Purpose

1. **Recovery** - After crash/context loss, AI reads ticket and resumes work
2. **Scoping** - Break work into chunks that fit in context window
3. **Dependencies** - Track what must be done first
4. **Bootstrap** - Capture key context (files, commands, links) so work can start immediately

## Skill-Based Management

The tickets system is managed via a Claude Code skill (`.claude/skills/tickets/SKILL.md`).

Claude automatically uses this skill when you mention:
- Creating, listing, or completing tickets
- Tracking work or ideas
- Managing backlog items
- Recurring reviews or audits

Example prompts:
- "Create a ticket for adding dark mode"
- "List my active tickets"
- "Complete the login-fix ticket"
- "Add an idea to the backlog about refactoring auth"

## Directories

| Directory | Purpose |
|-----------|---------|
| `active/` | Work in progress or planned next |
| `backlog/` | Ideas worth tracking, not yet planned |
| `completed/` | Finished work (can be purged periodically) |
| `recurring/` | Periodic tasks (reviews, audits) that are run repeatedly |

## Usage

- **New idea**: Ask Claude to create a backlog ticket, or manually create in `backlog/`
- **Planning work**: Move from `backlog/` to `active/`, flesh out full template
- **Starting work**: Ask Claude to create a ticket in `active/`
- **Resuming work**: Read ticket, continue from current state
- **Finishing work**: Ask Claude to complete the ticket, or move to `completed/`
- **Recurring work**: Create in `recurring/` with recurring template; update "Last Run" after each run

Completed tickets can be purged periodically - permanent decisions belong in AGENTS.md, code comments, or other documentation.

## Backlog Template

```markdown
# Feature Name

## Idea
What this would do.

## Why
Why it might be valuable.

## Rough Scope
High-level bullets of what's involved.

## Why Not Now
What's blocking or why it's not a priority.

## Trigger to Activate
What would make this worth doing.
```

## Active Ticket Template

```markdown
# Ticket Name

## Status
information gathering | ready for implementation | waiting for <dependency>

## Prerequisites
- [ ] other-ticket-name (dependency on another ticket)
- [ ] design decision needed (new design / approval)
- [ ] none

## Goal
One sentence: what "done" looks like.

## Context
- Relevant files/symbols:
- Related tickets/notes/docs:
- How to verify / reproduce:

## Decision Record
- Decision:
- Inputs:
- Options:
- Outcome:
- Follow-ups:

## Tasks
- [x] completed step
- [ ] next step
- [ ] future step

## Current State
Where things stand right now. Update as work progresses.

## Notes
- Short observations, gotchas, things tried
- Reference external docs for longer explanations
```

## Recurring Ticket Template

```markdown
# Review: Area Name

Brief description of what this review covers.

## Scope

- `path/to/module/` - Description
- `path/to/file.py` - Description

## Checklist

- [ ] Check item 1
- [ ] Check item 2
- [ ] Check item 3

## Output

Record findings in `docs/notes/reviews/review-<area>.md`.

## Last Run

YYYY-MM (brief note about findings)
```

## Guidelines

- Keep tickets focused - one coherent unit of work
- Front-load background gathering so tickets are startable without extra research
- Prefer `Prerequisites: none` unless blocked by new design or another ticket
- Record decisions in the ticket body; if a decision spans multiple tickets, extract
  it into a dedicated ticket and add dependencies
- Update current state frequently
- Notes prevent repeating mistakes after recovery
- Delete or archive when done - this is not documentation
