/**
 * BhashaAgent Background Service Worker (Manifest V3)
 *
 * Coordinates extension-level browser operations:
 * - Active tab identification and context discovery
 * - Tab-scoped Chrome Side Panel behavior (panels open only on explicit user request per tab)
 * - Content script injection and messaging relay
 * - Resource cleanup on tab closure
 * - Cross-tab action execution safety
 */

import { tabContextManager } from '../features/browser/services/tab-context-manager';

interface ActiveTabContext {
  tabId: number;
  url: string;
  title: string;
}

/**
 * Configure default side panel behavior on installation / startup:
 * - Do not automatically toggle side panel on toolbar action click (show popup instead)
 */
if (typeof chrome !== 'undefined' && chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: false }).catch((err) => {
    console.warn('[Background] setPanelBehavior error:', err);
  });
}

// When a tab is removed, clean up tab-specific resources and tab-context state
if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabContextManager.clearTab(tabId);
    if (chrome.sidePanel?.setOptions) {
      chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
    }
  });
}

/**
 * Helper to get currently active browser tab.
 */
export async function getActiveTab(): Promise<ActiveTabContext | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return null;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab || !activeTab.id || !activeTab.url) {
    return null;
  }

  return {
    tabId: activeTab.id,
    url: activeTab.url,
    title: activeTab.title || '',
  };
}

/**
 * Ensure content script is injected and responding in target tab.
 */
async function ensureContentScriptReady(tabId: number): Promise<boolean> {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    if (ping?.pong) return true;
  } catch {
    // Ping failed, inject script dynamically
  }

  try {
    if (chrome.scripting?.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      // Allow slight initialization tick
      await new Promise((r) => setTimeout(r, 100));
      return true;
    }
  } catch (err) {
    console.error('Failed to inject content script:', err);
  }

  return false;
}

// Runtime message listener
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_ACTIVE_TAB_CONTEXT') {
      void getActiveTab().then((tab) => {
        if (!tab) {
          sendResponse({ success: false, error: 'No active tab available' });
        } else {
          sendResponse({ success: true, data: tab });
        }
      });
      return true;
    }

    if (message?.type === 'FORWARD_TO_CONTENT') {
      void (async () => {
        const tab = await getActiveTab();
        if (!tab) {
          sendResponse({ success: false, error: 'No active tab found' });
          return;
        }

        // Cross-tab safety guard: verify tab URL matches expected URL if provided
        if (message.payload?.expectedUrl && !tab.url.startsWith(message.payload.expectedUrl)) {
          sendResponse({
            success: false,
            error: 'Tab URL has changed; action aborted to prevent cross-tab contamination',
          });
          return;
        }

        const ready = await ensureContentScriptReady(tab.tabId);
        if (!ready) {
          sendResponse({
            success: false,
            error: 'Could not communicate with webpage content script',
          });
          return;
        }

        try {
          const contentRes = await chrome.tabs.sendMessage(tab.tabId, message.payload);
          sendResponse(contentRes);
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : 'Content script communication failed',
          });
        }
      })();
      return true;
    }

    return false;
  });
}
