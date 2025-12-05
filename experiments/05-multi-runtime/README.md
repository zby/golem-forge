# Experiment 1.5: Multi-Runtime Approval

## Goal

Validate that the same core approval system works with different runtime callbacks (CLI vs browser extension).

## Status: COMPLETE

## Files

```
src/
├── cli-callback.ts      # CLI approval using readline
├── browser-callback.ts  # Mock browser extension callback
├── callbacks.test.ts    # Tests proving runtime equivalence
└── index.ts             # Exports

demo.ts                  # Non-interactive demo
demo-cli.ts              # Interactive CLI demo (optional)
```

## Running

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run demo
npm run demo
```

## Key Concepts

### The ApprovalCallback Abstraction

The entire multi-runtime capability rests on one simple type:

```typescript
type ApprovalCallback = (request: ApprovalRequest) => Promise<ApprovalDecision>;
```

This abstraction allows:
- **CLI**: Use readline to prompt user
- **Browser Extension**: Use chrome.notifications + message passing
- **VS Code**: Use vscode.window.showQuickPick
- **Web UI**: Use a modal dialog
- **Testing**: Use mock callbacks

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    golem-forge Core                          │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────┐  │
│  │ ApprovalResult │  │ApprovalMemory │  │ApprovalController│ │
│  └───────────────┘  └───────────────┘  └────────┬───────┘  │
│                                                  │           │
│                          ApprovalCallback        │           │
└──────────────────────────────────────────────────┼───────────┘
                                                   │
            ┌──────────────────────────────────────┼──────────────────────┐
            │                                      │                      │
            ▼                                      ▼                      ▼
   ┌────────────────┐                   ┌─────────────────┐      ┌──────────────┐
   │  CLI Runtime   │                   │ Browser Runtime │      │ Test Runtime │
   │                │                   │                 │      │              │
   │  readline      │                   │ chrome.notifs   │      │ mock fn()    │
   │  process.stdin │                   │ message passing │      │              │
   └────────────────┘                   └─────────────────┘      └──────────────┘
```

### CLI Callback Implementation

```typescript
import * as readline from "readline/promises";

const cliCallback: ApprovalCallback = async (request) => {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`Approve ${request.description}? [y/n] `);
  rl.close();

  return {
    approved: answer.toLowerCase() === "y",
    remember: "session",
  };
};
```

### Browser Callback Pattern

```typescript
// In a real extension:
const browserCallback: ApprovalCallback = async (request) => {
  return new Promise((resolve) => {
    // Create notification
    chrome.notifications.create(requestId, {
      type: "basic",
      title: `Approve: ${request.toolName}`,
      message: request.description,
      buttons: [{ title: "Approve" }, { title: "Deny" }],
    });

    // Listen for response
    chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
      if (notifId === requestId) {
        resolve({
          approved: buttonIndex === 0,
          remember: "session",
        });
      }
    });
  });
};
```

## Success Criteria

- [x] CLI callback works with ApprovalController
- [x] Browser callback works with ApprovalController
- [x] Both produce equivalent results for same inputs
- [x] Session caching works identically across runtimes
- [x] No runtime-specific code in core
- [x] Easy to add new runtimes

## Test Results

```
✓ CLI Callback
  ✓ auto-approves when configured
  ✓ auto-denies when configured
  ✓ works with ApprovalController

✓ Browser Callback
  ✓ creates notification on approval request
  ✓ resolves when user approves
  ✓ resolves when user denies
  ✓ works with ApprovalController
  ✓ handles multiple concurrent requests

✓ Runtime Agnostic Behavior
  ✓ both runtimes approve same request identically
  ✓ both runtimes deny same request identically
  ✓ session caching works identically across runtimes
  ✓ core code has no runtime-specific dependencies
```

## Implications for Browser Extension

This experiment validates that we can build a browser extension that:

1. **Shares the same core** - All approval logic, memory, controller lives in golem-forge
2. **Only implements the callback** - Extension just provides the UI for prompting
3. **Gets all features for free** - Session caching, modes, etc. work automatically

The extension code would be minimal:
- `popup.js`: Show pending approvals, handle user input
- `background.js`: Run golem-forge core, inject browser callback
- `content.js`: (optional) Page interaction

## Next Steps

→ After validation, callbacks can be packaged in:
  - `src/runtimes/cli.ts` - CLI callback
  - `src/runtimes/browser.ts` - Browser callback factory
  - Extension gets its own package later

→ Phase 2 experiments (Sandbox, Toolsets, etc.)
