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
  const splitMatch = fieldIdentifier.match(/^([-a-zA-Z0-9_]+)[_:](.+)$/);
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

  const cleanIdent = fieldIdentifier.toLowerCase().replace(/[:\s]+$/, '').trim();

  for (const el of candidates) {
    const elAria = (typeof el.getAttribute === 'function' ? el.getAttribute('aria-label') : '') || '';
    if (elAria.toLowerCase().replace(/[:\s]+$/, '').trim() === cleanIdent) return el;

    const elName = (typeof el.getAttribute === 'function' ? el.getAttribute('name') : (el as any).name) || '';
    if (elName.toLowerCase().replace(/[:\s]+$/, '').trim() === cleanIdent) return el;

    const elId = el.id || '';
    if (elId.toLowerCase().replace(/[:\s]+$/, '').trim() === cleanIdent) return el;

    // Check associated label for="id"
    if (el.id) {
      try {
        const label = doc.querySelector(`label[for="${safeCss(el.id)}"]`);
        if (label?.textContent?.trim().toLowerCase().replace(/[:\s]+$/, '').trim() === cleanIdent) {
          return el;
        }
      } catch {
        // Ignore selector error
      }
    }

    // Check wrapping <label>
    try {
      if (typeof el.closest === 'function') {
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent?.trim().toLowerCase().replace(/[:\s]+$/, '').trim() === cleanIdent) {
          return el;
        }
      }
    } catch {
      // Ignore closest errors
    }

    // Check preceding sibling <label>
    try {
      const prevEl = el.previousElementSibling;
      if (prevEl && (prevEl.tagName?.toLowerCase() === 'label' || (prevEl as HTMLElement).classList?.contains('label'))) {
        if (prevEl.textContent?.trim().toLowerCase().replace(/[:\s]+$/, '').trim() === cleanIdent) {
          return el;
        }
      }
    } catch {
      // Ignore sibling errors
    }
  }

  // Strategy 6: If fieldIdentifier is an option value on a checkbox or radio
  const lowerIdent = cleanIdent;
  for (const el of candidates) {
    if (isInputElement(el) && (el.type === 'checkbox' || el.type === 'radio')) {
      if (el.value.toLowerCase() === lowerIdent) return el;
      const pLabel = (typeof el.closest === 'function' ? el.closest('label')?.textContent : null)?.trim().toLowerCase();
      if (pLabel === lowerIdent) return el;
    }
  }

  // Strategy 7: Match telephone fields specifically when targeting telephone/phone
  if (/telephone|phone|mobile|tel|contact/i.test(cleanIdent)) {
    const telInput = candidates.find(
      (c) => isInputElement(c) && (c.type?.toLowerCase() === 'tel' || /tel|phone/i.test(c.name || c.id || '')),
    );
    if (telInput) return telInput;
  }

  // Strategy 8: Match by expectedType and position if unique
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
  const previousValue = el.value;
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
    } else {
      el.value = value;
    }
  } catch {
    el.value = value;
  }

  // React controlled component value-tracker synchronization
  try {
    const tracker = (el as any)._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') {
      tracker.setValue(previousValue === value ? (value === '' ? ' ' : '') : previousValue);
    }
  } catch {
    // Ignore tracker errors
  }
}

/**
 * Execute a single Phase 9 BrowserFillAction on the target element.
 */
const SENSITIVE_DOM_REGEX =
  /password|passcode|cvv|cvc|credit[\s_-]?card|card[\s_-]?number|debit[\s_-]?card|security[\s_-]?code|(?<![a-zA-Z])token(?![a-zA-Z])|(?<![a-zA-Z])secret(?![a-zA-Z])|private[\s_-]?key|api[\s_-]?key|(?<![a-zA-Z])otp(?![a-zA-Z])|upi[\s_-]?pin|aadhaar|(?<![a-zA-Z])pan(?![a-zA-Z])|(?<![a-zA-Z])ssn(?![a-zA-Z])/i;

function validateDomElementAgainstTarget(
  element: HTMLElement,
  requestedTarget?: string,
  originalInstruction?: string,
): { valid: boolean; reason?: string; errorCode?: string } {
  const targetText = (requestedTarget || originalInstruction || '').toLowerCase().trim();
  if (!targetText) return { valid: true };

  const elName = (typeof element.getAttribute === 'function' ? element.getAttribute('name') : (element as any).name || '') || '';
  const elId = element.id || '';
  const elLabel = (typeof element.closest === 'function' ? element.closest('label')?.textContent : '') || '';
  const elAria = (typeof element.getAttribute === 'function' ? element.getAttribute('aria-label') : '') || '';
  const searchable = `${elName} ${elId} ${elLabel} ${elAria}`.toLowerCase();

  // 1. Person name vs non-person entities
  const isPersonRequest = /\b(customer\s*name|my\s*name|applicant\s*name|full\s*name|first\s*name|last\s*name|your\s*name|user\s*name|custname|नाम|नाव)\b/i.test(targetText);
  const isNonPersonEntity = /\b(university|college|institution|school|company|employer|organization|file|attachment|resume)\b/i.test(searchable);
  if (isPersonRequest && isNonPersonEntity) {
    return {
      valid: false,
      reason: `Target element '${searchable}' is an organization or file entity, not a personal name`,
      errorCode: 'TARGET_FIELD_MISMATCH',
    };
  }

  // 2. Personal name vs Emergency Contact Name specificity
  const isExplicitCustomer = /\b(customer\s*name|my\s*name|applicant\s*name|your\s*name|custname)\b/i.test(targetText);
  const isEmergency = /\b(emergency|secondary|guardian)\b/i.test(searchable);
  if (isExplicitCustomer && isEmergency) {
    return {
      valid: false,
      reason: `Target element '${searchable}' is emergency contact, but user requested customer name`,
      errorCode: 'TARGET_FIELD_MISMATCH',
    };
  }

  // 3. Phone vs PIN code
  const isPhoneRequest = /\b(phone|telephone|mobile|tel|cell)\b/i.test(targetText);
  const isPostalField = /\b(pin\s*code|pincode|postal|zip)\b/i.test(searchable);
  if (isPhoneRequest && isPostalField) {
    return {
      valid: false,
      reason: `Target element '${searchable}' is postal code, but user requested phone number`,
      errorCode: 'TARGET_FIELD_MISMATCH',
    };
  }

  // 4. Address vs Email
  const isAddressRequest = /\b(street\s*address|delivery\s*address|residential\s*address|address|पता)\b/i.test(targetText) && !targetText.includes('email');
  const isEmailField = /\b(email|e-mail)\b/i.test(searchable);
  if (isAddressRequest && isEmailField) {
    return {
      valid: false,
      reason: `Target element '${searchable}' is email, but user requested physical address`,
      errorCode: 'TARGET_FIELD_MISMATCH',
    };
  }

  // 5. DOB vs Application/Submission Date
  const isDobRequest = /\b(date\s*of\s*birth|dob|birth\s*date)\b/i.test(targetText);
  const isEventDateField = /\b(application\s*date|submission\s*date|order\s*date|delivery\s*date)\b/i.test(searchable);
  if (isDobRequest && isEventDateField) {
    return {
      valid: false,
      reason: `Target element '${searchable}' is event/application date, but user requested date of birth`,
      errorCode: 'TARGET_FIELD_MISMATCH',
    };
  }

  return { valid: true };
}

export function isElementSensitive(element: HTMLElement): boolean {
  if (isInputElement(element)) {
    const inputType = (element.type || '').toLowerCase();
    if (inputType === 'password') return true;
    const autocomplete = (element.autocomplete || '').toLowerCase();
    if (
      autocomplete.includes('cc-') ||
      autocomplete.includes('current-password') ||
      autocomplete.includes('new-password') ||
      autocomplete.includes('one-time-code')
    ) {
      return true;
    }
  }
  const name = (typeof element.getAttribute === 'function' ? element.getAttribute('name') : (element as any).name || '') || '';
  const id = (element.id || '') || '';
  const ariaLabel = (typeof element.getAttribute === 'function' ? element.getAttribute('aria-label') : '') || '';
  const placeholder = (typeof element.getAttribute === 'function' ? element.getAttribute('placeholder') : (element as any).placeholder || '') || '';

  return (
    SENSITIVE_DOM_REGEX.test(name) ||
    SENSITIVE_DOM_REGEX.test(id) ||
    SENSITIVE_DOM_REGEX.test(ariaLabel) ||
    SENSITIVE_DOM_REGEX.test(placeholder)
  );
}

export async function executeSingleAction(
  doc: Document,
  action: BrowserFillAction,
): Promise<ActionResultItem> {
  const timestamp = new Date().toISOString();

  // Support both action and actionType property names
  const rawAction = (action.action || (action as any).actionType) as BrowserActionType;

  // Immediate cancellation boundary check
  if ((action as any).cancelled || (action as any).status === 'CANCELLED') {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'SKIPPED',
      errorCode: 'EXECUTION_CANCELLED',
      message: 'Action was cancelled before DOM mutation',
      executedAt: timestamp,
    };
  }

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

  // DOM attachment check
  if (typeof element.isConnected === 'boolean' && !element.isConnected) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: 'STALE_FIELD_REFERENCE',
      message: 'Browser element is detached from the DOM',
      executedAt: timestamp,
    };
  }

  // Boundary validation against user instruction / requested target
  const targetCheck = validateDomElementAgainstTarget(element, action.requestedTarget, action.originalInstruction);
  if (!targetCheck.valid) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: targetCheck.errorCode || 'TARGET_FIELD_MISMATCH',
      message: targetCheck.reason || 'Target element does not match requested entity',
      executedAt: timestamp,
    };
  }

  // Sensitive field protection boundary check
  if (isElementSensitive(element)) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: 'PROTECTED_SENSITIVE_FIELD',
      message: 'Protected sensitive fields (passwords, cards, CVV, authentication tokens, government IDs) cannot be autofilled by extension',
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

  // File input protection: browsers strictly forbid setting value programmatically on input[type="file"]
  if (isInputElement(element) && element.type?.toLowerCase() === 'file') {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: 'INCOMPATIBLE_FIELD_TYPE',
      message: 'File upload inputs cannot accept programmatic text values for browser security reasons. Use native file picker.',
      executedAt: timestamp,
    };
  }

  // Cross-type action compatibility
  if ((rawAction === 'CHECK' || rawAction === 'UNCHECK') && (!isInputElement(element) || element.type?.toLowerCase() !== 'checkbox')) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: 'INCOMPATIBLE_FIELD_TYPE',
      message: `Action '${rawAction}' cannot be executed against non-checkbox element`,
      executedAt: timestamp,
    };
  }
  if (rawAction === 'SELECT_OPTION' && !isSelectElement(element) && (!isInputElement(element) || element.type?.toLowerCase() !== 'radio')) {
    return {
      fieldId: action.fieldId,
      actionId: action.actionId,
      actionType: rawAction,
      status: 'FAILED',
      errorCode: 'INCOMPATIBLE_FIELD_TYPE',
      message: `Action 'SELECT_OPTION' cannot be executed against non-select/non-radio element`,
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

      if (typeof targetRadio.focus === "function") targetRadio.focus();
      if (!targetRadio.checked) {
        if (typeof targetRadio.click === "function") targetRadio.click();
      }
      if (!targetRadio.checked) {
        targetRadio.checked = true;
      }
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
        // If checkbox was targeted with SET_VALUE (e.g. true/false or array of group values)
        if (isInputElement(element) && element.type?.toLowerCase() === 'checkbox') {
          const targetVal = String(action.value ?? '').trim().toLowerCase();
          if (element.name && (Array.isArray(action.value) || (targetVal !== 'true' && targetVal !== 'false' && targetVal !== '1' && targetVal !== '0' && targetVal !== 'on' && targetVal !== ''))) {
            const desiredValues = Array.isArray(action.value)
              ? (action.value as unknown[]).map((v) => String(v).trim().toLowerCase())
              : targetVal.split(/[,\s]+/).map((v) => v.trim().toLowerCase());

            const group = Array.from(doc.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${safeCss(element.name)}"]`));
            let allPassed = true;
            for (const box of group) {
              const boxVal = box.value.trim().toLowerCase();
              const boxLabel = (box.closest('label')?.textContent || '').trim().toLowerCase();
              const shouldBeChecked = desiredValues.includes('all') || desiredValues.some((dv) => dv === boxVal || dv === boxLabel || boxLabel.includes(dv));
              if (shouldBeChecked && !box.checked) {
                if (typeof box.click === 'function') box.click();
                if (!box.checked) box.checked = true;
                dispatchInputEvents(box);
                if (!box.checked) allPassed = false;
              }
            }
            return {
              fieldId: action.fieldId,
              actionId: action.actionId,
              actionType: rawAction,
              status: allPassed ? 'SUCCESS' : 'FAILED',
              executedAt: timestamp,
            };
          }

          const desired = action.value === true || action.value === 'true' || action.value === 1 || String(action.value).toLowerCase() === 'on';
          if (typeof element.focus === "function") element.focus();
          if (element.checked !== desired) {
            if (typeof element.click === "function") element.click();
          }
          if (element.checked !== desired) {
            element.checked = desired;
          }
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

        // Value validity check before DOM mutation
        const inputType = isInputElement(element) ? (element.type || 'text').toLowerCase() : 'textarea';
        const targetType = (action.expectedFieldType || inputType).toLowerCase();

        if (targetType === 'email' && stringValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stringValue)) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'INVALID_FIELD_VALUE',
            message: `Value '${stringValue}' is not a valid email address`,
            executedAt: timestamp,
          };
        }
        if (targetType === 'number' && stringValue && isNaN(Number(stringValue))) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'INVALID_FIELD_VALUE',
            message: `Value '${stringValue}' is not a valid number`,
            executedAt: timestamp,
          };
        }
        if (targetType === 'tel' && stringValue && (/[a-zA-Z]/.test(stringValue) || stringValue.replace(/\D/g, '').length < 3)) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'INVALID_FIELD_VALUE',
            message: `Value '${stringValue}' is not a valid phone number`,
            executedAt: timestamp,
          };
        }
        if (targetType === 'date' && stringValue && !/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'INVALID_FIELD_VALUE',
            message: `Value '${stringValue}' is not a valid date (YYYY-MM-DD)`,
            executedAt: timestamp,
          };
        }
        if (targetType === 'time' && stringValue && !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(stringValue)) {
          return {
            fieldId: action.fieldId,
            actionId: action.actionId,
            actionType: rawAction,
            status: 'FAILED',
            errorCode: 'INVALID_FIELD_VALUE',
            message: `Value '${stringValue}' is not a valid time (HH:MM)`,
            executedAt: timestamp,
          };
        }

        if (typeof element.focus === "function") element.focus();
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
        if (typeof element.focus === "function") element.focus();
        if (element.checked !== desiredState) {
          if (typeof element.click === "function") element.click();
        }
        if (element.checked !== desiredState) {
          element.checked = desiredState;
        }
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


/**
 * Execute multiple Phase 9 BrowserFillActions sequentially.
 */
export async function executeInstructionsOnPage(
  actions: BrowserFillAction[],
  doc: Document = typeof document !== 'undefined' ? document : (null as unknown as Document),
): Promise<{
  overallStatus: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  results: ActionResultItem[];
}> {
  const results: ActionResultItem[] = [];
  for (const action of actions) {
    const res = await executeSingleAction(doc, action);
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
