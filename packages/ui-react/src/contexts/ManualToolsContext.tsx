/**
 * Manual Tools Context
 *
 * Provides manual tools state management with event bus integration.
 * Tracks available manual tools and provides a way to invoke them.
 *
 * @module @golem-forge/ui-react/contexts/ManualToolsContext
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import type { ManualToolInfoEvent } from '@golem-forge/core';
import { useEventBus } from './EventBusContext.js';

interface ManualToolsContextValue {
  /** Currently available manual tools */
  tools: ManualToolInfoEvent[];
  /** Whether there are any available tools */
  hasTools: boolean;
  actions: {
    /** Invoke a manual tool by name with arguments */
    invoke: (toolName: string, args: Record<string, unknown>) => void;
    /** Clear all available tools (e.g., when worker ends) */
    clear: () => void;
  };
}

const ManualToolsContext = createContext<ManualToolsContextValue | null>(null);
const ManualToolsActionsContext = createContext<ManualToolsContextValue['actions'] | null>(null);

export interface ManualToolsProviderProps {
  children: ReactNode;
}

/**
 * Provider that manages manual tools state and subscribes to bus events.
 */
export function ManualToolsProvider({ children }: ManualToolsProviderProps) {
  const bus = useEventBus();
  const [tools, setTools] = useState<ManualToolInfoEvent[]>([]);

  // Subscribe to manual tools events
  useEffect(() => {
    const unsubscribes = [
      // Handle manual tools available event
      bus.on('manualToolsAvailable', (event) => {
        setTools(event.tools);
      }),

      // Clear tools when session ends
      bus.on('sessionEnd', () => {
        setTools([]);
      }),
    ];

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [bus]);

  // Invoke a manual tool
  const invoke = useCallback(
    (toolName: string, args: Record<string, unknown>) => {
      bus.emit('manualToolInvoke', { toolName, args });
    },
    [bus]
  );

  // Clear all tools
  const clear = useCallback(() => {
    setTools([]);
  }, []);

  const actions = useMemo(() => ({ invoke, clear }), [invoke, clear]);

  const value: ManualToolsContextValue = {
    tools,
    hasTools: tools.length > 0,
    actions,
  };

  return (
    <ManualToolsActionsContext.Provider value={actions}>
      <ManualToolsContext.Provider value={value}>
        {children}
      </ManualToolsContext.Provider>
    </ManualToolsActionsContext.Provider>
  );
}

/**
 * Hook to access available manual tools.
 */
export function useManualTools(): ManualToolInfoEvent[] {
  const ctx = useContext(ManualToolsContext);
  if (!ctx) {
    throw new Error('useManualTools must be used within ManualToolsProvider');
  }
  return ctx.tools;
}

/**
 * Hook to check if any manual tools are available.
 */
export function useHasManualTools(): boolean {
  const ctx = useContext(ManualToolsContext);
  if (!ctx) {
    throw new Error('useHasManualTools must be used within ManualToolsProvider');
  }
  return ctx.hasTools;
}

/**
 * Hook to access manual tools actions.
 */
export function useManualToolsActions() {
  const actions = useContext(ManualToolsActionsContext);
  if (!actions) {
    throw new Error('useManualToolsActions must be used within ManualToolsProvider');
  }
  return actions;
}
