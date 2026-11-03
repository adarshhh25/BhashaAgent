import type { NormalizedField } from "./form-intelligence.types";

export interface TypeValidation {
  valid: boolean;
  value?: unknown;
  reason?: string;
}

function optionValue(option: unknown): unknown {
  if (option && typeof option === "object" && "value" in option) return (option as { value: unknown }).value;
  return option;
}

export function validateFieldValue(field: NormalizedField, value: unknown): TypeValidation {
  if (value === null || value === undefined || value === "") return { valid: false, reason: "A non-empty value is required" };
  if (field.inputType === "password") return { valid: false, reason: "Sensitive fields require explicit user input" };
  if (["text", "textarea", "email", "tel", "url"].includes(field.inputType) && typeof value !== "string") {
    return { valid: false, reason: "Expected a text value" };
  }
  if (field.inputType === "email" && (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
    return { valid: false, reason: "Value is not a valid email address" };
  }
  if (["number", "range"].includes(field.inputType) && typeof value !== "number" && typeof value !== "string") {
    return { valid: false, reason: "Expected a numeric value" };
  }
  if (["number", "range"].includes(field.inputType) && typeof value === "string" && !/^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return { valid: false, reason: "Expected a numeric value" };
  }
  if (field.inputType === "date" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
    return { valid: false, reason: "Expected an ISO date value" };
  }
  if (["select", "radio"].includes(field.inputType)) {
    const candidate = typeof value === "string" ? value.trim() : value;
    const matched = field.options.map(optionValue).some((option) =>
      option === candidate || String(option).trim().toLowerCase() === String(candidate).toLowerCase(),
    );
    if (!matched) return { valid: false, reason: "Value is not one of the available options" };
    return { valid: true, value: field.options.map(optionValue).find((option) =>
      option === candidate || String(option).trim().toLowerCase() === String(candidate).toLowerCase(),
    ) };
  }
  if (field.inputType === "checkbox") {
    if (field.groupName || field.options.length > 0) {
      if (!Array.isArray(value) || value.length === 0) return { valid: false, reason: "Expected selected checkbox options" };
      const options = field.options.map(optionValue);
      if (value.some((item) => !options.some((option) => String(option).trim().toLowerCase() === String(item).trim().toLowerCase()))) {
        return { valid: false, reason: "Selected checkbox option is not available" };
      }
    } else if (typeof value !== "boolean") {
      return { valid: false, reason: "Expected a boolean checkbox value" };
    }
  }
  return { valid: true, value };
}
