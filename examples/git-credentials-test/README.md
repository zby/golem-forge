# Git Credentials Test

Test workers for verifying git credential inheritance and scoped credential configurations.

## Quick Start: Local Test (No Network)

The safest way to test - uses a local bare repo as the "remote":

```bash
# 1. Set up local test repos
./examples/git-credentials-test/setup-local.sh

# 2. Run the test
npx tsx examples/git-credentials-test/run-local-test.ts
```

This creates:
- `/tmp/golem-git-test/remote.git` - bare repo acting as remote
- `/tmp/golem-git-test/workspace` - working repo with SSH-style remote

## Test Scenarios

### 1. Local Bare Repo (Recommended First)

Tests the full git workflow without any network access:

```bash
./examples/git-credentials-test/setup-local.sh
npx tsx examples/git-credentials-test/run-local-test.ts
```

**What it tests:**
- Sandbox file writing
- Git staging with approval
- Git push to local remote
- Credential inheritance (uses your git config for author)

### 2. GitHub with Scoped Token

Tests GitHub API integration with credentials scoped to one repo:

1. Create a test repo on GitHub (e.g., `your-user/golem-test`)

2. Create a fine-grained PAT at https://github.com/settings/tokens?type=beta
   - Repository access: "Only select repositories" → select your test repo
   - Permissions: Contents (Read and write)

3. Set the token and run:
   ```bash
   export GOLEM_TEST_GITHUB_TOKEN="github_pat_xxxx"
   export GOLEM_TEST_GITHUB_REPO="your-user/golem-test"
   npx tsx examples/git-credentials-test/run-github-test.ts
   ```

**What it tests:**
- `mode: explicit` prevents credential leakage
- Scoped token only works for the specified repo
- GitHub API push via Octokit

### 3. SSH Deploy Key

Tests SSH authentication with a key scoped to one repo:

1. Generate a test-only key:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/golem_test_key -N "" -C "golem-test"
   ```

2. Add as deploy key to your test repo (Settings → Deploy keys → Add, enable write access)

3. Clone the repo and run:
   ```bash
   git clone git@github.com:your-user/golem-test.git /tmp/golem-ssh-test
   export GOLEM_TEST_SSH_KEY="$HOME/.ssh/golem_test_key"
   export GOLEM_TEST_SSH_REPO="/tmp/golem-ssh-test"
   npx tsx examples/git-credentials-test/run-ssh-test.ts
   ```

**What it tests:**
- `GIT_SSH_COMMAND` override
- `mode: explicit` with SSH
- Deploy key can only access one repo

## Worker Files

| Worker | Credential Mode | Use Case |
|--------|-----------------|----------|
| `local-test.worker` | `inherit` | Local bare repo, uses host git config |
| `github-test.worker` | `explicit` | GitHub API with scoped token |
| `ssh-test.worker` | `explicit` | SSH with deploy key |

## Security Notes

- **`mode: inherit`** (default): Worker has same git access as your user
- **`mode: explicit`**: Worker only has credentials you explicitly provide
- **Scoped tokens/keys**: Limit blast radius if something goes wrong

For production use with untrusted content, always use `mode: explicit` with scoped credentials.
