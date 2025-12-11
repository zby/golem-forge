/**
 * Background Service Worker
 *
 * Handles extension lifecycle events and manages sidepanel behavior.
 */

// Enable sidepanel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Failed to set panel behavior:', error));

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Golem Forge extension installed');

    const now = Date.now();

    // Initialize default settings
    chrome.storage.local.get('settings', (result) => {
      if (!result.settings) {
        chrome.storage.local.set({
          settings: {
            defaultProvider: 'anthropic',
            defaultModel: 'claude-sonnet-4-20250514',
            showApprovals: true,
            maxIterations: 50,
          },
        });
      }
    });

    // Add bundled worker source
    chrome.storage.local.get('workerSources', (result) => {
      if (!result.workerSources || result.workerSources.length === 0) {
        chrome.storage.local.set({
          workerSources: [],
        });
      }
    });

    // Create default program (storage key kept as 'projects' for BACKCOMPAT)
    chrome.storage.local.get('projects', (result) => {
      if (!result.projects || result.projects.length === 0) {
        chrome.storage.local.set({
          projects: [
            {
              id: `default-${now}`,
              name: 'Default Program',
              description: 'Your first Golem Forge program',
              workerSources: [],
              githubBranch: 'main',
              triggers: [],
              createdAt: now,
              updatedAt: now,
            },
          ],
        });
        console.log('Created default program');
      }
    });
  } else if (details.reason === 'update') {
    console.log('Golem Forge extension updated');
  }
});

// Handle messages from popup/sidepanel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'getState') {
    // Return current extension state (storage key kept as 'projects' for BACKCOMPAT)
    chrome.storage.local.get(['projects', 'settings', 'apiKeys'], (result) => {
      sendResponse({
        programs: result.projects || [], // Renamed from projects to programs
        settings: result.settings || {},
        hasAPIKeys: (result.apiKeys || []).length > 0,
      });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'openSidePanel') {
    // Store desired tab if specified (sidepanel will read this on load)
    const openTab = message.tab || null;
    if (openTab) {
      chrome.storage.local.set({ pendingTab: openTab });
    }

    // Open sidepanel for the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]?.id) {
        await chrome.sidePanel.open({ tabId: tabs[0].id });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  }

  if (message.type === 'openProgram') {
    // Store program ID for sidepanel to read on load
    chrome.storage.local.set({ pendingProgramId: message.programId });
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// Log startup
console.log('Golem Forge background service worker started');
