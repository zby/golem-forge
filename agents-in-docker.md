# Agent-in-Docker: Autonomous AI Agents with a Safety Net

> **Status**: Draft — basic happy path verified: Claude Code and Codex login via mounted auth, autonomous flags work, container blocks push. Edge cases and error handling untested. TODO: check if Claude mounts can be reduced. Originally AI-generated, refined through use.

AI coding agents like Claude Code and Codex work best when they can operate autonomously—reading files, running commands, making changes—without constantly asking for approval. But giving an agent free rein on your host system feels risky.

**Solution: Run agents in a Docker container with one key restriction—no push access.**

The agent can do anything inside the container: edit files, run tests, commit changes. But it can't push to remote (no SSH keys, no tokens). You review the commits on your host and push what you approve.

This gives you:
- **Autonomous execution**: Agents run with `--dangerously-skip-permissions` (Claude) or `--dangerously-bypass-approvals-and-sandbox` (Codex)—no approval prompts interrupting the flow.
- **Safe experimentation**: Worst case, you discard bad commits before pushing.
- **CI-like environment**: Ubuntu 24.04 container matches GitHub Actions runners.

---

## What you'll create

Inside your repository, you’ll add an `.agent/` folder:

```
.agent/
  Dockerfile              # symlink → Dockerfile.python (or your stack)
  Dockerfile.python
  Dockerfile.typescript
  compose.yaml
  agent
```

You can commit `.agent/` to the repo, or add it to `.gitignore` if you prefer to keep it local.

---

## Prerequisites (host Ubuntu)

1) Install Docker and Compose (verify these work):

```bash
docker --version
docker compose version
```

2) Make sure your user can run Docker without sudo:

```bash
groups | grep -q docker && echo "Already in docker group" || echo "Not in docker group"
```

If you're not in the docker group, add yourself:

```bash
sudo usermod -aG docker "$USER"
```

Then log out/in for group membership to take effect.

3) Verify Docker works without sudo:

```bash
docker run --rm hello-world
```

If this prints "Hello from Docker!" you're ready to continue.

---

## Step 1 — Clone the repo (host)

```bash
mkdir -p ~/work
cd ~/work
git clone <YOUR_REPO_URL> myrepo
cd myrepo
```

If you’re using GitHub, you can clone with HTTPS or SSH on the host — it doesn’t matter for the workflow as long as you do the remote configuration in the next step.

---

## Step 2 — Configure Git remotes: HTTPS fetch, SSH push

This is the key to “pull inside container, push on host”.

Set **fetch** (pull) to HTTPS (works for public repos without tokens), and **push** to SSH (requires your host SSH keys):

```bash
# Fetch/pull via HTTPS:
git remote set-url origin https://github.com/OWNER/REPO.git

# Push via SSH:
git remote set-url --push origin git@github.com:OWNER/REPO.git

git remote -v
```

You should see:
- `origin ... (fetch)` is `https://...`
- `origin ... (push)` is `git@github.com:...`

Why this works:
- Inside the container, `git pull` uses the **fetch URL** (HTTPS) and won’t need credentials for a public repo.
- Inside the container, `git push` uses the **push URL** (SSH) and will fail because you won’t provide SSH keys.
- On the host, your SSH keys allow `git push` to work normally.

GitHub notes:
- GitHub migrated `ubuntu-latest` to Ubuntu 24.04 and recommends pinning runner labels when you want stability.
- The Ubuntu 24.04 runner image details are published in the `actions/runner-images` repo.

---

## Step 3 — Copy the agent container files

Copy the ready-made files from `agents-in-docker/` to your repo's `.agent/` directory:

```bash
mkdir -p .agent
cp /path/to/golem-forge/agents-in-docker/* .agent/
chmod +x .agent/agent
```

This copies:

| File | Purpose |
|------|---------|
| `Dockerfile` | Symlink to active Dockerfile (default: Python) |
| `Dockerfile.python` | Python + uv |
| `Dockerfile.typescript` | TypeScript + pnpm |
| `compose.yaml` | Container config with volumes, git safety, user mapping |
| `agent` | Interactive shell or run commands (e.g., `./.agent/agent claude-auto`) |

> **Host path note:** The default compose file mounts several `~/.claude`, `~/.codex`, and `~/.gemini` directories. If your credentials live elsewhere (different dotfolders, custom locations), edit the host paths in `.agent/compose.yaml` before launching the container.

**Switching languages**: Replace the symlink with your stack's Dockerfile:

```bash
cd .agent
rm Dockerfile
cp Dockerfile.typescript Dockerfile  # or ln -s Dockerfile.typescript Dockerfile
```

See the files in [`agents-in-docker/`](agents-in-docker/) for details.

**Authentication**

- **Claude Code:** We mount `~/.claude` from the host, so if you're already logged in on the host, it just works in the container—no extra login needed. (Adjust the host path in `.agent/compose.yaml` if your credentials live elsewhere.)
- **Codex:** The Dockerfile installs the Codex CLI and `.agent/compose.yaml` mounts `~/.codex` by default. If your Codex config lives somewhere else, change that host path. Because the host directory is bind-mounted, any existing host login is automatically available inside the container—no extra login needed. Only if you skip mounting host creds would you run `codex login` (or `codex login --device-auth`) inside the container to generate fresh tokens.
- **Gemini:** We mount `~/.gemini` from the host, so if you're already logged in on the host, it just works. If not, run `gemini login` inside the container to authenticate.

---

## Step 4 — First run: build and enter the container

Build the container image:

```bash
docker compose -f .agent/compose.yaml build
```

Then open the container shell:

```bash
./.agent/agent
```

Inside the container, confirm tools exist:

```bash
git --version
vim --version | head -n 2
uv --version
```

---

## Step 5 — (Recommended) Pin Python version

This makes local + CI consistent. Inside the container, run:

```bash
uv python pin 3.12
```

This creates a `.python-version` file that uv (and GitHub Actions) will use.

GitHub's `actions/setup-python` can also use `python-version-file: ".python-version"`.

---

## Step 6 — Install Python and dependencies

Inside the container, install the pinned Python version:

```bash
uv python install
```

`uv python install` will respect the project's pinned Python version.

Install project dependencies:

```bash
uv sync --locked
```

- `uv sync` creates the project venv at `.venv` by default if it doesn't exist.
- If you want the agent container to **never update** `uv.lock` during routine installs, use `--locked` (errors if lock is out of date) or set `UV_LOCKED=1`.
- `uv.lock` is intended to be committed for reproducible installs.

Run tests:

```bash
uv run pytest
```

`uv run` runs commands inside the project environment.

Exit the container shell when done:

```bash
exit
```

---

## Daily workflow

### 1) Start work (host)
Create a branch (recommended):

```bash
git switch -c agent/my-task
```

### 2) Run the agent/container (container)
```bash
./.agent/agent
```

Inside container:
- Edit with vim
- Run `uv run ...`
- Commit locally:

```bash
git status
git add -A
git commit -m "Your message"
```

Pull remote changes if needed (works because fetch is HTTPS):

```bash
git pull --rebase
```

Try pushing (should fail):

```bash
git push
# should fail (SSH blocked + no prompts)
```

### 3) Push from the host (host)
Because it’s the **same working tree**, you can just push normally:

```bash
git push -u origin HEAD
```

Your host SSH keys handle auth.

---

## Troubleshooting

### “git commit” fails because user.name/email is not set
Set it once (either on host or in container):

```bash
git config user.name "Agent"
git config user.email "agent@local"
```

This writes to `.git/config` for the repo, so both host and container will see it.

### Container created root-owned files in the repo
Make sure you’re using the compose `user: "${AGENT_UID}:${AGENT_GID}"` setup and launching via `./.agent/agent`.

### “I need to pull a private submodule / private dependency”
That’s outside this “no keys/tokens” model. For private access, you’d typically:
- use a fine-scoped token for HTTPS, or
- mount an SSH agent socket into the container.
But that breaks the “no push creds inside container” goal.

---

## Security caveat (important)
Blocking `git push` inside the container does **not** fully prevent data exfiltration if untrusted code runs in the container, because it can still make outbound network requests. If your threat model includes that, you’ll want stricter egress controls (firewall rules, network namespaces, or running without network).

---

## Notes on AI CLIs inside the container

- The Dockerfile pre-installs `claude` and `codex`, available immediately when you enter `./.agent/agent`.
- Secret storage lives on the host (`~/.claude`, `~/.codex`) and is mounted into the container, so you can revoke or rotate credentials outside the container lifecycle.
- **Gemini CLI color issue**: By default, the Gemini CLI output colors can be difficult to read in some terminal environments within the Docker container. This was resolved by configuring Gemini to use "google-code" colors, which provide better contrast and readability.
- You can add other agents by customizing `.agent/Dockerfile` and bind-mounting any config they require.
- Want a one-off Codex session without approval prompts? Pass `--ask-for-approval never` (e.g., `codex --ask-for-approval never exec -- uv run pytest`) or use the `codex-auto` alias below.
- If you ever skip host-mounted credentials, you can still authenticate from inside the container with the device flow:
  ```bash
  codex login --device-auth
  ```
  Copy the short code it prints, open the provided URL on your host, paste the code, and approve; the resulting token is stored in the mounted `~/.codex`.

### Autonomous mode aliases

The `agent` script provides convenience aliases for running agents without approval prompts:

```bash
./.agent/agent claude-auto   # runs: claude --dangerously-skip-permissions
./.agent/agent codex-auto    # runs: codex --dangerously-bypass-approvals-and-sandbox
```

Inside an interactive shell, the same aliases are available:
```bash
./.agent/agent
$ claude-auto    # starts Claude in autonomous mode
$ codex-auto     # starts Codex in autonomous mode
```

---

## See also

- [Git worktrees with uv](worktrees-with-uv.md) — run agents on multiple branches in parallel; copy `.agent/` to each worktree for isolated containers per branch
