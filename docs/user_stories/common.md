# Common User Stories

Stories that apply to both CLI and Browser Extension deployments.

## Related Documents

- **[CLI Stories](./cli.md)** - CLI-specific workflows
- **[Browser Stories](./browser.md)** - Browser extension workflows
- **[Sandbox Design](../sandbox-design.md)** - Sandbox implementation
- **[Git Integration Design](../notes/git-integration-design.md)** - Git as security boundary

---

## Personas

### Alex - Knowledge Worker
- Uses Golem Forge for research and document analysis
- Comfortable with basic git but not a developer
- Values convenience but wants to understand what's happening
- Primary concern: losing work, accidentally publishing something

### Sam - Security-Conscious Developer
- Uses Golem Forge integrated with development workflow
- Understands prompt injection risks
- Wants fine-grained control over permissions
- Primary concern: data exfiltration, credential exposure

### Jordan - Casual User
- Uses Golem Forge occasionally for simple tasks
- Doesn't want to think about security details
- Expects sensible defaults
- Primary concern: things "just working"

---

## Epic C1: Security and Trust

### Story C1.1: Untrusted Content Warning
**As** Jordan
**I want to** see a clear warning when processing untrusted content
**So that** I understand the security implications

**Acceptance Criteria:**
- [ ] Visual indicator shows trust level of current session
- [ ] Explanation of what "untrusted" means available
- [ ] Warning appears before first tool execution
- [ ] Can dismiss warning but it's logged

**Security Notes:**
- Cannot disable warning entirely
- Warning includes content origin
- Audit log records dismissal

---

### Story C1.2: Block Suspicious Operations
**As** Sam
**I want to** be alerted when LLM attempts suspicious operations
**So that** I can catch prompt injection attempts

**Acceptance Criteria:**
- [ ] Alert shown for attempts to access outside sandbox
- [ ] Alert shown for unusual file access patterns
- [ ] Can view what operation was blocked
- [ ] Session can be terminated immediately

**Security Notes:**
- Blocked operations logged with full context
- Pattern detection for common injection attempts
- Rate limiting on file operations

---

### Story C1.3: Sandbox Isolation
**As** Sam
**I want to** know that worker file operations are isolated
**So that** prompt injection cannot access my system

**Acceptance Criteria:**
- [ ] Workers can only read/write within sandbox zones
- [ ] Path traversal attacks are blocked
- [ ] Sandbox contents are ephemeral by default
- [ ] Only git operations can persist data outside sandbox

**Security Notes:**
- Sandbox enforces zone boundaries
- All file operations logged
- Git push is the controlled escape hatch

---

## Epic C2: Tool Approval

### Story C2.1: Tool Approval Flow
**As** Sam
**I want to** approve or deny each tool call
**So that** I maintain control over what the LLM does

**Acceptance Criteria:**
- [ ] Each tool call shows approval request
- [ ] Request shows tool name and arguments
- [ ] Can approve, deny, or approve for session
- [ ] Denied tools return error to LLM
- [ ] Can configure auto-approve rules

**Security Notes:**
- Sensitive tools always require approval
- Auto-approve rules cannot bypass security checks
- All approvals logged

---

### Story C2.2: Remember Approval Decisions
**As** Alex
**I want to** remember approval decisions for the session
**So that** I don't have to approve the same operation repeatedly

**Acceptance Criteria:**
- [ ] "Remember for session" option available
- [ ] Remembered decisions matched by tool + args
- [ ] Can view current remembered approvals
- [ ] Session end clears remembered approvals

**Security Notes:**
- Deep equality matching on arguments
- Cannot remember across sessions
- Remembered approvals logged

---

## Epic C3: Worker Execution

### Story C3.1: Run Worker
**As** Alex
**I want to** run a worker on my input
**So that** I get structured, consistent output

**Acceptance Criteria:**
- [ ] Can select worker to run
- [ ] Worker receives input (text or file)
- [ ] Progress shown during execution
- [ ] Output saved to sandbox
- [ ] Errors shown clearly

**Security Notes:**
- Worker cannot exceed session permissions
- Tool calls require approval based on configuration
- Worker definition from trusted source only

---

### Story C3.2: Worker Delegation
**As** Alex
**I want to** workers to call other workers
**So that** complex tasks can be composed from simpler workers

**Acceptance Criteria:**
- [ ] Parent worker can call child workers
- [ ] Delegation requires approval
- [ ] Child inherits parent's model (with validation)
- [ ] Delegation depth limited
- [ ] Circular delegation prevented

**Security Notes:**
- Approval propagates through delegation chain
- Delegation path visible in approval request
- Max depth configurable

---

### Story C3.3: View Execution History
**As** Alex
**I want to** see history of worker executions
**So that** I can review what was done

**Acceptance Criteria:**
- [ ] List of past sessions with timestamps
- [ ] Can view input, output, and tool calls
- [ ] Can see approval decisions made
- [ ] Can export session log

**Security Notes:**
- History may contain sensitive data
- Export requires confirmation
- Auto-cleanup configurable

---

## Epic C4: Git as Persistence Layer

### Story C4.1: Stage Changes for Commit
**As** Alex
**I want to** stage sandbox changes for git commit
**So that** I can review before persisting

**Acceptance Criteria:**
- [ ] `git_stage` prepares files for commit
- [ ] Commit message required
- [ ] Staged files tracked separately from sandbox
- [ ] Can stage multiple times (queued commits)
- [ ] Staging does not modify sandbox

**Security Notes:**
- Staging is a sandbox-only operation
- No approval required for staging
- Staged content hashed for verification

---

### Story C4.2: Review Staged Changes
**As** Alex
**I want to** review staged changes before pushing
**So that** I don't accidentally commit something wrong

**Acceptance Criteria:**
- [ ] `git_status` shows staged vs unstaged
- [ ] `git_diff` shows unified diff
- [ ] Can see all files in staged commit
- [ ] Can discard staged commit
- [ ] Diff highlights additions/deletions

**Security Notes:**
- Diff view in approval shows what's being pushed
- Warns if content looks suspicious
- Shows which session created files

---

### Story C4.3: Push to Git
**As** Alex
**I want to** push staged changes to a git repository
**So that** my work is persisted and versioned

**Acceptance Criteria:**
- [ ] `git_push` sends staged commit to target
- [ ] Supports local git repos
- [ ] Supports remote (GitHub)
- [ ] Push requires approval
- [ ] Success/failure clearly reported

**Security Notes:**
- Push is the security boundary crossing
- Approval shows full diff
- All pushes logged in audit trail

---

### Story C4.4: Pull from Git
**As** Alex
**I want to** pull files from git into sandbox
**So that** I can work with existing content

**Acceptance Criteria:**
- [ ] `git_pull` fetches files to sandbox
- [ ] Can specify paths to pull
- [ ] Files go to workspace zone
- [ ] Existing files can be overwritten (with warning)

**Security Notes:**
- Pulled content treated as part of sandbox
- Does not auto-execute pulled workers
- Pull logged in audit trail

---

## Epic C5: Audit and Compliance

### Story C5.1: View Audit Log
**As** Sam
**I want to** review all actions taken
**So that** I can verify nothing suspicious happened

**Acceptance Criteria:**
- [ ] Chronological list of all actions
- [ ] Filterable by session, type
- [ ] Shows user approvals and denials
- [ ] Shows blocked operations
- [ ] Exportable to file

**Security Notes:**
- Audit log tamper-resistant
- Cannot delete individual entries
- Log rotation preserves minimum history

---

### Story C5.2: Security Report
**As** Sam
**I want to** generate a security report
**So that** I can review overall security posture

**Acceptance Criteria:**
- [ ] Summary of sessions
- [ ] Count of blocked operations
- [ ] Git push history
- [ ] Approval/denial statistics

**Security Notes:**
- Report generation logged
- No sensitive content in report

---

## Epic C6: Error Handling

### Story C6.1: Handle LLM Errors
**As** Jordan
**I want to** understand when the LLM fails
**So that** I can retry or try a different approach

**Acceptance Criteria:**
- [ ] Clear error message for common failures
- [ ] Distinguish rate limits from other errors
- [ ] Can retry with same input
- [ ] Partial results preserved if available

**Security Notes:**
- Error messages don't leak prompt content
- Rate limit handling prevents overspend

---

### Story C6.2: Recover from Failed Push
**As** Alex
**I want to** recover when a git push fails
**So that** I don't lose my staged changes

**Acceptance Criteria:**
- [ ] Clear error message explaining failure
- [ ] Staged files preserved
- [ ] Can retry push after fixing issue
- [ ] Can discard if no longer needed

**Security Notes:**
- Failed push logged with reason
- Credentials not exposed in error
- Retry may require re-authentication

---

## Validation Checklist

### Security Validation
- [ ] Prompt injection cannot read outside sandbox
- [ ] Prompt injection cannot access credentials
- [ ] Prompt injection cannot push without user approval
- [ ] Session isolation prevents cross-session data access
- [ ] Audit log captures all security-relevant events
- [ ] Blocked operations are logged and visible

### Functional Validation
- [ ] Worker execution respects permissions
- [ ] Tool approval flow works correctly
- [ ] Git staging/push flow completes end-to-end
- [ ] Error recovery preserves user data

### Usability Validation
- [ ] Security level is always visible
- [ ] Approval requests provide enough context
- [ ] Staged changes can be reviewed before push
- [ ] Error messages are actionable
