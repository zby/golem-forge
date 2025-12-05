# User Stories for Browser Extension

This document contains user stories for validating the browser extension design. Stories are organized by persona and include security considerations.

## Related Documents

- **[Sandbox Design](./sandbox-design.md)** - Unified sandbox implementation (references stories below)
- **[Browser Extension Architecture](./browser-extension-architecture.md)** - Browser-specific architecture

## How to Use This Document

1. **During Design**: Each design decision should trace back to one or more stories
2. **During Implementation**: Use acceptance criteria as test cases
3. **During Review**: Verify security notes are addressed in implementation
4. **For Validation**: Run through validation checklist at bottom

---

## Personas

### Alex - Knowledge Worker
- Uses the extension for research and document analysis
- Comfortable with basic git but not a developer
- Values convenience but wants to understand what's happening
- Primary concern: losing work, accidentally publishing something

### Sam - Security-Conscious Developer
- Uses the extension integrated with development workflow
- Understands prompt injection risks
- Wants fine-grained control over permissions
- Primary concern: data exfiltration, credential exposure

### Jordan - Casual User
- Uses the extension occasionally for simple tasks
- Doesn't want to think about security details
- Expects sensible defaults
- Primary concern: things "just working"

---

## Epic 1: Basic Document Analysis Workflow

### Story 1.1: Analyze PDF from Web Search
**As** Alex
**I want to** analyze a PDF I found via web search
**So that** I can extract key insights without reading the whole document

**Acceptance Criteria:**
- [ ] Can trigger analysis from context menu on PDF link
- [ ] PDF is downloaded and cached in OPFS
- [ ] Analysis is saved to my working directory
- [ ] I can view the analysis in the extension popup
- [ ] Analysis can be staged for commit to GitHub

**Security Notes:**
- PDF content treated as untrusted
- Analysis session cannot read existing repo content
- Prompt injection in PDF cannot exfiltrate data

---

### Story 1.2: Batch Analyze Multiple Documents
**As** Alex
**I want to** analyze multiple PDFs from a search results page
**So that** I can quickly process a collection of documents

**Acceptance Criteria:**
- [ ] Can select multiple PDF links on a page
- [ ] Each PDF gets its own analysis file
- [ ] Progress shown for batch operation
- [ ] Can cancel batch mid-way
- [ ] All results staged as single commit

**Security Notes:**
- Each analysis runs in isolated session
- One compromised PDF cannot affect others
- Batch approval shows all files before commit

---

### Story 1.3: Continue Analysis in VS Code
**As** Alex
**I want to** continue editing my analysis in VS Code
**So that** I can use familiar tools for detailed work

**Acceptance Criteria:**
- [ ] Staged files can be pushed to GitHub
- [ ] Local `git pull` retrieves the files
- [ ] Files open normally in VS Code
- [ ] Local edits can be pushed back
- [ ] Extension can pull updated files

**Security Notes:**
- Push requires explicit user action
- Commit message shows source (browser extension)
- Git history provides audit trail

---

## Epic 2: Security and Trust Management

### Story 2.1: Untrusted Content Warning
**As** Jordan
**I want to** see a clear warning when processing untrusted content
**So that** I understand the security implications

**Acceptance Criteria:**
- [ ] Visual indicator shows trust level of current session
- [ ] Tooltip explains what "untrusted" means
- [ ] Warning appears before first tool execution
- [ ] Can dismiss warning but it's logged

**Security Notes:**
- Cannot disable warning entirely
- Warning includes origin URL
- Audit log records dismissal

---

### Story 2.2: Promote Trust Level
**As** Sam
**I want to** promote a session to higher trust level
**So that** I can enable additional capabilities when safe

**Acceptance Criteria:**
- [ ] Can view current permissions for session
- [ ] Can request trust level promotion
- [ ] Must re-authenticate (confirm identity)
- [ ] Promotion is logged in audit trail
- [ ] Can demote back if needed

**Security Notes:**
- Promotion requires explicit user action
- Cannot promote to 'full' from untrusted origin
- Time-limited promotions available

---

### Story 2.3: Block Suspicious Operations
**As** Sam
**I want to** be alerted when LLM attempts suspicious operations
**So that** I can catch prompt injection attempts

**Acceptance Criteria:**
- [ ] Alert shown for attempts to read outside working directory
- [ ] Alert shown for unusual file access patterns
- [ ] Can view what operation was blocked
- [ ] Can report false positive
- [ ] Session can be terminated immediately

**Security Notes:**
- Blocked operations logged with full context
- Pattern detection for common injection attempts
- Rate limiting on file operations

---

### Story 2.4: Review Staged Changes Before Push
**As** Alex
**I want to** review all staged changes before pushing
**So that** I don't accidentally commit something wrong

**Acceptance Criteria:**
- [ ] Staged commits panel shows all pending changes
- [ ] Can view diff for each file
- [ ] Can edit files before commit
- [ ] Can remove individual files from commit
- [ ] Can add commit message notes

**Security Notes:**
- Diff view highlights any suspicious content
- Warns if committing to unexpected branch
- Shows which session created each file

---

### Story 2.5: Configure Trusted Origins
**As** Sam
**I want to** pre-approve certain origins for higher trust
**So that** I don't need to approve every action from known-safe sites

**Acceptance Criteria:**
- [ ] Can add origins to trusted list
- [ ] Can specify trust level per origin
- [ ] Can set expiration for trust
- [ ] Can revoke trust at any time
- [ ] Changes logged in audit trail

**Security Notes:**
- Cannot trust all origins (no wildcard)
- Trusted origins still cannot access credentials
- Regular review reminders for trusted list

---

## Epic 3: Workspace and Repository Management

### Story 3.1: Connect GitHub Repository
**As** Alex
**I want to** connect my GitHub repository to the extension
**So that** my work is automatically synced

**Acceptance Criteria:**
- [ ] OAuth flow for GitHub authentication
- [ ] Can select repository to connect
- [ ] Can choose default branch
- [ ] Token stored securely (encrypted)
- [ ] Connection status shown in UI

**Security Notes:**
- Minimal GitHub scopes requested
- Token encrypted at rest
- Can disconnect and revoke token

---

### Story 3.2: Work Offline
**As** Jordan
**I want to** continue working when offline
**So that** network issues don't stop my work

**Acceptance Criteria:**
- [ ] OPFS operations work without network
- [ ] Changes queue for later sync
- [ ] Clear indication of offline status
- [ ] Automatic sync when back online
- [ ] Conflict resolution if needed

**Security Notes:**
- Offline queue encrypted
- Cannot promote trust while offline
- Audit log continues locally

---

### Story 3.3: Resolve Sync Conflicts
**As** Alex
**I want to** resolve conflicts when my changes clash with remote
**So that** I don't lose work from either source

**Acceptance Criteria:**
- [ ] Conflict detected before push fails
- [ ] Both versions shown side-by-side
- [ ] Can choose local, remote, or merge
- [ ] Resolution creates new commit
- [ ] Original versions preserved

**Security Notes:**
- Conflict content treated as untrusted
- Cannot auto-resolve with untrusted content
- Resolution logged in audit trail

---

### Story 3.4: Multiple Workspaces
**As** Sam
**I want to** maintain separate workspaces for different projects
**So that** work stays organized and isolated

**Acceptance Criteria:**
- [ ] Can create multiple workspaces
- [ ] Each workspace has own repo connection
- [ ] Can switch between workspaces
- [ ] Sessions isolated between workspaces
- [ ] Can delete workspace and all data

**Security Notes:**
- Workspaces cannot access each other's data
- Credentials isolated per workspace
- Deleting workspace clears all local data

---

## Epic 4: Worker and Tool Execution

### Story 4.1: Run Analysis Worker
**As** Alex
**I want to** run a pre-defined analysis worker on a document
**So that** I get consistent, structured output

**Acceptance Criteria:**
- [ ] Can select worker from available list
- [ ] Worker receives document as attachment
- [ ] Progress shown during execution
- [ ] Output saved to working directory
- [ ] Errors shown clearly

**Security Notes:**
- Worker cannot exceed session permissions
- Tool calls require approval based on trust level
- Worker definition from trusted source only

---

### Story 4.2: Tool Approval Flow
**As** Sam
**I want to** approve or deny each tool call
**So that** I maintain control over what the LLM does

**Acceptance Criteria:**
- [ ] Each tool call shows approval popup
- [ ] Popup shows tool name and arguments
- [ ] Can approve, deny, or approve for session
- [ ] Denied tools return error to LLM
- [ ] Can configure auto-approve rules

**Security Notes:**
- Sensitive tools always require approval
- Auto-approve rules cannot bypass security checks
- All approvals logged

---

### Story 4.3: View Execution History
**As** Alex
**I want to** see history of worker executions
**So that** I can review what was done and rerun if needed

**Acceptance Criteria:**
- [ ] List of past sessions with timestamps
- [ ] Can view input, output, and tool calls for each
- [ ] Can rerun a session with same input
- [ ] Can delete session history
- [ ] Export history to file

**Security Notes:**
- History may contain sensitive data
- Export requires confirmation
- Auto-cleanup of old sessions configurable

---

## Epic 5: Content Integration

### Story 5.1: Analyze Current Page
**As** Jordan
**I want to** analyze the current web page
**So that** I can get insights without copy-pasting

**Acceptance Criteria:**
- [ ] Browser action button triggers analysis
- [ ] Page content extracted cleanly
- [ ] Images and PDFs handled appropriately
- [ ] Analysis appears in popup or side panel
- [ ] Can save analysis to workspace

**Security Notes:**
- Page content treated as untrusted
- Cannot analyze extension pages or browser internals
- Content script isolation

---

### Story 5.2: Analyze Selected Text
**As** Alex
**I want to** analyze just the selected text on a page
**So that** I can focus on specific sections

**Acceptance Criteria:**
- [ ] Context menu option for selected text
- [ ] Selection preserved with some context
- [ ] Can choose analysis type
- [ ] Quick results in popup
- [ ] Full analysis saved to workspace

**Security Notes:**
- Selected text treated as untrusted
- Context limited to prevent data leakage
- Origin tracked for audit

---

### Story 5.3: Fetch and Analyze URL
**As** Alex
**I want to** provide a URL for the extension to fetch and analyze
**So that** I can process pages I haven't visited

**Acceptance Criteria:**
- [ ] Input field for URL in popup
- [ ] URL validated before fetch
- [ ] Content cached in OPFS
- [ ] Same analysis flow as visited pages
- [ ] Can queue multiple URLs

**Security Notes:**
- Fetch respects robots.txt (optional setting)
- Downloaded content treated as untrusted
- CORS handled appropriately

---

## Epic 6: Audit and Compliance

### Story 6.1: View Audit Log
**As** Sam
**I want to** review all actions taken by the extension
**So that** I can verify nothing suspicious happened

**Acceptance Criteria:**
- [ ] Chronological list of all actions
- [ ] Filterable by session, type, trust level
- [ ] Shows user approvals and denials
- [ ] Shows blocked operations
- [ ] Exportable to file

**Security Notes:**
- Audit log tamper-resistant
- Cannot delete individual entries
- Log rotation preserves minimum history

---

### Story 6.2: Security Report
**As** Sam
**I want to** generate a security report for a time period
**So that** I can review overall security posture

**Acceptance Criteria:**
- [ ] Summary of sessions by trust level
- [ ] Count of blocked operations
- [ ] List of trusted origins used
- [ ] GitHub push history
- [ ] Recommendations for improvement

**Security Notes:**
- Report generation logged
- No sensitive content in report
- Can schedule periodic reports

---

### Story 6.3: Data Export and Deletion
**As** Jordan
**I want to** export my data and delete everything
**So that** I maintain control over my information

**Acceptance Criteria:**
- [ ] Export all workspace data to zip
- [ ] Export includes all settings
- [ ] Delete all extension data
- [ ] Confirmation required for delete
- [ ] Revoke GitHub token on delete

**Security Notes:**
- Export encrypted with user password
- Deletion is complete (OPFS, settings, cache)
- Cannot recover after deletion

---

## Epic 7: Error Handling and Recovery

### Story 7.1: Recover from Failed Push
**As** Alex
**I want to** recover when a GitHub push fails
**So that** I don't lose my staged changes

**Acceptance Criteria:**
- [ ] Clear error message explaining failure
- [ ] Staged files preserved in OPFS
- [ ] Can retry push after fixing issue
- [ ] Can save staged files locally
- [ ] Can discard if no longer needed

**Security Notes:**
- Failed push logged with reason
- Credentials not exposed in error
- Retry requires re-authentication if token expired

---

### Story 7.2: Handle LLM Errors
**As** Jordan
**I want to** understand when the LLM fails
**So that** I can retry or try a different approach

**Acceptance Criteria:**
- [ ] Clear error message for common failures
- [ ] Distinguish rate limits from other errors
- [ ] Can retry with same input
- [ ] Partial results preserved if available
- [ ] Can switch to different model

**Security Notes:**
- Error messages don't leak prompt content
- Rate limit handling prevents accidental overspend
- Model switching respects trust level

---

### Story 7.3: Session Recovery After Crash
**As** Alex
**I want to** recover my work if the browser crashes
**So that** I don't lose progress on long tasks

**Acceptance Criteria:**
- [ ] OPFS persists across crashes
- [ ] Can resume incomplete session
- [ ] Staged changes preserved
- [ ] Clear indication of recovery state
- [ ] Can discard corrupted session

**Security Notes:**
- Recovery state validated before use
- Cannot resume with elevated privileges
- Corruption logged and reported

---

## Validation Checklist

### Security Validation
- [ ] Prompt injection cannot read existing repo content (untrusted level)
- [ ] Prompt injection cannot access credentials at any level
- [ ] Prompt injection cannot push to GitHub without user approval
- [ ] Session isolation prevents cross-session data access
- [ ] Audit log captures all security-relevant events
- [ ] Trust promotion requires explicit user action
- [ ] Blocked operations are logged and visible

### Functional Validation
- [ ] Basic PDF analysis workflow completes end-to-end
- [ ] GitHub sync works in both directions
- [ ] Offline mode allows continued work
- [ ] Multiple workspaces remain isolated
- [ ] Worker execution respects permissions
- [ ] Error recovery preserves user data

### Usability Validation
- [ ] Trust level is always visible and understandable
- [ ] Approval popups provide enough context for decision
- [ ] Staged changes can be reviewed before push
- [ ] Error messages are actionable
- [ ] Security features don't impede legitimate workflows
