/**
 * Chat Tab Component
 *
 * Event-driven chat interface that uses ui-react hooks.
 * Displays messages and handles user input via event bus.
 *
 * @module @golem-forge/chrome/components/ChatTab
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  useMessages,
  useStreaming,
  type UIMessage,
} from '@golem-forge/ui-react';
import { workerManager, type BundledProgram } from '../services/worker-manager.js';
import {
  useChromeUIState,
  useChromeUIActions,
  useChromeAdapter,
} from '../contexts/ChromeUIStateContext.js';
import { ApprovalDialog } from './ApprovalDialog.js';

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
  },
  workerSelector: {
    marginBottom: '12px',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '14px',
    backgroundColor: 'white',
  },
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 500,
    color: '#6b7280',
    marginBottom: '4px',
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    paddingBottom: '16px',
  },
  message: {
    marginBottom: '12px',
    padding: '10px 14px',
    borderRadius: '12px',
    maxWidth: '85%',
  },
  userMessage: {
    backgroundColor: '#6366f1',
    color: 'white',
    marginLeft: 'auto',
    borderBottomRightRadius: '4px',
  },
  assistantMessage: {
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
    marginRight: 'auto',
    borderBottomLeftRadius: '4px',
  },
  toolMessage: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    marginRight: 'auto',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  statusMessage: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    marginRight: 'auto',
    fontSize: '12px',
  },
  streamingIndicator: {
    display: 'inline-block',
    animation: 'pulse 1.5s infinite',
    color: '#6b7280',
  },
  inputArea: {
    borderTop: '1px solid #e5e7eb',
    padding: '12px',
    backgroundColor: '#f9fafb',
  },
  inputWrapper: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
    resize: 'none' as const,
    minHeight: '40px',
    maxHeight: '120px',
  },
  sendButton: {
    padding: '10px 16px',
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
    cursor: 'not-allowed',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#6b7280',
    textAlign: 'center' as const,
    padding: '20px',
  },
};

// ============================================================================
// Helper Components
// ============================================================================

/**
 * Render a single message based on its type.
 */
function MessageItem({ item }: { item: UIMessage }) {
  switch (item.type) {
    case 'message': {
      const { role, content } = item.message;
      const messageStyle = {
        ...styles.message,
        ...(role === 'user' ? styles.userMessage : styles.assistantMessage),
      };
      return <div style={messageStyle}>{content}</div>;
    }

    case 'tool_result': {
      const { toolName, value, error } = item.result;
      const displayText = error
        ? `[${toolName}] Error: ${error}`
        : `[${toolName}] ${JSON.stringify(value).slice(0, 200)}`;
      return <div style={{ ...styles.message, ...styles.toolMessage }}>{displayText}</div>;
    }

    case 'status': {
      const { type: statusType, message } = item.status;
      const statusStyle = {
        ...styles.message,
        ...styles.statusMessage,
        ...(statusType === 'error' ? { backgroundColor: '#fee2e2', color: '#991b1b' } : {}),
      };
      return <div style={statusStyle}>{message}</div>;
    }

    case 'worker_start':
    case 'worker_complete':
      // Don't render worker events for now
      return null;

    default:
      return null;
  }
}

/**
 * Streaming indicator component.
 */
function StreamingContent({ content }: { content: string }) {
  return (
    <div style={{ ...styles.message, ...styles.assistantMessage }}>
      {content}
      <span style={styles.streamingIndicator}>|</span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Chat Tab Component using event-driven architecture.
 *
 * Features:
 * - Program selection
 * - Message display using useMessages()
 * - Streaming content using useStreaming()
 * - Approval dialog integration
 * - Event-based worker execution via ChromeAdapter
 *
 * @example
 * ```tsx
 * function SidepanelContent() {
 *   const { activeTab } = useChromeUIState();
 *   return activeTab === 'chat' ? <ChatTab /> : <SettingsTab />;
 * }
 * ```
 */
export function ChatTab() {
  const [input, setInput] = useState('');
  const [bundledPrograms, setBundledPrograms] = useState<BundledProgram[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get state and actions from contexts
  const { selectedProgramId, isRunning } = useChromeUIState();
  const { selectProgram, setRunning } = useChromeUIActions();
  const adapter = useChromeAdapter();

  // Get messages and streaming state from ui-react
  const messages = useMessages();
  const { content: streamingContent, isStreaming } = useStreaming();

  // Load bundled programs on mount
  useEffect(() => {
    const programs = workerManager.getBundledPrograms();
    setBundledPrograms(programs);
    // Select first program by default if none selected
    if (programs.length > 0 && !selectedProgramId) {
      selectProgram(programs[0].id);
    }
  }, [selectedProgramId, selectProgram]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Handle program change
  const handleProgramChange = useCallback((programId: string) => {
    selectProgram(programId);
  }, [selectProgram]);

  // Handle send
  const handleSend = useCallback(async () => {
    if (!input.trim() || isRunning || !selectedProgramId || !adapter) return;

    const userInput = input.trim();
    setInput('');
    setRunning(true);

    try {
      // Get worker definition from the bundled program
      const worker = workerManager.getBundledProgramWorker(selectedProgramId);

      // Update adapter options with current program
      adapter.updateOptions({ programId: selectedProgramId });

      // Run the worker via the adapter (events will be emitted to the bus)
      await adapter.runWorker(worker, userInput);
    } catch (error) {
      console.error('Worker execution error:', error);
      // Error will be shown via status event from adapter
    } finally {
      setRunning(false);
    }
  }, [input, isRunning, selectedProgramId, adapter, setRunning]);

  // Handle key down
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Get the selected program for display
  const selectedProgram = bundledPrograms.find((p) => p.id === selectedProgramId);

  // Check if we can send
  const canSend = !isRunning && input.trim() && selectedProgramId && adapter;

  return (
    <div style={styles.container}>
      {/* Program Selector */}
      <div style={styles.workerSelector}>
        <label style={styles.label}>Program</label>
        <select
          style={styles.select}
          value={selectedProgramId || ''}
          onChange={(e) => handleProgramChange(e.target.value)}
          disabled={isRunning}
        >
          {bundledPrograms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} - {p.description}
            </option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.length === 0 && !isStreaming ? (
          <div style={styles.emptyState}>
            <p><strong>{selectedProgram?.name}</strong></p>
            <p style={{ marginTop: '4px', fontSize: '13px', color: '#6b7280' }}>
              {selectedProgram?.description}
            </p>
            <p style={{ marginTop: '12px', fontSize: '13px' }}>
              Send a message to start chatting.
            </p>
          </div>
        ) : (
          <>
            {messages.map((item, index) => (
              <MessageItem key={index} item={item} />
            ))}
            {isStreaming && streamingContent && (
              <StreamingContent content={streamingContent} />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={styles.inputArea}>
        <div style={styles.inputWrapper}>
          <textarea
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isRunning}
            rows={1}
          />
          <button
            style={{
              ...styles.sendButton,
              ...(!canSend ? styles.sendButtonDisabled : {}),
            }}
            onClick={handleSend}
            disabled={!canSend}
          >
            {isRunning ? 'Running...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Approval Dialog (renders when pending approval exists) */}
      <ApprovalDialog />
    </div>
  );
}

export default ChatTab;
