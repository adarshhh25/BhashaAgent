/**
 * Chrome Extension type declarations.
 *
 * Provides TypeScript interfaces for future extension communication.
 * These types define the message-passing contract between
 * the Side Panel, Popup, background service worker, and content scripts.
 *
 * FE-1: Architecture preparation only — no implementation yet.
 */

/**
 * Message types for chrome.runtime communication.
 * Extend this union as features are added.
 */
export type ExtensionMessageType =
  | 'OPEN_SIDE_PANEL'
  | 'SIDE_PANEL_READY'
  | 'POPUP_ACTION'
  | 'GET_ACTIVE_TAB_CONTEXT'
  | 'FORWARD_TO_CONTENT'
  | 'DETECT_PAGE_FIELDS'
  | 'EXECUTE_FILL_INSTRUCTIONS'
  | 'PING';

/**
 * Base message structure for extension communication.
 */
export interface ExtensionMessage<
  T extends ExtensionMessageType = ExtensionMessageType,
  P = unknown,
> {
  type: T;
  payload?: P;
  timestamp: number;
}

/**
 * Response structure for extension message handlers.
 */
export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Helper to create a typed extension message.
 */
export function createExtensionMessage<
  T extends ExtensionMessageType,
  P = undefined,
>(type: T, payload?: P): ExtensionMessage<T, P> {
  return {
    type,
    payload: payload as P,
    timestamp: Date.now(),
  };
}

