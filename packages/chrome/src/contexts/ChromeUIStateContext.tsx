/**
 * Chrome UI State Context
 *
 * Context for Chrome extension-specific UI state that isn't part of
 * the shared @golem-forge/ui-react contexts.
 *
 * This includes:
 * - Selected program ID
 * - Active tab (chat/settings)
 * - API key status
 * - Other Chrome-specific UI state
 *
 * @module @golem-forge/chrome/contexts/ChromeUIStateContext
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { settingsManager } from '../storage/settings-manager.js';
import type { ChromeAdapter } from '../services/chrome-adapter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Active tab in the sidepanel.
 */
export type ChromeTab = 'chat' | 'settings';

/**
 * Chrome-specific UI state.
 */
export interface ChromeUIState {
  /** Currently selected program ID */
  selectedProgramId: string | null;
  /** Active tab (chat or settings) */
  activeTab: ChromeTab;
  /** Whether API keys have been configured */
  hasAPIKeys: boolean;
  /** Whether the app is loading */
  isLoading: boolean;
  /** Whether a worker is currently running */
  isRunning: boolean;
}

/**
 * Chrome UI state actions.
 */
export interface ChromeUIActions {
  /** Select a program */
  selectProgram: (programId: string | null) => void;
  /** Set the active tab */
  setActiveTab: (tab: ChromeTab) => void;
  /** Set the loading state */
  setLoading: (loading: boolean) => void;
  /** Set the running state */
  setRunning: (running: boolean) => void;
  /** Refresh API key status */
  refreshAPIKeyStatus: () => Promise<void>;
}

/**
 * Context value type.
 */
export interface ChromeUIContextValue {
  state: ChromeUIState;
  actions: ChromeUIActions;
  /** The ChromeAdapter instance (if provided) */
  adapter: ChromeAdapter | null;
}

// ============================================================================
// Context
// ============================================================================

const ChromeUIContext = createContext<ChromeUIContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface ChromeUIStateProviderProps {
  children: ReactNode;
  /** The ChromeAdapter instance for running workers */
  adapter?: ChromeAdapter;
  /** Initial program ID */
  initialProgramId?: string;
  /** Initial tab */
  initialTab?: ChromeTab;
}

/**
 * Provider for Chrome-specific UI state.
 *
 * @example
 * ```tsx
 * import { ChromeUIStateProvider } from './contexts/ChromeUIStateContext';
 *
 * function App() {
 *   return (
 *     <ChromeUIStateProvider adapter={adapter} initialProgramId="my-program">
 *       <SidepanelContent />
 *     </ChromeUIStateProvider>
 *   );
 * }
 * ```
 */
export function ChromeUIStateProvider({
  children,
  adapter,
  initialProgramId,
  initialTab = 'chat',
}: ChromeUIStateProviderProps) {
  const [state, setState] = useState<ChromeUIState>({
    selectedProgramId: initialProgramId ?? null,
    activeTab: initialTab,
    hasAPIKeys: false,
    isLoading: true,
    isRunning: false,
  });

  // Check for API keys on mount
  useEffect(() => {
    refreshAPIKeyStatus();
  }, []);

  // Check for pending tab from popup navigation
  useEffect(() => {
    async function checkPendingTab() {
      const result = await chrome.storage.local.get('pendingTab');
      if (result.pendingTab) {
        if (result.pendingTab === 'settings' || result.pendingTab === 'chat') {
          setState(prev => ({ ...prev, activeTab: result.pendingTab }));
        }
        await chrome.storage.local.remove('pendingTab');
      }
    }
    checkPendingTab();
  }, []);

  // Refresh API key status when tab changes (in case user just added keys)
  useEffect(() => {
    refreshAPIKeyStatus();
  }, [state.activeTab]);

  const refreshAPIKeyStatus = useCallback(async () => {
    const apiKeys = await settingsManager.getAPIKeys();
    setState(prev => ({
      ...prev,
      hasAPIKeys: apiKeys.length > 0,
      isLoading: false,
    }));
  }, []);

  const selectProgram = useCallback((programId: string | null) => {
    setState(prev => ({ ...prev, selectedProgramId: programId }));
  }, []);

  const setActiveTab = useCallback((tab: ChromeTab) => {
    setState(prev => ({ ...prev, activeTab: tab }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  const setRunning = useCallback((running: boolean) => {
    setState(prev => ({ ...prev, isRunning: running }));
  }, []);

  const actions: ChromeUIActions = {
    selectProgram,
    setActiveTab,
    setLoading,
    setRunning,
    refreshAPIKeyStatus,
  };

  const value: ChromeUIContextValue = {
    state,
    actions,
    adapter: adapter ?? null,
  };

  return (
    <ChromeUIContext.Provider value={value}>
      {children}
    </ChromeUIContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Access the full Chrome UI context.
 * @throws Error if used outside of ChromeUIStateProvider
 */
export function useChromeUIContext(): ChromeUIContextValue {
  const context = useContext(ChromeUIContext);
  if (!context) {
    throw new Error('useChromeUIContext must be used within ChromeUIStateProvider');
  }
  return context;
}

/**
 * Access the Chrome UI state.
 */
export function useChromeUIState(): ChromeUIState {
  return useChromeUIContext().state;
}

/**
 * Access the Chrome UI actions.
 */
export function useChromeUIActions(): ChromeUIActions {
  return useChromeUIContext().actions;
}

/**
 * Access the ChromeAdapter instance.
 */
export function useChromeAdapter(): ChromeAdapter | null {
  return useChromeUIContext().adapter;
}

/**
 * Access the selected program ID.
 */
export function useSelectedProgramId(): string | null {
  return useChromeUIState().selectedProgramId;
}

/**
 * Access the active tab.
 */
export function useActiveTab(): ChromeTab {
  return useChromeUIState().activeTab;
}

/**
 * Check if API keys are configured.
 */
export function useHasAPIKeys(): boolean {
  return useChromeUIState().hasAPIKeys;
}

/**
 * Check if the app is loading.
 */
export function useChromeIsLoading(): boolean {
  return useChromeUIState().isLoading;
}

/**
 * Check if a worker is running.
 */
export function useChromeIsRunning(): boolean {
  return useChromeUIState().isRunning;
}
