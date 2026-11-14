import type { NormalizedField } from "./form-intelligence.types";
import { extractSpokenEmail } from "./spoken-email-normalizer";

export interface TypeValidation {
  valid: boolean;
  value?: unknown;
  reason?: string;
  errorCode?: "INCOMPATIBLE_FIELD_TYPE" | "PROTECTED_SENSITIVE_FIELD" | "INVALID_VALUE";
}

export interface FieldCompatibilityResult {
  compatible: boolean;
  errorCode?: "INCOMPATIBLE_FIELD_TYPE" | "PROTECTED_SENSITIVE_FIELD" | "INVALID_VALUE";
  reason?: string;
  resolvedType?: string;
}

export const SENSITIVE_FIELD_REGEX =
  /password|passcode|cvv|cvc|credit[\s_-]?card|card[\s_-]?number|debit[\s_-]?card|security[\s_-]?code|(?<![a-zA-Z])token(?![a-zA-Z])|(?<![a-zA-Z])secret(?![a-zA-Z])|private[\s_-]?key|api[\s_-]?key|(?<![a-zA-Z])otp(?![a-zA-Z])|upi[\s_-]?pin|aadhaar|(?<![a-zA-Z])pan(?![a-zA-Z])|(?<![a-zA-Z])ssn(?![a-zA-Z])/i;

export function isSensitiveField(field: {
  inputType?: string | null;
  name?: string | null;
  label?: string | null;
  fieldIdentifier?: string | null;
}): boolean {
  if ((field.inputType || "").toLowerCase() === "password") return true;
  const name = field.name || "";
  const label = field.label || "";
  const id = field.fieldIdentifier || "";
  return SENSITIVE_FIELD_REGEX.test(name) || SENSITIVE_FIELD_REGEX.test(label) || SENSITIVE_FIELD_REGEX.test(id);
}

function optionValue(option: unknown): unknown {
  if (option && typeof option === "object" && "value" in option) return (option as { value: unknown }).value;
  return option;
}

/**
 * Centralized Field-Type Compatibility Policy
 * Validates whether a value and/or action is compatible with a given form field.
 */
export function isFieldTypeCompatible(
  field: {
    inputType?: string | null;
    elementType?: string | null;
    name?: string | null;
    label?: string | null;
    fieldIdentifier?: string | null;
    options?: unknown;
    groupName?: string | null;
  },
  value: unknown,
  actionType?: string,
): FieldCompatibilityResult {
  const inputType = (field.inputType || "").toLowerCase();
  const elementType = (field.elementType || "").toLowerCase();

  // 1. Mandatory exclusion: FILE fields cannot accept ordinary text or automated values
  if (inputType === "file" || elementType === "file") {
    return {
      compatible: false,
      errorCode: "INCOMPATIBLE_FIELD_TYPE",
      reason: "File attachment fields require user selection through the browser's native file picker and cannot be filled with text values.",
    };
  }

  // 2. Sensitive fields protection
  if (isSensitiveField(field)) {
    return {
      compatible: false,
      errorCode: "PROTECTED_SENSITIVE_FIELD",
      reason: "Sensitive fields require explicit user input directly on the webpage for security.",
    };
  }

  // 3. Null / undefined / empty check
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return {
      compatible: false,
      errorCode: "INVALID_VALUE",
      reason: "A non-empty value is required.",
    };
  }

  const act = (actionType || "").toUpperCase();

  // 4. Action-specific compatibility
  if (act === "CHECK" || act === "UNCHECK") {
    if (inputType !== "checkbox") {
      return {
        compatible: false,
        errorCode: "INCOMPATIBLE_FIELD_TYPE",
        reason: `Action '${act}' is only compatible with checkbox fields, got '${inputType || elementType}'.`,
      };
    }
    return { compatible: true, resolvedType: "checkbox" };
  }

  if (act === "SELECT_OPTION") {
    if (inputType !== "select" && inputType !== "radio" && elementType !== "select") {
      return {
        compatible: false,
        errorCode: "INCOMPATIBLE_FIELD_TYPE",
        reason: `Action 'SELECT_OPTION' is only compatible with select or radio controls, got '${inputType || elementType}'.`,
      };
    }
  }

  // 5. Value vs Field Type compatibility
  if (inputType === "checkbox") {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return {
          compatible: false,
          errorCode: "INVALID_VALUE",
          reason: "Checkbox selection list cannot be empty.",
        };
      }
      const fieldOptions = Array.isArray(field.options) ? (field.options as any[]) : [];
      if (fieldOptions.length > 0) {
        const allMatch = value.every((item) => {
          const candidate = String(item).toLowerCase().trim();
          return fieldOptions.some((opt: any) => {
            const ov = opt && typeof opt === "object" && "value" in opt ? String(opt.value).toLowerCase() : String(opt).toLowerCase();
            const ol = opt && typeof opt === "object" && "label" in opt ? String(opt.label).toLowerCase() : ov;
            return ov === candidate || ol === candidate;
          });
        });
        if (!allMatch) {
          return {
            compatible: false,
            errorCode: "INVALID_VALUE",
            reason: `One or more selected values in [${value.join(", ")}] are not valid options for ${field.label || field.fieldIdentifier}.`,
          };
        }
      }
      return { compatible: true, resolvedType: "checkbox" };
    }

    const isBool = typeof value === "boolean" || value === "true" || value === "false" || value === 1 || value === 0;
    const isMatchingOption = Array.isArray(field.options) && field.options.some((opt: any) => {
      const ov = opt && typeof opt === "object" && "value" in opt ? String(opt.value).toLowerCase() : String(opt).toLowerCase();
      const ol = opt && typeof opt === "object" && "label" in opt ? String(opt.label).toLowerCase() : ov;
      const candidate = String(value).toLowerCase().trim();
      return ov === candidate || ol === candidate;
    });

    if (!isBool && !isMatchingOption) {
      return {
        compatible: false,
        errorCode: "INCOMPATIBLE_FIELD_TYPE",
        reason: "Checkbox fields require a boolean, selection value, or matching option, not arbitrary text.",
      };
    }
    return { compatible: true, resolvedType: "checkbox" };
  }

  if (inputType === "select" || inputType === "radio") {
    if (Array.isArray(field.options) && field.options.length > 0) {
      const candidate = typeof value === "string" ? value.trim().toLowerCase() : String(value).toLowerCase();
      const matched = field.options.some((opt: any) => {
        const ov = opt && typeof opt === "object" && "value" in opt ? String(opt.value).toLowerCase() : String(opt).toLowerCase();
        const ol = opt && typeof opt === "object" && "label" in opt ? String(opt.label).toLowerCase() : ov;
        return ov === candidate || ol === candidate;
      });
      if (!matched) {
        return {
          compatible: false,
          errorCode: "INVALID_VALUE",
          reason: `Value "${value}" is not one of the available options for ${field.label || field.fieldIdentifier}.`,
        };
      }
    }
    return { compatible: true, resolvedType: inputType };
  }

  if (inputType === "email") {
    const str = String(value).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
      const normalizedSpoken = extractSpokenEmail(str);
      if (normalizedSpoken) {
        return { compatible: true, resolvedType: "email" };
      }
      return {
        compatible: false,
        errorCode: "INVALID_VALUE",
        reason: `Value "${value}" is not a valid email address.`,
      };
    }
    return { compatible: true, resolvedType: "email" };
  }

  if (inputType === "tel") {
    const str = String(value).trim();
    const hasSpokenDigits = /(?:zero|one|two|three|four|five|six|seven|eight|nine|double|triple|शून्य|एक|दो|तीन|चार|पाँच|छह|सात|आठ|नौ)/i.test(str);
    if ((/[a-zA-Z]/.test(str) && !hasSpokenDigits) || (!hasSpokenDigits && str.replace(/\D/g, "").length < 3)) {
      return {
        compatible: false,
        errorCode: "INVALID_VALUE",
        reason: `Value "${value}" is not a valid telephone number.`,
      };
    }
    return { compatible: true, resolvedType: "tel" };
  }

  if (inputType === "number" || inputType === "range") {
    if (typeof value !== "number" && (typeof value !== "string" || isNaN(Number(value)) || !/^-?\d+(?:\.\d+)?$/.test(value.trim()))) {
      return {
        compatible: false,
        errorCode: "INVALID_VALUE",
        reason: `Value "${value}" is not a valid numeric quantity.`,
      };
    }
    return { compatible: true, resolvedType: "number" };
  }

  if (inputType === "date") {
    const str = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return {
        compatible: false,
        errorCode: "INVALID_VALUE",
        reason: `Value "${value}" is not an ISO date (YYYY-MM-DD).`,
      };
    }
    return { compatible: true, resolvedType: "date" };
  }

  if (inputType === "time") {
    const str = String(value).trim();
    const hasSpokenTime = /(?:am|pm|o'clock|half|quarter|seven|eight|nine|ten|eleven|twelve|one|two|three|four|five|six|शाम|सुबह|बजे|संध्याकाळी)/i.test(str);
    if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(str) && !hasSpokenTime) {
      return {
        compatible: false,
        errorCode: "INVALID_VALUE",
        reason: `Value "${value}" is not a valid time format (HH:MM).`,
      };
    }
    return { compatible: true, resolvedType: "time" };
  }

  if (inputType === "datetime-local") {
    const str = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
      return {
        compatible: false,
        errorCode: "INVALID_VALUE",
        reason: `Value "${value}" is not an ISO datetime format (YYYY-MM-DDTHH:MM).`,
      };
    }
    return { compatible: true, resolvedType: "datetime-local" };
  }

  return { compatible: true, resolvedType: inputType || elementType || "text" };
}

export function validateFieldValue(field: NormalizedField, value: unknown): TypeValidation {
  const compat = isFieldTypeCompatible(field, value);
  if (!compat.compatible) {
    return {
      valid: false,
      reason: compat.reason,
      errorCode: compat.errorCode,
    };
  }

  if (["select", "radio"].includes(field.inputType.toLowerCase())) {
    const candidate = typeof value === "string" ? value.trim() : value;
    const resolvedOpt = field.options.map(optionValue).find((option) =>
      option === candidate || String(option).trim().toLowerCase() === String(candidate).toLowerCase(),
    );
    return { valid: true, value: resolvedOpt ?? value };
  }

  if (field.inputType.toLowerCase() === "email") {
    const candidate = typeof value === "string" ? value.trim() : String(value);
    const resolvedEmail = extractSpokenEmail(candidate);
    return { valid: true, value: resolvedEmail ?? value };
  }

  return { valid: true, value };
}
