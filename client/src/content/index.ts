/**
 * BhashaAgent Content Script (Manifest V3)
 *
 * Runs inside webpage contexts:
 * - Listens for authorized execution instructions from extension background/sidepanel
 * - Executes allowlisted actions (SET_VALUE, SELECT_OPTION, CHECK, UNCHECK)
 * - Verifies result states and returns structured acknowledgements
 * - NEVER submits webpage forms or executes arbitrary code
 */

import { executeSingleAction, isElementSensitive } from '../features/browser/services/dom-action-executor';
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
  const processedCheckboxGroups = new Set<string>();

  // Helper to resolve group label (e.g. Fieldset <legend>, role="group" aria-label, preceding heading)
  function resolveGroupLabel(el: HTMLElement, name: string): string {
    // 1. Check Fieldset Legend
    const fieldset = el.closest('fieldset');
    const legend = fieldset?.querySelector('legend');
    if (legend?.textContent?.trim()) {
      return legend.textContent.trim().replace(/[:\s]+$/, '');
    }

    // 2. Check role="radiogroup" or role="group" aria-label / aria-labelledby
    const groupContainer = el.closest('[role="radiogroup"], [role="group"]');
    if (groupContainer) {
      const ariaLabel = groupContainer.getAttribute('aria-label');
      if (ariaLabel?.trim()) return ariaLabel.trim();
      const labelledBy = groupContainer.getAttribute('aria-labelledby');
      if (labelledBy) {
        const parts = labelledBy.split(/\s+/).map((partId) => doc.getElementById(partId)?.textContent?.trim()).filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
      }
    }

    // 3. Preceding heading / group label in container
    const parentContainer = el.closest('.form-group, .field-group, .form-row, div, section');
    const heading = parentContainer?.querySelector('label, h3, h4, h5, .group-title, .group-label');
    if (heading && !heading.querySelector('input') && heading.textContent?.trim()) {
      return heading.textContent.trim().replace(/[:\s]+$/, '');
    }

    // 4. Cleaned name attribute
    if (name) {
      return name
        .replace(/[-_]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .trim();
    }

    return '';
  }

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

      const groupLabel = resolveGroupLabel(el, name) || resolveFieldLabel(el, id, name, placeholder) || name;
      const options: Array<{ value: string | number | boolean; label?: string; checked?: boolean; disabled?: boolean }> = [];

      for (const radio of radioElements) {
        const radioLabel = resolveFieldLabel(radio, radio.id || '', '', undefined) || radio.value;
        options.push({
          value: radio.value,
          label: radioLabel,
          checked: radio.checked,
          disabled: radio.disabled,
        });
      }

      const selectedRadio = radioElements.find((r) => r.checked);
      const radioCurrentValue = selectedRadio ? selectedRadio.value : undefined;

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
        currentValue: radioCurrentValue || undefined,
      });
      continue;
    }

    // Handle Checkbox Groups: group checkboxes sharing the same name
    if (type === 'checkbox' && name) {
      const sameNameCheckboxes = Array.from(
        doc.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${safeCssEscape(name)}"]`),
      ).filter(isElementVisible);

      if (sameNameCheckboxes.length > 1) {
        if (processedCheckboxGroups.has(name)) {
          continue;
        }
        processedCheckboxGroups.add(name);

        const groupLabel = resolveGroupLabel(el, name) || name;
        const options: Array<{ value: string | number | boolean; label?: string; checked?: boolean; disabled?: boolean }> = [];

        for (const chk of sameNameCheckboxes) {
          const chkLabel = resolveFieldLabel(chk, chk.id || '', '', undefined) || chk.value;
          options.push({
            value: chk.value,
            label: chkLabel,
            checked: chk.checked,
            disabled: chk.disabled,
          });
        }

        const checkedBoxes = sameNameCheckboxes.filter((c) => c.checked);
        const checkedValues = checkedBoxes.map((c) => c.value);

        fields.push({
          fieldIdentifier: name,
          fieldKey: name,
          label: groupLabel,
          name,
          elementType: 'input',
          inputType: 'checkbox',
          isRequired: sameNameCheckboxes.some((r) => r.required),
          isDisabled: sameNameCheckboxes.every((r) => r.disabled),
          isReadOnly: sameNameCheckboxes.every((r) => r.readOnly),
          detectedOrder: orderIndex++,
          options,
          currentValue: checkedValues.length > 0 ? checkedValues.join(', ') : undefined,
        });
        continue;
      }
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

    const currentValue =
      isElementSensitive(el) || type === 'file'
        ? undefined
        : type === 'checkbox'
        ? (el as HTMLInputElement).checked ? (el as HTMLInputElement).value || 'true' : undefined
        : (isInput || isSelect || tag === 'textarea')
        ? (el as HTMLInputElement).value
        : undefined;

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
      currentValue: currentValue || undefined,
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

// Per-turn cancellation: monotonically increasing generation ID.
// When a cancel is received, the latestGenerationId advances and any
// EXECUTE_FILL_INSTRUCTIONS carrying a stale generationId is rejected.
let latestGenerationId = 0;

// Setup Chrome Runtime message listener if running inside extension
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING') {
      sendResponse({ success: true, pong: true });
      return false;
    }

    // Cancellation signal: advance the generation so stale turns are rejected.
    if (message?.type === 'CANCEL_FILL_EXECUTION') {
      latestGenerationId++;
      console.log('[BhashaAgent ContentScript] Cancellation received, advancing generationId to', latestGenerationId);
      sendResponse({ success: true, generationId: latestGenerationId });
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
      // Static boolean snapshot check (legacy path)
      if (message.payload?.cancelled) {
        sendResponse({ success: false, cancelled: true, message: 'Execution was cancelled before DOM mutation' });
        return false;
      }
      // Generation-ID check: reject stale turns
      const msgGenId = typeof message.payload?.generationId === 'number' ? message.payload.generationId : -1;
      if (msgGenId >= 0 && msgGenId < latestGenerationId) {
        console.log('[BhashaAgent ContentScript] Rejecting stale turn generationId', msgGenId, '< current', latestGenerationId);
        sendResponse({ success: false, cancelled: true, message: 'Stale turn rejected by generationId check' });
        return false;
      }
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
