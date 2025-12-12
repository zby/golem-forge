/**
 * UIState Context
 *
 * Provides UI-level state management for mode, focus, and errors.
 * This is for UI-specific concerns that don't belong in domain contexts.
 *
 * @module @golem-forge/ui-react/contexts/UIStateContext
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

/**
 * UI modes represent the current high-level state of the UI.
 */
export type UIMode =
  | 'idle'        // Waiting for user input
  | 'input'       // User is typing
  | 'processing'  // Model is processing
  | 'approval'    // Waiting for approval decision
  | 'error';      // Error state

/**
 * UI focus areas for keyboard navigation.
 */
export type UIFocus =
  | 'input'       // Text input field
  | 'messages'    // Message list
  | 'approval'    // Approval dialog
  | 'workers';    // Worker tree

interface UIState {
  mode: UIMode;
  focus: UIFocus;
  error: string | null;
  isInputEnabled: boolean;
}

interface UIStateContextValue {
  state: UIState;
  actions: {
    setMode: (mode: UIMode) => void;
    setFocus: (focus: UIFocus) => void;
    setError: (error: string | null) => void;
    setInputEnabled: (enabled: boolean) => void;
    clearError: () => void;
  };
}

const UIStateContext = createContext<UIStateContextValue | null>(null);
const UIStateActionsContext = createContext<UIStateContextValue['actions'] | null>(null);

const initialState: UIState = {
  mode: 'idle',
  focus: 'input',
  error: null,
  isInputEnabled: true,
};

export interface UIStateProviderProps {
  children: ReactNode;
  initialMode?: UIMode;
  initialFocus?: UIFocus;
}

/**
 * Provider that manages UI-level state.
 */
export function UIStateProvider({
  children,
  initialMode = 'idle',
  initialFocus = 'input',
}: UIStateProviderProps) {
  const [state, setState] = useState<UIState>({
    ...initialState,
    mode: initialMode,
    focus: initialFocus,
  });

  const setMode = useCallback((mode: UIMode) => {
    setState((s) => ({ ...s, mode }));
  }, []);

  const setFocus = useCallback((focus: UIFocus) => {
    setState((s) => ({ ...s, focus }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((s) => ({
      ...s,
      error,
      mode: error ? 'error' : s.mode,
    }));
  }, []);

  const setInputEnabled = useCallback((isInputEnabled: boolean) => {
    setState((s) => ({ ...s, isInputEnabled }));
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({
      ...s,
      error: null,
      mode: s.mode === 'error' ? 'idle' : s.mode,
    }));
  }, []);

  const actions = useMemo(
    () => ({
      setMode,
      setFocus,
      setError,
      setInputEnabled,
      clearError,
    }),
    [setMode, setFocus, setError, setInputEnabled, clearError]
  );

  const value: UIStateContextValue = {
    state,
    actions,
  };

  return (
    <UIStateActionsContext.Provider value={actions}>
      <UIStateContext.Provider value={value}>
        {children}
      </UIStateContext.Provider>
    </UIStateActionsContext.Provider>
  );
}

/**
 * Hook to access the full UI state.
 */
export function useUIState(): UIState {
  const ctx = useContext(UIStateContext);
  if (!ctx) {
    throw new Error('useUIState must be used within UIStateProvider');
  }
  return ctx.state;
}

/**
 * Hook to access the current UI mode.
 */
export function useUIMode(): UIMode {
  const ctx = useContext(UIStateContext);
  if (!ctx) {
    throw new Error('useUIMode must be used within UIStateProvider');
  }
  return ctx.state.mode;
}

/**
 * Hook to access the current UI focus.
 */
export function useUIFocus(): UIFocus {
  const ctx = useContext(UIStateContext);
  if (!ctx) {
    throw new Error('useUIFocus must be used within UIStateProvider');
  }
  return ctx.state.focus;
}

/**
 * Hook to access UI errors.
 */
export function useUIError(): string | null {
  const ctx = useContext(UIStateContext);
  if (!ctx) {
    throw new Error('useUIError must be used within UIStateProvider');
  }
  return ctx.state.error;
}

/**
 * Hook to check if input is enabled.
 */
export function useIsInputEnabled(): boolean {
  const ctx = useContext(UIStateContext);
  if (!ctx) {
    throw new Error('useIsInputEnabled must be used within UIStateProvider');
  }
  return ctx.state.isInputEnabled;
}

/**
 * Hook to access UI state actions.
 */
export function useUIStateActions() {
  const actions = useContext(UIStateActionsContext);
  if (!actions) {
    throw new Error('useUIStateActions must be used within UIStateProvider');
  }
  return actions;
}
