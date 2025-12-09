/**
 * Approval Hooks
 *
 * Convenience hooks for accessing approval state and derived values.
 *
 * @module @golem-forge/ui-react/hooks/useApproval
 */

import {
  useApprovalState,
  usePendingApproval,
  useApprovalActions,
} from '../contexts/ApprovalContext.js';
import { getApprovalStats, isAutoApproved } from '../state/approval-state.js';
import type { ApprovalRequestData } from '../state/approval-state.js';

// Re-export context hooks
export { useApprovalState, usePendingApproval, useApprovalActions };

/**
 * Hook to get approval statistics.
 */
export function useApprovalStats() {
  const state = useApprovalState();
  return getApprovalStats(state);
}

/**
 * Hook to check if there's a pending approval.
 */
export function useHasPendingApproval(): boolean {
  const pending = usePendingApproval();
  return pending !== null;
}

/**
 * Hook to get session approval patterns.
 */
export function useSessionApprovals() {
  const state = useApprovalState();
  return state.sessionApprovals;
}

/**
 * Hook to get always approval patterns.
 */
export function useAlwaysApprovals() {
  const state = useApprovalState();
  return state.alwaysApprovals;
}

/**
 * Hook to get approval history.
 */
export function useApprovalHistory() {
  const state = useApprovalState();
  return state.history;
}

/**
 * Hook to check if a request would be auto-approved.
 */
export function useIsAutoApproved(request: ApprovalRequestData): boolean {
  const state = useApprovalState();
  return isAutoApproved(state, request);
}
