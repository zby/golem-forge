# Browser Extension GitHub Integration

## Prerequisites
- [x] Phase 1 complete (OPFS sandbox, worker runtime, UI foundation)
- [x] AI SDK browser compatibility validated
- [x] `packages/chrome/` exists with working build
- [x] `IsomorphicGitBackend` exists in core (uses isomorphic-git)
- [x] `createOPFSGitAdapter` exists for OPFS → IsomorphicFs conversion
- [x] Git toolset works in CLI with GitHub targets

## Goal
Enable GitHub synchronization for browser extension - OAuth auth, clone/pull/push repos, and staging UI. User can link a project to a GitHub repo and sync changes.

## Tasks

### 1. GitHub OAuth Authentication
- [ ] Add `identity` permission to manifest.json
- [ ] Create `GitHubAuth` service (`services/github-auth.ts`)
  - [ ] `launchAuthFlow()` - Chrome identity API OAuth
  - [ ] `getToken()` - retrieve stored token
  - [ ] `revokeToken()` - logout
  - [ ] `isAuthenticated()` - check status
- [ ] Token storage in `chrome.storage.session` (ephemeral) + encrypted `chrome.storage.local` (persistent)
- [ ] Settings UI for GitHub connection status and logout

### 2. Git Service for Browser
- [ ] Create `BrowserGitService` (`services/browser-git.ts`)
  - [ ] Wraps `IsomorphicGitBackend` with OPFS adapter
  - [ ] Provides: `clone()`, `pull()`, `push()`, `status()`, `diff()`
  - [ ] Token injection from `GitHubAuth`
- [ ] Initialize git repo in OPFS on first clone
- [ ] Handle auth errors gracefully (prompt re-auth)

### 3. Project-Repository Linking
- [ ] Extend `Program` type with `githubRepo?: { owner: string, repo: string, branch: string }`
- [ ] UI for linking: enter `owner/repo` or paste GitHub URL
- [ ] Validate repo exists and user has access (via Octokit or isomorphic-git)
- [ ] Store link in `chrome.storage.local`

### 4. Clone/Pull Flow
- [ ] "Clone" button in project settings (for new link)
- [ ] "Pull" button/command to fetch latest
- [ ] Show progress indicator during operations
- [ ] Handle conflicts: show conflict markers, let user resolve
- [ ] Write pulled files to OPFS sandbox workspace zone

### 5. Staging and Push Flow
- [ ] Integrate git toolset into browser runtime
- [ ] `git_stage` works with OPFS sandbox files
- [ ] `git_push` sends staged commits to GitHub
- [ ] Clearance view: list staged commits, show diffs, approve/discard
- [ ] Push requires explicit user action (button click)

### 6. UI Components
- [ ] GitHub connection panel in Settings tab
- [ ] Repository link panel in Project view
- [ ] Staged commits list with diff viewer
- [ ] Push/Discard buttons
- [ ] Sync status indicator (in sync / ahead / behind / conflict)

## Current State
Phase 1 complete. Prerequisites validated. Ready to start OAuth implementation.

## Notes
- isomorphic-git uses HTTPS + PAT (no SSH support)
- Auth flow: Chrome `identity.launchWebAuthFlow` → GitHub OAuth → PAT token
- OPFS adapter already exists: `createOPFSGitAdapter()`
- Token refresh: GitHub PATs don't expire by default, but OAuth tokens do - need refresh handling
- See `docs/browser-extension-architecture.md` for system design

---

# Testing Plan

## Automated Tests (Vitest)

### Unit Tests
Location: `packages/chrome/src/services/__tests__/`

#### github-auth.test.ts
```
- Token storage/retrieval (mock chrome.storage)
- Token encryption/decryption
- isAuthenticated() states
- Error handling for missing/invalid tokens
```

#### browser-git.test.ts
```
- Clone to OPFS (mock isomorphic-git)
- Pull updates (mock isomorphic-git)
- Push staged commits (mock isomorphic-git)
- Auth error detection and handling
- Conflict detection
```

#### Integration with git toolset
```
- git_stage creates staged commit in browser
- git_diff shows correct diff
- git_status reflects OPFS state
```

### E2E Tests (Playwright)
Location: `packages/chrome/e2e/`

These test the full extension in a real browser but use a **test GitHub account** or **mock server**.

```
- Load extension
- Navigate to settings
- GitHub OAuth flow (with test account or mocked)
- Link project to test repo
- Clone repo
- Make changes
- Stage and push
- Verify changes in repo
```

## Manual Test Scripts

### Setup Requirements
1. GitHub test account (or use your own private test repo)
2. Test repo: `<your-username>/golem-forge-test` (create empty, private)
3. Chrome with extension loaded unpacked

---

### TEST-1: GitHub OAuth Flow

**Purpose:** Verify OAuth authentication works end-to-end.

**Prerequisites:**
- Extension built and loaded in Chrome
- GitHub test account credentials ready

**Steps:**
1. Open extension popup
2. Click "Settings" tab
3. Locate "GitHub Connection" section
4. Click "Connect to GitHub"
5. OAuth popup should appear
6. Log in with test account
7. Authorize the app
8. Popup should close

**Expected Results:**
- [ ] Settings shows "Connected as <username>"
- [ ] "Disconnect" button appears
- [ ] Token stored (check via chrome://extensions → Inspect → Application → Storage)

**Cleanup:**
- Click "Disconnect" to revoke token

---

### TEST-2: Link Project to Repository

**Purpose:** Verify project-repo linking and validation.

**Prerequisites:**
- TEST-1 passed (authenticated)
- Test repo exists: `<username>/golem-forge-test`

**Steps:**
1. Open side panel
2. Select or create a project
3. Go to project settings
4. Find "GitHub Repository" section
5. Enter: `<username>/golem-forge-test`
6. Click "Link"

**Expected Results:**
- [ ] Repo validates successfully
- [ ] Link saved and displayed
- [ ] "Clone" or "Pull" button appears

**Error Cases to Test:**
- [ ] Non-existent repo → shows error
- [ ] No access (private repo, wrong user) → shows error
- [ ] Invalid format (missing `/`) → shows error

---

### TEST-3: Clone Repository

**Purpose:** Verify initial clone to OPFS.

**Prerequisites:**
- TEST-2 passed (repo linked)
- Test repo has some files (README.md, src/index.ts)

**Steps:**
1. From project view, click "Clone"
2. Wait for progress indicator
3. Check file browser / sandbox contents

**Expected Results:**
- [ ] Progress shown during clone
- [ ] Files appear in workspace zone
- [ ] .git directory created in OPFS (verify via DevTools → Application → Storage → OPFS)
- [ ] Status shows "In sync"

**Error Cases:**
- [ ] Network failure → shows error, allows retry
- [ ] Auth expired → prompts re-auth

---

### TEST-4: Make Changes and Stage

**Purpose:** Verify staging flow in browser.

**Prerequisites:**
- TEST-3 passed (repo cloned)

**Steps:**
1. Use worker to modify a file (e.g., edit README.md)
2. Check `git_status` output (via worker or UI)
3. Use `git_stage` with the modified file
4. Check staged commits view

**Expected Results:**
- [ ] Status shows modified file
- [ ] Stage creates commit entry
- [ ] Diff viewer shows changes
- [ ] Commit message captured

---

### TEST-5: Push to GitHub

**Purpose:** Verify push flow end-to-end.

**Prerequisites:**
- TEST-4 passed (changes staged)

**Steps:**
1. Review staged commit in clearance view
2. Click "Push" button
3. Wait for completion

**Expected Results:**
- [ ] Push completes successfully
- [ ] Staged commit removed from list
- [ ] GitHub repo shows new commit (verify in browser)
- [ ] Commit author matches configured name/email

**Error Cases:**
- [ ] Conflict (someone else pushed) → shows conflict message
- [ ] Auth expired → prompts re-auth
- [ ] Network failure → shows error, commit stays staged

---

### TEST-6: Pull Updates

**Purpose:** Verify pulling remote changes.

**Prerequisites:**
- TEST-5 passed
- Make a change directly on GitHub (edit a file via web UI)

**Steps:**
1. From project view, click "Pull"
2. Wait for completion
3. Check file contents

**Expected Results:**
- [ ] Pull completes successfully
- [ ] Changed file updated in OPFS
- [ ] Status shows "In sync"

**Conflict Case:**
1. Make local change (don't push)
2. Make different change on GitHub
3. Pull
- [ ] Conflict markers inserted
- [ ] Status shows "Conflict"
- [ ] User can manually resolve

---

### TEST-7: Discard Staged Commit

**Purpose:** Verify discard flow.

**Prerequisites:**
- Stage a commit (don't push)

**Steps:**
1. In clearance view, click "Discard" on staged commit
2. Confirm discard

**Expected Results:**
- [ ] Staged commit removed
- [ ] Files remain in sandbox (not reverted)
- [ ] Status shows modified files again

---

### TEST-8: Session Persistence

**Purpose:** Verify token survives browser restart.

**Prerequisites:**
- TEST-1 passed (authenticated)
- "Remember me" / persistent storage enabled

**Steps:**
1. Close Chrome completely
2. Reopen Chrome
3. Open extension

**Expected Results:**
- [ ] Still authenticated (no re-login needed)
- [ ] Can perform git operations

---

### TEST-9: Logout and Re-auth

**Purpose:** Verify clean logout and re-authentication.

**Prerequisites:**
- TEST-1 passed (authenticated)

**Steps:**
1. Go to Settings
2. Click "Disconnect" / logout
3. Confirm
4. Try a git operation (should fail)
5. Re-authenticate

**Expected Results:**
- [ ] Token cleared
- [ ] Git operations prompt for auth
- [ ] Re-auth works cleanly

---

## Test Matrix

| Test | Automated | Manual | Priority |
|------|-----------|--------|----------|
| Token storage | Unit test | - | High |
| OAuth flow | - | TEST-1 | High |
| Repo linking | Unit test | TEST-2 | High |
| Clone | Unit test | TEST-3 | High |
| Stage | Unit test | TEST-4 | High |
| Push | Unit test | TEST-5 | High |
| Pull | Unit test | TEST-6 | High |
| Discard | Unit test | TEST-7 | Medium |
| Persistence | - | TEST-8 | Medium |
| Logout/re-auth | - | TEST-9 | Medium |
| Conflict handling | Unit test | TEST-6 | Medium |
| Error recovery | Unit test | Various | Medium |

## Test Environment Setup

### Create Test Repository
```bash
# Create test repo on GitHub
gh repo create golem-forge-test --private --description "Test repo for browser extension"

# Add some test files
cd /tmp && mkdir golem-forge-test && cd golem-forge-test
git init
echo "# Test Repository" > README.md
mkdir src && echo "export const hello = 'world';" > src/index.ts
git add . && git commit -m "Initial commit"
gh repo create golem-forge-test --private --source=. --push
```

### Build Extension for Testing
```bash
cd packages/chrome
npm run build
# Load dist/ folder as unpacked extension in chrome://extensions
```

### Debug Tools
- Chrome DevTools → Application → Storage → OPFS (inspect files)
- Chrome DevTools → Console (extension errors)
- `chrome.storage.local.get(console.log)` in DevTools console
- Network tab to watch GitHub API calls
