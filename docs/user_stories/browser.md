# Browser Extension User Stories

Stories specific to the browser extension deployment.

## Related Documents

- **[Common Stories](./common.md)** - Shared stories for all deployments
- **[CLI Stories](./cli.md)** - CLI workflows
- **[Browser Extension Architecture](../browser-extension-architecture.md)** - Technical architecture

---

## Overview

The browser extension is the end-user deployment target, providing:

- OPFS-based sandbox storage
- GitHub sync via Octokit
- Popup-based approval UI
- Web content analysis (pages, PDFs, selections)
- Offline support with sync queue

---

## Epic B1: Web Content Analysis

### Story B1.1: Analyze PDF from Web
**As** Alex
**I want to** analyze a PDF I found via web search
**So that** I can extract key insights without reading the whole document

**Acceptance Criteria:**
- [ ] Can trigger analysis from context menu on PDF link
- [ ] PDF is downloaded and cached in OPFS
- [ ] Analysis is saved to workspace
- [ ] Can view the analysis in the extension popup
- [ ] Analysis can be staged for commit to GitHub

**Security Notes:**
- PDF content treated as untrusted
- Analysis session cannot read existing repo content
- Prompt injection in PDF cannot exfiltrate data

---

### Story B1.2: Batch Analyze Multiple Documents
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

### Story B1.3: Analyze Current Page
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
- Content script isolation enforced

---

### Story B1.4: Analyze Selected Text
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

### Story B1.5: Fetch and Analyze URL
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

## Epic B2: Browser Approval UI

### Story B2.1: Popup Approval Flow
**As** Sam
**I want to** approve tool calls in the extension popup
**So that** I maintain control over what the LLM does

**Acceptance Criteria:**
- [ ] Popup shows pending approval requests
- [ ] Clear display of tool name and arguments
- [ ] Approve/Deny/Remember buttons
- [ ] Can view details before deciding
- [ ] Notification badge for pending approvals

**Security Notes:**
- Popup cannot be spoofed by web content
- Approval state not accessible to content scripts
- All decisions logged

---

### Story B2.2: Trust Level Indicator
**As** Jordan
**I want to** see the current trust level clearly
**So that** I understand the security context

**Acceptance Criteria:**
- [ ] Visual indicator in popup header
- [ ] Color-coded (red=untrusted, yellow=session, green=workspace)
- [ ] Tooltip explains what each level means
- [ ] Shows origin URL for untrusted sessions

---

### Story B2.3: Promote Trust Level
**As** Sam
**I want to** promote a session to higher trust level
**So that** I can enable additional capabilities when safe

**Acceptance Criteria:**
- [ ] Can view current permissions for session
- [ ] Can request trust level promotion
- [ ] Must confirm promotion action
- [ ] Promotion is logged in audit trail
- [ ] Can demote back if needed

**Security Notes:**
- Promotion requires explicit user action
- Cannot promote to 'full' from untrusted origin
- Time-limited promotions available

---

## Epic B3: GitHub Sync

### Story B3.1: Connect GitHub Repository
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
- Token encrypted at rest in extension storage
- Can disconnect and revoke token

---

### Story B3.2: Push to GitHub from Browser
**As** Alex
**I want to** push staged changes to GitHub
**So that** my analysis results are saved

**Acceptance Criteria:**
- [ ] Push button in staged commits panel
- [ ] Shows diff before push
- [ ] Progress indicator during push
- [ ] Success shows commit URL
- [ ] Failure shows error and retry option

---

### Story B3.3: Continue Work in VS Code
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

### Story B3.4: Resolve Sync Conflicts
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

## Epic B4: Offline Support

### Story B4.1: Work Offline
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

### Story B4.2: Sync Queue Management
**As** Alex
**I want to** see and manage queued changes
**So that** I know what will sync when online

**Acceptance Criteria:**
- [ ] Queue panel shows pending pushes
- [ ] Can reorder queue
- [ ] Can remove items from queue
- [ ] Can force sync attempt

---

## Epic B5: Workspace Management

### Story B5.1: Multiple Workspaces
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

### Story B5.2: Workspace Storage Management
**As** Jordan
**I want to** manage storage used by workspaces
**So that** I don't run out of browser storage

**Acceptance Criteria:**
- [ ] Shows storage used per workspace
- [ ] Shows total OPFS usage
- [ ] Can clear cache without losing workspace
- [ ] Warning when storage is low

---

## Epic B6: Data Management

### Story B6.1: Data Export
**As** Jordan
**I want to** export all my data
**So that** I have a backup

**Acceptance Criteria:**
- [ ] Export all workspace data to zip
- [ ] Export includes all settings
- [ ] Can select specific workspaces
- [ ] Progress shown during export

**Security Notes:**
- Export encrypted with user password
- Includes audit log

---

### Story B6.2: Data Deletion
**As** Jordan
**I want to** delete all extension data
**So that** I can start fresh or remove the extension cleanly

**Acceptance Criteria:**
- [ ] Delete all extension data option
- [ ] Confirmation required
- [ ] Revoke GitHub tokens
- [ ] Clear OPFS completely

**Security Notes:**
- Deletion is complete and unrecoverable
- Logged before deletion completes

---

### Story B6.3: Session Recovery After Crash
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

## Epic B7: Configure Trusted Origins

### Story B7.1: Trusted Origins List
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

## Validation Checklist

### Browser-Specific Validation
- [ ] PDF analysis from context menu works
- [ ] Page analysis extracts content correctly
- [ ] Popup approval flow is intuitive
- [ ] GitHub OAuth flow completes successfully
- [ ] Push to GitHub shows correct diff
- [ ] Offline mode queues changes correctly
- [ ] OPFS storage persists across sessions

### Integration Validation
- [ ] Content script cannot access extension storage
- [ ] Untrusted content cannot trigger privileged actions
- [ ] Multiple workspaces are fully isolated
- [ ] Export/import preserves all data
