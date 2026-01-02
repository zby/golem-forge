# Task Management Skill

A skill for managing operational work tracking documents.

## Trigger

Invoke this skill when:
- Starting a new piece of work
- Resuming after context loss or session restart
- Needing to organize ideas or backlog items
- Running periodic reviews or audits

## Purpose

1. **Recovery** - After crash/context loss, AI reads task and resumes work
2. **Scoping** - Break work into chunks that fit in context window
3. **Dependencies** - Track what must be done first
4. **Bootstrap** - Capture key context (files, commands, links) so work can start immediately

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `skills/active/` | Work in progress or planned next |
| `skills/backlog/` | Ideas worth tracking, not yet planned |
| `skills/completed/` | Finished work (can be purged periodically) |
| `skills/recurring/` | Periodic tasks (reviews, audits) that are run repeatedly |

## Procedures

### New Idea
1. Create file in `skills/backlog/` using **Backlog Template**
2. Name file descriptively: `feature-name.md`

### Plan Work
1. Move file from `skills/backlog/` to `skills/active/`
2. Expand using **Active Task Template**
3. Fill in all sections with available context

### Start Work
1. Create task directly in `skills/active/` using **Active Task Template**
2. Ensure Context section has all bootstrap information
3. Set Status to appropriate phase

### Resume Work
1. Read task file from `skills/active/`
2. Check Current State section
3. Continue from where work left off
4. Update Current State as you progress

### Finish Work
1. Move file from `skills/active/` to `skills/completed/`
2. Or delete if not worth archiving
3. Permanent decisions belong in code comments or documentation, not here

### Recurring Work
1. Create in `skills/recurring/` using **Recurring Task Template**
2. After each run, update "Last Run" section
3. Record findings in designated output location

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

## Active Task Template

```markdown
# Task Name

## Status
information gathering | ready for implementation | waiting for <dependency>

## Prerequisites
- [ ] other-task-name (dependency on another task)
- [ ] design decision needed (new design / approval)
- [ ] none

## Goal
One sentence: what "done" looks like.

## Context
- Relevant files/symbols:
- Related tasks/notes/docs:
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

## Recurring Task Template

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

## Constraints

- Keep tasks focused - one coherent unit of work
- Front-load background gathering so tasks are startable without extra research
- Prefer `Prerequisites: none` unless blocked by new design or another task
- Record decisions in the task body; if a decision spans multiple tasks, extract it into a dedicated task and add dependencies
- Update current state frequently
- Notes prevent repeating mistakes after recovery
- Delete or archive when done - this is not documentation

## Verification

After completing a task operation, verify:
- [ ] File is in correct directory for its state
- [ ] Template sections are filled appropriately
- [ ] Current State reflects actual progress
- [ ] Bootstrap context is sufficient for cold start

## See Also

- `tasks/` - Parallel README-based task system for comparison
- `skills-vs-readme.md` - Analysis of skills vs README approaches
- `ideas/task-system-for-llm-coding.md` - Original task system concept
