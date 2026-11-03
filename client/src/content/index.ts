/**
 * BhashaAgent Content Script (Manifest V3)
 *
 * Runs inside webpage contexts:
 * - Listens for authorized execution instructions from extension background/sidepanel
 * - Executes allowlisted actions (SET_VALUE, SELECT_OPTION, CHECK, UNCHECK)
 * - Verifies result states and returns structured acknowledgements
 * - NEVER submits webpage forms or executes arbitrary code
 */

import { executeSingleAction } from '../features/browser/services/dom-action-executor';
import type {
  BrowserFillAction,
  ActionResultItem,
  BrowserPageContext,
  BrowserDetectedField,
} from '../features/browser/types/browser.types';

export function scanPageFormFields(): {
  pageContext: BrowserPageContext;
  fields: BrowserDetectedField[];
} {
  const url = window.location.href;
  const title = document.title || undefined;
  const detectedAt = new Date().toISOString();

  const elements = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    ),
  );

  const fields: BrowserDetectedField[] = [];

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;

    const tag = el.tagName.toLowerCase();
    const type = el instanceof HTMLInputElement ? el.type.toLowerCase() : tag;

    // Skip submit, reset, and hidden inputs
    if (type === 'submit' || type === 'reset' || type === 'hidden' || type === 'button') {
      continue;
    }

    const id = el.id || '';
    const name = el.name || '';
    const fieldIdentifier = id || name || `field_${i + 1}`;

    // Resolve human-readable label
    let label = '';
    if (id) {
      const labelEl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (labelEl?.textContent) {
        label = labelEl.textContent.trim();
      }
    }
    if (!label && el.parentElement?.tagName.toLowerCase() === 'label') {
      label = el.parentElement.textContent?.trim() || '';
    }
    if (!label) {
      const placeholder = 'placeholder' in el ? (el as HTMLInputElement).placeholder : '';
      label = el.getAttribute('aria-label') || placeholder || name || id || `Field ${i + 1}`;
    }

    // Extract options for selects
    let options: Array<{ value: string | number | boolean; label?: string }> | undefined;
    if (el instanceof HTMLSelectElement) {
      options = Array.from(el.options).map((opt) => ({
        value: opt.value,
        label: opt.text.trim() || undefined,
      }));
    }

    fields.push({
      fieldIdentifier,
      fieldKey: name || undefined,
      label,
      name: name || undefined,
      elementType: tag,
      inputType: type,
      placeholder: 'placeholder' in el ? (el as HTMLInputElement).placeholder || undefined : undefined,
      isRequired: el.required || false,
      isDisabled: el.disabled || false,
      isReadOnly: 'readOnly' in el ? (el as HTMLInputElement).readOnly || false : false,
      detectedOrder: i + 1,
      options,
    });
  }

  return {
    pageContext: {
      url,
      title,
      detectedAt,
    },
    fields,
  };
}

export async function executeInstructionsOnPage(
  actions: BrowserFillAction[],
): Promise<{
  overallStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  results: ActionResultItem[];
}> {
  const results: ActionResultItem[] = [];

  for (const action of actions) {
    const res = await executeSingleAction(document, action);
    results.push(res);
  }

  const successCount = results.filter((r) => r.status === 'SUCCESS').length;
  let overallStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED';

  if (successCount === results.length && results.length > 0) {
    overallStatus = 'COMPLETED';
  } else if (successCount > 0) {
    overallStatus = 'PARTIAL';
  } else {
    overallStatus = 'FAILED';
  }

  return { overallStatus, results };
}

// Setup Chrome Runtime message listener if running inside extension
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ success: true, pong: true });
      return false;
    }

    if (message?.type === 'DETECT_PAGE_FIELDS') {
      try {
        const detected = scanPageFormFields();
        sendResponse({ success: true, data: detected });
      } catch (err) {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : 'Failed to scan page fields',
        });
      }
      return false;
    }

    if (message?.type === 'EXECUTE_FILL_INSTRUCTIONS') {
      const actions: BrowserFillAction[] = message.payload?.actions || [];
      void executeInstructionsOnPage(actions).then((res) => {
        sendResponse({ success: true, data: res });
      }).catch((err) => {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : 'Execution failed',
        });
      });
      return true; // Keep channel open for async response
    }

    return false;
  });
}
