# Gemini CLI Architecture Alignment

Proposal for adapting golem-forge's UI architecture to align with Gemini CLI patterns while preserving core differentiators.

## Core Differentiators (Non-Negotiable)

1. **Worker Model** - Hierarchical task delegation with nested workers
2. **Approvals System** - Risk-based approval with worker path context, multiple approval types
3. **Manual Tools** - Direct user invocation of tools with form-based input

## Current vs Proposed Architecture

### Current: Single Interface Abstraction

```
UIAdapter (interface)
  └── CLIAdapter (imperative implementation)
```

### Proposed: Context-Based React Architecture

```
UIRoot
├── Providers (stacked contexts)
│   ├── ConfigContext        (settings, theme preference)
│   ├── ThemeContext         (semantic colors)
│   ├── WorkerContext        (NEW: worker tree state)
│   ├── StreamingContext     (LLM response state)
│   ├── ApprovalContext      (NEW: pending approvals)
│   ├── KeypressContext      (keyboard input)
│   └── UIActionsContext     (dispatch actions)
│
├── Layouts
│   ├── DefaultLayout        (standard view)
│   └── AccessibleLayout     (screen reader mode)
│
└── Composer (main UI orchestrator)
    ├── Header               (logo, mode indicators)
    ├── MainContent          (messages, tool results)
    ├── ApprovalDialog       (when pending approval)
    ├── ManualToolPalette    (when activated)
    ├── InputPrompt          (user input)
    └── Footer               (worker status, model, context %)
```

## Key Adaptations

### 1. Worker Context (NEW)

Gemini CLI lacks a worker model - this is our unique addition:

```typescript
interface WorkerState {
  /** Active worker tree */
  workers: Map<string, WorkerNode>;
  /** Currently focused worker */
  activeWorkerId: string;
  /** Worker path from root to active */
  activePath: WorkerInfo[];
}

interface WorkerNode {
  id: string;
  task: string;
  status: "pending" | "running" | "complete" | "error";
  parentId?: string;
  children: string[];
  depth: number;
}

const WorkerContext = createContext<WorkerState>(initialState);
const WorkerActionsContext = createContext<WorkerActions>(actions);
```

### 2. Approval Context (NEW)

Adapts Gemini's ToolConfirmationMessage pattern for our richer approval model:

```typescript
interface ApprovalState {
  /** Pending approval request (null if none) */
  pending: UIApprovalRequest | null;
  /** Resolve function for current request */
  resolve: ((result: UIApprovalResult) => void) | null;
  /** Session-approved patterns */
  sessionApprovals: ApprovalPattern[];
  /** Permanent approval patterns */
  alwaysApprovals: ApprovalPattern[];
}

// Approval types we preserve (Gemini only has approve/deny)
type UIApprovalResult =
  | { approved: true }
  | { approved: false; reason?: string }
  | { approved: "always" }   // Remember forever
  | { approved: "session" }; // Remember this session
```

### 3. Manual Tool Integration

Map to Gemini's shell mode / command concept:

```typescript
// Activation: Gemini uses `!` prefix, we use `/` commands
// Both support: completion, history, direct execution

interface ManualToolState {
  /** Available manual tools */
  tools: ManualToolInfo[];
  /** Currently active tool (form open) */
  activeTool: string | null;
  /** Form field values */
  fieldValues: Record<string, unknown>;
}

// Hook for manual tool completion (like Gemini's useSlashCompletion)
function useManualToolCompletion(input: string): ManualToolInfo[] {
  const { tools } = useManualTools();
  if (!input.startsWith("/")) return [];
  return tools.filter(t => t.name.startsWith(input.slice(1)));
}
```

### 4. Message Types

Expand to match Gemini's granularity while keeping our concepts:

```typescript
type MessageType =
  // Standard (like Gemini)
  | "user"
  | "assistant"
  | "error"
  | "info"
  | "warning"
  // Worker-specific (our addition)
  | "worker_start"
  | "worker_complete"
  | "worker_delegate"
  // Tool-specific (like Gemini)
  | "tool_call"
  | "tool_result"
  | "tool_confirmation";

// Component mapping
const MessageComponents: Record<MessageType, Component> = {
  user: UserMessage,
  assistant: AssistantMessage,
  error: ErrorMessage,
  worker_start: WorkerStartMessage,    // NEW
  worker_complete: WorkerCompleteMessage, // NEW
  worker_delegate: WorkerDelegateMessage, // NEW
  tool_call: ToolCallMessage,
  tool_result: ToolResultDisplay,
  tool_confirmation: ApprovalPrompt,
};
```

### 5. Semantic Theming

Adopt Gemini's 3-layer approach:

```typescript
// Layer 1: Color Palette
interface ColorPalette {
  background: string;
  foreground: string;
  blue: string;
  green: string;
  yellow: string;
  red: string;
  purple: string;
  cyan: string;
}

// Layer 2: Semantic Tokens
interface SemanticColors {
  text: {
    primary: string;
    secondary: string;
    muted: string;
    link: string;
  };
  status: {
    success: string;
    error: string;
    warning: string;
    info: string;
  };
  border: {
    default: string;
    focused: string;
  };
  // Worker-specific (our addition)
  worker: {
    active: string;
    pending: string;
    complete: string;
    delegating: string;
  };
}

// Layer 3: Component-specific tokens
interface ThemeTokens extends SemanticColors {
  approval: {
    lowRisk: string;
    mediumRisk: string;
    highRisk: string;
  };
}
```

### 6. Footer Status Bar

Adapt Gemini's footer for worker model:

```
┌─────────────────────────────────────────────────────────────────────┐
│ [vim] ~/project (main) │ worker:3/5 ⚡ │ claude-sonnet │ 42% ctx │
└─────────────────────────────────────────────────────────────────────┘

Left:    vim mode | cwd + branch
Center:  worker progress (active/total) + status indicator
Right:   model name | context remaining
```

### 7. Hooks Library

Create hooks matching Gemini's patterns:

```typescript
// Core (from Gemini)
useTerminalSize()
useKeypress()
useInputHistory()

// Streaming (adapted)
useWorkerStream()        // Stream from active worker
useStreamingState()      // Current streaming status

// Worker-specific (NEW)
useWorkerTree()          // Full worker hierarchy
useActiveWorker()        // Currently focused worker
useWorkerPath()          // Path from root to active

// Approval (NEW)
usePendingApproval()     // Current approval request
useApprovalHistory()     // Past decisions for patterns

// Manual tools (adapted from Gemini's shell mode)
useManualTools()         // Available tools
useToolCompletion()      // Input completion
```

## Component Structure

```
src/ui/ink/
├── index.ts
├── InkAdapter.tsx           # Implements UIAdapter interface
│
├── contexts/
│   ├── WorkerContext.tsx    # NEW
│   ├── ApprovalContext.tsx  # NEW
│   ├── StreamingContext.tsx
│   ├── ThemeContext.tsx
│   ├── KeypressContext.tsx
│   └── ConfigContext.tsx
│
├── hooks/
│   ├── useWorkerTree.ts     # NEW
│   ├── useApproval.ts       # NEW
│   ├── useManualTools.ts
│   ├── useInputHistory.ts
│   ├── useTerminalSize.ts
│   └── useKeypress.ts
│
├── components/
│   ├── App.tsx
│   ├── Composer.tsx         # Main orchestrator
│   │
│   ├── messages/
│   │   ├── UserMessage.tsx
│   │   ├── AssistantMessage.tsx
│   │   ├── WorkerMessage.tsx      # NEW
│   │   ├── ToolCallMessage.tsx
│   │   ├── ToolResultDisplay.tsx
│   │   └── DiffRenderer.tsx
│   │
│   ├── dialogs/
│   │   ├── ApprovalDialog.tsx     # Enhanced
│   │   ├── ManualToolDialog.tsx   # NEW
│   │   └── SettingsDialog.tsx
│   │
│   ├── shared/
│   │   ├── ScrollableList.tsx
│   │   ├── TextInput.tsx
│   │   ├── RadioSelect.tsx
│   │   └── MaxSizedBox.tsx
│   │
│   └── layout/
│       ├── Header.tsx
│       ├── Footer.tsx             # With worker status
│       ├── DefaultLayout.tsx
│       └── AccessibleLayout.tsx
│
└── themes/
    ├── theme.ts
    ├── semantic-tokens.ts
    ├── default.ts
    ├── dracula.ts
    └── no-color.ts
```

## Migration Path

### Phase 1: Foundation
- Set up context providers
- Implement WorkerContext + ApprovalContext
- Port shared components from Gemini patterns

### Phase 2: Core Components
- Message components with worker support
- ApprovalDialog with worker path display
- Footer with worker status

### Phase 3: Manual Tools
- ManualToolDialog with form rendering
- Completion integration
- `/` command handling

### Phase 4: Polish
- Theming system
- Accessibility layout
- Settings dialog

## UIAdapter Compatibility

The `UIAdapter` interface remains as the contract. `InkAdapter` implements it by delegating to the React context/component system:

```typescript
class InkAdapter implements UIAdapter {
  private app: ReturnType<typeof render>;
  private workerActions: WorkerActions;
  private approvalActions: ApprovalActions;

  async requestApproval(request: UIApprovalRequest): Promise<UIApprovalResult> {
    // Dispatch to ApprovalContext, wait for resolution
    return this.approvalActions.requestApproval(request);
  }

  showProgress(task: TaskProgress): void {
    // Update WorkerContext
    this.workerActions.updateWorker(task);
  }

  onManualToolRequest(handler: ManualToolHandler): void {
    // Register in ManualToolContext
    this.manualToolActions.setHandler(handler);
  }
}
```

## Summary

| Concept | Gemini CLI | golem-forge Adaptation |
|---------|------------|------------------------|
| State management | 13 contexts | 6-8 contexts (add Worker, Approval) |
| Message types | 10+ types | 12+ types (add worker messages) |
| Shell mode | `!` prefix | `/` commands (manual tools) |
| Theming | 3-layer semantic | Same + worker colors |
| Footer | model/sandbox/errors | model/workers/context |
| Dialogs | Focus management | Same + worker path display |
| Streaming | StreamingContext | Same + per-worker streaming |
