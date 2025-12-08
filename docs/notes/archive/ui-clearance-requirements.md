# UI Requirements for Clearance Protocol

**Date**: 2025-12-07
**Status**: Design
**Related**: [../sandbox-design.md](../sandbox-design.md)

## Current UI Model

The current UI supports two interaction patterns:

1. **Conversation** - User talks to LLM, LLM responds
2. **Approval** - LLM requests action, user approves/rejects

```
User ←→ LLM ←→ Tools
         ↓
      Approval
         ↓
       User
```

This covers **Autonomous** (pre-cleared) and **Supervised** (requires approval) modes.

## Missing: Manual Mode

The Clearance Protocol introduces a third mode where the **user initiates** operations that the LLM cannot even request:

| Mode | Current UI Support |
|------|-------------------|
| Autonomous | ✓ (tools execute without prompt) |
| Supervised | ✓ (approval dialog) |
| **Manual** | ✗ (no mechanism exists) |

## Required UI Capabilities

### 1. Clearance Dashboard

A view showing what's pending clearance:

```
┌─────────────────────────────────────────────────────────────┐
│  Pending Clearance                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📦 Staged Commit: "Add quarterly report"                   │
│     3 files, 2.1 KB total                                   │
│     Created: 2 minutes ago                                  │
│                                                             │
│     [View Diff]  [Push to main]  [Discard]                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  No other items pending clearance                           │
└─────────────────────────────────────────────────────────────┘
```

**Requirements:**
- List all pending clearance items (staged commits, pending exports)
- Show metadata (size, age, description)
- Actions: view details, execute clearance, discard

### 2. Diff Viewer

Review content before clearance:

```
┌─────────────────────────────────────────────────────────────┐
│  Staged: "Add quarterly report" → main                      │
├─────────────────────────────────────────────────────────────┤
│  workspace/report.md                              [+] new   │
├─────────────────────────────────────────────────────────────┤
│  + # Q4 2024 Report                                         │
│  +                                                          │
│  + ## Summary                                                │
│  + Revenue increased by 15% compared to Q3...               │
│  +                                                          │
├─────────────────────────────────────────────────────────────┤
│  workspace/analysis.json                          [M] mod   │
├─────────────────────────────────────────────────────────────┤
│    {                                                        │
│      "period": "Q4-2024",                                   │
│  -   "status": "draft"                                      │
│  +   "status": "final",                                     │
│  +   "metrics": {                                           │
│  +     "revenue": 1500000                                   │
│  +   }                                                      │
│    }                                                        │
├─────────────────────────────────────────────────────────────┤
│                          [Push]  [Discard]  [Cancel]        │
└─────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Unified diff view with syntax highlighting
- File-by-file navigation
- Clear visual distinction for adds/removes/modifications
- Action buttons for clearance decision

### 3. Manual Command Interface

Execute clearance operations that LLM cannot trigger:

```
┌─────────────────────────────────────────────────────────────┐
│  Clearance Commands                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Git:                                                       │
│    golem git status     - View sandbox and staged changes   │
│    golem git diff       - Show staged changes               │
│    golem git push       - Push to trusted zone              │
│    golem git discard    - Discard staged changes            │
│                                                             │
│  Export (future):                                           │
│    golem export <path>  - Export file from sandbox          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Options:**
- **CLI only**: User runs commands in terminal alongside UI
- **Integrated**: UI provides buttons/commands for clearance operations
- **Hybrid**: UI shows status, links to CLI commands

### 4. Notifications / Status Bar

Show when items are pending clearance:

```
┌─────────────────────────────────────────────────────────────┐
│  [Chat]  [Files]  [Clearance (1)]                           │
└─────────────────────────────────────────────────────────────┘
```

Or in status bar:
```
┌─────────────────────────────────────────────────────────────┐
│  📦 1 item pending clearance                    [Review]    │
└─────────────────────────────────────────────────────────────┘
```

**Requirements:**
- Non-intrusive indicator when clearance items exist
- Quick access to clearance dashboard
- Badge count for pending items

## Interaction Flow

### Current Flow (Approval)

```
LLM: "I'll write the report now"
LLM: [calls write_file] → Approval dialog
User: [Approve]
LLM: "Done! The report is ready."
```

### New Flow (Manual Clearance)

```
LLM: "I've staged the report for your review"
LLM: [calls git_stage] → Executes (autonomous)
LLM: "Run 'golem git push' when you're ready to save it"

--- Later, user-initiated ---

User: [Opens Clearance tab]
User: [Views diff]
User: [Clicks Push]
System: "Pushed to main (commit abc123)"
```

## Design Questions

### Q1: Where do clearance operations live?

| Option | Pros | Cons |
|--------|------|------|
| **Separate tab/panel** | Clear separation, dedicated space | Context switch from conversation |
| **Inline in chat** | Contextual, no switch | Clutters conversation |
| **Status bar + modal** | Non-intrusive, on-demand | Hidden, easy to forget |
| **CLI only** | Simple, no UI changes | Poor discoverability |

**Recommendation**: Status bar indicator + dedicated panel. The indicator keeps clearance visible; the panel provides full review capabilities.

### Q2: Should LLM see clearance status?

The LLM can call `git_status` to see what's staged. Should the LLM:
- Be notified when user clears/discards items?
- Be able to reference pending clearance in conversation?

**Recommendation**: Yes, LLM should see clearance status via tools. When user pushes/discards, the conversation could show a system message:

```
[System: User pushed staged commit "Add quarterly report" to main]
```

This keeps the LLM informed for coherent conversation.

### Q3: Scanner integration UI

When scanners are implemented, how should results display?

```
┌─────────────────────────────────────────────────────────────┐
│  Scanner Results                                            │
├─────────────────────────────────────────────────────────────┤
│  output/chart.png                                           │
│                                                             │
│  ✓ Malware scan: Clean                                      │
│  ✓ Format validation: Valid PNG                             │
│  ⚠ Metadata: Contains GPS coordinates                       │
│                                                             │
│  [View Metadata]  [Strip Metadata & Push]  [Discard]        │
└─────────────────────────────────────────────────────────────┘
```

**Consideration**: Scanners may surface warnings that require user judgment. UI needs to present findings clearly and offer remediation options.

## Implementation Phases

### Phase 1: CLI-First

- Clearance operations via CLI commands only
- UI shows notification when items are pending
- Links to CLI commands in UI

```
[!] 1 staged commit pending
    Run: golem git diff    (review)
         golem git push    (push to main)
         golem git discard (discard)
```

### Phase 2: Integrated Diff Viewer

- View diffs in UI
- Still push/discard via CLI or simple UI buttons
- No full dashboard yet

### Phase 3: Full Clearance Dashboard

- Dedicated clearance panel
- Full diff viewer with syntax highlighting
- Scanner results display
- History of cleared items

## Summary

The Clearance Protocol requires the UI to support **user-initiated operations** that the LLM cannot trigger. Minimum viable support:

1. **Notification** when items are pending clearance
2. **Command reference** for CLI operations
3. **Status visibility** so LLM can reference pending items

Full support adds:

4. **Diff viewer** for reviewing content
5. **Clearance dashboard** for managing pending items
6. **Scanner UI** for binary content verification
