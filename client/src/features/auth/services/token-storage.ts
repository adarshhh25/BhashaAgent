/**
 * Token and Session Storage Service
 *
 * Implements secure storage for Chrome Extension MV3 (chrome.storage.local)
 * with graceful fallback to localStorage in browser environments and
 * in-memory fallback for test environments.
 * Provides cross-context synchronization and single-flight token refresh mutex.
 */

import type { StoredSession } from '../types/auth.types';

const SESSION_STORAGE_KEY = 'bhashaagent_session';

// In-memory fallback for Node/unit test environments where neither chrome.storage nor localStorage is defined
let memorySession: StoredSession | null = null;

/** Whether the Chrome extension storage API is available */
function isChromeStorageAvailable(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    typeof chrome.storage !== 'undefined' &&
    typeof chrome.storage.local !== 'undefined'
  );
}

/** Whether browser localStorage is available */
function isLocalStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/**
 * Retrieve the active session from storage.
 */
export async function getStoredSession(): Promise<StoredSession | null> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.get([SESSION_STORAGE_KEY], (result: { [key: string]: unknown }) => {
        const session = result[SESSION_STORAGE_KEY] as StoredSession | undefined;
        resolve(session ?? null);
      });
    });
  }

  if (isLocalStorageAvailable()) {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }

  return memorySession;
}

/**
 * Persist the active session to storage.
 */
export async function setStoredSession(session: StoredSession): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SESSION_STORAGE_KEY]: session }, () => {
        resolve();
      });
    });
  }

  if (isLocalStorageAvailable()) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      return;
    } catch {
      // Storage quota or disabled storage
    }
  }

  memorySession = session;
}

/**
 * Clear the session from storage.
 */
export async function clearStoredSession(): Promise<void> {
  if (isChromeStorageAvailable()) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([SESSION_STORAGE_KEY], () => {
        resolve();
      });
    });
  }

  if (isLocalStorageAvailable()) {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    } catch {
      // Ignore error on clearing
    }
  }

  memorySession = null;
}

/**
 * Listen for storage changes across extension contexts (Side Panel <-> Popup).
 */
export function onSessionChange(callback: (session: StoredSession | null) => void): () => void {
  if (isChromeStorageAvailable()) {
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'local' && changes[SESSION_STORAGE_KEY]) {
        const newValue = changes[SESSION_STORAGE_KEY].newValue as StoredSession | undefined;
        callback(newValue ?? null);
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const listener = (event: StorageEvent) => {
      if (event.key === SESSION_STORAGE_KEY) {
        try {
          const session = event.newValue ? (JSON.parse(event.newValue) as StoredSession) : null;
          callback(session);
        } catch {
          callback(null);
        }
      }
    };

    window.addEventListener('storage', listener);
    return () => {
      window.removeEventListener('storage', listener);
    };
  }

  return () => {};
}

/* ---------------------------------------------------------------------------
 * Single-flight Refresh Token Mutex Coordinator
 * ---------------------------------------------------------------------------*/

type RefreshFunction = (refreshToken: string) => Promise<StoredSession | null>;

let activeRefreshPromise: Promise<string | null> | null = null;
let registeredRefreshFn: RefreshFunction | null = null;

/**
 * Registers the refresh function used by the token coordinator.
 */
export function registerRefreshHandler(fn: RefreshFunction): void {
  registeredRefreshFn = fn;
}

/**
 * Returns a valid access token.
 * If the access token is valid (with 60-second safety window), returns it immediately.
 * If expired and a refresh handler is registered, executes a single-flight token refresh.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const session = await getStoredSession();
  if (!session) return null;

  // 60-second safety buffer before expiry
  const now = Date.now();
  if (now < session.expiresAt - 60_000) {
    return session.accessToken;
  }

  // Token is expired or expiring soon, execute single-flight refresh
  if (!registeredRefreshFn) {
    return null;
  }

  if (!activeRefreshPromise) {
    activeRefreshPromise = (async () => {
      try {
        const newSession = await registeredRefreshFn(session.refreshToken);
        if (newSession) {
          await setStoredSession(newSession);
          return newSession.accessToken;
        }
        await clearStoredSession();
        return null;
      } catch {
        await clearStoredSession();
        return null;
      } finally {
        activeRefreshPromise = null;
      }
    })();
  }

  return activeRefreshPromise;
}
