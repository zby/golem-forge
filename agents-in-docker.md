# Agent-in-Docker: Autonomous AI Agents with a Safety Net

> **Status**: Draft — basic happy path verified. Edge cases untested.

AI coding agents work best when autonomous—reading files, running commands, making changes without approval prompts. But free rein on your host system feels risky.

**Solution: Run agents in Docker with one restriction—no push access.**

The agent can do anything inside: edit, test, commit. But it can't push (no SSH keys, no tokens). You review commits on host and push what you approve.

This gives you:
- **Autonomous execution**: No approval prompts interrupting the flow
- **Safe experimentation**: Worst case, discard bad commits before pushing
- **CI-like environment**: Ubuntu 24.04 matches GitHub Actions runners

---

## Setup

### 1. Prerequisites

Docker with compose, runnable without sudo:

```bash
docker run --rm hello-world  # should print "Hello from Docker!"
```

### 2. Clone and configure remotes

```bash
git clone <YOUR_REPO_URL> myrepo && cd myrepo

# HTTPS fetch (works in container), SSH push (blocked in container, works on host)
git remote set-url origin https://github.com/OWNER/REPO.git
git remote set-url --push origin git@github.com:OWNER/REPO.git
```

### 3. Copy agent files

```bash
mkdir -p .agent
cp /path/to/golem-forge/agents-in-docker/* .agent/
chmod +x .agent/agent
```

This adds: `Dockerfile`, `Dockerfile.python`, `Dockerfile.typescript`, `compose.yaml`, `agent` script.

For TypeScript: `cd .agent && rm Dockerfile && ln -s Dockerfile.typescript Dockerfile`

### 4. Build and verify

```bash
docker compose -f .agent/compose.yaml build
./.agent/agent              # opens container shell
git --version && uv --version  # verify tools exist
exit
```

---

## Daily Workflow

**On host** — create a branch:
```bash
git switch -c agent/my-task
```

**In container** — run agent, make changes, commit:
```bash
./.agent/agent
# work happens here...
git add -A && git commit -m "Your message"
git push  # fails (SSH blocked) — this is expected
exit
```

**On host** — review and push:
```bash
git log --oneline -3  # review commits
git push -u origin HEAD
```

---

## Authentication

Credentials are mounted from host (`~/.claude`, `~/.codex`, `~/.gemini`). If logged in on host, it works in container.

To authenticate fresh inside container:
- **Claude**: `claude login`
- **Codex**: `codex login --device-auth`
- **Gemini**: `gemini login`

---

## Autonomous Mode

Run agents without approval prompts:

```bash
./.agent/agent claude-auto   # claude --dangerously-skip-permissions
./.agent/agent codex-auto    # codex --dangerously-bypass-approvals-and-sandbox
```

Same aliases work inside the interactive shell.

---

## Troubleshooting

**git commit fails (user.name not set)**:
```bash
git config user.name "Agent" && git config user.email "agent@local"
```

**Root-owned files**: Use the compose `user:` setup and launch via `./.agent/agent`.

**Private repos/dependencies**: Outside this model. Would require tokens or SSH agent socket, which breaks the "no push creds" goal.

---

## Security Caveat

Blocking `git push` doesn't prevent data exfiltration—untrusted code can still make network requests. For stricter security, add egress controls or run without network.

---

## See Also

- [Git worktrees with uv](worktrees-with-uv.md) — run agents on multiple branches in parallel
