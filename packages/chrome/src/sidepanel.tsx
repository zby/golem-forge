/**
 * Sidepanel Component
 *
 * Main interface for the Golem Forge extension.
 * Uses event-driven architecture with UIProvider from @golem-forge/ui-react.
 */

import { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { createUIEventBus } from '@golem-forge/core';
import { UIProvider } from '@golem-forge/ui-react';
import { settingsManager } from './storage/settings-manager';
import { programManager } from './storage/program-manager';
import { createChromeAdapter } from './services/chrome-adapter';
import {
  ChromeUIStateProvider,
  useChromeUIState,
  useChromeUIActions,
} from './contexts/ChromeUIStateContext';
import { ChatTab } from './components/ChatTab';
import type { LLMProvider, Program } from './storage/types';

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

  // Programs
  const [programs, setPrograms] = useState<Program[]>([]);
  const [newProgramName, setNewProgramName] = useState('');

  // UI state
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<'api' | 'model' | 'programs'>('api');

  // Get actions for refreshing API key status
  const { refreshAPIKeyStatus } = useChromeUIActions();

  useEffect(() => {
    async function init() {
      await loadSettings();
      await programManager.ensureDefaultProgram();
      await loadPrograms();
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

  async function loadPrograms() {
    const programList = await programManager.listPrograms();
    setPrograms(programList);
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

    // Clear modified tracking and refresh API key status
    setModifiedKeys(new Set());
    await refreshAPIKeyStatus();
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

  async function handleCreateProgram() {
    if (!newProgramName.trim()) return;

    await programManager.createProgram({
      name: newProgramName.trim(),
      workerSources: [],
      githubBranch: 'main',
      triggers: [],
    });

    setNewProgramName('');
    await loadPrograms();
  }

  async function handleDeleteProgram(programId: string) {
    if (!confirm('Are you sure you want to delete this program?')) return;

    await programManager.deleteProgram(programId);
    await loadPrograms();
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
        <button style={sectionButtonStyle('programs')} onClick={() => setActiveSection('programs')}>
          Programs
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

      {/* Programs Section */}
      {activeSection === 'programs' && (
        <>
          <div style={styles.formGroup}>
            <label style={styles.label}>Create New Program</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                style={{ ...styles.formInput, flex: 1 }}
                value={newProgramName}
                onChange={(e) => setNewProgramName(e.target.value)}
                placeholder="Program name..."
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProgram()}
              />
              <button
                style={{
                  ...styles.saveButton,
                  padding: '10px 16px',
                }}
                onClick={handleCreateProgram}
                disabled={!newProgramName.trim()}
              >
                Create
              </button>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Existing Programs</label>
            {programs.length === 0 ? (
              <p style={{ color: '#6b7280', fontSize: '13px', margin: '8px 0' }}>
                No programs yet. Create one above.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {programs.map((p) => (
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
                      onClick={() => handleDeleteProgram(p.id)}
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
// Sidepanel Content Component
// ─────────────────────────────────────────────────────────────────────────────

function SidepanelContent() {
  const { activeTab, hasAPIKeys, isLoading } = useChromeUIState();
  const { setActiveTab } = useChromeUIActions();

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
        {isLoading ? (
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
// Main App Component
// ─────────────────────────────────────────────────────────────────────────────

function SidepanelApp() {
  // Create event bus and adapter once
  const { eventBus, adapter } = useMemo(() => {
    const bus = createUIEventBus();
    const chromeAdapter = createChromeAdapter(bus);
    return { eventBus: bus, adapter: chromeAdapter };
  }, []);

  return (
    <UIProvider bus={eventBus}>
      <ChromeUIStateProvider adapter={adapter}>
        <SidepanelContent />
      </ChromeUIStateProvider>
    </UIProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root')!);
root.render(<SidepanelApp />);
