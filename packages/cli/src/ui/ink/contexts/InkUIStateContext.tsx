/**
 * Extended UI State context for Ink-specific state
 *
 * Adds fields not in the base ui-react UIStateContext:
 * - modelName: Current model name for footer display
 * - contextUsage: Context window usage percentage
 * - inputPrompt: Active input prompt state
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";

/**
 * Input prompt state for collecting user input
 */
export interface InputPromptState {
  prompt: string;
  resolve: (value: string) => void;
}

/**
 * Extended UI state for Ink
 */
export interface InkUIState {
  /** Current model name for footer display */
  modelName: string;
  /** Context window usage percentage (0-100) */
  contextUsage: number;
  /** Active input prompt, if any */
  inputPrompt: InputPromptState | null;
}

interface InkUIStateContextValue {
  state: InkUIState;
  actions: {
    setModelName: (name: string) => void;
    setContextUsage: (percentage: number) => void;
    requestInput: (prompt: string) => Promise<string>;
    clearInputPrompt: () => void;
  };
}

const InkUIStateContext = createContext<InkUIStateContextValue | null>(null);

export interface InkUIStateProviderProps {
  children: React.ReactNode;
  initialModelName?: string;
  initialContextUsage?: number;
}

/**
 * Provider for Ink-specific UI state
 */
export function InkUIStateProvider({
  children,
  initialModelName = "claude-sonnet",
  initialContextUsage = 0,
}: InkUIStateProviderProps): React.ReactElement {
  const [state, setState] = useState<InkUIState>({
    modelName: initialModelName,
    contextUsage: initialContextUsage,
    inputPrompt: null,
  });

  const setModelName = useCallback((modelName: string) => {
    setState((s) => ({ ...s, modelName }));
  }, []);

  const setContextUsage = useCallback((contextUsage: number) => {
    setState((s) => ({ ...s, contextUsage }));
  }, []);

  const requestInput = useCallback((prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      setState((s) => ({
        ...s,
        inputPrompt: { prompt, resolve },
      }));
    });
  }, []);

  const clearInputPrompt = useCallback(() => {
    setState((s) => ({ ...s, inputPrompt: null }));
  }, []);

  const value = useMemo<InkUIStateContextValue>(
    () => ({
      state,
      actions: {
        setModelName,
        setContextUsage,
        requestInput,
        clearInputPrompt,
      },
    }),
    [state, setModelName, setContextUsage, requestInput, clearInputPrompt]
  );

  return (
    <InkUIStateContext.Provider value={value}>
      {children}
    </InkUIStateContext.Provider>
  );
}

/**
 * Hook to access Ink-specific UI state
 */
export function useInkUIState(): InkUIState {
  const ctx = useContext(InkUIStateContext);
  if (!ctx) {
    throw new Error("useInkUIState must be used within InkUIStateProvider");
  }
  return ctx.state;
}

/**
 * Hook to access Ink-specific UI state actions
 */
export function useInkUIStateActions() {
  const ctx = useContext(InkUIStateContext);
  if (!ctx) {
    throw new Error("useInkUIStateActions must be used within InkUIStateProvider");
  }
  return ctx.actions;
}
