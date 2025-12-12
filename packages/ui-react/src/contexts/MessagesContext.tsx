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
  useMemo,
  type ReactNode,
} from 'react';
import { useEventBus } from './EventBusContext.js';
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

export interface MessagesProviderProps {
  children: ReactNode;
}

const MessagesStateContext = createContext<MessageState | null>(null);
const MessagesActionsContext = createContext<{ clear: () => void } | null>(null);

/**
 * Provider that manages message state and subscribes to bus events.
 */
export function MessagesProvider({ children }: MessagesProviderProps) {
  const bus = useEventBus();
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
            event.args,
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
          setState((s) => addWorkerStart(s, event.workerId, event.task, event.model, event.tools));
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

  const actions = useMemo(() => ({ clear }), [clear]);

  return (
    <MessagesActionsContext.Provider value={actions}>
      <MessagesStateContext.Provider value={state}>
        {children}
      </MessagesStateContext.Provider>
    </MessagesActionsContext.Provider>
  );
}

/**
 * Hook to access the full message state.
 */
export function useMessagesState(): MessageState {
  const state = useContext(MessagesStateContext);
  if (!state) {
    throw new Error('useMessagesState must be used within MessagesProvider');
  }
  return state;
}

/**
 * Hook to access message actions (clear, etc.).
 */
export function useMessagesActions() {
  const actions = useContext(MessagesActionsContext);
  if (!actions) {
    throw new Error('useMessagesActions must be used within MessagesProvider');
  }
  return actions;
}
