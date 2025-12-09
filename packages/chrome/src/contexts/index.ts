/**
 * Chrome Extension Contexts
 *
 * React contexts for Chrome extension-specific state management.
 *
 * @module @golem-forge/chrome/contexts
 */

export {
  ChromeUIStateProvider,
  useChromeUIContext,
  useChromeUIState,
  useChromeUIActions,
  useChromeAdapter,
  useSelectedProgramId,
  useActiveTab,
  useHasAPIKeys,
  useChromeIsLoading,
  useChromeIsRunning,
  type ChromeTab,
  type ChromeUIState,
  type ChromeUIActions,
  type ChromeUIContextValue,
  type ChromeUIStateProviderProps,
} from './ChromeUIStateContext.js';
