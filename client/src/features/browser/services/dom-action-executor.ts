/**
 * DOM Action Executor & Element Target Resolver
 *
 * Safe browser execution engine grounded in Backend Phase 9:
 * - Allowlist: SET_VALUE, SELECT_OPTION, CHECK, UNCHECK
 * - Framework-compatible reactive input setter (React/Vue/Angular)
 * - Support for radio button groups and multi-checkbox form controls
 * - Readback verification after state change
 * - Strict prohibition of form submission or arbitrary JavaScript
 */

import type {
  BrowserFillAction,
  ActionResultItem,
  BrowserActionType,
} from '../types/browser.types';

export const ALLOWED_ACTIONS: readonly BrowserActionType[] = [
  'SET_VALUE',
  'SELECT_OPTION',
  'CHECK',
  'UNCHECK',
] as const;

function safeCss(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Find element on document using multiple resilient strategies:
 * 1. Exact ID match
 * 2. Exact name attribute
 * 3. Exact fieldIdentifier attribute/data-testid
 * 4. Compound identifier for multi-element groups (e.g., topping_bacon, topping:cheese)
 * 5. Associated label text or option value
 */
export function resolveTargetElement(
  doc: Document,
  fieldIdentifier: string,
  expectedType?: string,
  _targetValue?: unknown,
): HTMLElement | null {
  if (!fieldIdentifier) return null;

  // Strategy 1: ID
  try {
    const byId = doc.getElementById(fieldIdentifier);
    if (byId && isValidFormElement(byId)) return byId;
  } catch {
    // Ignore invalid selector syntax
  }

  // Strategy 2: [name="..."]
  try {
    const escaped = safeCss(fieldIdentifier);
    const byName = doc.querySelector(`[name="${escaped}"]`);
    if (byName && isValidFormElement(byName)) return byName as HTMLElement;
  } catch {
    // Ignore invalid selector syntax
  }

  // Strategy 3: [id="..."], [data-field-id="..."], [data-testid="..."]
  try {
    const escaped = safeCss(fieldIdentifier);
    const byAttr = doc.querySelector(
      `[data-field-id="${escaped}"], [data-testid="${escaped}"], #${escaped}`,
    );
    if (byAttr && isValidFormElement(byAttr)) return byAttr as HTMLElement;
  } catch {
    // Ignore invalid selector syntax
  }

  // Strategy 4: Compound identifier resolution (e.g., "topping_bacon", "topping:cheese")
  const splitMatch = fieldIdentifier.match(/^([a-zA-Z0-9_-]+)[_:](.+)$/);
  if (splitMatch && splitMatch[1] && splitMatch[2]) {
    const groupName = splitMatch[1];
    const valPart = splitMatch[2].toLowerCase();
    try {
      const groupElements = Array.from(
        doc.querySelectorAll<HTMLInputElement>(`input[name="${safeCss(groupName)}"]`),
      );
      for (const el of groupElements) {
        if (el.value.toLowerCase() === valPart) return el;
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent?.trim().toLowerCase() === valPart) return el;
        if (el.id) {
          const l = doc.querySelector(`label[for="${safeCss(el.id)}"]`);
          if (l?.textContent?.trim().toLowerCase() === valPart) return el;
        }
      }
    } catch {
      // Ignore query exceptions
    }
  }

  // Strategy 5: Fallback to aria-label or label text search
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>('input, select, textarea'),
  );

  for (const el of candidates) {
    if (el.getAttribute('aria-label') === fieldIdentifier) return el;
    if (el.getAttribute('name') === fieldIdentifier) return el;
    if (el.id === fieldIdentifier) return el;

    // Check associated label
    if (el.id) {
      try {
        const label = doc.querySelector(`label[for="${safeCss(el.id)}"]`);
        if (label?.textContent?.trim().toLowerCase() === fieldIdentifier.toLowerCase()) {
          return el;
        }
      } catch {
        // Ignore selector error
      }
    }
  }

  // Strategy 6: If fieldIdentifier is an option value on a checkbox or radio
  const lowerIdent = fieldIdentifier.toLowerCase();
  for (const el of candidates) {
    if (isInputElement(el) && (el.type === 'checkbox' || el.type === 'radio')) {
      if (el.value.toLowerCase() === lowerIdent) return el;
      const pLabel = el.closest('label')?.textContent?.trim().toLowerCase();
      if (pLabel === lowerIdent) return el;
    }
  }

  // Strategy 7: Match by expectedType and position if unique
  if (expectedType) {
    const typeMatches = candidates.filter(
      (c) =>
        (c as HTMLInputElement).type?.toLowerCase() === expectedType.toLowerCase() ||
        c.tagName.toLowerCase() === expectedType.toLowerCase(),
    );
    if (typeMatches.length === 1 && typeMatches[0]) {
      return typeMatches[0];
    }
  }

  return null;
}

function isValidFormElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'select' || tag === 'textarea';
}

function isInputElement(el: unknown): el is HTMLInputElement {
  if (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) return true;
  return Boolean(
    el &&
      typeof el === 'object' &&
      'tagName' in el &&
      String((el as { tagName: unknown }).tagName).toUpperCase() === 'INPUT',
  );
}

function isTextAreaElement(el: unknown): el is HTMLTextAreaElement {
  if (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) return true;
  return Boolean(
    el &&
      typeof el === 'object' &&
      'tagName' in el &&
      String((el as { tagName: unknown }).tagName).toUpperCase() === 'TEXTAREA',
  );
}

function isSelectElement(el: unknown): el is HTMLSelectElement {
  if (typeof HTMLSelectElement !== 'undefined' && el instanceof HTMLSelectElement) return true;
  return Boolean(
    el &&
      typeof el === 'object' &&
      'tagName' in el &&
      String((el as { tagName: unknown }).tagName).toUpperCase() === 'SELECT',
  );
}

function isElementUsable(el: HTMLElement): { usable: boolean; reason?: string } {
  if ('disabled' in el && (el as HTMLInputElement).disabled) {
    return { usable: false, reason: 'ELEMENT_DISABLED' };
  }
  if ('readOnly' in el && (el as HTMLInputElement).readOnly) {
    return { usable: false, reason: 'ELEMENT_READONLY' };
  }
  return { usable: true };
}

/**
 * Dispatch reactive change and input events compatible with modern frontend frameworks.
 */
function dispatchInputEvents(el: HTMLElement): void {
  if (typeof Event !== 'undefined' && typeof el.dispatchEvent === 'function') {
    try {
      const inputEvent = new Event('input', { bubbles: true, cancelable: true, composed: true });
      const changeEvent = new Event('change', { bubbles: true, cancelable: true, composed: true });
      el.dispatchEvent(inputEvent);
      el.dispatchEvent(changeEvent);
    } catch {
      // Ignore in non-standard event environments
    }
  }
}

/**
 * Set value on HTMLInputElement or HTMLTextAreaElement using property descriptor
 * so React/Vue/Angular synthetic event listeners detect the change.
 */
function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  try {
    const prototype =
      typeof HTMLTextAreaElement !== 'undefined' && isTextAreaElement(el)
        ? HTMLTextAreaElement.prototype
        : typeof HTMLInputElement !== 'undefined'
        ? HTMLInputElement.prototype
        : undefined;

    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value') : undefined;
    if (descriptor?.set) {
      descriptor.set.call(el, value);
      return;
    }
  } catch {
    // Fallback below
  }
  el.value = value;
}

/**
 * Execute a single Phase 9 BrowserFillAction on the target element.
 */
export async function executeSingleAction(
  doc: Document,
  action: BrowserFillAction,
): Promise<ActionResultItem> {
  const timestamp = new Date().toISOString();

  // Support both action and actionType property names
  const rawAction = (action.action || (action as any).actionType) as BrowserActionType;

  // Validate action allowlist
  if (!ALLOWED_ACTIONS.includes(rawAction)) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: 'UNSUPPORTED_ACTION',
      message: `Action '${rawAction}' is not permitted by Phase 9 allowlist`,
      executedAt: timestamp,
    };
  }

  // Resolve target element using fieldId or fieldIdentifier
  const element = resolveTargetElement(
    doc,
    action.fieldId || (action as any).fieldIdentifier,
    action.expectedFieldType,
    action.value,
  );

  if (!element) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: 'FIELD_NOT_FOUND',
      message: `Could not locate target form field for '${action.fieldId}' on webpage`,
      executedAt: timestamp,
    };
  }

  // Validate element usable state
  const usability = isElementUsable(element);
  if (!usability.usable) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: usability.reason || 'ELEMENT_UNUSABLE',
      message: `Element is disabled or read-only`,
      executedAt: timestamp,
    };
  }

  try {
    // 1. Special Handling for Radio Buttons (supports SELECT_OPTION, SET_VALUE, or CHECK)
    if (isInputElement(element) && element.type?.toLowerCase() === 'radio') {
      let targetRadio: HTMLInputElement = element;
      const targetVal = String(action.value ?? '').trim().toLowerCase();

      // If resolved element's value doesn't match action.value and element has a group name, find matching radio
      if (element.name && targetVal) {
        try {
          const group = Array.from(
            doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${safeCss(element.name)}"]`),
          );
          const match = group.find((r) => {
            if (r.value.trim().toLowerCase() === targetVal) return true;
            const pLabel = r.closest('label')?.textContent?.trim().toLowerCase();
            if (pLabel === targetVal) return true;
            if (r.id) {
              const l = doc.querySelector(`label[for="${safeCss(r.id)}"]`);
              if (l?.textContent?.trim().toLowerCase() === targetVal) return true;
            }
            return false;
          });
          if (match) {
            targetRadio = match;
          }
        } catch {
          // Keep current targetRadio
        }
      }

      targetRadio.focus();
      targetRadio.checked = true;
      dispatchInputEvents(targetRadio);

      if (targetRadio.checked) {
        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: rawAction,
          status: 'SUCCESS',
          executedAt: timestamp,
        };
      } else {
        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: rawAction,
          status: 'FAILED',
          errorCode: 'VERIFICATION_FAILED',
          message: `Radio button '${targetRadio.value}' could not be checked`,
          executedAt: timestamp,
        };
      }
    }

    // 2. Standard Actions
    switch (rawAction) {
      case 'SET_VALUE': {
        // If checkbox was targeted with SET_VALUE (e.g. true/false)
        if (isInputElement(element) && element.type?.toLowerCase() === 'checkbox') {
          const desired = action.value === true || action.value === 'true' || action.value === 1 || String(action.value).toLowerCase() === 'on';
          element.focus();
          element.checked = desired;
          dispatchInputEvents(element);
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: element.checked === desired ? 'SUCCESS' : 'FAILED',
            executedAt: timestamp,
          };
        }

        if (!isInputElement(element) && !isTextAreaElement(element)) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'INVALID_ELEMENT_TYPE',
            message: `Element is not an input or textarea`,
            executedAt: timestamp,
          };
        }

        const stringValue =
          typeof action.value === 'object' && action.value !== null
            ? JSON.stringify(action.value)
            : String(action.value ?? '');

        element.focus();
        setNativeValue(element, stringValue);
        dispatchInputEvents(element);

        // Readback verification
        if (element.value !== stringValue) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'VERIFICATION_FAILED',
            message: `Readback value '${element.value}' did not match expected '${stringValue}'`,
            executedAt: timestamp,
          };
        }

        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: rawAction,
          status: 'SUCCESS',
          executedAt: timestamp,
        };
      }

      case 'SELECT_OPTION': {
        if (!isSelectElement(element)) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'INVALID_ELEMENT_TYPE',
            message: `Element is not a select element`,
            executedAt: timestamp,
          };
        }

        const targetValue = String(action.value);
        let found = false;

        for (let i = 0; i < element.options.length; i++) {
          const opt = element.options[i];
          if (
            opt &&
            (opt.value === targetValue ||
              opt.text.trim().toLowerCase() === targetValue.toLowerCase())
          ) {
            element.selectedIndex = i;
            found = true;
            break;
          }
        }

        if (!found) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'OPTION_NOT_FOUND',
            message: `Option '${targetValue}' was not found in select element`,
            executedAt: timestamp,
          };
        }

        element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

        // Readback verification
        const selected = element.options[element.selectedIndex];
        const selectedVal = selected?.value ?? '';
        const selectedText = selected?.text?.trim().toLowerCase() ?? '';
        if (selectedVal !== targetValue && selectedText !== targetValue.toLowerCase()) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'VERIFICATION_FAILED',
            message: `Selected value '${selectedVal}' did not match expected '${targetValue}'`,
            executedAt: timestamp,
          };
        }

        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: rawAction,
          status: 'SUCCESS',
          executedAt: timestamp,
        };
      }

      case 'CHECK':
      case 'UNCHECK': {
        if (!isInputElement(element) || String((element as HTMLInputElement).type).toLowerCase() !== 'checkbox') {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'INVALID_ELEMENT_TYPE',
            message: `Element is not a checkbox input`,
            executedAt: timestamp,
          };
        }

        const desiredState = rawAction === 'CHECK';
        element.focus();
        element.checked = desiredState;
        dispatchInputEvents(element);

        // Readback verification
        if (element.checked !== desiredState) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'VERIFICATION_FAILED',
            message: `Checkbox checked state '${element.checked}' did not match expected '${desiredState}'`,
            executedAt: timestamp,
          };
        }

        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: rawAction,
          status: 'SUCCESS',
          executedAt: timestamp,
        };
      }

      default:
        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: rawAction,
          status: 'FAILED',
          errorCode: 'UNSUPPORTED_ACTION',
          message: `Action ${rawAction} is not supported`,
          executedAt: timestamp,
        };
    }
  } catch (err) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: 'EXECUTION_ERROR',
      message: err instanceof Error ? err.message : 'Unknown execution error',
      executedAt: timestamp,
    };
  }
}
