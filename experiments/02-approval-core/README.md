# Experiment 1.2: Approval System Core

## Goal

Port the Python `pydantic-ai-blocking-approval` package to TypeScript, creating a runtime-agnostic approval system.

## Status: COMPLETE

## Files

```
src/
├── types.ts      # Core types: ApprovalResult, ApprovalRequest, ApprovalDecision
├── memory.ts     # ApprovalMemory: session cache for approval decisions
├── controller.ts # ApprovalController: mode-based approval handling
└── index.ts      # Public exports

*.test.ts         # Unit tests for each module
demo.ts           # Interactive demo showing different runtimes
```

## Running

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run demo
npm run demo
```

## Key Concepts

### 1. ApprovalResult (Three-State)

```typescript
// Factory methods for clear semantics
const blocked = ApprovalResult.blocked("Dangerous operation");
const preApproved = ApprovalResult.preApproved();
const needsApproval = ApprovalResult.needsApproval();

// Check status
if (result.isBlocked) { /* reject */ }
if (result.isPreApproved) { /* execute immediately */ }
if (result.isNeedsApproval) { /* prompt user */ }
```

### 2. ApprovalCallback (Runtime Abstraction)

The key abstraction that enables multi-runtime support:

```typescript
type ApprovalCallback = (request: ApprovalRequest) => Promise<ApprovalDecision>;

// CLI implementation
const cliCallback: ApprovalCallback = async (req) => {
  const answer = await readline.question(`Approve ${req.description}? `);
  return { approved: answer === 'y', remember: 'session' };
};

// Browser extension implementation
const browserCallback: ApprovalCallback = async (req) => {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'approval', request: req });
    // Listen for response from popup
  });
};
```

### 3. ApprovalController (Mode Handling)

```typescript
// Auto-approve for tests
const testController = new ApprovalController({ mode: "approve_all" });

// Reject all for CI/production
const ciController = new ApprovalController({ mode: "strict" });

// Interactive with custom callback
const interactiveController = new ApprovalController({
  mode: "interactive",
  approvalCallback: myCallback,
});
```

### 4. ApprovalMemory (Session Cache)

```typescript
const memory = new ApprovalMemory();

// Store approval with session scope
memory.store("write_file", { path: "/tmp/test" }, { approved: true, remember: "session" });

// Later lookup - avoids re-prompting
const cached = memory.lookup("write_file", { path: "/tmp/test" });
```

## Ported from Python

| Python | TypeScript | Notes |
|--------|------------|-------|
| `ApprovalResult` dataclass | `ApprovalResult` class | Factory methods preserved |
| `ApprovalRequest` Pydantic model | `ApprovalRequest` interface | |
| `ApprovalDecision` Pydantic model | `ApprovalDecision` interface | |
| `SupportsNeedsApproval` Protocol | `SupportsNeedsApproval` interface | + type guard |
| `SupportsApprovalDescription` Protocol | `SupportsApprovalDescription` interface | + type guard |
| `ApprovalMemory` class | `ApprovalMemory` class | Uses Map instead of dict |
| `ApprovalController` class | `ApprovalController` class | Async-first API |

## Success Criteria

- [x] Types are clean TypeScript (no `any` except where intentional)
- [x] ApprovalResult with factory methods
- [x] ApprovalMemory with JSON-based matching
- [x] ApprovalController with mode handling
- [x] Session caching works correctly
- [x] Callbacks are runtime-agnostic (no Node.js-specific code)
- [x] All tests passing (26 tests)
- [x] Demo runs successfully

## Architecture Insight

```
┌─────────────────────────────────────────────────────┐
│                 Approval Core (this package)         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ ApprovalResult│ │ApprovalMemory│ │ApprovalController│
│  └─────────────┘  └─────────────┘  └──────┬──────┘  │
│                                           │          │
│                       ApprovalCallback    │          │
└───────────────────────────────────────────┼──────────┘
                                            │
         ┌──────────────────────────────────┼──────────────────────────────┐
         │                                  │                              │
         ▼                                  ▼                              ▼
   ┌───────────┐                     ┌───────────┐                  ┌───────────┐
   │    CLI    │                     │  Browser  │                  │  VS Code  │
   │  Runtime  │                     │ Extension │                  │ Extension │
   └───────────┘                     └───────────┘                  └───────────┘
```

The core package has **zero runtime dependencies**. All runtime-specific behavior is injected via `ApprovalCallback`.

## Next Steps

→ Experiment 1.3: Integrate approval system with lemmy tool execution
