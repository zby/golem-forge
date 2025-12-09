/**
 * Popup Component
 *
 * Quick access menu for the Golem Forge extension.
 * Provides shortcuts to open sidepanel, manage programs, and settings.
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { programManager } from './storage/program-manager';
import { settingsManager } from './storage/settings-manager';
import type { Program } from './storage/types';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    padding: '16px',
    minWidth: '300px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e0e0e0',
  } as React.CSSProperties,
  logo: {
    width: '32px',
    height: '32px',
    backgroundColor: '#6366f1',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '18px',
  } as React.CSSProperties,
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1f2937',
    margin: 0,
  } as React.CSSProperties,
  subtitle: {
    fontSize: '12px',
    color: '#6b7280',
    margin: 0,
  } as React.CSSProperties,
  section: {
    marginBottom: '16px',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '8px',
  } as React.CSSProperties,
  button: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as React.CSSProperties,
  buttonSecondary: {
    backgroundColor: '#f3f4f6',
    color: '#374151',
  } as React.CSSProperties,
  projectList: {
    maxHeight: '150px',
    overflowY: 'auto' as const,
  } as React.CSSProperties,
  projectItem: {
    padding: '8px 12px',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    marginBottom: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  } as React.CSSProperties,
  projectName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#1f2937',
  } as React.CSSProperties,
  projectDesc: {
    fontSize: '12px',
    color: '#6b7280',
    marginTop: '2px',
  } as React.CSSProperties,
  emptyState: {
    padding: '20px',
    textAlign: 'center' as const,
    color: '#6b7280',
    fontSize: '13px',
  } as React.CSSProperties,
  warning: {
    padding: '12px',
    backgroundColor: '#fef3c7',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '13px',
    color: '#92400e',
  } as React.CSSProperties,
  footer: {
    borderTop: '1px solid #e0e0e0',
    paddingTop: '12px',
    marginTop: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as React.CSSProperties,
  link: {
    color: '#6366f1',
    textDecoration: 'none',
    fontSize: '12px',
    cursor: 'pointer',
  } as React.CSSProperties,
  version: {
    fontSize: '11px',
    color: '#9ca3af',
  } as React.CSSProperties,
};

// ─────────────────────────────────────────────────────────────────────────────
// Popup App
// ─────────────────────────────────────────────────────────────────────────────

function PopupApp() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [hasAPIKeys, setHasAPIKeys] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [programList, apiKeys] = await Promise.all([
        programManager.listPrograms(),
        settingsManager.getAPIKeys(),
      ]);

      setPrograms(programList);
      setHasAPIKeys(apiKeys.length > 0);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  function openSidePanel() {
    chrome.runtime.sendMessage({ type: 'openSidePanel' });
    window.close();
  }

  function openSettings() {
    // Send message to open sidepanel with settings tab active
    chrome.runtime.sendMessage({ type: 'openSidePanel', tab: 'settings' });
    window.close();
  }

  function openProgram(programId: string) {
    // Send message to open program in sidepanel
    chrome.runtime.sendMessage({
      type: 'openProgram',
      programId,
    });
    openSidePanel();
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>GF</div>
        <div>
          <h1 style={styles.title}>Golem Forge</h1>
          <p style={styles.subtitle}>AI Workflow Automation</p>
        </div>
      </div>

      {/* Warning if no API keys */}
      {!hasAPIKeys && (
        <div style={styles.warning}>
          No API keys configured. Add your API keys in settings to start using workers.
        </div>
      )}

      {/* Quick Actions */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Quick Actions</div>
        <button style={styles.button} onClick={openSidePanel}>
          <span>Open Sidepanel</span>
        </button>
        <button
          style={{ ...styles.button, ...styles.buttonSecondary }}
          onClick={openSettings}
        >
          <span>Settings</span>
        </button>
      </div>

      {/* Programs */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Recent Programs</div>
        {programs.length === 0 ? (
          <div style={styles.emptyState}>
            No programs yet. Create one in the sidepanel.
          </div>
        ) : (
          <div style={styles.projectList}>
            {programs.slice(0, 5).map((program) => (
              <div
                key={program.id}
                style={styles.projectItem}
                onClick={() => openProgram(program.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                }}
              >
                <div style={styles.projectName}>{program.name}</div>
                {program.description && (
                  <div style={styles.projectDesc}>{program.description}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <span style={styles.version}>v0.1.0</span>
        <a
          style={styles.link}
          onClick={() => {
            chrome.tabs.create({
              url: 'https://github.com/anthropics/golem-forge',
            });
          }}
        >
          Documentation
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount
// ─────────────────────────────────────────────────────────────────────────────

const root = createRoot(document.getElementById('root')!);
root.render(<PopupApp />);
