/**
 * Approval State Management
 *
 * Platform-agnostic state management for approval patterns and history.
 * Pure functions that return new state objects for immutability.
 *
 * @module @golem-forge/core/approval-state
 */

import type { ApprovalRisk, ApprovalType } from './ui-events.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Pattern for matching approval requests.
 * Used for "session" and "always" auto-approval.
 */
export interface ApprovalPattern {
  /** Type of operation to match */
  type: ApprovalType;
  /** Pattern to match against description (substring match) */
  descriptionPattern?: string;
  /** Maximum risk level to auto-approve */
  maxRisk?: ApprovalRisk;
}

/**
 * Request data for approval (UI-agnostic subset)
 */
export interface ApprovalRequestData {
  type: ApprovalType;
  description: string;
  risk: ApprovalRisk;
}

/**
 * Result data for approval
 */
export type ApprovalResultData =
  | { approved: true }
  | { approved: false; reason?: string }
  | { approved: 'always' }
  | { approved: 'session' };

/**
 * Entry in approval history
 */
export interface ApprovalHistoryEntry {
  request: ApprovalRequestData;
  result: ApprovalResultData;
  timestamp: number;
}

/**
 * Core approval state (platform-agnostic)
 */
export interface ApprovalState {
  /** Patterns auto-approved for this session only */
  sessionApprovals: ApprovalPattern[];
  /** Patterns always auto-approved (persisted) */
  alwaysApprovals: ApprovalPattern[];
  /** History of approval decisions */
  history: ApprovalHistoryEntry[];
}

/**
 * Statistics about approval state
 */
export interface ApprovalStats {
  sessionCount: number;
  alwaysCount: number;
  historyCount: number;
  approvedCount: number;
  deniedCount: number;
}

// ============================================================================
// Risk Level Utilities
// ============================================================================

const RISK_ORDER: Record<ApprovalRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Compare risk levels.
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareRisk(a: ApprovalRisk, b: ApprovalRisk): number {
  return RISK_ORDER[a] - RISK_ORDER[b];
}

/**
 * Check if a risk level is at or below a maximum.
 */
export function isRiskAtOrBelow(risk: ApprovalRisk, maxRisk: ApprovalRisk): boolean {
  return compareRisk(risk, maxRisk) <= 0;
}

// ============================================================================
// State Creation
// ============================================================================

/**
 * Create initial approval state.
 *
 * @param initialAlwaysApprovals - Pre-configured patterns to always auto-approve
 * @returns New approval state
 */
export function createApprovalState(
  initialAlwaysApprovals: ApprovalPattern[] = []
): ApprovalState {
  return {
    sessionApprovals: [],
    alwaysApprovals: [...initialAlwaysApprovals],
    history: [],
  };
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Check if a request matches an approval pattern.
 */
export function matchesApprovalPattern(
  request: ApprovalRequestData,
  pattern: ApprovalPattern
): boolean {
  // Type must match
  if (request.type !== pattern.type) {
    return false;
  }

  // Description pattern must match (if specified)
  if (pattern.descriptionPattern) {
    if (!request.description.includes(pattern.descriptionPattern)) {
      return false;
    }
  }

  // Risk must be at or below max (if specified)
  if (pattern.maxRisk) {
    if (!isRiskAtOrBelow(request.risk, pattern.maxRisk)) {
      return false;
    }
  }

  return true;
}

/**
 * Find the first matching pattern in state.
 * Checks session approvals first, then always approvals.
 */
export function findMatchingPattern(
  state: ApprovalState,
  request: ApprovalRequestData
): { pattern: ApprovalPattern; scope: 'session' | 'always' } | undefined {
  // Check session approvals first
  for (const pattern of state.sessionApprovals) {
    if (matchesApprovalPattern(request, pattern)) {
      return { pattern, scope: 'session' };
    }
  }

  // Check always approvals
  for (const pattern of state.alwaysApprovals) {
    if (matchesApprovalPattern(request, pattern)) {
      return { pattern, scope: 'always' };
    }
  }

  return undefined;
}

/**
 * Check if a request is auto-approved by existing patterns.
 */
export function isAutoApproved(
  state: ApprovalState,
  request: ApprovalRequestData
): boolean {
  return findMatchingPattern(state, request) !== undefined;
}

// ============================================================================
// Pattern Creation
// ============================================================================

/**
 * Create an approval pattern from a request.
 *
 * @param request - The request to create a pattern from
 * @param includeDescription - Whether to include description in pattern
 * @returns New approval pattern
 */
export function createPatternFromRequest(
  request: ApprovalRequestData,
  includeDescription: boolean = false
): ApprovalPattern {
  const pattern: ApprovalPattern = {
    type: request.type,
    maxRisk: request.risk,
  };

  if (includeDescription) {
    pattern.descriptionPattern = request.description;
  }

  return pattern;
}

// ============================================================================
// State Updates
// ============================================================================

/**
 * Add an approval decision to state.
 * If the result is "session" or "always", adds the pattern to appropriate list.
 *
 * @param state - Current state
 * @param request - The approval request
 * @param result - The user's decision
 * @returns New state with approval recorded
 */
export function addApproval(
  state: ApprovalState,
  request: ApprovalRequestData,
  result: ApprovalResultData
): ApprovalState {
  // Record in history
  const historyEntry: ApprovalHistoryEntry = {
    request,
    result,
    timestamp: Date.now(),
  };

  const newState: ApprovalState = {
    ...state,
    history: [...state.history, historyEntry],
  };

  // Add pattern if session or always
  if (result.approved === 'session') {
    const pattern = createPatternFromRequest(request);
    newState.sessionApprovals = [...state.sessionApprovals, pattern];
  } else if (result.approved === 'always') {
    const pattern = createPatternFromRequest(request);
    newState.alwaysApprovals = [...state.alwaysApprovals, pattern];
  }

  return newState;
}

/**
 * Add a pattern to session approvals.
 */
export function addSessionApproval(
  state: ApprovalState,
  pattern: ApprovalPattern
): ApprovalState {
  return {
    ...state,
    sessionApprovals: [...state.sessionApprovals, pattern],
  };
}

/**
 * Add a pattern to always approvals.
 */
export function addAlwaysApproval(
  state: ApprovalState,
  pattern: ApprovalPattern
): ApprovalState {
  return {
    ...state,
    alwaysApprovals: [...state.alwaysApprovals, pattern],
  };
}

/**
 * Clear all session approvals.
 * Called at end of session.
 */
export function clearSessionApprovals(state: ApprovalState): ApprovalState {
  return {
    ...state,
    sessionApprovals: [],
  };
}

/**
 * Clear approval history.
 */
export function clearApprovalHistory(state: ApprovalState): ApprovalState {
  return {
    ...state,
    history: [],
  };
}

/**
 * Remove an always approval pattern.
 */
export function removeAlwaysApproval(
  state: ApprovalState,
  pattern: ApprovalPattern
): ApprovalState {
  return {
    ...state,
    alwaysApprovals: state.alwaysApprovals.filter(
      (p) =>
        p.type !== pattern.type ||
        p.descriptionPattern !== pattern.descriptionPattern ||
        p.maxRisk !== pattern.maxRisk
    ),
  };
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get statistics about approval state.
 */
export function getApprovalStats(state: ApprovalState): ApprovalStats {
  let approvedCount = 0;
  let deniedCount = 0;

  for (const entry of state.history) {
    if (entry.result.approved === true ||
        entry.result.approved === 'session' ||
        entry.result.approved === 'always') {
      approvedCount++;
    } else {
      deniedCount++;
    }
  }

  return {
    sessionCount: state.sessionApprovals.length,
    alwaysCount: state.alwaysApprovals.length,
    historyCount: state.history.length,
    approvedCount,
    deniedCount,
  };
}
