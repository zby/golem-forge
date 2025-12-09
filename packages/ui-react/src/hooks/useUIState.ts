/**
 * UIState Hooks
 *
 * Re-exports from UIStateContext for convenience.
 *
 * @module @golem-forge/ui-react/hooks/useUIState
 */

export {
  useUIState,
  useUIMode,
  useUIFocus,
  useUIError,
  useIsInputEnabled,
  useUIStateActions,
} from '../contexts/UIStateContext.js';

export type { UIMode, UIFocus } from '../contexts/UIStateContext.js';
