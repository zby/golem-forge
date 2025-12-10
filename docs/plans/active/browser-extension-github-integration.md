# Browser Extension GitHub Integration

## Prerequisites
- [x] Phase 1 complete (OPFS sandbox, worker runtime, UI foundation)
- [x] AI SDK browser compatibility validated
- [x] `packages/chrome/` exists with working build

## Goal
Enable GitHub synchronization for browser extension projects - OAuth auth, pull/push, and staging UI.

## Tasks

### Phase 2: GitHub Integration
- [ ] Implement GitHub OAuth flow (`identity` permission)
- [ ] Secure token storage (`chrome.storage.session` + encrypted local)
- [ ] Token refresh handling
- [ ] Integrate `@octokit/rest`
- [ ] Implement `GitSync` service
  - [ ] `pull()`: Fetch repo → OPFS `/projects/{id}/cache`
  - [ ] `push()`: OPFS `/staged` → commit → push
  - [ ] Merge conflict handling
- [ ] Implement `stageFiles(files)` with manifest generation
- [ ] Staging status API for UI
- [ ] GitHub worker syncing in `WorkerManager`

### Phase 3: UI & Triggers
- [ ] Project Dashboard (list, create, link to repo)
- [ ] Worker Settings UI (enable/disable per project)
- [ ] Clearance View (pending commits, diffs, approve/reject)
- [ ] Content script triggers (URL pattern matching)
- [ ] Tool approval dialog
- [ ] Clearance notification badge

## Current State
Phase 1 complete. Ready to start Phase 2 (GitHub OAuth).

## Notes
- Architecture decision: User-provided API keys with direct LLM calls (no backend proxy)
- Custom YAML parser works correctly (~140 lines)
- See `docs/browser-extension-architecture.md` for system design
- See `docs/notes/container-isolation-options.md` for future WASM isolation (Phase 4)
