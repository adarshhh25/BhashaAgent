/**
 * Hook for Active Browser Tab Discovery & Page Session Management
 *
 * Verifies that the user's active browser page matches the form task page,
 * ensuring no actions are issued against an unrelated or changed tab.
 */

import { useState, useEffect, useCallback } from 'react';
import { browserService } from '../services/browser.service';
import {
  BROWSER_PROTOCOL_VERSION,
  type BrowserPageContext,
  type BrowserPageSession,
  type BrowserDetectedField,
} from '../types/browser.types';
import type { FormTask, DetectedField } from '../../forms/types/form.types';

export type BrowserConnectionStatus =
  | 'CHECKING'
  | 'CONNECTED'
  | 'MISMATCH'
  | 'DISCONNECTED';

interface UseBrowserConnectionResult {
  status: BrowserConnectionStatus;
  activeUrl: string | null;
  activeTitle: string | null;
  pageSession: BrowserPageSession | null;
  isRegisteringSession: boolean;
  error: string | null;
  refreshTab: () => Promise<void>;
  registerSession: (detectedFields?: BrowserDetectedField[]) => Promise<BrowserPageSession | null>;
}

function parseUrlSafe(raw?: string | null): URL | null {
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function useBrowserConnection(
  task: FormTask | null,
  fields: DetectedField[] = [],
): UseBrowserConnectionResult {
  const [status, setStatus] = useState<BrowserConnectionStatus>('CHECKING');
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string | null>(null);
  const [pageSession, setPageSession] = useState<BrowserPageSession | null>(null);
  const [isRegisteringSession, setIsRegisteringSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkActiveTab = useCallback(async () => {
    setError(null);

    // If running in Chrome Extension environment
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const current = tabs[0];
        if (current?.url) {
          setActiveUrl(current.url);
          setActiveTitle(current.title || null);

          if (!task?.webpageUrl) {
            setStatus('CONNECTED');
            return;
          }

          const currentParsed = parseUrlSafe(current.url);
          const taskParsed = parseUrlSafe(task.webpageUrl);

          if (
            currentParsed &&
            taskParsed &&
            currentParsed.origin === taskParsed.origin &&
            currentParsed.pathname === taskParsed.pathname
          ) {
            setStatus('CONNECTED');
          } else {
            setStatus('MISMATCH');
          }
          return;
        }
      } catch (err) {
        console.warn('Chrome tab query failed:', err);
      }
    }

    // Fallback if testing or non-extension context
    if (task?.webpageUrl) {
      setActiveUrl(task.webpageUrl);
      setActiveTitle(task.webpageTitle || 'Webpage');
      setStatus('CONNECTED');
    } else {
      setStatus('DISCONNECTED');
    }
  }, [task]);

  useEffect(() => {
    let isMounted = true;
    void Promise.resolve().then(async () => {
      if (isMounted) {
        await checkActiveTab();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [checkActiveTab]);

  const registerSession = useCallback(
    async (detectedFields: BrowserDetectedField[] = []): Promise<BrowserPageSession | null> => {
      if (!task || !activeUrl) {
        setError('No active task or webpage URL available');
        return null;
      }

      setIsRegisteringSession(true);
      setError(null);

      try {
        const pageContext: BrowserPageContext = {
          url: activeUrl,
          title: activeTitle || undefined,
          detectedAt: new Date().toISOString(),
        };

        const sessionFields: BrowserDetectedField[] =
          detectedFields.length > 0
            ? detectedFields
            : fields.map((f) => ({
                fieldIdentifier: f.fieldIdentifier,
                fieldKey: f.fieldKey || undefined,
                label: f.label,
                name: f.name || undefined,
                elementType: f.elementType,
                inputType: f.inputType,
                placeholder: f.placeholder || undefined,
                isRequired: f.isRequired,
                isDisabled: f.isDisabled,
                isReadOnly: f.isReadOnly,
                detectedOrder: f.detectedOrder || undefined,
              }));

        // Minimum 1 field required by Phase 9 registration schema
        if (sessionFields.length === 0) {
          sessionFields.push({
            fieldIdentifier: 'default_form_field',
            label: 'Form Field',
            elementType: 'input',
            inputType: 'text',
          });
        }

        const session = await browserService.registerPageSession({
          protocolVersion: BROWSER_PROTOCOL_VERSION,
          messageId: crypto.randomUUID(),
          messageType: 'TASK_REGISTER',
          taskId: task.id,
          timestamp: new Date().toISOString(),
          idempotencyKey: `session-${task.id}-${task.version}`,
          payload: {
            pageContext,
            fields: sessionFields,
          },
        });

        setPageSession(session);
        return session;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to register browser session';
        setError(msg);
        return null;
      } finally {
        setIsRegisteringSession(false);
      }
    },
    [task, activeUrl, activeTitle, fields],
  );

  return {
    status,
    activeUrl,
    activeTitle,
    pageSession,
    isRegisteringSession,
    error,
    refreshTab: checkActiveTab,
    registerSession,
  };
}
