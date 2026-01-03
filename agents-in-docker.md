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
  Dockerfile
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
| `Dockerfile` | Ubuntu 24.04 image with git, vim, uv, Claude, Codex, and Gemini CLIs |
| `compose.yaml` | Container config with volumes, git safety, user mapping |
| `agent` | Interactive shell or run commands (e.g., `./.agent/agent claude-auto`) |

See the files in [`agents-in-docker/`](agents-in-docker/) for details.

**Authentication**

- **Claude Code:** The container mounts `~/.claude`, so your login persists. First time:
  1. Run `claude` inside the container.
  2. Complete the browser OAuth flow on the host.
  3. Credentials land in `~/.claude`, which is already mounted.
- **Codex:** The Dockerfile installs the Codex CLI and `.agent/compose.yaml` mounts `~/.codex` by default. Run `codex login` once inside the container to kick off the host-browser auth flow; the token is saved into the mounted directory.
- **Gemini:** The Dockerfile also installs the Gemini CLI and `.agent/compose.yaml` mounts `~/.gemini`. Run `gemini login` once inside the container to kick off the host-browser auth flow; the token is saved into the mounted directory.

---

## Step 4 — First run: build and enter the container

Open the container shell:

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

## Matching GitHub Actions even closer

### Pin the runner OS
In CI, pin to Ubuntu 24.04 to match the container base image:

```yaml
runs-on: ubuntu-24.04
```

GitHub announced Ubuntu 24.04 runner image GA and the `ubuntu-latest` migration to 24.04.

### Use `.python-version` in CI
From uv’s GitHub Actions guide:

```yaml
- name: "Set up Python"
 uses: actions/setup-python@v6
 with:
 python-version-file: ".python-version"
```

Then install uv and sync:

```yaml
- name: Install uv
 uses: astral-sh/setup-uv@v7

- name: Install the project
 run: uv sync --locked --all-extras --dev

- name: Run tests
 run: uv run pytest
```

This is straight from the uv GitHub Actions integration docs.

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

- The Dockerfile pre-installs `claude`, `codex`, and `gemini`, so they’re immediately available when you enter `./.agent/agent`.
- Secret storage lives on the host (`~/.claude`, `~/.codex`, `~/.gemini`) and is mounted into the container, so you can revoke or rotate credentials outside the container lifecycle.
- You can still add other agents (local OSS models, etc.) by customizing `.agent/Dockerfile` and bind-mounting any config they require.
- Want Codex to run fully-automatic inside the container without approval prompts? Just pass `--ask-for-approval never` when launching:
  ```bash
  codex --ask-for-approval never
  # or for single commands
  codex exec --ask-for-approval never -- "uv run pytest"
  ```
  This keeps the “no-approval” behavior scoped to the container session, leaving your host defaults untouched.
