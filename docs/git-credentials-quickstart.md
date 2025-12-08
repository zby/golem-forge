# Git Credentials Quick Start

This guide explains how workers authenticate with git repositories for push/pull operations.

## TL;DR

**It just works.** Workers inherit your existing git credentials—SSH keys, credential helpers, and environment variables. No configuration needed for most setups.

## Default Behavior

When a worker runs `git_push` or `git_pull`, it uses your host's git configuration:

| Credential Type | How It Works |
|-----------------|--------------|
| **SSH keys** | Inherited via `$SSH_AUTH_SOCK` |
| **Credential helpers** | Inherited from `~/.gitconfig` |
| **GitHub CLI** | Uses `gh auth token` if available |
| **GITHUB_TOKEN** | Inherited from environment |

### Verify Your Setup

```bash
# Check SSH agent is running
ssh-add -l

# Check GitHub CLI auth
gh auth status

# Check git credential helper
git config --get credential.helper
```

If any of these work on your host, they'll work in workers.

## Common Scenarios

### 1. Local Repository (SSH)

No configuration needed if you have SSH keys set up:

```yaml
# worker.yaml
toolsets:
  git:
    default_target:
      type: local
      path: "."
```

### 2. GitHub with Personal Access Token

Set `GITHUB_TOKEN` before running the worker:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
golem run my-worker.yaml
```

Or use GitHub CLI:

```bash
gh auth login
golem run my-worker.yaml  # Uses gh auth token automatically
```

### 3. Custom Commit Author

Override the commit author for worker-generated commits:

```yaml
# worker.yaml
toolsets:
  git:
    default_target:
      type: local
      path: "."
    credentials:
      env:
        GIT_AUTHOR_NAME: "My Worker Bot"
        GIT_AUTHOR_EMAIL: "bot@example.com"
        GIT_COMMITTER_NAME: "My Worker Bot"
        GIT_COMMITTER_EMAIL: "bot@example.com"
```

### 4. Custom SSH Key

Use a specific SSH key for git operations:

```yaml
# worker.yaml
toolsets:
  git:
    credentials:
      env:
        GIT_SSH_COMMAND: "ssh -i ~/.ssh/worker_key -o IdentitiesOnly=yes"
```

### 5. CI Environment

In CI, credentials are typically provided via environment variables:

```yaml
# GitHub Actions
- name: Run worker
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: golem run my-worker.yaml
```

```yaml
# GitLab CI
script:
  - export GITHUB_TOKEN=$CI_JOB_TOKEN
  - golem run my-worker.yaml
```

## Configuration Reference

```yaml
toolsets:
  git:
    credentials:
      # Mode: 'inherit' (default) or 'explicit'
      mode: inherit

      # Additional environment variables
      env:
        GIT_AUTHOR_NAME: "Bot Name"
        GIT_AUTHOR_EMAIL: "bot@example.com"
        GIT_SSH_COMMAND: "ssh -i ~/.ssh/custom_key"
        GIT_TERMINAL_PROMPT: "0"  # Disable prompts
```

### Credential Modes

| Mode | Behavior |
|------|----------|
| `inherit` | Merge explicit env with host's `process.env` (default) |
| `explicit` | Only use explicitly provided env vars (for isolation) |

## Troubleshooting

### "Permission denied (publickey)"

SSH key not available to the worker.

```bash
# Ensure SSH agent is running
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# Verify
ssh -T git@github.com
```

### "Authentication failed" for GitHub

GitHub token not set or expired.

```bash
# Option 1: Use GitHub CLI
gh auth login

# Option 2: Set token directly
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

### Credential prompts hanging

Git is waiting for interactive input. Disable prompts:

```yaml
toolsets:
  git:
    credentials:
      env:
        GIT_TERMINAL_PROMPT: "0"
```

### Wrong commit author

Commits showing wrong name/email. Override in config:

```yaml
toolsets:
  git:
    credentials:
      env:
        GIT_AUTHOR_NAME: "Correct Name"
        GIT_AUTHOR_EMAIL: "correct@example.com"
```

## Security Notes

1. **Manual push control**: The `git_push` tool is manual-only—the LLM cannot invoke it. You control when content enters your trusted repository.

2. **Credential inheritance**: In the default `inherit` mode, workers have the same git access as your user account. This is intentional for ease of use.

3. **Future isolation**: For untrusted content processing, use `mode: explicit` with scoped tokens to prevent credential leakage.

## See Also

- [Sandbox Design: Git Credential Inheritance](sandbox-design.md#git-credential-inheritance)
- [Git Toolset Reference](git-toolset.md)
