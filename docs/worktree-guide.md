# Git Worktree Guide for Bug Fixes

Git worktrees let you work on multiple branches simultaneously without stashing or switching. Each worktree is a separate directory with its own working copy.

## Quick Setup

```bash
# From the main repo directory
cd /home/zby/llm/golem-forge

# Create a worktree for your fix (creates new branch from current HEAD)
git worktree add ../golem-forge-fix-123 -b fix/issue-123

# Or create from a specific branch/commit
git worktree add ../golem-forge-fix-123 -b fix/issue-123 main
```

## Install Dependencies and Build

Each worktree needs its own `node_modules`. After creating a worktree:

```bash
cd ../golem-forge-fix-123
npm install
npm run build  # Required! Tests depend on compiled packages
```

**Important**: The `npm run build` step is required because packages like `@golem-forge/ui-react` depend on compiled output from `@golem-forge/core`. Without building first, tests will fail with "Failed to resolve entry for package" errors.

## Verify Tests Pass Before Making Changes

Always run tests before writing any fixes to establish a baseline:

```bash
npm test
```

If tests fail at this point, the issue is with setup (missing build, dependencies, etc.) not your changes.

## Work on Your Fix

```bash
# Make changes, run tests
npm test

# Commit as usual
git add .
git commit -m "Fix issue #123"
```

## Clean Up When Done

```bash
# Return to main repo
cd /home/zby/llm/golem-forge

# Remove the worktree
git worktree remove ../golem-forge-fix-123

# Or if you need to force removal
git worktree remove --force ../golem-forge-fix-123
```

## Useful Commands

```bash
# List all worktrees
git worktree list

# Prune stale worktree references
git worktree prune
```

## Tips

- Worktree directories are typically placed as siblings to avoid nesting
- Each worktree has independent staged/unstaged changes
- You cannot check out the same branch in multiple worktrees
- The branch created in a worktree can be merged/pushed like any other branch
