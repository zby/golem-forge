/**
 * Background Service Worker
 *
 * Handles extension lifecycle events and manages sidepanel behavior.
 */

import { DEFAULT_SETTINGS } from './storage/settings-manager';

// Enable sidepanel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Failed to set panel behavior:', error));

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Golem Forge extension installed');

    // Initialize default settings (use shared DEFAULT_SETTINGS constant)
    chrome.storage.local.get('settings', (result) => {
      if (!result.settings) {
        chrome.storage.local.set({
          settings: DEFAULT_SETTINGS,
        });
      }
    });

    // Note: "Stored programs" feature has been removed.
    // The extension now uses only bundled demo programs.
    // This simplifies the architecture by having a single source of truth.

  } else if (details.reason === 'update') {
    console.log('Golem Forge extension updated');
  }
});

// Handle messages from popup/sidepanel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'getState') {
    // Return current extension state
    chrome.storage.local.get(['settings', 'apiKeys'], (result) => {
      sendResponse({
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
    // Store bundled program ID for sidepanel to read on load
    // Note: This only supports bundled programs, not stored programs
    chrome.storage.local.set({ pendingProgramId: message.programId });
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// Log startup
console.log('Golem Forge background service worker started');
