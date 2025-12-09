/**
 * Ink UI Module for golem-forge CLI
 *
 * Provides a rich terminal UI using Ink (React for CLI).
 * Uses shared state management from @golem-forge/ui-react.
 *
 * @module @golem-forge/cli/ui/ink
 */

// ============================================================================
// Adapter
// ============================================================================

export { InkAdapter, createInkAdapter, type InkAdapterOptions } from "./InkAdapter.js";

// ============================================================================
// Components
// ============================================================================

export {
  // Layout
  Header,
  Footer,
  InputPrompt,
  ContinuePrompt,
  MainContent,
  // Messages
  UserMessage,
  AssistantMessage,
  SystemMessage,
  StatusMessage,
  WorkerStartMessage,
  WorkerCompleteMessage,
  // Dialogs
  ApprovalDialog,
  // Shared
  ToolResultDisplay,
  TaskProgressDisplay,
  WorkerTreeDisplay,
  DiffView,
  DiffSummaryList,
  // App
  App,
  Composer,
  // Types
  type HeaderProps,
  type FooterProps,
  type InputPromptProps,
  type ContinuePromptProps,
  type UserMessageProps,
  type AssistantMessageProps,
  type SystemMessageProps,
  type StatusMessageProps,
  type WorkerStartMessageProps,
  type WorkerCompleteMessageProps,
  type ApprovalDialogProps,
  type ApprovalResult,
  type ToolResultDisplayProps,
  type TaskProgressDisplayProps,
  type DiffViewProps,
  type DiffContent,
  type DiffSummary,
  type DiffSummaryListProps,
  type AppProps,
} from "./components/index.js";

// ============================================================================
// Themes
// ============================================================================

export {
  defaultTheme,
  type Theme,
  type ColorPalette,
  type SemanticColors,
  type InkColor,
} from "./themes/index.js";

// ============================================================================
// Hooks
// ============================================================================

export {
  useTerminalSize,
  useIsNarrow,
  useAvailableWidth,
  useKeyCommands,
  matchesBinding,
  matchCommand,
  approvalCommands,
  navigationCommands,
  type TerminalSize,
  type KeyBinding,
  type KeyCommand,
} from "./hooks/index.js";

// ============================================================================
// Contexts
// ============================================================================

export {
  ThemeProvider,
  useTheme,
  useThemeActions,
  type ThemeProviderProps,
} from "./contexts/index.js";

// Re-export ui-react hooks for convenience
export {
  EventBusProvider,
  useEventBus,
  MessagesProvider,
  useMessagesState,
  useMessagesActions,
  ApprovalProvider,
  useApprovalState,
  usePendingApproval,
  useApprovalActions,
  WorkerProvider,
  useWorkerState,
  useActiveWorker,
  useWorkerPath,
  useWorkersInOrder,
  useWorkerActions,
  UIStateProvider,
  useUIState,
  useUIMode,
  useUIFocus,
  useUIError,
  useIsInputEnabled,
  useUIStateActions,
  UIProvider,
  useMessages,
  useConversationMessages,
  useStreaming,
  useLastMessage,
  useRecentMessages,
  useIsAwaitingResponse,
  useCurrentDisplayContent,
  useMessageStats,
  useApprovalStats,
  useHasPendingApproval,
  useSessionApprovals,
  useAlwaysApprovals,
  useApprovalHistory,
  useIsAutoApproved,
  useWorkerList,
  useWorkersAtDepth,
  useWorkerChildren,
  useWorkerStats,
  useHasActiveWorker,
  useRootWorkerId,
} from "@golem-forge/ui-react";
