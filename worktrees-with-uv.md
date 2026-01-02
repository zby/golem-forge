# Git worktrees (Python + uv)

How to work on multiple branches in parallel using **git worktrees**, with Python dependencies managed by **uv** (`pyproject.toml` + `uv.lock`).

Worktrees let you check out multiple branches **at the same time** into separate folders, without constantly switching branches or stashing changes. This is especially useful for agentic workflows — you can have an AI agent working on a feature in one worktree while you continue development on main.

---

## Suggested directory layout

Keep worktrees *next to* your main checkout:

```
~/src/myproj/                  # main worktree (your normal clone)
~/src/myproj.worktrees/         # extra worktrees live here
  feature-login/
  bugfix-123/
```

This makes it obvious which folder corresponds to which branch and avoids nesting worktrees inside each other.

---

## Create a new worktree

From your main checkout:

```bash
cd ~/src/myproj
git fetch origin
mkdir -p ../myproj.worktrees
```

### Create a new branch in a new worktree (common)

```bash
git worktree add -b feature/login ../myproj.worktrees/feature-login origin/main
```

### Use an existing branch in a new worktree

```bash
git worktree add ../myproj.worktrees/bugfix-123 bugfix/123
```

---

## Python + uv in each worktree

Each worktree is a separate directory that contains its own copy of the tracked files. Treat it like a normal checkout.

### Option A (recommended): use `uv run` (no activation needed)

This is the easiest way to avoid accidentally using the wrong environment:

```bash
cd ../myproj.worktrees/feature-login

uv run python -V
uv run pytest
uv run ruff check .
```

### Option B: create/sync and activate the local `.venv`

This is often preferred for IDE integration or if you like explicit activation:

```bash
cd ../myproj.worktrees/feature-login

uv sync
source .venv/bin/activate     # Windows PowerShell: .venv\Scripts\Activate.ps1
python -V
pytest
```

---

## Can I have separate venvs in each worktree?

Yes — and that’s usually what you want.

By default, uv uses a **project-local virtual environment** (commonly a `.venv` folder in the project root). Since each worktree has its own project root directory, each worktree will naturally have its own `.venv` (unless you intentionally configure uv to put the environment somewhere else).

**Why separate envs are good:**
- Branch A and Branch B can have different dependency versions without stepping on each other.
- You avoid “it works on this branch but not the other” issues caused by a shared environment.

---

## Do I need to create the venv after creating a worktree?

Typically you don’t need a separate “create venv” step.

In a fresh worktree, you usually just run **one** of the following and uv will set things up:

- `uv run <command>` (will create/use the environment as needed), or
- `uv sync` (creates/syncs the environment to the locked dependencies)

If the branch changes dependencies (`pyproject.toml` / `uv.lock`), re-run:

```bash
uv sync
```

---

## Is uv “intelligent” about worktrees?

In practice, yes:

- uv resolves the project environment **relative to the folder you’re in**.
- Because each worktree is a different folder, uv will use the corresponding environment for that worktree.
- uv also uses caching, so creating environments across multiple worktrees is usually fast after the first install.

---

## Worktree housekeeping

### See all worktrees

```bash
git worktree list
```

### Remove a worktree cleanly

```bash
git worktree remove ../myproj.worktrees/feature-login
```

### If you deleted a worktree folder manually, clean up metadata

```bash
git worktree prune
```

---

## Common gotchas

- **Don’t run tooling from the wrong folder.**  
  If you keep multiple worktrees open in your editor/terminal, it’s easy to run commands in the wrong repo directory.
  A good habit is to show your current path in your shell prompt.

- **Make sure `.venv` is ignored.**  
  Your `.venv` should not be committed. Ensure your `.gitignore` includes:

  ```
  .venv/
  ```

- **IDE interpreter selection matters.**  
  Point your IDE to the interpreter inside the worktree’s `.venv` (each worktree may have a different one).

---

## Quick start checklist (new worktree)

```bash
git worktree add -b feature/foo ../myproj.worktrees/feature-foo origin/main
cd ../myproj.worktrees/feature-foo
uv sync
uv run pytest
```

---

## See also

- [DHH on using worktrees](https://x.com/dhh/status/2005326958578856206)
- [doodlestein's criticism](https://x.com/doodlestein/status/2006263488155468101) — prefers agents coordinating on same worktree via "agent email"
- [David Crawshaw prefers `cp -a`](https://x.com/davidcrawshaw/status/2002842140226035977) — simpler than worktrees
- [Worktrunk](https://worktrunk.dev/) — A CLI tool for managing git worktrees, designed for running AI agents in parallel. Instead of juggling multiple git commands and directory changes, Worktrunk lets you address worktrees by branch name. Creating a worktree and launching Claude becomes `wt switch -c -x claude feat` instead of several separate commands. Also includes project hooks for setup tasks, AI-generated commit messages, and integrated merge workflows.
- [Zagi](https://github.com/mattzcarey/zagi) — A Git-compatible CLI written in Zig, optimized for AI agents. Produces ~50% smaller output than standard git to prevent context window overflow. Includes a `fork` command for worktree-based parallel exploration of implementation approaches. When `ZAGI_AGENT` is set, it adds safeguards like requiring prompt tracking for commits and blocking destructive commands.

---

## Provenance

First version generated by ChatGPT 5.2 Pro. Original prompt:

> Write a readme file for using git worktrees in my programming project. Assume I use python and uv for deps. Can I have separate venvs in each worktree? I assume that after creating a work tree I'll need to create the venv in it for this to work? Is uv intelligent about it?
