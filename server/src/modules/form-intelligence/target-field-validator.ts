/**
 * Target Field Validation Layer
 *
 * Strict validation of target form fields against user instructions prior to
 * proposing or executing any form action.
 *
 * Enforces:
 * 1. Semantic Entity Identity (Personal Name != Company/University/File Name)
 * 2. Target Specificity (Customer Name != Emergency Contact Name)
 * 3. Ambiguity Detection (Generic "name" when multiple name fields exist)
 * 4. Contextual Consistency (ConversationId, FormTaskId, Browser Session)
 * 5. Field-Type Compatibility (Rejects File/Checkbox/Radio text type mismatches)
 */

import type { ContextDetectedField } from "../context/context.types";
import { isFieldTypeCompatible, isSensitiveField } from "./field-type-validator.service";
import { logObservabilityEvent } from "../llm/llm-logger";

export type EntityCategory =
  | "PERSON_NAME"
  | "EMERGENCY_CONTACT_NAME"
  | "ORGANIZATION_NAME"
  | "FILE_ATTACHMENT"
  | "PHONE_NUMBER"
  | "POSTAL_CODE"
  | "STREET_ADDRESS"
  | "EMAIL_ADDRESS"
  | "DATE_OF_BIRTH"
  | "EVENT_DATE"
  | "UNKNOWN";

export interface TargetFieldValidationResult {
  valid: boolean;
  confidence: number;
  reason: string;
  errorCode?:
    | "TARGET_FIELD_MISMATCH"
    | "TARGET_FIELD_AMBIGUOUS"
    | "INCOMPATIBLE_FIELD_TYPE"
    | "CONTEXT_MISMATCH"
    | "SENSITIVE_FIELD_REJECTED";
  requestedTarget?: string;
  resolvedTarget?: string;
  clarificationNeeded?: boolean;
}

export interface ValidateTargetFieldParams {
  originalInstruction: string;
  requestedTarget?: string;
  candidateField: ContextDetectedField;
  candidatePool?: ContextDetectedField[];
  operation?: string;
  value?: unknown;
  formTaskId?: string;
  expectedTaskId?: string;
  conversationId?: string;
  expectedConversationId?: string;
}

/**
 * Extracts requested target phrase and potential value from user instruction.
 */
export function extractRequestedTarget(instruction: string): {
  requestedTarget?: string;
  operation?: string;
  requestedValue?: string;
} {
  const text = (instruction || "").trim();
  if (!text) return {};

  // Pattern: "Add [VALUE] as [TARGET]" or "Add [TARGET] as [VALUE]" / "Set [TARGET] to [VALUE]"
  const asMatch = text.match(/(?:add|enter|put|set|fill)\s+["']?([^"']+)["']?\s+(?:as|in|into|for)\s+["']?([^"'.!?]+)["']?/i);
  if (asMatch) {
    const p1 = asMatch[1].trim();
    const p2 = asMatch[2].trim();
    if (/(?:customer\s*name|my\s*name|the\s*name|^name$|phone|email|address)/i.test(p1)) {
      return {
        requestedTarget: p1,
        requestedValue: p2,
        operation: "SET_VALUE",
      };
    }
    return {
      requestedValue: p1,
      requestedTarget: p2,
      operation: "SET_VALUE",
    };
  }

  const setMatch = text.match(/(?:set|change|update|make)\s+["']?([^"']+)["']?\s+(?:to|as)\s+["']?([^"'.!?]+)["']?/i);
  if (setMatch) {
    return {
      requestedTarget: setMatch[1].trim(),
      requestedValue: setMatch[2].trim(),
      operation: "SET_VALUE",
    };
  }

  // Hindi / Hinglish: "[TARGET] mein [VALUE] likho / dal do"
  const hiMatch = text.match(/["']?([^"']+)["']?\s+(?:में|mein|me|ko|को)\s+["']?([^"']+)["']?\s+(?:लिखें|लिखिए|लिखो|likho|likhein|karo|bana\s+do|dal\s+do|kijiye)/i);
  if (hiMatch) {
    return {
      requestedTarget: hiMatch[1].trim(),
      requestedValue: hiMatch[2].trim(),
      operation: "SET_VALUE",
    };
  }

  // Common target mentions
  const targetKeywords = [
    "customer name",
    "client name",
    "emergency contact name",
    "emergency contact",
    "applicant name",
    "full name",
    "first name",
    "last name",
    "university name",
    "college name",
    "institution name",
    "company name",
    "employer name",
    "file name",
    "attach files",
    "attached files",
    "files",
    "resume",
    "phone number",
    "telephone",
    "mobile number",
    "pin code",
    "pincode",
    "postal code",
    "zip code",
    "email address",
    "email",
    "delivery address",
    "address",
    "date of birth",
    "dob",
    "application date",
    "delivery time",
    "name",
    "नाम",
    "ग्राहक का नाम",
    "कस्टमर का नाम",
    "फोन नंबर",
    "टेलीफोन",
    "पिन कोड",
    "ईमेल",
    "पता",
  ];

  const lower = text.toLowerCase();
  for (const kw of targetKeywords) {
    if (lower.includes(kw)) {
      return { requestedTarget: kw, operation: "SET_VALUE" };
    }
  }

  return {};
}

/**
 * Classifies an entity (from label, identifier, or target string) into an EntityCategory.
 */
export function classifyEntityCategory(text?: string | null): EntityCategory {
  if (!text || typeof text !== "string") return "UNKNOWN";
  const s = text.toLowerCase().trim();

  // 1. Files / Attachments
  if (/\b(attach\s*files?|attachment|upload|file\s*name|upload\s*file|resume|cv|document)\b/i.test(s)) {
    return "FILE_ATTACHMENT";
  }

  // 2. Organizations / Universities / Companies
  if (/\b(university|college|institution|school|campus|company|employer|organization|firm|workplace)\b/i.test(s)) {
    return "ORGANIZATION_NAME";
  }

  // 3. Emergency Contact Name
  if (/\b(emergency\s*contact|emergency\s*name|guardian\s*name|secondary\s*contact|next\s*of\s*kin)\b/i.test(s)) {
    return "EMERGENCY_CONTACT_NAME";
  }

  // 4. Postal / PIN code
  if (/\b(pin\s*code|pincode|postal\s*code|zip\s*code|zip|postal|पिन\s*कोड)\b/i.test(s)) {
    return "POSTAL_CODE";
  }

  // 5. Phone / Telephone
  if (/\b(phone|telephone|tel|mobile|cell|contact\s*no|contact\s*number|फोन|टेलीफोन|मोबाईल)\b/i.test(s)) {
    return "PHONE_NUMBER";
  }

  // 6. Email Address
  if (/\b(e-?mail|email\s*address|mail\s*id|ईमेल)\b/i.test(s)) {
    return "EMAIL_ADDRESS";
  }

  // 7. Street / Physical Address
  if (/\b(street\s*address|delivery\s*address|residential\s*address|permanent\s*address|flat|house|street|address|पता)\b/i.test(s)) {
    return "STREET_ADDRESS";
  }

  // 8. Date of Birth
  if (/\b(date\s*of\s*birth|dob|birth\s*date|जन्म\s*तिथि|वाढदिवस)\b/i.test(s)) {
    return "DATE_OF_BIRTH";
  }

  // 9. Event or Submission Date
  if (/\b(application\s*date|submission\s*date|order\s*date|booking\s*date|delivery\s*date|event\s*date)\b/i.test(s)) {
    return "EVENT_DATE";
  }

  // 10. Personal Name
  if (/\b(customer\s*name|client\s*name|applicant\s*name|candidate\s*name|full\s*name|first\s*name|last\s*name|your\s*name|my\s*name|user\s*name|student\s*name|custname|name|नाम|नाव|ग्राहक\s*का\s*नाम|कस्टमर\s*का\s*नाम)\b/i.test(s)) {
    return "PERSON_NAME";
  }

  return "UNKNOWN";
}

/**
 * Checks if two entity categories are mutually incompatible.
 */
function areCategoriesIncompatible(requested: EntityCategory, candidate: EntityCategory): boolean {
  if (requested === "UNKNOWN" || candidate === "UNKNOWN") return false;
  if (requested === candidate) return false;

  // Person name incompatible with Organization, File, Address, Email, Phone, Postal code
  if (requested === "PERSON_NAME") {
    if (
      candidate === "ORGANIZATION_NAME" ||
      candidate === "FILE_ATTACHMENT" ||
      candidate === "POSTAL_CODE" ||
      candidate === "EMAIL_ADDRESS" ||
      candidate === "PHONE_NUMBER" ||
      candidate === "EMERGENCY_CONTACT_NAME"
    ) {
      return true;
    }
  }

  // Organization incompatible with Person, File, Postal, Email, Phone
  if (requested === "ORGANIZATION_NAME") {
    if (
      candidate === "PERSON_NAME" ||
      candidate === "FILE_ATTACHMENT" ||
      candidate === "POSTAL_CODE" ||
      candidate === "EMAIL_ADDRESS" ||
      candidate === "PHONE_NUMBER" ||
      candidate === "EMERGENCY_CONTACT_NAME"
    ) {
      return true;
    }
  }

  // Phone number incompatible with Postal Code, Email, Person, Organization, File
  if (requested === "PHONE_NUMBER") {
    if (candidate === "POSTAL_CODE" || candidate === "EMAIL_ADDRESS" || candidate === "PERSON_NAME" || candidate === "FILE_ATTACHMENT") {
      return true;
    }
  }

  // Postal Code incompatible with Phone, Email, Person, Address (if strict PIN check)
  if (requested === "POSTAL_CODE") {
    if (candidate === "PHONE_NUMBER" || candidate === "EMAIL_ADDRESS" || candidate === "PERSON_NAME" || candidate === "FILE_ATTACHMENT") {
      return true;
    }
  }

  // Physical Address incompatible with Email Address
  if (requested === "STREET_ADDRESS" && candidate === "EMAIL_ADDRESS") {
    return true;
  }
  if (requested === "EMAIL_ADDRESS" && candidate === "STREET_ADDRESS") {
    return true;
  }

  // Date of Birth incompatible with Event Date
  if (requested === "DATE_OF_BIRTH" && candidate === "EVENT_DATE") {
    return true;
  }
  if (requested === "EVENT_DATE" && candidate === "DATE_OF_BIRTH") {
    return true;
  }

  return false;
}

/**
 * Validates a candidate field against the user's instruction and candidate pool.
 */
export function validateTargetFieldAgainstInstruction(
  params: ValidateTargetFieldParams,
): TargetFieldValidationResult {
  const {
    originalInstruction,
    candidateField,
    candidatePool = [],
    operation,
    value,
    formTaskId,
    expectedTaskId,
    conversationId,
    expectedConversationId,
  } = params;

  const candidateIdentifier = candidateField.fieldIdentifier || candidateField.name || candidateField.id || "";
  const candidateLabel = candidateField.label || candidateIdentifier;
  const candidateSearchable = `${candidateLabel} ${candidateIdentifier} ${candidateField.name || ""}`;

  // 1. Contextual Consistency Check
  if (expectedTaskId && formTaskId && formTaskId !== expectedTaskId) {
    const res: TargetFieldValidationResult = {
      valid: false,
      confidence: 0,
      reason: `Context mismatch: FormTaskId '${formTaskId}' does not match expected '${expectedTaskId}'`,
      errorCode: "CONTEXT_MISMATCH",
      resolvedTarget: candidateLabel,
    };
    logObservabilityEvent("TARGET_VALIDATION_REJECTED", {
      instruction: originalInstruction,
      fieldIdentifier: candidateIdentifier,
      errorCode: res.errorCode,
      reason: res.reason,
    });
    return res;
  }

  if (expectedConversationId && conversationId && conversationId !== expectedConversationId) {
    const res: TargetFieldValidationResult = {
      valid: false,
      confidence: 0,
      reason: `Context mismatch: ConversationId '${conversationId}' does not match expected '${expectedConversationId}'`,
      errorCode: "CONTEXT_MISMATCH",
      resolvedTarget: candidateLabel,
    };
    logObservabilityEvent("TARGET_VALIDATION_REJECTED", {
      instruction: originalInstruction,
      fieldIdentifier: candidateIdentifier,
      errorCode: res.errorCode,
      reason: res.reason,
    });
    return res;
  }

  // 2. Sensitive Field Protection Check
  if (isSensitiveField(candidateField)) {
    const res: TargetFieldValidationResult = {
      valid: false,
      confidence: 0,
      reason: `Sensitive field '${candidateLabel}' cannot be populated directly from unverified instructions`,
      errorCode: "SENSITIVE_FIELD_REJECTED",
      resolvedTarget: candidateLabel,
    };
    logObservabilityEvent("TARGET_VALIDATION_REJECTED", {
      instruction: originalInstruction,
      fieldIdentifier: candidateIdentifier,
      errorCode: res.errorCode,
      reason: res.reason,
    });
    return res;
  }

  // 3. Field-Type Compatibility Check
  const typeResult = isFieldTypeCompatible(candidateField, value, operation);
  if (!typeResult.compatible) {
    const res: TargetFieldValidationResult = {
      valid: false,
      confidence: 0,
      reason: typeResult.reason || `Field '${candidateLabel}' is incompatible with value type`,
      errorCode: "INCOMPATIBLE_FIELD_TYPE",
      resolvedTarget: candidateLabel,
    };
    logObservabilityEvent("TARGET_VALIDATION_REJECTED", {
      instruction: originalInstruction,
      fieldIdentifier: candidateIdentifier,
      errorCode: res.errorCode,
      reason: res.reason,
    });
    return res;
  }

  // 4. Requested Target Extraction
  const extracted = extractRequestedTarget(originalInstruction);
  const requestedTarget = params.requestedTarget || extracted.requestedTarget;

  const requestedCategory = classifyEntityCategory(requestedTarget || originalInstruction);
  const candidateCategory = classifyEntityCategory(candidateSearchable);

  // 5. Semantic Entity Collision Check
  if (areCategoriesIncompatible(requestedCategory, candidateCategory)) {
    const res: TargetFieldValidationResult = {
      valid: false,
      confidence: 0,
      reason: `Entity mismatch: User instruction requested '${requestedCategory}' but candidate field '${candidateLabel}' is '${candidateCategory}'`,
      errorCode: "TARGET_FIELD_MISMATCH",
      requestedTarget,
      resolvedTarget: candidateLabel,
    };
    logObservabilityEvent("TARGET_VALIDATION_REJECTED", {
      instruction: originalInstruction,
      requestedTarget,
      fieldIdentifier: candidateIdentifier,
      errorCode: res.errorCode,
      reason: res.reason,
      requestedCategory,
      candidateCategory,
    });
    return res;
  }

  // 6. Target Specificity Check (e.g. Customer Name vs Emergency Contact Name)
  const normInstruction = originalInstruction.toLowerCase();
  const isExplicitCustomerName = /\b(customer\s*name|applicant\s*name|client\s*name|custname|ग्राहक\s*का\s*नाम|कस्टमर\s*का\s*नाम)\b/i.test(normInstruction);
  const isEmergencyCandidate = /\b(emergency|secondary|guardian)\b/i.test(candidateSearchable);

  if (isExplicitCustomerName && isEmergencyCandidate) {
    const res: TargetFieldValidationResult = {
      valid: false,
      confidence: 0,
      reason: `Specificity mismatch: User requested Customer Name, but candidate is '${candidateLabel}'`,
      errorCode: "TARGET_FIELD_MISMATCH",
      requestedTarget,
      resolvedTarget: candidateLabel,
    };
    logObservabilityEvent("TARGET_VALIDATION_REJECTED", {
      instruction: originalInstruction,
      requestedTarget,
      fieldIdentifier: candidateIdentifier,
      errorCode: res.errorCode,
      reason: res.reason,
    });
    return res;
  }

  // 7. Ambiguity Check (e.g., user says "Add my name" when BOTH Customer Name and Emergency Contact Name exist)
  if (candidatePool.length > 1) {
    const isGenericNameRequest = /\b(?:add|enter|put|set|fill)?\s*(?:my\s+|the\s+)?(?:name|naam|नाव|नाम)\b/i.test(normInstruction) && !isExplicitCustomerName;
    if (isGenericNameRequest) {
      const nameFields = candidatePool.filter((f) => {
        const cat = classifyEntityCategory(`${f.label || ""} ${f.fieldIdentifier || ""} ${f.name || ""}`);
        return cat === "PERSON_NAME" || cat === "EMERGENCY_CONTACT_NAME";
      });

      if (nameFields.length > 1) {
        const res: TargetFieldValidationResult = {
          valid: false,
          confidence: 0.5,
          reason: `Target is ambiguous: multiple name fields found on page (${nameFields.map((f) => f.label || f.fieldIdentifier).join(", ")})`,
          errorCode: "TARGET_FIELD_AMBIGUOUS",
          requestedTarget: "name",
          resolvedTarget: candidateLabel,
          clarificationNeeded: true,
        };
        logObservabilityEvent("TARGET_VALIDATION_REJECTED", {
          instruction: originalInstruction,
          requestedTarget: "name",
          fieldIdentifier: candidateIdentifier,
          errorCode: res.errorCode,
          reason: res.reason,
        });
        return res;
      }
    }
  }

  // Validation Permitted
  const res: TargetFieldValidationResult = {
    valid: true,
    confidence: requestedCategory === candidateCategory && requestedCategory !== "UNKNOWN" ? 0.98 : 0.9,
    reason: `Field '${candidateLabel}' matches instruction target '${requestedTarget || requestedCategory}'`,
    requestedTarget,
    resolvedTarget: candidateLabel,
  };

  logObservabilityEvent("TARGET_VALIDATION_PERMITTED", {
    instruction: originalInstruction,
    requestedTarget,
    fieldIdentifier: candidateIdentifier,
    resolvedTarget: candidateLabel,
    confidence: res.confidence,
  });

  return res;
}

