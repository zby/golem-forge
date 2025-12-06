# Browser Extension Implementation Plan

**Status:** Draft
**Based on:** [Browser Extension Architecture](../browser-extension-architecture.md)

This plan outlines the steps to build the Golem Forge browser extension, focusing on the "Project" based workflow and GitHub integration.

## Phase 1: Core Foundation (Storage & Sandbox)

Goal: Establish the local storage structure (OPFS) and the Project/Worker management logic.

### 1.1 Project & Worker Storage
- [ ] Implement `ProjectManager` service
  - [ ] CRUD operations for Projects in `chrome.storage.local`
  - [ ] `WorkerSource` management (bundled vs github)
- [ ] Define data models (`Project`, `WorkerRef`, `SiteTrigger`)
- [ ] Create initial "Bundled" worker definitions (e.g., `pitchdeck-analyzer.worker`)

### 1.2 OPFS Sandbox
- [ ] Implement `FileSandbox` interface backed by OPFS
  - [ ] `read(path)`, `write(path, content)`, `list(path)`
  - [ ] Path mapping logic: `/projects/{id}/...`
- [ ] Implement `Session` isolation
  - [ ] Create unique `/working/{session-id}` directories
  - [ ] Enforce read/write permissions based on Trust Level

### 1.3 Basic Worker Runtime
- [ ] Port core `WorkerRuntime` to browser environment
- [ ] Implement "Logical Isolation"
  - [ ] Restrict worker file access to its assigned Zone
- [ ] Mock Tool Execution (for initial testing without WASM)

## Phase 2: GitHub Integration

Goal: Enable synchronization between local OPFS projects and GitHub repositories.

### 2.1 Authentication
- [ ] Implement GitHub OAuth flow (`identity` permission)
- [ ] Secure token storage (use `chrome.storage.session` or encrypted local storage)

### 2.2 Octokit Integration
- [ ] Integrate `@octokit/rest` or lightweight alternative
- [ ] Implement `GitSync` service
  - [ ] `pull()`: Fetch repo content -> write to OPFS `/projects/{id}/cache`
  - [ ] `push()`: Read from OPFS `/staged` -> create commit -> push

### 2.3 Staging Logic
- [ ] Implement `stageFiles(files)` in `GitSync`
  - [ ] Write files to `/staged/{commit-id}/`
  - [ ] Generate `manifest.json` for the commit

## Phase 3: UI & Triggers

Goal: User-facing interface for managing projects and triggering workers from websites.

### 3.1 Extension Popup / Options
- [ ] **Project Dashboard**: List projects, create new (link to repo)
- [ ] **Worker Settings**: Enable/disable workers per project
- [ ] **Staging View**: Show pending commits, Approve/Reject buttons

### 3.2 Content Script Triggers
- [ ] Implement `SiteTrigger` matching logic in Background script
- [ ] Create generic Content Script
  - [ ] Listen for matches
  - [ ] Inject "Action Button" (e.g., "Analyze Pitch Deck")
  - [ ] Handle click -> Send message to Background to start Session

### 3.3 Approval UI
- [ ] Implement "Approval Request" popup
  - [ ] Show when Worker tries to Stage files or Push
  - [ ] Display diffs (if possible)

## Phase 4: Advanced Security (Future)

Goal: Harden isolation for untrusted content.

### 4.1 WASM Runtime
- [ ] Research WASI runtimes for browser (e.g., `browser_wasi_shim`)
- [ ] Compile core tools (grep, basic text processing) to WASM
- [ ] Update `WorkerRuntime` to execute tools in WASM container

### 4.2 Advanced Permissions
- [ ] Fine-grained permission UI (e.g., "Allow network access to *.google.com")
- [ ] Audit Log viewer

## Milestones

| Milestone | Deliverable | Estimated Time |
|-----------|-------------|----------------|
| **M1: MVP Core** | Project creation, OPFS storage, Local worker execution | 2 weeks |
| **M2: Sync** | GitHub Auth, Pull/Push, Staging UI | 2 weeks |
| **M3: Integration** | Hey.com Pitch Deck Analyzer demo (End-to-End) | 1 week |
