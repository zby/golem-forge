# Git Toolset Demo

Demonstrates the git workflow step by step.

## Interactive Demo

Run the interactive demo that pauses at each step:

```bash
npx tsx examples/git-demo/run.ts
```

This walks you through:
1. Setup test repo in `/tmp/golem-git-demo`
2. Write a file to sandbox (simulating LLM action)
3. Stage the file with approval dialog (you approve)
4. Show git status and diff
5. Push with approval dialog (you approve)
6. Verify the commit in git history

## Automated Test

Run the automated test with mock LLM:

```bash
npx vitest run examples/git-demo/demo.test.ts
```

## Expected Output

```
📋 Git status: {
  "staged": [{
    "id": "abc123",
    "message": "Add LLM-generated section to README",
    "files": ["/workspace/README.md"]
  }]
}

📦 Staged commit ID: abc123

🚀 Push result: {
  "success": true,
  "commitSha": "def456..."
}

✅ Demo completed successfully!
   - File written to sandbox
   - Changes staged for commit
   - Commit pushed to repository
   - Final commit count: 2
   - Last commit: "Add LLM-generated section to README"
```

## What It Demonstrates

1. **Mock LLM**: Uses vitest mocking to simulate LLM tool calls
2. **Sandbox Isolation**: Files are written to sandbox, not directly to repo
3. **Staged Commits**: Changes are held in memory until pushed
4. **Manual Push**: `git_push` is invoked directly (simulating user action)
5. **Real Git**: Commits actually appear in the git repo

## Note on Paths

Sandbox paths like `/workspace/README.md` become `workspace/README.md` in the
target git repo. The sandbox zone prefix is preserved in the commit.
