/**
 * Component exports for Ink UI
 */

// Layout components
export { Header, type HeaderProps } from "./layout/index.js";
export { Footer, type FooterProps } from "./layout/index.js";
export { InputPrompt, ContinuePrompt, type InputPromptProps, type ContinuePromptProps } from "./layout/index.js";
export { MainContent } from "./layout/index.js";

// Message components
export {
  UserMessage,
  AssistantMessage,
  SystemMessage,
  StatusMessage,
  WorkerStartMessage,
  WorkerCompleteMessage,
  type UserMessageProps,
  type AssistantMessageProps,
  type SystemMessageProps,
  type StatusMessageProps,
  type WorkerStartMessageProps,
  type WorkerCompleteMessageProps,
} from "./messages/index.js";

// Dialog components
export { ApprovalDialog, type ApprovalDialogProps, type ApprovalResult } from "./dialogs/index.js";

// Shared components
export {
  ToolResultDisplay,
  TaskProgressDisplay,
  WorkerTreeDisplay,
  DiffView,
  DiffSummaryList,
  type ToolResultDisplayProps,
  type TaskProgressDisplayProps,
  type DiffViewProps,
  type DiffContent,
  type DiffSummary,
  type DiffSummaryListProps,
} from "./shared/index.js";

// Main app components
export { App, type AppProps } from "./App.js";
export { Composer } from "./Composer.js";
