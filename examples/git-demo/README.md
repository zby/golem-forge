# Git Toolset Demo

Demonstrates the git workflow with a mock LLM:

1. Setup test repo in `/tmp/golem-git-demo`
2. Mock LLM writes a file to sandbox
3. Mock LLM stages the file (user would approve in real usage)
4. Manual git_push commits to the repo
5. Verify the commit appears in git history

## Run the Demo

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
