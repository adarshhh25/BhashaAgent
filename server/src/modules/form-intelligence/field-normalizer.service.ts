import type { NormalizedField } from "./form-intelligence.types";

function words(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeField(field: {
  id: string;
  fieldIdentifier: string;
  label: string;
  name?: string | null;
  fieldKey?: string | null;
  placeholder?: string | null;
  inputType: string;
  isRequired: boolean;
  isDisabled: boolean;
  isReadOnly: boolean;
  options: unknown;
  groupName?: string | null;
}): NormalizedField {
  const searchableText = [
    field.label,
    field.name,
    field.fieldKey,
    field.placeholder,
  ].filter(Boolean).flatMap((value) => words(String(value))).join(" ");
  return {
    id: field.id,
    fieldIdentifier: field.fieldIdentifier,
    label: field.label,
    searchableText,
    inputType: field.inputType.toLowerCase(),
    required: field.isRequired,
    disabled: field.isDisabled,
    readOnly: field.isReadOnly,
    options: Array.isArray(field.options) ? field.options : [],
    groupName: field.groupName ?? undefined,
  };
}
