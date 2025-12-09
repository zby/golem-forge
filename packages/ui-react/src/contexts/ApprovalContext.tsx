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
  type ReactNode,
} from 'react';
import type { UIEventBus, ApprovalRequiredEvent } from '@golem-forge/core';
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
  actions: {
    respond: (approved: ApprovalResultData) => void;
    addSession: (pattern: ApprovalPattern) => void;
    addAlways: (pattern: ApprovalPattern) => void;
    removeAlways: (pattern: ApprovalPattern) => void;
    clearSession: () => void;
  };
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

export interface ApprovalProviderProps {
  children: ReactNode;
  bus: UIEventBus;
  initialAlwaysApprovals?: ApprovalPattern[];
}

/**
 * Provider that manages approval state and subscribes to bus events.
 */
export function ApprovalProvider({
  children,
  bus,
  initialAlwaysApprovals = [],
}: ApprovalProviderProps) {
  const [state, setState] = useState(() =>
    createApprovalState(initialAlwaysApprovals)
  );
  const [pending, setPending] = useState<PendingApproval | null>(null);

  // Subscribe to approval required events
  useEffect(() => {
    const unsub = bus.on('approvalRequired', (event) => {
      // Check if auto-approved
      const request = {
        type: event.type,
        description: event.description,
        risk: event.risk,
      };

      if (isAutoApproved(state, request)) {
        // Auto-approve immediately
        bus.emit('approvalResponse', {
          requestId: event.requestId,
          approved: true,
        });
        return;
      }

      // Set as pending
      setPending({
        ...event,
        timestamp: Date.now(),
      });
    });

    return unsub;
  }, [bus, state]);

  // Respond to pending approval
  const respond = useCallback(
    (result: ApprovalResultData) => {
      if (!pending) return;

      const request = {
        type: pending.type,
        description: pending.description,
        risk: pending.risk,
      };

      // Update state with approval decision
      setState((s) => addApproval(s, request, result));

      // Emit response to bus with full approval semantics
      // Preserve 'session'|'always' discriminators for the runtime
      bus.emit('approvalResponse', {
        requestId: pending.requestId,
        approved: result.approved,
        // Only include reason for denied results
        ...(result.approved === false && result.reason ? { reason: result.reason } : {}),
      });

      // Clear pending
      setPending(null);
    },
    [bus, pending]
  );

  const addSession = useCallback((pattern: ApprovalPattern) => {
    setState((s) => addSessionApproval(s, pattern));
  }, []);

  const addAlways = useCallback((pattern: ApprovalPattern) => {
    setState((s) => addAlwaysApproval(s, pattern));
  }, []);

  const removeAlwaysFn = useCallback((pattern: ApprovalPattern) => {
    setState((s) => removeAlwaysApproval(s, pattern));
  }, []);

  const clearSession = useCallback(() => {
    setState((s) => clearSessionApprovals(s));
  }, []);

  const value: ApprovalContextValue = {
    state,
    pending,
    actions: {
      respond,
      addSession,
      addAlways,
      removeAlways: removeAlwaysFn,
      clearSession,
    },
  };

  return (
    <ApprovalContext.Provider value={value}>
      {children}
    </ApprovalContext.Provider>
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
  const ctx = useContext(ApprovalContext);
  if (!ctx) {
    throw new Error('useApprovalActions must be used within ApprovalProvider');
  }
  return ctx.actions;
}
