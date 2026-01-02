# Agent-in-Docker workflow (pull + commit in container, push on host)

This setup lets you:
- Work in a **Linux Docker container** (good for running “coding agents” safely).
- Allow the container to **clone/fetch/pull and commit** to your local repo.
- Prevent the container from **pushing** to GitHub (no SSH keys or tokens inside the container).
- Push to GitHub **from your host** (Ubuntu) where your SSH keys live.
- Keep the Python toolchain close to **GitHub Actions (Ubuntu 24.04 runner)**.

> Notes about “matching GitHub CI”:
> - GitHub-hosted runners are **VMs**, not containers. Your local container will share **your host kernel**, so you can’t match the runner kernel exactly.
> - You *can* match the **Ubuntu userland** and **Python version + dependency lock** very closely, which is what usually matters for Python projects.

---

## What you’ll create

Inside your repository, you’ll add an `.agent/` folder:

```
repo/
 .agent/
 Dockerfile
 compose.yaml
 agent
 agent-run
 pyproject.toml
 uv.lock
 ...
```

You can commit `.agent/` to the repo, or add it to `.gitignore` if you prefer to keep it local.

---

## Prerequisites (host Ubuntu)

1) Install Docker and Compose (verify these work):

```bash
docker --version
docker compose version
```

2) Make sure your user can run Docker (optional but common):

```bash
sudo usermod -aG docker "$USER"
```

Log out/in for group membership to take effect.

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

## Step 3 — (Recommended) Pin Python version in the repo

This makes local + CI consistent.

### Option A: Use `.python-version` (recommended)

In the repo root (host or container), create a `.python-version` file.

If you already use uv:

```bash
uv python pin 3.12
```

`uv` uses `.python-version` to decide what Python version to use/install.

Also, GitHub’s `actions/setup-python` can use `python-version-file: ".python-version"` (and even falls back to `.python-version` if no version is supplied).

### Option B: Use `requires-python` in `pyproject.toml`

Also good, but `.python-version` is the most direct way to keep local + CI identical.

---

## Step 4 — Create the agent container files

Create the directory:

```bash
mkdir -p .agent
```

### 4.1 `.agent/Dockerfile`

Create `.agent/Dockerfile` with:

```dockerfile
FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# Core tools: git + vim + curl for installing uv
RUN apt-get update && \
 apt-get install -y --no-install-recommends \
 ca-certificates \
 curl \
 git \
 vim \
 less \
 bash-completion \
 tzdata \
 && rm -rf /var/lib/apt/lists/*

# Install uv (standalone) into /usr/local/bin
# UV_INSTALL_DIR controls destination.
RUN curl -LsSf https://astral.sh/uv/install.sh | \
 env UV_INSTALL_DIR="/usr/local/bin" UV_NO_MODIFY_PATH=1 sh

# Writable locations so the container can run as *your* host UID/GID
RUN mkdir -p /uv-cache /uv-python /tmp/home && \
 chmod 777 /uv-cache /uv-python /tmp/home

# Defaults; you can override in compose
ENV UV_CACHE_DIR=/uv-cache \
 UV_PYTHON_INSTALL_DIR=/uv-python \
 UV_PROJECT_ENVIRONMENT=/workspace/.venv

WORKDIR /workspace
CMD ["bash"]
```

### 4.2 `.agent/compose.yaml`

Create `.agent/compose.yaml` with:

```yaml
services:
 agent:
 build:
 context: ..
 dockerfile: .agent/Dockerfile
 image: repo-agent-dev:ubuntu24
 working_dir: /workspace
 volumes:
 - ..:/workspace:rw
 - uv-cache:/uv-cache
 - uv-python:/uv-python
 environment:
 HOME: /tmp/home

 # Git safety:
 # - allow fetch/pull over HTTPS (public repo)
 # - make pushes fail (no SSH, no prompts)
 GIT_TERMINAL_PROMPT: "0"
 GIT_ASKPASS: /bin/false
 GIT_SSH_COMMAND: /bin/false

 # uv: store cache + downloaded Pythons in volumes (fast + repeatable)
 UV_CACHE_DIR: /uv-cache
 UV_PYTHON_INSTALL_DIR: /uv-python

 # uv project venv location: default is `.venv`, configurable via UV_PROJECT_ENVIRONMENT
 UV_PROJECT_ENVIRONMENT: /workspace/.venv

 # Run as your host UID/GID so files created in the repo aren't owned by root
 user: "${AGENT_UID}:${AGENT_GID}"

 tty: true
 stdin_open: true
 init: true

 # Basic hardening (optional but recommended)
 security_opt:
 - no-new-privileges:true
 cap_drop:
 - ALL

volumes:
 uv-cache:
 uv-python:
```

### 4.3 `.agent/agent` (open an interactive shell)

Create `.agent/agent` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"

export AGENT_UID="${AGENT_UID:-$(id -u)}"
export AGENT_GID="${AGENT_GID:-$(id -g)}"

cd "$REPO_ROOT"
exec docker compose -f .agent/compose.yaml run --rm agent bash
```

Make it executable:

```bash
chmod +x .agent/agent
```

### 4.4 `.agent/agent-run` (run a single command in the container)

Create `.agent/agent-run` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." >/dev/null 2>&1 && pwd)"

export AGENT_UID="${AGENT_UID:-$(id -u)}"
export AGENT_GID="${AGENT_GID:-$(id -g)}"

cd "$REPO_ROOT"
exec docker compose -f .agent/compose.yaml run --rm agent "$@"
```

Make it executable:

```bash
chmod +x .agent/agent-run
```

---

## Step 5 — First run: build container + set up Python + deps

Open the container shell:

```bash
./.agent/agent
```

Inside the container:

1) Confirm tools exist:

```bash
git --version
vim --version | head -n 2
uv --version
```

2) Install the Python version you pinned (if you created `.python-version`):

```bash
uv python install
```

`uv python install` will respect the project’s pinned Python version.
Also, uv can automatically download Python versions when needed.

3) Install project dependencies:

```bash
uv sync --locked
```

- `uv sync` creates the project venv at `.venv` by default if it doesn’t exist.
- If you want the agent container to **never update** `uv.lock` during routine installs, use `--locked` (errors if lock is out of date) or set `UV_LOCKED=1`.
- `uv.lock` is intended to be committed for reproducible installs.

4) Run tests:

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

## Optional: one command to “test in container, then push from host”

Create a host-side helper script `.agent/push-after-tests`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Run tests in the container (same env the agent uses)
./.agent/agent-run uv run pytest

# If tests pass, push from host (uses host SSH keys)
git push "$@"
```

Make it executable:

```bash
chmod +x .agent/push-after-tests
```

Then run:

```bash
./.agent/push-after-tests -u origin HEAD
```

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
