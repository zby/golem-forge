/**
 * Approval Dialog Component
 *
 * Event-driven approval dialog that uses ui-react hooks.
 * Displays pending approval requests and allows user to approve/deny.
 *
 * @module @golem-forge/chrome/components/ApprovalDialog
 */

import {
  usePendingApproval,
  useApprovalActions,
} from '@golem-forge/ui-react';

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  content: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    maxWidth: '400px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '8px',
    color: '#1f2937',
  },
  riskBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    marginBottom: '12px',
  },
  riskLow: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  riskMedium: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  riskHigh: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  description: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '16px',
    lineHeight: 1.5,
  },
  details: {
    backgroundColor: '#f3f4f6',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'monospace',
    marginBottom: '16px',
    maxHeight: '150px',
    overflow: 'auto',
  },
  toolName: {
    fontWeight: 600,
    color: '#374151',
    marginBottom: '8px',
  },
  buttons: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end',
  },
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  denyButton: {
    backgroundColor: '#ef4444',
    color: 'white',
  },
  approveButton: {
    backgroundColor: '#10b981',
    color: 'white',
  },
  sessionButton: {
    backgroundColor: '#6366f1',
    color: 'white',
  },
  alwaysButton: {
    backgroundColor: '#8b5cf6',
    color: 'white',
  },
};

// ============================================================================
// Component
// ============================================================================

/**
 * Approval Dialog that displays pending approval requests.
 *
 * Uses event-driven architecture via ui-react hooks:
 * - usePendingApproval() - Get the current pending approval
 * - useApprovalActions() - Get the respond action
 *
 * Approval options:
 * - Deny: Reject this request
 * - Approve: Allow this request only
 * - Session: Allow similar requests for this session
 * - Always: Always allow this type of request
 *
 * @example
 * ```tsx
 * function ChatTab() {
 *   return (
 *     <div>
 *       <Messages />
 *       <Input />
 *       <ApprovalDialog />
 *     </div>
 *   );
 * }
 * ```
 */
export function ApprovalDialog() {
  const pendingApproval = usePendingApproval();
  const { respond } = useApprovalActions();

  // Don't render if no pending approval
  if (!pendingApproval) {
    return null;
  }

  const { type, description, details, risk } = pendingApproval;

  // Get risk-specific styles
  const riskStyle = {
    ...styles.riskBadge,
    ...(risk === 'low' ? styles.riskLow :
        risk === 'high' ? styles.riskHigh :
        styles.riskMedium),
  };

  // Format details for display
  const formattedDetails = typeof details === 'object'
    ? JSON.stringify(details, null, 2)
    : String(details);

  return (
    <div style={styles.overlay}>
      <div style={styles.content}>
        <h3 style={styles.title}>Approval Required</h3>

        <span style={riskStyle}>
          {risk.toUpperCase()} RISK
        </span>

        <p style={styles.description}>{description}</p>

        <div style={styles.details}>
          <div style={styles.toolName}>{type}</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {formattedDetails}
          </pre>
        </div>

        <div style={styles.buttons}>
          <button
            style={{ ...styles.button, ...styles.denyButton }}
            onClick={() => respond({ approved: false, reason: 'User denied' })}
          >
            Deny
          </button>
          <button
            style={{ ...styles.button, ...styles.approveButton }}
            onClick={() => respond({ approved: true })}
          >
            Approve
          </button>
          <button
            style={{ ...styles.button, ...styles.sessionButton }}
            onClick={() => respond({ approved: 'session' })}
            title="Allow similar requests for this session"
          >
            Session
          </button>
          <button
            style={{ ...styles.button, ...styles.alwaysButton }}
            onClick={() => respond({ approved: 'always' })}
            title="Always allow this type of request"
          >
            Always
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalDialog;
