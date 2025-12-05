# Use Case: Browser Extension Project & Worker Management

**Priority**: High (core extension functionality)
**Status**: Design

## Conceptual Model

```
Program (Project)          = One GitHub repository for output
Function (Worker)          = One task definition (analyze deck, summarize doc, etc.)

┌─────────────────────────────────────────────────────────────────────┐
│                         Project = Program                           │
│                                                                     │
│  GitHub Repo: github.com/user/pitchdecks                            │
│                                                                     │
│  Workers (Functions):                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ pitchdeck-      │  │ competitor-     │  │ market-         │     │
│  │ analyzer        │  │ lookup          │  │ research        │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                     │
│  All output → /pitchdecks/ repo                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key constraint**: One project = one output repository. Workers within a project all write to the same repo.

## User Stories

### US-PM-1: Create Project with GitHub Connection

**As** a browser extension user
**I want to** create a new project linked to a GitHub repository
**So that** all my work is automatically saved and versioned

**Acceptance Criteria**:
- [ ] Can authenticate with GitHub (OAuth flow)
- [ ] Can select existing repository or create new one
- [ ] Can specify branch (default: main)
- [ ] Project configuration stored in extension settings
- [ ] Token stored securely (extension secure storage, not localStorage)

### US-PM-2: Use Bundled Workers

**As** a new user
**I want to** use pre-packaged workers immediately after installation
**So that** I can start working without any configuration

**Acceptance Criteria**:
- [ ] Extension ships with curated set of useful workers
- [ ] Bundled workers available in all projects
- [ ] No GitHub connection required for bundled workers
- [ ] Bundled workers cannot be modified (read-only)

**Initial bundled workers**:
- `document-summarizer` - Summarize any document
- `pitchdeck-analyzer` - Analyze pitch decks (see [pitchdeck-analyzer.md](./pitchdeck-analyzer.md))
- `meeting-notes` - Extract action items from meeting notes
- `code-explainer` - Explain code snippets

### US-PM-3: Import Workers from GitHub Repository

**As** a power user
**I want to** sync workers from my own GitHub repository
**So that** I can version-control and share my custom workers

**Acceptance Criteria**:
- [ ] Can configure a "worker source" repository
- [ ] Extension fetches `.worker` files from specified path
- [ ] Workers cached in OPFS for offline use
- [ ] Can manually trigger sync to get updates
- [ ] Workers namespaced by repo (e.g., `my-workers/custom-analyzer`)

**Worker repository structure**:
```
my-golem-workers/           # User's worker repo
├── README.md
├── pitchdeck/
│   └── analyzer.worker     # Custom pitchdeck worker
├── research/
│   ├── summarizer.worker
│   └── fact-checker.worker
└── code/
    └── reviewer.worker
```

### US-PM-4: Assign Workers to Project

**As** a user setting up a project
**I want to** choose which workers are available in this project
**So that** I see only relevant options when working

**Acceptance Criteria**:
- [ ] Project configuration includes list of enabled workers
- [ ] Can select from bundled + imported workers
- [ ] UI shows only enabled workers when project is active
- [ ] Can modify worker selection after project creation

### US-PM-5: Configure Site Triggers

**As** a user who processes content from specific sites
**I want to** configure automatic worker availability on certain URLs
**So that** the right tools appear when I visit those sites

**Acceptance Criteria**:
- [ ] Can define URL patterns (glob-style: `https://hey.com/*`)
- [ ] Pattern activates specific project/worker combination
- [ ] Content script injects UI elements on matching pages
- [ ] Multiple triggers per project allowed
- [ ] Can enable/disable triggers without deleting

**Example triggers**:
```yaml
triggers:
  - pattern: "https://hey.com/*"
    worker: pitchdeck-analyzer
    inject: ".attachment-list"  # Where to add button

  - pattern: "https://github.com/*/pull/*"
    worker: code-reviewer
    inject: ".pr-toolbar"
```

## Workflow

### First-Time Setup

```
┌─────────────────────────────────────────────────────────────────────┐
│  Welcome to Golem Forge                                             │
│                                                                     │
│  Get started in 3 steps:                                            │
│                                                                     │
│  1. [Connect GitHub]     ← OAuth authentication                     │
│                                                                     │
│  2. [Create Project]     ← Link to output repository                │
│                                                                     │
│  3. [Choose Workers]     ← Select from bundled + your repos         │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  Or try now with bundled workers (no GitHub required):              │
│  [Quick Start →]                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Project Creation Flow

```
Step 1: GitHub Repository
┌─────────────────────────────────────────────────────────────────────┐
│  Where should output be saved?                                       │
│                                                                     │
│  ○ Create new repository                                            │
│     Name: [my-research              ]                               │
│     Private: [✓]                                                    │
│                                                                     │
│  ● Use existing repository                                          │
│     [zby/pitchdecks                        ▼]                       │
│     Branch: [main ▼]                                                │
│                                                                     │
│  [Back]                                              [Next →]       │
└─────────────────────────────────────────────────────────────────────┘

Step 2: Select Workers
┌─────────────────────────────────────────────────────────────────────┐
│  Which workers should be available?                                  │
│                                                                     │
│  Bundled Workers                                                    │
│  ☑ pitchdeck-analyzer     Analyze pitch deck PDFs                   │
│  ☑ document-summarizer    Summarize any document                    │
│  ☐ meeting-notes          Extract action items                      │
│  ☐ code-explainer         Explain code snippets                     │
│                                                                     │
│  From: my-golem-workers (synced)                                    │
│  ☑ custom/competitor-lookup                                         │
│  ☐ custom/market-research                                           │
│                                                                     │
│  [+ Add worker source repository]                                   │
│                                                                     │
│  [Back]                                              [Create →]     │
└─────────────────────────────────────────────────────────────────────┘
```

### Adding Worker Source Repository

```
┌─────────────────────────────────────────────────────────────────────┐
│  Add Worker Repository                                               │
│                                                                     │
│  Repository: [username/my-golem-workers     ]                       │
│  Branch:     [main                          ]                       │
│  Path:       [/ (root)                      ]  ← where .worker files│
│                                                                     │
│  [Test Connection]                                                  │
│                                                                     │
│  ✓ Found 3 worker files:                                            │
│    • custom/competitor-lookup.worker                                │
│    • custom/market-research.worker                                  │
│    • custom/fact-checker.worker                                     │
│                                                                     │
│  [Cancel]                                           [Add Source]    │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Model

### Project Configuration

```typescript
interface Project {
  id: string;
  name: string;
  createdAt: Date;

  // Output destination (one repo per project)
  github: {
    owner: string;
    repo: string;
    branch: string;
  };

  // Enabled workers (references)
  workers: WorkerRef[];

  // Site triggers
  triggers: SiteTrigger[];

  // Settings
  settings: {
    defaultTrustLevel: TrustLevel;
    requireApprovalForPush: boolean;  // Always true for now
  };
}

interface WorkerRef {
  source: 'bundled' | 'github';
  id: string;  // e.g., "pitchdeck-analyzer" or "my-workers/custom-analyzer"
}

interface SiteTrigger {
  id: string;
  urlPattern: string;
  workerId: string;
  injectSelector?: string;
  enabled: boolean;
}
```

### Worker Source Configuration

```typescript
interface WorkerSource {
  id: string;
  type: 'bundled' | 'github';

  // For GitHub sources
  github?: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
  };

  // Cached worker definitions
  workers: WorkerDefinition[];
  lastSynced?: Date;
}
```

## Storage Layout

```
Extension Storage (chrome.storage.local):
├── projects/
│   ├── {project-id}/
│   │   └── config.json
│   └── ...
├── worker-sources/
│   ├── bundled.json
│   └── github-{owner}-{repo}.json
└── settings/
    └── global.json

Extension Secure Storage (for tokens):
└── github-token

OPFS (file content):
/workspace/{project-id}/
├── cache/           # Downloaded attachments
└── output/          # Staged files before push

/workers/
├── bundled/         # Read from extension bundle
│   ├── pitchdeck-analyzer.worker
│   └── ...
└── github/          # Synced from user repos
    └── {owner}-{repo}/
        └── *.worker
```

## Security Considerations

- **GitHub tokens**: Stored in extension secure storage, never in localStorage
- **Worker sources**: Only fetch from authenticated GitHub repos
- **Bundled workers**: Signed/verified, cannot be modified
- **Project isolation**: Each project's OPFS workspace is isolated
- **Trust levels**: User-initiated actions get `session` trust, auto-triggers need explicit approval

## Implementation Dependencies

| Dependency | Phase | Notes |
|------------|-------|-------|
| Browser sandbox with OPFS | 5.1 | Storage backend |
| GitHub OAuth | 5.2 | Token acquisition |
| Octokit integration | 5.2 | Repo operations |
| Worker parser (browser) | 5.3 | Parse .worker files |
| Extension popup UI | 5.4 | Configuration interface |
| Content script framework | 5.5 | Site triggers |

## Future Enhancements

1. **Worker marketplace**: Browse and install community workers
2. **Project templates**: Pre-configured project + worker combinations
3. **Team sharing**: Share projects via GitHub organization
4. **Worker versioning**: Pin to specific worker versions
5. **Sync indicators**: Show when workers need updating
6. **Import/export**: Backup project configurations

## Open Questions

1. Should projects be able to use multiple output repos? (Current: No, one repo per project)
2. How to handle worker name conflicts between sources?
3. Should we support worker dependencies (one worker calling another)?
4. Offline mode: What works without GitHub connection?
