/**
 * Sidepanel Component
 *
 * Main interface for the Golem Forge extension.
 * Provides chat interface for running workers and managing projects.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { settingsManager } from './storage/settings-manager';
import { projectManager } from './storage/project-manager';
import { workerManager, type BundledProject } from './services/worker-manager';
import {
  createBrowserRuntime,
  type ApprovalRequest,
  type ApprovalDecision,
} from './services/browser-runtime';
import type { LLMProvider, Project } from './storage/types';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: '#ffffff',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
    backgroundColor: '#f9fafb',
  },
  headerTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
  },
  headerSubtitle: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '2px',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #e5e7eb',
  },
  tab: {
    flex: 1,
    padding: '10px 16px',
    border: 'none',
    background: 'none',
    fontSize: '13px',
    fontWeight: 500,
    color: '#6b7280',
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
  },
  tabActive: {
    color: '#6366f1',
    borderBottomColor: '#6366f1',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px',
  },
  chatContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
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
  settingsForm: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  formInput: {
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    fontSize: '14px',
  },
  saveButton: {
    padding: '12px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
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
  approvalDialog: {
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
  approvalContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '20px',
    maxWidth: '400px',
    width: '90%',
  },
  approvalTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '12px',
  },
  approvalDesc: {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '16px',
  },
  approvalArgs: {
    backgroundColor: '#f3f4f6',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'monospace',
    marginBottom: '16px',
    maxHeight: '150px',
    overflow: 'auto',
  },
  approvalButtons: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  approveButton: {
    padding: '8px 16px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  denyButton: {
    padding: '8px 16px',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

// Message ID counter for uniqueness within same millisecond
let messageIdCounter = 0;
function generateMessageId(): string {
  return `${Date.now()}-${++messageIdCounter}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Dialog Component
// ─────────────────────────────────────────────────────────────────────────────

function ApprovalDialog({
  request,
  onDecision,
}: {
  request: ApprovalRequest;
  onDecision: (decision: ApprovalDecision) => void;
}) {
  return (
    <div style={styles.approvalDialog}>
      <div style={styles.approvalContent}>
        <h3 style={styles.approvalTitle}>Approval Required</h3>
        <p style={styles.approvalDesc}>{request.description}</p>
        <div style={styles.approvalArgs}>
          <strong>{request.toolName}</strong>
          <pre>{JSON.stringify(request.toolArgs, null, 2)}</pre>
        </div>
        <div style={styles.approvalButtons}>
          <button
            style={styles.denyButton}
            onClick={() => onDecision({ approved: false, remember: 'none' })}
          >
            Deny
          </button>
          <button
            style={styles.approveButton}
            onClick={() => onDecision({ approved: true, remember: 'session' })}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default models per provider
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODELS: Record<LLMProvider, Array<{ id: string; name: string }>> = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-20250514', name: 'Claude Haiku 4' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  google: [
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (via OpenRouter)' },
    { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku (via OpenRouter)' },
    { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)' },
    { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro (via OpenRouter)' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Settings Tab Component
// ─────────────────────────────────────────────────────────────────────────────

function SettingsTab() {
  // API Keys - display values
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');

  // Track which keys have been modified by user (not just masked display)
  const [modifiedKeys, setModifiedKeys] = useState<Set<LLMProvider>>(new Set());

  // Model settings
  const [defaultProvider, setDefaultProvider] = useState<LLMProvider>('anthropic');
  const [defaultModel, setDefaultModel] = useState('claude-sonnet-4-20250514');

  // Projects
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState('');

  // UI state
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<'api' | 'model' | 'projects'>('api');

  useEffect(() => {
    async function init() {
      await loadSettings();
      await projectManager.ensureDefaultProject();
      await loadProjects();
    }
    init();
  }, []);

  async function loadSettings() {
    const settings = await settingsManager.getSettings();
    setDefaultProvider(settings.defaultProvider);
    setDefaultModel(settings.defaultModel);

    // Load existing keys (masked)
    const apiKeys = await settingsManager.getAPIKeys();
    for (const key of apiKeys) {
      const masked = key.apiKey.slice(0, 8) + '...' + key.apiKey.slice(-4);
      switch (key.provider) {
        case 'anthropic':
          setAnthropicKey(masked);
          break;
        case 'openai':
          setOpenaiKey(masked);
          break;
        case 'google':
          setGoogleKey(masked);
          break;
        case 'openrouter':
          setOpenrouterKey(masked);
          break;
      }
    }
  }

  async function loadProjects() {
    const projectList = await projectManager.listProjects();
    setProjects(projectList);
  }

  async function handleSaveAPIKeys() {
    // Only save keys that have been modified by the user
    if (modifiedKeys.has('anthropic') && anthropicKey) {
      await settingsManager.setAPIKey('anthropic', anthropicKey);
    }
    if (modifiedKeys.has('openai') && openaiKey) {
      await settingsManager.setAPIKey('openai', openaiKey);
    }
    if (modifiedKeys.has('google') && googleKey) {
      await settingsManager.setAPIKey('google', googleKey);
    }
    if (modifiedKeys.has('openrouter') && openrouterKey) {
      await settingsManager.setAPIKey('openrouter', openrouterKey);
    }

    // Clear modified tracking after save
    setModifiedKeys(new Set());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Helper to update key and mark as modified
  function handleKeyChange(provider: LLMProvider, value: string) {
    setModifiedKeys((prev) => new Set(prev).add(provider));
    switch (provider) {
      case 'anthropic':
        setAnthropicKey(value);
        break;
      case 'openai':
        setOpenaiKey(value);
        break;
      case 'google':
        setGoogleKey(value);
        break;
      case 'openrouter':
        setOpenrouterKey(value);
        break;
    }
  }

  async function handleSaveModelSettings() {
    await settingsManager.updateSettings({ defaultProvider, defaultModel });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // When provider changes, update model to first available for that provider
  function handleProviderChange(provider: LLMProvider) {
    setDefaultProvider(provider);
    const models = DEFAULT_MODELS[provider];
    if (models.length > 0) {
      setDefaultModel(models[0].id);
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;

    await projectManager.createProject({
      name: newProjectName.trim(),
      workerSources: [],
      githubBranch: 'main',
      triggers: [],
    });

    setNewProjectName('');
    await loadProjects();
  }

  async function handleDeleteProject(projectId: string) {
    if (!confirm('Are you sure you want to delete this project?')) return;

    await projectManager.deleteProject(projectId);
    await loadProjects();
  }

  const sectionButtonStyle = (section: typeof activeSection) => ({
    padding: '8px 12px',
    border: 'none',
    background: activeSection === section ? '#6366f1' : '#e5e7eb',
    color: activeSection === section ? 'white' : '#374151',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  });

  return (
    <div style={styles.settingsForm}>
      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button style={sectionButtonStyle('api')} onClick={() => setActiveSection('api')}>
          API Keys
        </button>
        <button style={sectionButtonStyle('model')} onClick={() => setActiveSection('model')}>
          Model
        </button>
        <button style={sectionButtonStyle('projects')} onClick={() => setActiveSection('projects')}>
          Projects
        </button>
      </div>

      {/* API Keys Section */}
      {activeSection === 'api' && (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Anthropic API Key</label>
            <input
              type="password"
              style={styles.formInput}
              value={anthropicKey}
              onChange={(e) => handleKeyChange('anthropic', e.target.value)}
              placeholder="sk-ant-..."
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>OpenAI API Key</label>
            <input
              type="password"
              style={styles.formInput}
              value={openaiKey}
              onChange={(e) => handleKeyChange('openai', e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Google AI API Key</label>
            <input
              type="password"
              style={styles.formInput}
              value={googleKey}
              onChange={(e) => handleKeyChange('google', e.target.value)}
              placeholder="AIza..."
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>OpenRouter API Key</label>
            <input
              type="password"
              style={styles.formInput}
              value={openrouterKey}
              onChange={(e) => handleKeyChange('openrouter', e.target.value)}
              placeholder="sk-or-..."
            />
          </div>

          <button
            style={{
              ...styles.saveButton,
              backgroundColor: saved ? '#10b981' : '#6366f1',
            }}
            onClick={handleSaveAPIKeys}
          >
            {saved ? 'Saved!' : 'Save API Keys'}
          </button>
        </>
      )}

      {/* Model Settings Section */}
      {activeSection === 'model' && (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Default Provider</label>
            <select
              style={styles.select}
              value={defaultProvider}
              onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
              <option value="google">Google (Gemini)</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Default Model</label>
            <select
              style={styles.select}
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
            >
              {DEFAULT_MODELS[defaultProvider].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <button
            style={{
              ...styles.saveButton,
              backgroundColor: saved ? '#10b981' : '#6366f1',
            }}
            onClick={handleSaveModelSettings}
          >
            {saved ? 'Saved!' : 'Save Model Settings'}
          </button>
        </>
      )}

      {/* Projects Section */}
      {activeSection === 'projects' && (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Create New Project</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                style={{ ...styles.formInput, flex: 1 }}
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name..."
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              />
              <button
                style={{
                  ...styles.saveButton,
                  padding: '10px 16px',
                }}
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
              >
                Create
              </button>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Existing Projects</label>
            {projects.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '13px', margin: '8px 0' }}>
                No projects yet. Create one above.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {projects.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '6px',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '14px' }}>{p.name}</div>
                      {p.description && (
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{p.description}</div>
                      )}
                    </div>
                    <button
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                      onClick={() => handleDeleteProject(p.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Tab Component
// ─────────────────────────────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [bundledProjects, setBundledProjects] = useState<BundledProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
  const [approvalResolver, setApprovalResolver] = useState<((decision: ApprovalDecision) => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load bundled projects on mount
  useEffect(() => {
    const projects = workerManager.getBundledProjects();
    setBundledProjects(projects);
    // Select first project by default
    if (projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle project change - clear messages
  function handleProjectChange(projectId: string) {
    setSelectedProjectId(projectId);
    setMessages([]); // Clear messages when project changes
  }

  const handleApproval = useCallback(
    async (request: ApprovalRequest): Promise<ApprovalDecision> => {
      return new Promise((resolve) => {
        setApprovalRequest(request);
        setApprovalResolver(() => resolve);
      });
    },
    []
  );

  function handleApprovalDecision(decision: ApprovalDecision) {
    if (approvalResolver) {
      approvalResolver(decision);
    }
    setApprovalRequest(null);
    setApprovalResolver(null);
  }

  async function handleSend() {
    if (!input.trim() || isRunning || !selectedProjectId) return;

    const userMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsRunning(true);

    try {
      // Get worker definition from the bundled project's index.worker
      const worker = workerManager.getBundledProjectWorker(selectedProjectId);

      // Create runtime - use projectId for sandbox
      const runtime = await createBrowserRuntime({
        worker,
        projectId: selectedProjectId,
        approvalMode: 'interactive',
        approvalCallback: handleApproval,
        onStream: (text) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + text },
              ];
            }
            return [
              ...prev,
              { id: generateMessageId(), role: 'assistant', content: text },
            ];
          });
        },
        onToolCall: (toolName, _args, result) => {
          const toolMessage: Message = {
            id: generateMessageId(),
            role: 'tool',
            content: `[${toolName}] ${JSON.stringify(result).slice(0, 200)}`,
          };
          setMessages((prev) => [...prev, toolMessage]);
        },
      });

      // Run worker
      const result = await runtime.run(userMessage.content);

      if (!result.success && result.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            role: 'assistant',
            content: `Error: ${result.error}`,
          },
        ]);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    } finally {
      setIsRunning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Get the selected project for display
  const selectedProject = bundledProjects.find((p) => p.id === selectedProjectId);

  return (
    <div style={styles.chatContainer}>
      {/* Project Selector */}
      <div style={styles.workerSelector}>
        <label style={styles.label}>Project</label>
        <select
          style={styles.select}
          value={selectedProjectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          disabled={isRunning}
        >
          {bundledProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} - {p.description}
            </option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {messages.length === 0 ? (
          <div style={styles.emptyState}>
            <p><strong>{selectedProject?.name}</strong></p>
            <p style={{ marginTop: '4px', fontSize: '13px', color: '#6b7280' }}>
              {selectedProject?.description}
            </p>
            <p style={{ marginTop: '12px', fontSize: '13px' }}>
              Send a message to start chatting.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                ...styles.message,
                ...(msg.role === 'user'
                  ? styles.userMessage
                  : msg.role === 'tool'
                  ? styles.toolMessage
                  : styles.assistantMessage),
              }}
            >
              {msg.content}
            </div>
          ))
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
              ...(isRunning || !input.trim() || !selectedProjectId ? styles.sendButtonDisabled : {}),
            }}
            onClick={handleSend}
            disabled={isRunning || !input.trim() || !selectedProjectId}
          >
            {isRunning ? 'Running...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Approval Dialog */}
      {approvalRequest && (
        <ApprovalDialog
          request={approvalRequest}
          onDecision={handleApprovalDecision}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App Component
// ─────────────────────────────────────────────────────────────────────────────

function SidepanelApp() {
  const [activeTab, setActiveTab] = useState<'chat' | 'settings'>('chat');
  const [hasAPIKeys, setHasAPIKeys] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    checkAPIKeys();
  }, [activeTab]);

  async function initializeApp() {
    // Check for pending tab from popup navigation
    const result = await chrome.storage.local.get('pendingTab');
    if (result.pendingTab) {
      if (result.pendingTab === 'settings' || result.pendingTab === 'chat') {
        setActiveTab(result.pendingTab);
      }
      // Clear the pending tab
      await chrome.storage.local.remove('pendingTab');
    }
    await checkAPIKeys();
  }

  async function checkAPIKeys() {
    const apiKeys = await settingsManager.getAPIKeys();
    setHasAPIKeys(apiKeys.length > 0);
    setLoading(false);
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Golem Forge</h1>
        <div style={styles.headerSubtitle}>AI Workflow Automation</div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'chat' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'settings' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {loading ? (
          <div style={styles.emptyState}>Loading...</div>
        ) : activeTab === 'settings' ? (
          <SettingsTab />
        ) : !hasAPIKeys ? (
          <div style={styles.emptyState}>
            <p>Please configure your API keys in Settings to start using workers.</p>
            <button
              style={{ ...styles.sendButton, marginTop: '12px' }}
              onClick={() => setActiveTab('settings')}
            >
              Go to Settings
            </button>
          </div>
        ) : (
          <ChatTab />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root')!);
root.render(<SidepanelApp />);
