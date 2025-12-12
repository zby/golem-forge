/**
 * Approval Context
 *
 * Provides approval state management with event bus integration.
 * Handles pending approvals, auto-approval patterns, and approval history.
 *
 * @module @golem-forge/ui-react/contexts/ApprovalContext
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { ApprovalRequiredEvent } from '@golem-forge/core';
import { useEventBus } from './EventBusContext.js';
import {
  type ApprovalState,
  type ApprovalResultData,
  type ApprovalPattern,
  createApprovalState,
  addApproval,
  addSessionApproval,
  addAlwaysApproval,
  clearSessionApprovals,
  removeAlwaysApproval,
  isAutoApproved,
} from '../state/approval-state.js';

interface PendingApproval extends ApprovalRequiredEvent {
  timestamp: number;
}

interface ApprovalContextValue {
  state: ApprovalState;
  pending: PendingApproval | null;
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);
const ApprovalActionsContext = createContext<{
  respond: (approved: ApprovalResultData) => void;
  addSession: (pattern: ApprovalPattern) => void;
  addAlways: (pattern: ApprovalPattern) => void;
  removeAlways: (pattern: ApprovalPattern) => void;
  clearSession: () => void;
} | null>(null);

export interface ApprovalProviderProps {
  children: ReactNode;
  initialAlwaysApprovals?: ApprovalPattern[];
}

/**
 * Provider that manages approval state and subscribes to bus events.
 */
export function ApprovalProvider({
  children,
  initialAlwaysApprovals = [],
}: ApprovalProviderProps) {
  const bus = useEventBus();
  const [state, setState] = useState(() =>
    createApprovalState(initialAlwaysApprovals)
  );
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const stateRef = useRef<ApprovalState>(state);
  const pendingRef = useRef<PendingApproval | null>(pending);
  const respondRef = useRef<(approved: ApprovalResultData) => void>(() => {
    throw new Error('Approval actions not initialized yet');
  });
  const addSessionRef = useRef<(pattern: ApprovalPattern) => void>(() => {
    throw new Error('Approval actions not initialized yet');
  });
  const addAlwaysRef = useRef<(pattern: ApprovalPattern) => void>(() => {
    throw new Error('Approval actions not initialized yet');
  });
  const removeAlwaysRef = useRef<(pattern: ApprovalPattern) => void>(() => {
    throw new Error('Approval actions not initialized yet');
  });
  const clearSessionRef = useRef<() => void>(() => {
    throw new Error('Approval actions not initialized yet');
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Subscribe to approval required events
  useEffect(() => {
    const unsub = bus.on('approvalRequired', (event) => {
      // Check if auto-approved
      const request = {
        type: event.type,
        description: event.description,
        risk: event.risk,
      };

      if (isAutoApproved(stateRef.current, request)) {
        // Auto-approve immediately
        bus.emit('approvalResponse', {
          requestId: event.requestId,
          approved: true,
        });
        return;
      }

      // Set as pending (ignore concurrent approvals; core is expected to serialize approvals)
      setPending((current) => {
        if (current !== null) {
          console.error(
            `Invariant violation: received approvalRequired while an approval is already pending (pendingRequestId=${current.requestId}, newRequestId=${event.requestId}). ` +
            'Core is expected to serialize approvals.'
          );
          return current;
        }

        const nextPending: PendingApproval = {
          ...event,
          timestamp: Date.now(),
        };
        pendingRef.current = nextPending;
        return nextPending;
      });
    });

    return unsub;
  }, [bus]);

  // Respond to pending approval
  const respond = useCallback((result: ApprovalResultData) => {
    const currentPending = pendingRef.current;
    if (!currentPending) {
      throw new Error('No pending approval to respond to');
    }

    const request = {
      type: currentPending.type,
      description: currentPending.description,
      risk: currentPending.risk,
    };

    // Update state with approval decision
    setState((s) => {
      const next = addApproval(s, request, result);
      stateRef.current = next;
      return next;
    });

    // Emit response to bus with full approval semantics
    // Preserve 'session'|'always' discriminators for the runtime
    bus.emit('approvalResponse', {
      requestId: currentPending.requestId,
      approved: result.approved,
      // Only include reason for denied results
      ...(result.approved === false && result.reason ? { reason: result.reason } : {}),
    });

    // Clear pending
    pendingRef.current = null;
    setPending(null);
  }, [bus]);

  const addSession = useCallback((pattern: ApprovalPattern) => {
    setState((s) => {
      const next = addSessionApproval(s, pattern);
      stateRef.current = next;
      return next;
    });
  }, []);

  const addAlways = useCallback((pattern: ApprovalPattern) => {
    setState((s) => {
      const next = addAlwaysApproval(s, pattern);
      stateRef.current = next;
      return next;
    });
  }, []);

  const removeAlwaysFn = useCallback((pattern: ApprovalPattern) => {
    setState((s) => {
      const next = removeAlwaysApproval(s, pattern);
      stateRef.current = next;
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    setState((s) => {
      const next = clearSessionApprovals(s);
      stateRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    respondRef.current = respond;
    addSessionRef.current = addSession;
    addAlwaysRef.current = addAlways;
    removeAlwaysRef.current = removeAlwaysFn;
    clearSessionRef.current = clearSession;
  }, [respond, addSession, addAlways, removeAlwaysFn, clearSession]);

  const actions = useMemo(() => {
    return {
      respond: (result: ApprovalResultData) => respondRef.current(result),
      addSession: (pattern: ApprovalPattern) => addSessionRef.current(pattern),
      addAlways: (pattern: ApprovalPattern) => addAlwaysRef.current(pattern),
      removeAlways: (pattern: ApprovalPattern) => removeAlwaysRef.current(pattern),
      clearSession: () => clearSessionRef.current(),
    };
  }, []);

  const value: ApprovalContextValue = { state, pending };

  return (
    <ApprovalActionsContext.Provider value={actions}>
      <ApprovalContext.Provider value={value}>
        {children}
      </ApprovalContext.Provider>
    </ApprovalActionsContext.Provider>
  );
}

/**
 * Hook to access the full approval state.
 */
export function useApprovalState(): ApprovalState {
  const ctx = useContext(ApprovalContext);
  if (!ctx) {
    throw new Error('useApprovalState must be used within ApprovalProvider');
  }
  return ctx.state;
}

/**
 * Hook to access the pending approval request.
 */
export function usePendingApproval(): PendingApproval | null {
  const ctx = useContext(ApprovalContext);
  if (!ctx) {
    throw new Error('usePendingApproval must be used within ApprovalProvider');
  }
  return ctx.pending;
}

/**
 * Hook to access approval actions.
 */
export function useApprovalActions() {
  const actions = useContext(ApprovalActionsContext);
  if (!actions) {
    throw new Error('useApprovalActions must be used within ApprovalProvider');
  }
  return actions;
}
