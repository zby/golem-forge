# CLI User Stories

Stories specific to the command-line interface deployment.

## Related Documents

- **[Common Stories](./common.md)** - Shared stories for all deployments
- **[Browser Stories](./browser.md)** - Browser extension workflows
- **[Git Integration Design](../notes/git-integration-design.md)** - Git as security boundary

---

## Overview

The CLI is the primary development environment for Golem Forge. It provides:

- Terminal-based worker execution
- Interactive approval prompts
- Git integration for local and remote repos
- Rich diff review in terminal

---

## Epic CLI1: Terminal Workflow

### Story CLI1.1: Run Worker from Command Line
**As** Sam
**I want to** run a worker from the command line
**So that** I can integrate it into my development workflow

**Acceptance Criteria:**
- [ ] `golem run <worker> [input]` executes worker
- [ ] Files auto-detected as attachments based on extension (.pdf, .png, etc.)
- [ ] Text input passed as prompt content
- [ ] Output displayed in terminal
- [ ] Exit code indicates success/failure
- [ ] Can specify model with `--model` flag

**Example:**
```bash
# File argument auto-detected as attachment
golem run analyzer report.pdf

# Text input
golem run greeter "Hello world"

# Stdin
golem run summarizer < document.md
echo "Hello" | golem run greeter

# Multiple files with text
golem run analyzer report.pdf chart.png "Summarize these"

# Explicit attachment (also supported)
golem run analyzer --attach report.pdf "Analyze this"
```

---

### Story CLI1.2: Interactive Approval in Terminal
**As** Sam
**I want to** approve tool calls interactively
**So that** I maintain control during execution

**Acceptance Criteria:**
- [ ] Approval prompt shows tool name and args
- [ ] Can type `y` (yes), `n` (no), `r` (remember)
- [ ] Prompt shows security context
- [ ] Can quit session with `q`
- [ ] Timeout configurable

**Example:**
```
┌─ Tool Approval ─────────────────────────────────┐
│ write_file                                      │
│   path: /workspace/report.md                    │
│   content: "# Analysis Report..."  (1.2 KB)     │
│                                                 │
│ [y]es  [n]o  [r]emember  [q]uit                │
└─────────────────────────────────────────────────┘
```

---

### Story CLI1.3: Non-Interactive Mode
**As** Sam
**I want to** run workers non-interactively
**So that** I can use them in scripts and automation

**Acceptance Criteria:**
- [ ] `--approve-all` auto-approves everything
- [ ] `--approve-reads` auto-approves read operations
- [ ] `--deny-all` auto-denies (useful for dry-run)
- [ ] Non-interactive mode logged
- [ ] Warning shown for dangerous modes

**Example:**
```bash
# Automated pipeline (trusted input)
golem run processor --approve-all < input.json

# Dry run to see what would happen
golem run analyzer --deny-all report.pdf
```

---

### Story CLI1.4: Program Configuration
**As** Sam
**I want to** configure Golem Forge per program
**So that** settings are consistent and version-controlled

**Acceptance Criteria:**
- [ ] `.golem/config.yaml` for program settings
- [ ] Default worker search paths
- [ ] Default approval mode
- [ ] Git target configuration
- [ ] Environment variable overrides

**Example:**
```yaml
# .golem/config.yaml
workers:
  search_paths:
    - ./workers
    - ~/.golem/workers
approval:
  mode: interactive
  auto_approve:
    - read_file
git:
  default_target:
    type: local
    path: .
```

---

## Epic CLI2: Local Git Integration

### Story CLI2.1: Push to Local Git Repo
**As** Sam
**I want to** push worker output to my local git repo
**So that** changes are tracked in version control

**Acceptance Criteria:**
- [ ] `git_push` with local target creates commit
- [ ] Files copied from sandbox to working tree
- [ ] Commit message from staged commit
- [ ] Can specify branch
- [ ] Works with current directory (`.`)

**Example:**
```
Worker calls:
  git_stage({ files: ["/workspace/report.md"], message: "Add report" })
  git_push({ target: { type: "local", path: "." } })

Result:
  [abc1234] Add report
   1 file changed, 45 insertions(+)
   create mode 100644 report.md
```

---

### Story CLI2.2: Push to Different Local Repo
**As** Sam
**I want to** push to a different local repository
**So that** output goes to a separate program

**Acceptance Criteria:**
- [ ] Can specify absolute or relative path
- [ ] Target repo must exist
- [ ] Branch created if doesn't exist
- [ ] Push approval shows target path

**Example:**
```typescript
git_push({
  target: {
    type: "local",
    path: "/home/user/reports-repo",
    branch: "automated"
  }
})
```

---

### Story CLI2.3: Terminal Diff Review
**As** Alex
**I want to** review diffs in the terminal before pushing
**So that** I can verify changes are correct

**Acceptance Criteria:**
- [ ] `git_diff` output is syntax-highlighted
- [ ] Shows unified diff format
- [ ] Paging for long diffs
- [ ] Push approval includes diff option

**Example:**
```
┌─ git_push Approval ────────────────────────────────┐
│ Target: local:. (branch: main)                     │
│ Commit: "Add quarterly report"                     │
│                                                    │
│ Files:                                             │
│   + report.md (1.2 KB)                             │
│   M analysis.json (0.8 KB)                         │
│                                                    │
│ [d]iff  [y]es  [n]o  [?]help                       │
└────────────────────────────────────────────────────┘

> d

--- /dev/null
+++ report.md
@@ -0,0 +1,45 @@
+# Q4 2024 Report
+
+## Summary
+Revenue increased by 15%...
```

---

### Story CLI2.4: Pull from Local Git
**As** Sam
**I want to** pull files from a local repo into sandbox
**So that** workers can process existing codebase files

**Acceptance Criteria:**
- [ ] `git_pull` copies files to sandbox workspace
- [ ] Can specify paths or globs
- [ ] Preserves directory structure
- [ ] Read-only copy (originals unchanged)

**Example:**
```typescript
git_pull({
  source: { type: "local", path: "." },
  paths: ["src/config.ts", "docs/*.md"]
})
// Files available at /workspace/src/config.ts, /workspace/docs/*.md
```

---

## Epic CLI3: Remote Git Integration

### Story CLI3.1: Push to GitHub
**As** Alex
**I want to** push worker output to GitHub
**So that** results are backed up and shareable

**Acceptance Criteria:**
- [ ] GitHub authentication via `gh` CLI or token
- [ ] Supports any GitHub repo user has access to
- [ ] Branch created if doesn't exist
- [ ] Returns commit URL

**Example:**
```typescript
git_push({
  target: {
    type: "github",
    repo: "user/reports",
    branch: "main"
  }
})
// Returns: { commitSha: "abc123", url: "https://github.com/..." }
```

---

### Story CLI3.2: Pull from GitHub
**As** Alex
**I want to** pull files from GitHub into sandbox
**So that** I can work with remote content

**Acceptance Criteria:**
- [ ] Can pull specific paths from repo
- [ ] Supports branches and tags
- [ ] Large files handled appropriately
- [ ] Rate limiting respected

---

### Story CLI3.3: GitHub Authentication
**As** Sam
**I want to** authenticate with GitHub securely
**So that** my credentials are protected

**Acceptance Criteria:**
- [ ] Use `gh` CLI auth if available
- [ ] Fall back to `GITHUB_TOKEN` env var
- [ ] Prompt for token if neither available
- [ ] Token not logged or displayed

**Security Notes:**
- Never log or display token
- Use minimal scopes
- Token stored in memory only

---

## Epic CLI4: Sandbox Modes

### Story CLI4.1: Filesystem Sandbox (Default)
**As** Sam
**I want to** use a filesystem-backed sandbox
**So that** I can inspect files during debugging

**Acceptance Criteria:**
- [ ] Sandbox at `.sandbox/` by default
- [ ] Can specify custom location
- [ ] Files visible in filesystem
- [ ] Cleaned up on session end (optional)

**Example:**
```bash
golem run analyzer report.pdf
# Files in .sandbox/workspace/

golem run analyzer --sandbox=/tmp/golem report.pdf
# Files in /tmp/golem/workspace/
```

---

### Story CLI4.2: In-Memory Sandbox
**As** Sam
**I want to** use an in-memory sandbox
**So that** workers cannot access real filesystem

**Acceptance Criteria:**
- [ ] `--sandbox=memory` uses in-memory backend
- [ ] No files written to disk during execution
- [ ] Git push materializes files temporarily
- [ ] Temp files cleaned up immediately after push

**Example:**
```bash
# Maximum isolation - nothing on disk
golem run analyzer --sandbox=memory report.pdf
```

**Security Notes:**
- Recommended for untrusted input
- Git push is only way to persist
- Temp files in secure temp directory

---

### Story CLI4.3: Direct Mode (Dangerous)
**As** Sam
**I want to** give workers direct filesystem access
**So that** I can work with existing codebase structure

**Acceptance Criteria:**
- [ ] `--sandbox=direct:./path` maps to real directory
- [ ] Requires explicit opt-in
- [ ] Warning displayed about security risk
- [ ] Should only use with trusted workers

**Example:**
```bash
# DANGEROUS: Workers can modify real files
golem run formatter --sandbox=direct:./src --approve-all
```

**Security Notes:**
- Only for trusted workers with trusted input
- No protection against prompt injection
- Logged as high-risk operation

---

## Epic CLI5: Development Workflow

### Story CLI5.1: Worker Development
**As** Sam
**I want to** develop and test workers locally
**So that** I can iterate quickly

**Acceptance Criteria:**
- [ ] Workers loaded from local files
- [ ] Changes picked up on next run
- [ ] Validation errors shown clearly
- [ ] Can test with mock input

**Example:**
```bash
# Edit workers/analyzer.worker
golem run ./workers/analyzer.worker test-input.pdf
# Make changes, run again
```

---

### Story CLI5.2: Debug Mode
**As** Sam
**I want to** see detailed execution logs
**So that** I can debug worker issues

**Acceptance Criteria:**
- [ ] `--debug` shows LLM prompts/responses
- [ ] Shows tool call details
- [ ] Shows timing information
- [ ] Can save debug log to file

**Example:**
```bash
golem run analyzer --debug report.pdf 2> debug.log
```

---

### Story CLI5.3: Dry Run
**As** Sam
**I want to** see what a worker would do without executing
**So that** I can validate before running

**Acceptance Criteria:**
- [ ] `--dry-run` parses worker and shows tools
- [ ] Shows what approvals would be needed
- [ ] Validates worker configuration
- [ ] Does not call LLM

**Example:**
```bash
golem run analyzer --dry-run
# Worker: analyzer
# Tools: read_file, write_file, git_stage, git_push
# Approvals needed: write_file, git_push
```

---

## Validation Checklist

### CLI-Specific Validation
- [ ] Interactive approval works in terminal
- [ ] Non-interactive modes work in scripts
- [ ] Local git push creates valid commits
- [ ] GitHub push works with `gh` auth
- [ ] Diff review shows correct changes
- [ ] In-memory sandbox prevents filesystem access
- [ ] Program configuration loads correctly

### Integration Validation
- [ ] Can run worker, stage, review diff, push - full flow
- [ ] Works in CI/CD pipeline with `--approve-all`
- [ ] Error messages are helpful
- [ ] Exit codes are correct
