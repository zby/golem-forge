/**
 * Messages Context
 *
 * Provides message state management with event bus integration.
 * Handles conversation history, tool results, status updates, and streaming.
 *
 * @module @golem-forge/ui-react/contexts/MessagesContext
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { UIEventBus } from '@golem-forge/core';
import {
  type MessageState,
  createMessageState,
  addMessage,
  addToolResultFromEvent,
  addStatus,
  addWorkerStart,
  addWorkerComplete,
  updateStreamingFromEvent,
  clearMessages,
} from '../state/message-state.js';

interface MessagesContextValue {
  state: MessageState;
  actions: {
    clear: () => void;
  };
}

const MessagesContext = createContext<MessagesContextValue | null>(null);

export interface MessagesProviderProps {
  children: ReactNode;
  bus: UIEventBus;
}

/**
 * Provider that manages message state and subscribes to bus events.
 */
export function MessagesProvider({ children, bus }: MessagesProviderProps) {
  const [state, setState] = useState(createMessageState);

  // Subscribe to events
  useEffect(() => {
    const unsubscribes = [
      // Handle message events
      bus.on('message', (event) => {
        setState((s) => addMessage(s, event.message));
      }),

      // Handle streaming events
      bus.on('streaming', (event) => {
        setState((s) =>
          updateStreamingFromEvent(s, event.requestId, event.delta, event.done)
        );
      }),

      // Handle tool result events
      bus.on('toolResult', (event) => {
        setState((s) =>
          addToolResultFromEvent(
            s,
            event.toolCallId,
            event.toolName,
            event.status,
            event.durationMs,
            event.value,
            event.error
          )
        );
      }),

      // Handle status events
      bus.on('status', (event) => {
        setState((s) => addStatus(s, { type: event.type, message: event.message }));
      }),

      // Handle worker update events
      bus.on('workerUpdate', (event) => {
        if (event.status === 'running') {
          setState((s) => addWorkerStart(s, event.workerId, event.task));
        } else if (event.status === 'complete') {
          setState((s) => addWorkerComplete(s, event.workerId, true));
        } else if (event.status === 'error') {
          setState((s) => addWorkerComplete(s, event.workerId, false));
        }
      }),
    ];

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [bus]);

  const clear = useCallback(() => {
    setState(clearMessages);
  }, []);

  const value: MessagesContextValue = {
    state,
    actions: { clear },
  };

  return (
    <MessagesContext.Provider value={value}>
      {children}
    </MessagesContext.Provider>
  );
}

/**
 * Hook to access the full message state.
 */
export function useMessagesState(): MessageState {
  const ctx = useContext(MessagesContext);
  if (!ctx) {
    throw new Error('useMessagesState must be used within MessagesProvider');
  }
  return ctx.state;
}

/**
 * Hook to access message actions (clear, etc.).
 */
export function useMessagesActions() {
  const ctx = useContext(MessagesContext);
  if (!ctx) {
    throw new Error('useMessagesActions must be used within MessagesProvider');
  }
  return ctx.actions;
}
