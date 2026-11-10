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

function safeCssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

export function scanPageFormFields(doc: Document = document): {
  pageContext: BrowserPageContext;
  fields: BrowserDetectedField[];
} {
  const url = typeof window !== 'undefined' ? window.location.href : 'http://localhost';
  const title = doc.title || undefined;
  const detectedAt = new Date().toISOString();

  const elements = Array.from(
    doc.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea, [contenteditable="true"]',
    ),
  );

  const fields: BrowserDetectedField[] = [];
  const processedRadioGroups = new Set<string>();

  // Helper for multi-layer accessible label resolution
  function resolveFieldLabel(
    el: HTMLElement,
    id: string,
    name: string,
    placeholder?: string,
  ): string {
    // Layer 1: aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((partId) => doc.getElementById(partId)?.textContent?.trim())
        .filter(Boolean);
      if (parts.length > 0) return parts.join(' ');
    }

    // Layer 2: Explicit <label for="id">
    if (id) {
      try {
        const labelEl = doc.querySelector(`label[for="${safeCssEscape(id)}"]`);
        if (labelEl?.textContent?.trim()) {
          return labelEl.textContent.trim();
        }
      } catch {
        // Selector may be invalid in some edge cases
      }
    }

    // Layer 3: Wrapping <label>
    const parentLabel = el.closest('label');
    if (parentLabel?.textContent?.trim()) {
      // Exclude input's own text if any
      const clone = parentLabel.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input, select, textarea').forEach((input) => input.remove());
      const labelText = clone.textContent?.trim();
      if (labelText) return labelText;
    }

    // Layer 4: aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel?.trim()) return ariaLabel.trim();

    // Layer 5: Fieldset <legend>
    const fieldset = el.closest('fieldset');
    const legend = fieldset?.querySelector('legend');
    if (legend?.textContent?.trim()) {
      return legend.textContent.trim();
    }

    // Layer 6: Placeholder
    if (placeholder?.trim()) return placeholder.trim();

    // Layer 7: Preceding text or sibling label
    const prevEl = el.previousElementSibling;
    if (prevEl && (prevEl.tagName.toLowerCase() === 'label' || prevEl.classList.contains('label') || prevEl.classList.contains('form-label'))) {
      if (prevEl.textContent?.trim()) return prevEl.textContent.trim();
    }

    // Layer 8: Clean Name or ID
    const rawName = name || id;
    if (rawName) {
      return rawName
        .replace(/[-_]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();
    }

    return '';
  }

  // Helper to check element visibility
  function isElementVisible(el: HTMLElement): boolean {
    if (el.getAttribute('type') === 'hidden') return false;
    const style = typeof window !== 'undefined' ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
      return false;
    }
    return true;
  }

  let orderIndex = 1;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el || !isElementVisible(el)) continue;

    const tag = el.tagName.toLowerCase();
    const isInput = typeof HTMLInputElement !== 'undefined' ? el instanceof HTMLInputElement : tag === 'input';
    const isSelect = typeof HTMLSelectElement !== 'undefined' ? el instanceof HTMLSelectElement : tag === 'select';
    const type = isInput && 'type' in el && typeof (el as { type?: unknown }).type === 'string'
      ? (el as { type: string }).type.toLowerCase()
      : tag === 'contenteditable'
        ? 'contenteditable'
        : tag;

    // Skip submit, reset, and button inputs
    if (type === 'submit' || type === 'reset' || type === 'hidden' || type === 'button') {
      continue;
    }

    const id = el.id || '';
    const name = 'name' in el ? (el as HTMLInputElement).name || '' : '';
    const placeholder = 'placeholder' in el ? (el as HTMLInputElement).placeholder || undefined : undefined;

    // Handle Radio Button Groups: group radio inputs by name
    if (type === 'radio' && name) {
      if (processedRadioGroups.has(name)) {
        continue;
      }
      processedRadioGroups.add(name);

      const radioElements = Array.from(
        doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${safeCssEscape(name)}"]`),
      ).filter(isElementVisible);

      const groupLabel = resolveFieldLabel(el, id, name, placeholder) || name;
      const options: Array<{ value: string | number | boolean; label?: string }> = [];

      for (const radio of radioElements) {
        const radioLabel = resolveFieldLabel(radio, radio.id || '', '', undefined) || radio.value;
        options.push({
          value: radio.value,
          label: radioLabel,
        });
      }

      fields.push({
        fieldIdentifier: name,
        fieldKey: name,
        label: groupLabel,
        name,
        elementType: 'input',
        inputType: 'radio',
        isRequired: radioElements.some((r) => r.required),
        isDisabled: radioElements.every((r) => r.disabled),
        isReadOnly: radioElements.every((r) => r.readOnly),
        detectedOrder: orderIndex++,
        options,
      });
      continue;
    }

    let fieldIdentifier = id || '';
    if (!fieldIdentifier && type === 'checkbox') {
      const val = 'value' in el ? (el as HTMLInputElement).value : '';
      fieldIdentifier = name && val ? `${name}_${val}` : (name || `field_${orderIndex}`);
    } else if (!fieldIdentifier) {
      fieldIdentifier = name || `field_${orderIndex}`;
    }
    const label = resolveFieldLabel(el, id, name, placeholder) || `Field ${orderIndex}`;

    // Extract options for selects
    let options: Array<{ value: string | number | boolean; label?: string }> | undefined;
    if (isSelect && 'options' in el && (el as HTMLSelectElement).options) {
      options = Array.from((el as HTMLSelectElement).options).map((opt) => ({
        value: opt.value,
        label: opt.text ? opt.text.trim() || undefined : undefined,
      }));
    }

    fields.push({
      fieldIdentifier,
      fieldKey: name || undefined,
      label,
      name: name || undefined,
      elementType: tag,
      inputType: type,
      placeholder,
      isRequired: 'required' in el ? Boolean(el.required) : false,
      isDisabled: 'disabled' in el ? Boolean(el.disabled) : false,
      isReadOnly: 'readOnly' in el ? Boolean(el.readOnly) : false,
      detectedOrder: orderIndex++,
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

  console.log('[BhashaAgent ContentScript] Received fill instructions count:', actions.length, actions);
  for (const action of actions) {
    const res = await executeSingleAction(document, action);
    console.log('[BhashaAgent ContentScript] Action execution result:', res);
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

    if (message?.type === 'DETECT_PAGE_FIELDS' || message?.type === 'DISCOVER_FORM_CONTEXT') {
      try {
        const detected = scanPageFormFields();
        sendResponse({
          success: true,
          data: detected,
          fields: detected.fields,
          pageContext: detected.pageContext,
        });
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

  // Observe dynamic form mutations on the page
  let mutationTimeout: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (mutationTimeout) clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
      try {
        chrome.runtime?.sendMessage?.({ type: 'PAGE_DOM_MUTATED' })?.catch?.(() => {});
      } catch {
        // Suppress extension context invalidated errors
      }
    }, 500);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }
}
