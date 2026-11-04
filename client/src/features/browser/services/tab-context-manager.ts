/**
 * Tab Context Manager
 *
 * Maintains tab-scoped browser contexts in the Chrome extension client:
 * - Maps each Chrome tabId to its active webpage URL, title, document fingerprint, and detected fields
 * - Isolates Form Tasks by URL so Tab 1 (e.g. Job application) and Tab 2 (e.g. College registration)
 *   never share, overwrite, or cross-contaminate active form contexts
 * - Verifies tab and URL identity before executing approved browser fill actions
 * - Cleans up tab-associated state when tabs are closed
 */

import type { BrowserDetectedField } from '../types/browser.types';
import type { FormTask } from '../../forms/types/form.types';

export interface TabContextState {
  tabId: number;
  url: string;
  title: string;
  documentId?: string;
  formTaskId?: string;
  formTask?: FormTask | null;
  detectedFields: BrowserDetectedField[];
  fieldCount: number;
  lastScannedAt: string;
}

class TabContextManager {
  private tabMap = new Map<number, TabContextState>();
  // Map of `${conversationId}:${normalizedUrl}` -> formTaskId to maintain clean 1-to-1 mapping
  private taskUrlMap = new Map<string, string>();

  /**
   * Normalize URLs for reliable matching across protocol variants and trailing slashes
   */
  private normalizeUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    const withoutHash = rawUrl.split('#')[0] ?? '';
    return withoutHash.replace(/\/+$/, '').toLowerCase();
  }

  /**
   * Retrieve cached context state for a specific tabId
   */
  getTabState(tabId: number): TabContextState | undefined {
    return this.tabMap.get(tabId);
  }

  /**
   * Set or update context state for a specific tabId
   */
  setTabState(
    tabId: number,
    state: {
      url: string;
      title: string;
      documentId?: string;
      formTaskId?: string;
      formTask?: FormTask | null;
      detectedFields?: BrowserDetectedField[];
    },
  ): TabContextState {
    const existing = this.tabMap.get(tabId);
    const detectedFields = state.detectedFields ?? existing?.detectedFields ?? [];
    const updated: TabContextState = {
      tabId,
      url: state.url,
      title: state.title,
      documentId: state.documentId ?? existing?.documentId,
      formTaskId: state.formTaskId ?? existing?.formTaskId,
      formTask: state.formTask !== undefined ? state.formTask : (existing?.formTask ?? null),
      detectedFields,
      fieldCount: detectedFields.length,
      lastScannedAt: new Date().toISOString(),
    };
    this.tabMap.set(tabId, updated);
    return updated;
  }

  /**
   * Associate a formTaskId with a specific conversationId and URL
   */
  associateFormTask(conversationId: string, url: string, formTaskId: string): void {
    const key = `${conversationId}:${this.normalizeUrl(url)}`;
    this.taskUrlMap.set(key, formTaskId);
  }

  /**
   * Get the formTaskId associated with a conversationId and URL
   */
  getAssociatedFormTaskId(conversationId: string, url: string): string | undefined {
    const key = `${conversationId}:${this.normalizeUrl(url)}`;
    return this.taskUrlMap.get(key);
  }

  /**
   * Verify whether a tabId's recorded URL matches the expected approved URL
   */
  verifyTabMatch(tabId: number, expectedUrl: string): boolean {
    const state = this.tabMap.get(tabId);
    if (!state) return false;
    return this.normalizeUrl(state.url) === this.normalizeUrl(expectedUrl);
  }

  /**
   * Clean up all state associated with a tabId (e.g. on tab close)
   */
  clearTab(tabId: number): void {
    this.tabMap.delete(tabId);
  }

  /**
   * Reset all tab state (for testing or session reset)
   */
  reset(): void {
    this.tabMap.clear();
    this.taskUrlMap.clear();
  }
}

export const tabContextManager = new TabContextManager();
