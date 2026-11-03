/**
 * DOM Action Executor & Element Target Resolver
 *
 * Safe browser execution engine grounded in Backend Phase 9:
 * - Allowlist: SET_VALUE, SELECT_OPTION, CHECK, UNCHECK
 * - Framework-compatible reactive input setter (React/Vue/Angular)
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

/**
 * Find element on document using multiple resilient strategies:
 * 1. Exact ID match
 * 2. Exact name attribute
 * 3. Exact fieldIdentifier attribute/data-testid
 * 4. Associated label text
 */
export function resolveTargetElement(
  doc: Document,
  fieldIdentifier: string,
  expectedType?: string,
): HTMLElement | null {
  // Strategy 1: ID
  try {
    const byId = doc.getElementById(fieldIdentifier);
    if (byId && isValidFormElement(byId)) return byId;
  } catch {
    // Ignore invalid selector syntax
  }

  // Strategy 2: [name="..."]
  try {
    const escaped = CSS.escape(fieldIdentifier);
    const byName = doc.querySelector(`[name="${escaped}"]`);
    if (byName && isValidFormElement(byName)) return byName as HTMLElement;
  } catch {
    // Ignore invalid selector syntax
  }

  // Strategy 3: [id="..."], [data-field-id="..."], [data-testid="..."]
  try {
    const escaped = CSS.escape(fieldIdentifier);
    const byAttr = doc.querySelector(
      `[data-field-id="${escaped}"], [data-testid="${escaped}"], #${escaped}`,
    );
    if (byAttr && isValidFormElement(byAttr)) return byAttr as HTMLElement;
  } catch {
    // Ignore invalid selector syntax
  }

  // Strategy 4: Fallback to aria-label or label text search
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>('input, select, textarea'),
  );

  for (const el of candidates) {
    if (el.getAttribute('aria-label') === fieldIdentifier) return el;
    if (el.getAttribute('name') === fieldIdentifier) return el;
    if (el.id === fieldIdentifier) return el;

    // Check associated label
    if (el.id) {
      const label = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent?.trim().toLowerCase() === fieldIdentifier.toLowerCase()) {
        return el;
      }
    }
  }

  // Strategy 5: Match by expectedType and position if unique
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

  // Validate action allowlist
  if (!ALLOWED_ACTIONS.includes(action.action)) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: action.action,
      status: 'FAILED',
      errorCode: 'UNSUPPORTED_ACTION',
      message: `Action '${action.action}' is not permitted by Phase 9 allowlist`,
      executedAt: timestamp,
    };
  }

  // Resolve target element
  const element = resolveTargetElement(doc, action.fieldId, action.expectedFieldType);
  if (!element) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: action.action,
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
      actionType: action.action,
      status: 'FAILED',
      errorCode: usability.reason || 'ELEMENT_UNUSABLE',
      message: `Element is disabled or read-only`,
      executedAt: timestamp,
    };
  }

  try {
    switch (action.action) {
      case 'SET_VALUE': {
        if (!isInputElement(element) && !isTextAreaElement(element)) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: action.action,
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
            actionType: action.action,
            status: 'FAILED',
            errorCode: 'VERIFICATION_FAILED',
            message: `Readback value '${element.value}' did not match expected '${stringValue}'`,
            executedAt: timestamp,
          };
        }

        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: action.action,
          status: 'SUCCESS',
          executedAt: timestamp,
        };
      }

      case 'SELECT_OPTION': {
        if (!isSelectElement(element)) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: action.action,
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
            actionType: action.action,
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
            actionType: action.action,
            status: 'FAILED',
            errorCode: 'VERIFICATION_FAILED',
            message: `Selected value '${selectedVal}' did not match expected '${targetValue}'`,
            executedAt: timestamp,
          };
        }

        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: action.action,
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
            actionType: action.action,
            status: 'FAILED',
            errorCode: 'INVALID_ELEMENT_TYPE',
            message: `Element is not a checkbox input`,
            executedAt: timestamp,
          };
        }

        const desiredState = action.action === 'CHECK';
        if (element.checked !== desiredState) {
          element.checked = desiredState;
          dispatchInputEvents(element);
        }

        // Readback verification
        if (element.checked !== desiredState) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: action.action,
            status: 'FAILED',
            errorCode: 'VERIFICATION_FAILED',
            message: `Checkbox checked state '${element.checked}' did not match expected '${desiredState}'`,
            executedAt: timestamp,
          };
        }

        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: action.action,
          status: 'SUCCESS',
          executedAt: timestamp,
        };
      }

      default:
        return {
          fieldId: action.fieldId,
          actionId: action.actionId,
          actionType: action.action,
          status: 'FAILED',
          errorCode: 'UNSUPPORTED_ACTION',
          message: `Action ${(action as { action: string }).action} is not supported`,
          executedAt: timestamp,
        };
    }
  } catch (err) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: action.action,
      status: 'FAILED',
      errorCode: 'EXECUTION_ERROR',
      message: err instanceof Error ? err.message : 'Unknown execution error',
      executedAt: timestamp,
    };
  }
}
