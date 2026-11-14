/**
 * Provider-Independent Form Action Router
 *
 * Deterministically detects and routes explicit form-update and selection requests
 * across English, Hindi, Marathi, and Hinglish.
 *
 * Resolves target fields and options against active Form Task metadata without
 * requiring the LLM to generate function calls, guaranteeing reliable form updates
 * across primary and fallback LLM providers.
 */

import type { ContextDetectedField, ContextProfileFact } from "../context/context.types";
import { conceptForField, conceptForText } from "./field-matcher.service";
import { matchOption, type FormOption } from "./option-matcher.service";
import { isSensitiveField, isFieldTypeCompatible } from "./field-type-validator.service";
import { logObservabilityEvent } from "../llm/llm-logger";
import {
  normalizeSpokenDigits,
  extractPhoneNumber,
  parseSpokenTime,
  parseSpokenNumber,
} from "./spoken-number-normalizer";
import {
  convertFieldScript,
  cleanNameValue,
  containsDevanagari,
  containsLatin,
  devanagariToLatin,
  latinToDevanagari,
} from "./script-converter.service";
import { validateTargetFieldAgainstInstruction } from "./target-field-validator";
import { extractSpokenEmail } from "./spoken-email-normalizer";
import {
  classifyUserIntent,
  isValidTargetFieldCandidate,
  isValidPersonalName,
  GENERIC_NON_FIELD_WORDS,
} from "./intent-classifier";

export interface ResolvedFieldUpdate {
  field: ContextDetectedField;
  value: unknown;
  resolvedValue: unknown;
  confidence: number;
  intentReason: string;
}

export type FormActionRouteResult =
  | {
      type: "FORM_UPDATE";
      status: "RESOLVED";
      field: ContextDetectedField;
      value: unknown;
      resolvedValue: unknown;
      confidence: number;
      intentReason: string;
      updates: ResolvedFieldUpdate[];
    }
  | {
      type: "FORM_UPDATE";
      status: "AMBIGUOUS";
      candidateFields: ContextDetectedField[];
      requestedTarget: string;
      clarificationQuestion: string;
    }
  | {
      type: "FORM_UPDATE";
      status: "NO_FIELD_MATCH";
      requestedTarget: string;
      clarificationQuestion: string;
    }
  | {
      type: "FORM_UPDATE";
      status: "OPTION_NOT_FOUND";
      field: ContextDetectedField;
      requestedOption: string;
      availableOptions: Array<{ label: string; value: string }>;
      clarificationMessage: string;
    }
  | {
      type: "CONVERSATIONAL_RESPONSE";
      response: string;
      intent: string;
    }
  | {
      type: "NOT_FORM_ACTION";
    };

const MEMORY_INSTRUCTION_REGEX =
  /\b(?:remember(?:\s+that)?|save(?:\s+to|\s+this)?(?:\s+my)?\s+profile|store(?:\s+this)?\s+in\s+memory|माझी\s+प्रोफाईल|मेरी\s+प्रोफाइल|प्रोफाइल\s+में\s+सेव|सेव्ह\s+करा)\b/i;

const GENERAL_QUERY_REGEX =
  /^(?:what|which|how|is|are|can|could|why|who|क्या|का|कोणते|कसे|हे|काहे|please explain|tell me about|help me to fill|help me fill|status of|status)\b/i;

const ACTION_VERBS_REGEX =
  /\b(?:select|choose|pick|change|set|enter|fill|update|put|make|use|add|insert|type|write|likho|likhein|likhe|likhiye|likh\s+do|provide|specify|tick|mark|check|चुनें|चुनिये|चुनो|करें|कीजिए|डालें|डालिये|भरें|भरिये|रखें|बदलें|जोड़ें|लिखें|लिखो|लिखिए|निवडा|करा|टाका|भरा|ठेवा|बदला)\b/i;

const HINGLISH_ACTION_REGEX =
  /\b(?:select\s+karo|choose\s+karo|kar\s+do|daal\s+do|bhar\s+do|set\s+karo|change\s+karo|rakh\s+do|chuno|badal\s+do|likh\s+do|likho|likhein|likhe|likhiye|likh\s+dijiye|type\s+karo|write\s+karo|add\s+kar\s+do|add\s+karo)\b/i;

function normalizeTargetTypos(target: string): string {
  if (!target) return "";
  return target
    .replace(/\bcutomer\b/gi, "customer")
    .replace(/\bcustmer\b/gi, "customer")
    .replace(/\bcostumer\b/gi, "customer")
    .replace(/\btelfone\b/gi, "telephone")
    .replace(/\btelephon\b/gi, "telephone")
    .replace(/\bphon\b/gi, "phone")
    .replace(/\bemil\b/gi, "email")
    .replace(/\be-?mail\b/gi, "email")
    .replace(/\baddres\b/gi, "address");
}

function cleanString(text?: string | null): string {
  if (!text || typeof text !== "string") return "";
  return text.toLowerCase().replace(/[^\w\s\u0900-\u097f]/gu, " ").replace(/\s+/g, " ").trim();
}

function isNameField(f: ContextDetectedField): boolean {
  if ((f.inputType || "").toLowerCase() === "file" || isSensitiveField(f)) return false;
  const searchable = `${f.label || ""} ${f.fieldIdentifier || ""} ${f.name || ""}`.toLowerCase();
  if (/(university|college|institution|school|company|employer|organization|file|document|attachment|folder|resume)/i.test(searchable)) {
    return false;
  }
  const c = conceptForField({
    id: f.id,
    fieldIdentifier: f.fieldIdentifier,
    label: f.label,
    searchableText: searchable,
    inputType: f.inputType || "text",
    options: [],
    required: Boolean(f.required),
    disabled: Boolean(f.disabled),
    readOnly: Boolean(f.readOnly),
  });
  return c === "full_name" || c === "first_name" || /\b(customer\s*name|custname|client\s*name|full\s*name|applicant\s*name|candidate\s*name|your\s*name|my\s*name|first\s*name|last\s*name|ग्राहक\s*का\s*नाम|ग्राहकाचे\s*नाव|पूरा\s*नाम|पूर्ण\s*नाव)\b/i.test(searchable) || (/^(name|नाम|नाव)$/i.test((f.label || "").trim()));
}

const INSTRUCTION_FRAGMENT_PATTERNS = [
  /^(?:the\s+)?(?:customer\s+name|cutomer\s+name|custname|name|field|input|box|option|details|form)$/i,
  /^(?:same\s+name|same|same\s+value|current\s+value|existing\s+value)$/i,
  /^(?:english|hindi|marathi|latin|devanagari|roman|angrezi|english\s+same\s+name|english\s+mein|hindi\s+mein|in\s+english)$/i,
  /^(?:it|this|that|isko|use|usko|tyala|he|ha|to|null|undefined)$/i,
  /^(?:update|change|correct|convert|likho|likhein|karo|kar\s+do|bana\s+do|fill|set)$/i,
];

export function isInstructionFragment(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return true;
  return INSTRUCTION_FRAGMENT_PATTERNS.some((p) => p.test(trimmed));
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "name", "naam", "naav", "field", "input", "box", "same", "this", "that"]);

function wordOverlap(source: string, target: string): boolean {
  const sourceWords = cleanString(source).split(" ").filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  const targetWords = cleanString(target).split(" ").filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return sourceWords.some((sw) => targetWords.includes(sw));
}

export function matchFieldByTarget(
  target: string,
  field: ContextDetectedField,
  valueToFill?: unknown,
): number {
  const cleanTarget = cleanString(normalizeTargetTypos(target));
  if (!cleanTarget) return 0;
  if (!isValidTargetFieldCandidate(cleanTarget)) return 0;

  const fieldType = (field.inputType || "").toLowerCase();
  const isTargetFile = /file|attach|upload|document/i.test(cleanTarget);

  // 1. Mandatory FILE exclusion: FILE fields NEVER match ordinary text/fill operations
  if (fieldType === "file" && !isTargetFile) {
    return 0;
  }

  // 2. Sensitive fields protection (allow matching only if the target explicitly requested a sensitive field)
  const isTargetExplicitlySensitive = isSensitiveField({ inputType: "password", name: cleanTarget, label: cleanTarget, fieldIdentifier: cleanTarget });
  if (isSensitiveField(field) && !isTargetExplicitlySensitive) {
    return 0;
  }

  // 2B. Instruction-to-Target Field Validation Layer
  if (!isTargetExplicitlySensitive) {
    const targetValidation = validateTargetFieldAgainstInstruction({
      originalInstruction: target,
      requestedTarget: target,
      candidateField: field,
      value: valueToFill,
    });
    if (!targetValidation.valid && targetValidation.errorCode !== "TARGET_FIELD_AMBIGUOUS") {
      return 0;
    }
  }

  // 3. Value-level compatibility check if value is provided
  if (valueToFill !== undefined && !isSensitiveField(field)) {
    const compat = isFieldTypeCompatible(field, valueToFill);
    if (!compat.compatible) return 0;
  }

  const cleanLabel = cleanString(field.label || "");
  const cleanId = cleanString(field.fieldIdentifier || "");
  const cleanName = cleanString(field.name || "");
  const searchableAll = `${cleanLabel} ${cleanId} ${cleanName}`.toLowerCase();

  // 4. Disambiguate Person Names from Entity Names (University Name, Company Name, File Name, etc.)
  const isTargetPersonName = /customer\s*name|custname|client\s*name|full\s*name|applicant\s*name|candidate\s*name|user\s*name|first\s*name|last\s*name|naam|naav|^name$/i.test(cleanTarget);
  const isNonPersonEntityField = /(university|college|institution|school|company|employer|organization|file|document|attachment|folder|resume)/i.test(searchableAll);
  if (isTargetPersonName && isNonPersonEntityField) {
    return 0;
  }

  // Disambiguate University vs Company vs Person
  if (/university|college|institution|school/i.test(cleanTarget) && !/university|college|institution|school/i.test(searchableAll)) {
    return 0;
  }
  if (/company|employer|organization/i.test(cleanTarget) && !/company|employer|organization/i.test(searchableAll)) {
    return 0;
  }

  // Exact match
  if (cleanLabel === cleanTarget || cleanId === cleanTarget || cleanName === cleanTarget) {
    return 1.0;
  }

  // Label contains target or target contains label (guarded for generic words)
  if (cleanLabel && (cleanLabel.includes(cleanTarget) || cleanTarget.includes(cleanLabel))) {
    if (cleanTarget === "name" && isNonPersonEntityField) return 0;
    return 0.9;
  }
  if (cleanId && (cleanId.includes(cleanTarget) || cleanTarget.includes(cleanId))) {
    return 0.85;
  }

  // Concept matching via aliases
  const targetConcept = conceptForText(cleanTarget);
  const fieldConceptVal = conceptForField({
    id: field.id,
    fieldIdentifier: field.fieldIdentifier,
    label: field.label,
    searchableText: searchableAll,
    inputType: field.inputType || "text",
    options: (field.options as FormOption[]) || [],
    required: Boolean(field.required),
    disabled: Boolean(field.disabled),
    readOnly: Boolean(field.readOnly),
  });

  if (targetConcept && fieldConceptVal && targetConcept === fieldConceptVal) {
    return 0.95;
  }

  // Token overlap (stopwords excluded)
  if (wordOverlap(cleanTarget, cleanLabel) || wordOverlap(cleanTarget, cleanId)) {
    return 0.75;
  }

  return 0;
}

export function buildFormAssistanceResponse(detectedFields: ContextDetectedField[], lang: string): string {
  const nonHiddenFields = detectedFields.filter((f) => (f.inputType || "").toLowerCase() !== "hidden");
  const fieldNames = nonHiddenFields
    .map((f) => (f.label || f.fieldIdentifier || "").trim())
    .filter(Boolean);
  const uniqueFieldNames = Array.from(new Set(fieldNames));
  const displayFields = uniqueFieldNames.slice(0, 5);

  const firstEmpty = nonHiddenFields.find((f) => f.isEmpty && !f.disabled && !f.readOnly) || nonHiddenFields[0];
  const firstEmptyName = firstEmpty ? (firstEmpty.label || firstEmpty.fieldIdentifier || "").trim() : "";

  if (lang === "hi") {
    const fieldsStr = displayFields.length > 0 ? displayFields.join(", ") : "ज़रूरी फ़ील्ड्स";
    const promptField = firstEmptyName || "ग्राहक का नाम";
    return `मैं इस फ़ॉर्म को पूरा करने में आपकी मदद करूँगा! इसमें ${fieldsStr} जैसे विवरण शामिल हैं। शुरुआत करने के लिए, कृपया अपना ${promptField} बताइए।`;
  } else if (lang === "mr") {
    const fieldsStr = displayFields.length > 0 ? displayFields.join(", ") : "आवश्यक फील्ड्स";
    const promptField = firstEmptyName || "नाव";
    return `मी हा फॉर्म भरण्यासाठी तुम्हाला नक्की मदत करेन! यामध्ये ${fieldsStr} यांसारखे तपशील आहेत. सुरुवात करण्यासाठी, कृपया आपले ${promptField} सांगा.`;
  } else if (lang === "hinglish") {
    const fieldsStr = displayFields.length > 0 ? displayFields.join(", ") : "fields";
    const promptField = firstEmptyName || "Customer name";
    return `Main is form ko fill karne mein aapki help karunga! Isme ${fieldsStr} jaise details hain. Shuru karne ke liye, aapka ${promptField} kya hai?`;
  }

  const fieldsStr = displayFields.length > 0 ? displayFields.join(", ") : "all required fields";
  const promptField = firstEmptyName || "Customer name";
  return `I'm here to help you fill out this form! It includes fields for ${fieldsStr}. To get started, what is your ${promptField}?`;
}

export function buildFormOverviewResponse(detectedFields: ContextDetectedField[], lang: string): string {
  const nonHiddenFields = detectedFields.filter((f) => (f.inputType || "").toLowerCase() !== "hidden");
  const uniqueFieldNames = Array.from(new Set(nonHiddenFields.map((f) => (f.label || f.fieldIdentifier || "").trim()).filter(Boolean)));
  const fieldsStr = uniqueFieldNames.join(", ");

  if (lang === "hi") {
    return `इस फ़ॉर्म में निम्नलिखित फ़ील्ड्स मौजूद हैं: ${fieldsStr}। आप इनमें से किसी भी फ़ील्ड को भरने के लिए निर्देश दे सकते हैं।`;
  } else if (lang === "mr") {
    return `या फॉर्ममध्ये खालील फील्ड्स उपलब्ध आहेत: ${fieldsStr}. तुम्ही यापैकी कोणतीही माहिती भरण्यासाठी सांगू शकता.`;
  } else if (lang === "hinglish") {
    return `Is form mein ye fields hain: ${fieldsStr}. Aap inme se koi bhi detail fill karne ke liye bata sakte hain.`;
  }
  return `This form contains the following fields: ${fieldsStr}. You can tell me what details you'd like to fill in.`;
}

export function buildFieldQueryResponse(field: ContextDetectedField, lang: string): string {
  const label = field.label || field.fieldIdentifier || "this field";
  const type = field.inputType || "text";
  const isReq = field.required ? "required" : "optional";
  if (lang === "hi") {
    return `"${label}" एक ${isReq === "required" ? "अनिवार्य" : "वैकल्पिक"} फ़ील्ड है (${type})। आप इसमें अपना विवरण दर्ज कर सकते हैं।`;
  } else if (lang === "mr") {
    return `"${label}" हे एक ${isReq === "required" ? "आवश्यक" : "पर्यायी"} फील्ड आहे (${type}). तुम्ही येथे योग्य माहिती नोंदवू शकता.`;
  } else if (lang === "hinglish") {
    return `"${label}" ek ${isReq} field hai (${type}). Aap isme apna detail fill kar sakte hain.`;
  }
  return `"${label}" is an ${isReq} ${type} field. You can provide your information for it.`;
}

export function routeFormAction(params: {
  content?: string;
  userMessage?: string;
  detectedFields: ContextDetectedField[];
  approvedMemories?: ContextProfileFact[];
  detectedLang?: string;
  conversationId?: string;
  requestId?: string;
  recentMessages?: Array<{ role: string; content: string; language?: string }>;
}): FormActionRouteResult {
  const { detectedFields, approvedMemories = [], detectedLang = "en", conversationId, requestId, recentMessages = [] } = params;
  const content = params.content ?? params.userMessage ?? "";

  if (!detectedFields || detectedFields.length === 0 || !content.trim()) {
    return { type: "NOT_FORM_ACTION" };
  }

  const rawTrimmed = content.trim();

  // Exclude explicit memory save commands
  if (MEMORY_INSTRUCTION_REGEX.test(rawTrimmed)) {
    return { type: "NOT_FORM_ACTION" };
  }

  // STEP 0: Centralized Multilingual Intent Classification
  const classifiedIntent = classifyUserIntent(rawTrimmed, { detectedFields, recentMessages });

  if (classifiedIntent.intent === "GENERAL_FORM_ASSISTANCE") {
    logObservabilityEvent("INTENT_DETECTED", {
      conversationId,
      requestId,
      intent: "GENERAL_FORM_ASSISTANCE",
    });
    return {
      type: "CONVERSATIONAL_RESPONSE",
      response: buildFormAssistanceResponse(detectedFields, detectedLang),
      intent: "GENERAL_FORM_ASSISTANCE",
    };
  }

  if (classifiedIntent.intent === "FORM_OVERVIEW") {
    logObservabilityEvent("INTENT_DETECTED", {
      conversationId,
      requestId,
      intent: "FORM_OVERVIEW",
    });
    return {
      type: "CONVERSATIONAL_RESPONSE",
      response: buildFormOverviewResponse(detectedFields, detectedLang),
      intent: "FORM_OVERVIEW",
    };
  }

  if (classifiedIntent.intent === "FIELD_INFORMATION_QUERY" && classifiedIntent.requestedTarget) {
    const matchedField = detectedFields.find((f) => matchFieldByTarget(classifiedIntent.requestedTarget!, f) >= 0.6);
    if (matchedField) {
      logObservabilityEvent("INTENT_DETECTED", {
        conversationId,
        requestId,
        intent: "FIELD_INFORMATION_QUERY",
        targetField: matchedField.label || matchedField.fieldIdentifier,
      });
      return {
        type: "CONVERSATIONAL_RESPONSE",
        response: buildFieldQueryResponse(matchedField, detectedLang),
        intent: "FIELD_INFORMATION_QUERY",
      };
    }
  }

  if (classifiedIntent.intent === "SELECT_ALL_CHECKBOXES") {
    const targetQuery = (classifiedIntent.requestedTarget || "").toLowerCase().trim();
    const checkboxFields = detectedFields.filter(
      (f) => (f.inputType || "").toLowerCase() === "checkbox" || (f.elementType || "").toLowerCase() === "checkbox"
    );

    if (checkboxFields.length > 0) {
      const isToppingQuery = /topping|pizza/i.test(targetQuery) || checkboxFields.some((cf) =>
        /topping|pizza|bacon|cheese|onion|mushroom/i.test(`${cf.label || ""} ${cf.fieldIdentifier || ""} ${cf.name || ""}`)
      );

      // Find primary target field: prefer grouped field with options array or field with matching topping metadata
      let targetGroupField = checkboxFields.find((f) => {
        const hasOptions = f.options && Array.isArray(f.options) && f.options.length > 0;
        const searchable = `${f.label || ""} ${f.fieldIdentifier || ""} ${f.name || ""} ${f.groupName || ""}`.toLowerCase();
        return hasOptions && (isToppingQuery ? /topping|pizza/i.test(searchable) : true);
      });

      if (!targetGroupField) {
        targetGroupField = checkboxFields.find((f) => {
          const searchable = `${f.label || ""} ${f.fieldIdentifier || ""} ${f.name || ""} ${f.groupName || ""}`.toLowerCase();
          return isToppingQuery ? /topping|pizza|bacon|cheese|onion|mushroom/i.test(searchable) : true;
        });
      }

      if (!targetGroupField) {
        targetGroupField = checkboxFields[0];
      }

      const groupTitle = isToppingQuery ? "Pizza Toppings" : (targetGroupField.groupName || targetGroupField.label || "options");
      const updates: ResolvedFieldUpdate[] = [];

      // Case A: Grouped checkbox field with options array
      if (targetGroupField.options && Array.isArray(targetGroupField.options) && targetGroupField.options.length > 0) {
        const allValues = (targetGroupField.options as any[]).map((opt) => String(opt.value ?? opt.label ?? opt));
        updates.push({
          field: targetGroupField,
          value: allValues,
          resolvedValue: allValues,
          confidence: 1.0,
          intentReason: "SELECT_ALL_CHECKBOXES",
        });
      } else {
        // Case B: Individual separate checkbox fields in detectedFields
        const sameGroupCheckboxes = checkboxFields.filter((cf) => {
          if (targetGroupField!.name && cf.name && targetGroupField!.name === cf.name) return true;
          if (targetGroupField!.groupName && cf.groupName && targetGroupField!.groupName === cf.groupName) return true;
          if (isToppingQuery && /topping|pizza|bacon|cheese|onion|mushroom/i.test(`${cf.label || ""} ${cf.fieldIdentifier || ""} ${cf.name || ""}`)) return true;
          return false;
        });

        const targets = sameGroupCheckboxes.length > 0 ? sameGroupCheckboxes : checkboxFields;
        for (const cf of targets) {
          updates.push({
            field: cf,
            value: true,
            resolvedValue: true,
            confidence: 1.0,
            intentReason: "SELECT_ALL_CHECKBOXES",
          });
        }
      }

      logObservabilityEvent("INTENT_DETECTED", {
        conversationId,
        requestId,
        intent: "SELECT_ALL_CHECKBOXES",
        targetGroup: groupTitle,
        totalUpdates: updates.length,
      });

      return {
        type: "FORM_UPDATE",
        status: "RESOLVED",
        field: updates[0]?.field || targetGroupField,
        value: updates[0]?.value ?? true,
        resolvedValue: updates[0]?.resolvedValue ?? true,
        confidence: 1.0,
        intentReason: "SELECT_ALL_CHECKBOXES",
        updates,
      };
    }
  }

  if (classifiedIntent.intent === "OBSERVATION_CORRECTION") {
    let obsMsg = "I checked the active form: the options are currently not selected. Would you like me to select all toppings for you?";
    if (detectedLang === "hi") {
      obsMsg = "मैंने सक्रिय फ़ॉर्म की जाँच की: विकल्प अभी चुने नहीं गए हैं। क्या आप चाहते हैं कि मैं आपके लिए सभी टॉपिंग्स चुन लूँ?";
    } else if (detectedLang === "mr") {
      obsMsg = "मी सक्रिय फॉर्म तपासला: पर्याय अद्याप निवडलेले नाहीत. मी तुमच्यासाठी सर्व टॉपिंग्स निवडू का?";
    } else if (detectedLang === "hinglish") {
      obsMsg = "Maine form check kiya: options abhi select nahi hue hain. Kya main saare toppings select kar doon?";
    }

    return {
      type: "CONVERSATIONAL_RESPONSE",
      response: obsMsg,
      intent: "OBSERVATION_CORRECTION",
    };
  }

  // Check for short affirmative / negative responses against last assistant question
  const lowerTrimmed = rawTrimmed.toLowerCase().replace(/[.!?।]+$/, "").trim();
  const isAffirmative = /^(?:yes|yeah|yup|sure|okay|ok|haan|ha|ho|हो|होय|हाँ|हाँजी|बिलकुल|नक्कीच|yes please|sure thing)$/i.test(lowerTrimmed);
  const isNegative = /^(?:no|nah|nope|not now|nahi|नाही|नहीं|नको|बाद में|not that one)$/i.test(lowerTrimmed);

  if ((isAffirmative || isNegative) && recentMessages.length > 0) {
    const lastAssistant = [...recentMessages].reverse().find((m) => m.role === "ASSISTANT" || (m as any).role === "assistant");
    if (lastAssistant && lastAssistant.content) {
      const lastText = lastAssistant.content.toLowerCase();

      // Case 1: Assistant previously asked if user wants to provide email address
      if (lastText.includes("email") || lastText.includes("ईमेल")) {
        if (isAffirmative) {
          let followUpMsg = "Sure! What's your email address?";
          if (detectedLang === "hi") {
            followUpMsg = "ज़रूर! कृपया अपना ईमेल पता बताइए।";
          } else if (detectedLang === "mr") {
            followUpMsg = "नक्कीच! कृपया तुमचा ईमेल पत्ता सांगा.";
          } else if (detectedLang === "hinglish") {
            followUpMsg = "Sure! Apna email address bata dijiye.";
          }
          return {
            type: "CONVERSATIONAL_RESPONSE",
            response: followUpMsg,
            intent: "PROVIDE_FIELD_INFORMATION",
          };
        } else {
          // User said no to email: find the next empty field
          const remainingField = detectedFields.find((f) => {
            const isEmail = conceptForField({
              id: f.id,
              fieldIdentifier: f.fieldIdentifier,
              label: f.label,
              searchableText: `${f.label || ""} ${f.fieldIdentifier}`,
              inputType: f.inputType || "text",
              options: [],
              required: Boolean(f.required),
              disabled: Boolean(f.disabled),
              readOnly: Boolean(f.readOnly),
            }) === "email";
            return !isEmail && f.isEmpty;
          });

          let skipMsg = "No problem!";
          if (remainingField) {
            skipMsg = `No problem! Would you like to specify your ${remainingField.label || remainingField.fieldIdentifier}?`;
            if (detectedLang === "hi") {
              skipMsg = `कोई बात नहीं! क्या आप अपना ${remainingField.label || remainingField.fieldIdentifier} बताना चाहेंगे?`;
            } else if (detectedLang === "mr") {
              skipMsg = `काही हरकत नाही! तुम्ही तुमचा ${remainingField.label || remainingField.fieldIdentifier} सांगू इच्छिता का?`;
            } else if (detectedLang === "hinglish") {
              skipMsg = `Koi baat nahi! Kya aap apna ${remainingField.label || remainingField.fieldIdentifier} batana chahenge?`;
            }
          }
          return {
            type: "CONVERSATIONAL_RESPONSE",
            response: skipMsg,
            intent: "SKIP_FIELD",
          };
        }
      }

      // Case 2: Assistant previously asked confirmation for a pending selection or time
      const timeConfirmMatch = lastText.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
      if (timeConfirmMatch && isAffirmative) {
        const timeField = detectedFields.find((f) => f.inputType === "time" || /delivery|time|समय|वेळ/i.test(f.label || ""));
        if (timeField) {
          const parsed = parseSpokenTime(timeConfirmMatch[1], detectedLang);
          if (parsed?.formattedTime) {
            return {
              type: "FORM_UPDATE",
              status: "RESOLVED",
              field: timeField,
              value: parsed.formattedTime,
              resolvedValue: parsed.formattedTime,
              confidence: 1.0,
              intentReason: "User confirmed delivery time",
              updates: [{
                field: timeField,
                value: parsed.formattedTime,
                resolvedValue: parsed.formattedTime,
                confidence: 1.0,
                intentReason: "User confirmed delivery time",
              }],
            };
          }
        }
      }
    }
  }

  // Normalize spoken numbers across the user message while preserving original transcript
  const normalizedSpokenDigits = normalizeSpokenDigits(rawTrimmed);

  // Exclude general interrogative queries unless an explicit action verb is present
  const hasActionVerb = ACTION_VERBS_REGEX.test(rawTrimmed) || HINGLISH_ACTION_REGEX.test(rawTrimmed);
  const isQuestion = GENERAL_QUERY_REGEX.test(rawTrimmed) || rawTrimmed.includes("?");
  if (isQuestion && !hasActionVerb) {
    return { type: "NOT_FORM_ACTION" };
  }

  const updates: ResolvedFieldUpdate[] = [];

  // =========================================================================
  // Strategy 0A: Script Conversion Intent ("Customer name ko English mein likho", "Name Hindi mein kar do", "Isko English script mein convert karo", etc.)
  // =========================================================================
  const SCRIPT_LANGS = "english|angrezi|latin|roman|hindi|devanagari|marathi|इंग्लिश|अंग्रेज़ी|मराठी|हिंदी|देवनागरी";
  const POSTPOS = "को|ko|la|ला|च्या|साठी";
  const SCRIPT_PREPS = "में|mein|me|script\\s+mein|letters\\s+mein|मध्ये|त|in|into|to|script|letters";
  const WRITE_VERBS = "लिखें|लिखिए|लिखो|likho|likh\\s+do|kar\\s+do|convert\\s+karo|convert\\s+kar\\s+do|badlo|badal\\s+do|karo|likhiye|kijiye|करा|बदला|लिहा|करायचे|कीजिए|करें|change|write|convert";
  const PRONOUNS = "isko|use|it|this|that|त्याला|त्यास|उसे|इसको";

  // 1. [VALUE] [isko/use] [LANG] [mein] [write/likho]
  // e.g., "आदर्श झा उसे English में लिखें।"
  const m2 = rawTrimmed.match(
    new RegExp(`^(.+?)\\s+(?:${PRONOUNS})\\s+(${SCRIPT_LANGS})(?:\\s+(?:${SCRIPT_PREPS}))?\\s+(?:${WRITE_VERBS})[.!?।]?$`, "i")
  );

  // 2. [FIELD] [ko] [LANG] [mein] [write/likho] [, VALUE]
  // e.g., "customer name को english में लिखें, आदर्श झा।" or "customer name ko english mein likho"
  const m1 = !m2 ? rawTrimmed.match(
    new RegExp(`^(.+?)(?:\\s+(?:${POSTPOS}))?\\s+(${SCRIPT_LANGS})(?:\\s+(?:${SCRIPT_PREPS}))?\\s+(?:${WRITE_VERBS})(?:[,\\s]+(.+?))?[.!?।]?$`, "i")
  ) : null;

  // 3. [isko/use] [LANG] [mein] [write/likho]
  // e.g., "isko English mein likho"
  const m3 = rawTrimmed.match(
    new RegExp(`^(?:${PRONOUNS})\\s+(?:(?:${POSTPOS})\\s+)?(${SCRIPT_LANGS})(?:\\s+(?:${SCRIPT_PREPS}))?\\s+(?:${WRITE_VERBS})[.!?।]?$`, "i")
  );

  // 4. [convert/write/change] [FIELD] [in/into/to] [LANG] [, VALUE]
  // e.g., "convert customer name to english"
  const m4 = rawTrimmed.match(
    new RegExp(`^(?:convert|write|change)\\s+(?:the\\s+|my\\s+)?(.+?)\\s+(?:in|into|to)\\s+(${SCRIPT_LANGS})(?:\\s+(?:script|letters))?(?:[,\\s]+(.+?))?[.!?।]?$`, "i")
  );

  // 5. Reference to previous name: "maine jo naam diya tha usko english letters mein likho"
  const m5 = rawTrimmed.match(
    new RegExp(`^(?:maine\\s+jo\\s+naam\\s+diya\\s+tha|jo\\s+naam\\s+likha\\s+tha|previous\\s+name)\\s+(?:usko\\s+)?(${SCRIPT_LANGS})(?:\\s+(?:${SCRIPT_PREPS}))?\\s+(?:${WRITE_VERBS})[.!?।]?$`, "i")
  );

  const scriptConversionMatch = m2 || m1 || m3 || m4 || m5;

  if (scriptConversionMatch) {
    let rawTargetScript = "";
    let targetFieldRef: string | undefined;
    let explicitValue: string | undefined;

    if (m2) {
      explicitValue = m2[1].trim();
      rawTargetScript = m2[2].toLowerCase();
      targetFieldRef = undefined;
    } else if (m1) {
      targetFieldRef = m1[1].trim();
      rawTargetScript = m1[2].toLowerCase();
      explicitValue = m1[3]?.trim();
    } else if (m3) {
      targetFieldRef = undefined;
      rawTargetScript = m3[1].toLowerCase();
      explicitValue = undefined;
    } else if (m4) {
      targetFieldRef = m4[1].trim();
      rawTargetScript = m4[2].toLowerCase();
      explicitValue = m4[3]?.trim();
    } else if (m5) {
      targetFieldRef = "name";
      rawTargetScript = m5[1].toLowerCase();
      explicitValue = undefined;
    }

    const targetScript: "latin" | "devanagari" = /hindi|devanagari|marathi|हिंदी|मराठी|देवनागरी/i.test(rawTargetScript) ? "devanagari" : "latin";

    let matchedField: ContextDetectedField | undefined;
    if (targetFieldRef && !/^(?:isko|use|it|this|that|त्याला|त्यास|उसे|इसको|maine\s+jo\s+naam\s+diya\s+tha|jo\s+naam\s+likha\s+tha)$/i.test(targetFieldRef)) {
      const cleanRef = normalizeTargetTypos(targetFieldRef).replace(/\b(?:field|input|box|ko|ला|को)\b/gi, "").trim();
      const scored = detectedFields
        .map((f) => ({ field: f, score: matchFieldByTarget(cleanRef, f) }))
        .filter((s) => s.score >= 0.6)
        .sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        matchedField = scored[0].field;
      }
    }

    if (!matchedField) {
      // Resolve from context: prefer name field or field with collected value
      matchedField = detectedFields.find((f) => isNameField(f)) ||
        detectedFields.find((f) => Boolean(f.collectedValue) || Boolean((f as any).currentValue));
    }

    if (matchedField) {
      // Discard instruction fragments or command tokens like "same name"
      if (explicitValue && isInstructionFragment(explicitValue)) {
        explicitValue = undefined;
      }

      let rawValToConvert = explicitValue;
      if (!rawValToConvert) {
        rawValToConvert = String(matchedField.collectedValue || (matchedField as any).currentValue || "");
      }

      if (!rawValToConvert) {
        // Never fall back to conversation transcripts for live field values
        let clarifyMsg = `What name or text would you like to put in ${matchedField.label || matchedField.fieldIdentifier} in ${targetScript === "latin" ? "English" : "Hindi"}?`;
        if (detectedLang === "hi") {
          clarifyMsg = `आप ${matchedField.label || matchedField.fieldIdentifier} में ${targetScript === "latin" ? "अंग्रेज़ी" : "हिंदी"} में क्या नाम या विवरण लिखना चाहते हैं?`;
        } else if (detectedLang === "mr") {
          clarifyMsg = `तुम्ही ${matchedField.label || matchedField.fieldIdentifier} मध्ये ${targetScript === "latin" ? "इंग्रजी" : "मराठी"}मध्ये काय नाव किंवा तपशील लिहू इच्छिता?`;
        } else if (detectedLang === "hinglish") {
          clarifyMsg = `Aap ${matchedField.label || matchedField.fieldIdentifier} mein ${targetScript === "latin" ? "English" : "Hindi"} mein kya likhna chahte hain?`;
        }
        return {
          type: "CONVERSATIONAL_RESPONSE",
          response: clarifyMsg,
          intent: "CLARIFY_FIELD_VALUE",
        };
      }

      if (rawValToConvert) {
        const cleanedVal = cleanNameValue(rawValToConvert);
        const converted = convertFieldScript(cleanedVal, targetScript);
        const finalValue = converted.convertedValue;

        if (finalValue) {
          logObservabilityEvent("INTENT_DETECTED", {
            conversationId,
            requestId,
            intent: "CONVERT_FIELD_SCRIPT",
            targetField: matchedField.label || matchedField.fieldIdentifier,
            targetScript,
            fromValue: rawValToConvert,
            toValue: finalValue,
          });

          return {
            type: "FORM_UPDATE",
            status: "RESOLVED",
            field: matchedField,
            value: finalValue,
            resolvedValue: finalValue,
            confidence: 1.0,
            intentReason: "CONVERT_FIELD_SCRIPT",
            updates: [{
              field: matchedField,
              value: finalValue,
              resolvedValue: finalValue,
              confidence: 1.0,
              intentReason: "CONVERT_FIELD_SCRIPT",
            }],
          };
        }
      }

      // If existing value is missing or ambiguous, ask user for clarification
      const fieldTitle = matchedField.label || matchedField.fieldIdentifier || "नाम";
      let clarifyMsg = `I understand you want to write your ${fieldTitle} in English. What is your full name?`;
      if (targetScript === "devanagari") {
        clarifyMsg = `आप अपना ${fieldTitle} हिंदी में क्या लिखना चाहते हैं?`;
      } else if (detectedLang === "hi") {
        clarifyMsg = `आप अपना ${fieldTitle} अंग्रेज़ी में क्या लिखना चाहते हैं?`;
      } else if (detectedLang === "hinglish") {
        clarifyMsg = `Aap apna ${fieldTitle} English mein kya likhna chahte hain?`;
      } else if (detectedLang === "mr") {
        clarifyMsg = `तुम्ही तुमचा ${fieldTitle} इंग्रजीत काय लिहू इच्छिता?`;
      }

      return {
        type: "CONVERSATIONAL_RESPONSE",
        response: clarifyMsg,
        intent: "CLARIFY_FIELD_VALUE",
      };
    }
  }

  // =========================================================================
  // Strategy 0B: Field Correction Intent ("Phone number mein last digit galat hai, use 5 kar do", etc.)
  // =========================================================================
  const lastDigitCorrectionMatch = rawTrimmed.match(
    /(?:phone|number|मोबाइल|नंबर)?\s*(?:mein\s+)?last\s+digit\s+(?:galat\s+hai,?\s*)?(?:use\s+)?([0-9]|zero|one|two|three|four|five|six|seven|eight|nine|शून्य|एक|दो|तीन|चार|पाँच|छह|सात|आठ|नौ)\s+(?:kar\s+do|bana\s+do|रखें|करा)[.!?।]?$/i,
  );
  if (lastDigitCorrectionMatch) {
    const phoneField = detectedFields.find(
      (f) => f.inputType === "tel" || conceptForField({
        id: f.id,
        fieldIdentifier: f.fieldIdentifier,
        label: f.label,
        searchableText: `${f.label || ""} ${f.fieldIdentifier}`,
        inputType: f.inputType || "text",
        options: [],
        required: Boolean(f.required),
        disabled: Boolean(f.disabled),
        readOnly: Boolean(f.readOnly),
      }) === "phone",
    );
    if (phoneField) {
      const rawDigit = lastDigitCorrectionMatch[1];
      const normalizedDigit = normalizeSpokenDigits(rawDigit);
      const digitChar = normalizedDigit.replace(/\D/g, "").slice(-1);

      let existingPhone = String(phoneField.collectedValue || (phoneField as any).currentValue || "");
      if (!existingPhone && recentMessages.length > 0) {
        for (const msg of [...recentMessages].reverse()) {
          const ph = extractPhoneNumber(msg.content);
          if (ph) {
            existingPhone = ph;
            break;
          }
        }
      }

      if (existingPhone && digitChar) {
        const correctedPhone = existingPhone.slice(0, -1) + digitChar;
        return {
          type: "FORM_UPDATE",
          status: "RESOLVED",
          field: phoneField,
          value: correctedPhone,
          resolvedValue: correctedPhone,
          confidence: 1.0,
          intentReason: "CORRECT_PHONE_DIGIT",
          updates: [{
            field: phoneField,
            value: correctedPhone,
            resolvedValue: correctedPhone,
            confidence: 1.0,
            intentReason: "CORRECT_PHONE_DIGIT",
          }],
        };
      }
    }
  }

  // =========================================================================
  // Strategy 0C: File Upload Safety & Guidance
  // =========================================================================
  if (/(?:attach|upload|choose|select)\s+(?:a\s+)?(?:file|document|resume|photo|image|pdf|attachment)|(?:फ़ाइल|दस्तावेज़|फाइल)\s*(?:अपलोड|अटैच)/i.test(rawTrimmed)) {
    let msg = "For your privacy and security, browsers do not allow extensions to automatically select local files from your device. Please click the file attachment button on the webpage directly to choose your file.";
    if (detectedLang === "hi") {
      msg = "आपकी सुरक्षा और गोपनीयता के लिए, ब्राउज़र एक्सटेंशन को आपके डिवाइस से फ़ाइलें सीधे चुनने की अनुमति नहीं देते हैं। कृपया वेबपेज पर दिए गए फ़ाइल बटन पर क्लिक करके अपनी फ़ाइल चुनें।";
    } else if (detectedLang === "mr") {
      msg = "तुमच्या सुरक्षेसाठी आणि गोपनीयतेसाठी, ब्राउझर एक्स्टेंशनला तुमच्या डिव्हाइसवरून थेट फाइल्स निवडण्याची परवानगी नसते. कृपया वेबपेजवरील फाइल बटणावर क्लिक करून आपली फाइल निवडा.";
    } else if (detectedLang === "hinglish") {
      msg = "Security aur privacy ke chalte, browser extensions directly local files attach nahi kar sakte. Kripya webpage par 'Attach files' button par click karke apni file select karein.";
    }
    return {
      type: "CONVERSATIONAL_RESPONSE",
      response: msg,
      intent: "INFORM_FILE_SECURITY",
    };
  }

  // Explicit correction patterns: "actually my name is X", "actually customer name should be X", "phone correct karo to X"
  const explicitCorrectionMatch =
    rawTrimmed.match(/(?:actually,?)\s+(?:the\s+|my\s+)?(.+?)\s+(?:is|should\s+be)\s+(.+?)[.!?।]?$/i) ||
    rawTrimmed.match(/(.+?)\s+correct\s+(?:karo|kar\s+do)\s+to\s+(.+?)[.!?।]?$/i);

  if (explicitCorrectionMatch) {
    const targetFieldStr = normalizeTargetTypos(explicitCorrectionMatch[1].trim()).replace(/\b(?:field|input|box|ko|la)\b/gi, "").trim();
    const targetVal = explicitCorrectionMatch[2].trim();

    const matches = detectedFields
      .map((f) => ({ field: f, score: matchFieldByTarget(targetFieldStr, f, targetVal) }))
      .filter((m) => m.score >= 0.6)
      .sort((a, b) => b.score - a.score);

    if (matches.length > 1 && Math.abs(matches[0].score - matches[1].score) < 0.1) {
      const candidateFields = matches.slice(0, 3).map((m) => m.field);
      const names = candidateFields.map((cf) => cf.label || cf.fieldIdentifier).join(", ");
      let clarificationQuestion = `Multiple fields match "${targetFieldStr}": ${names}. Which field would you like to update?`;
      if (detectedLang === "hi") {
        clarificationQuestion = `"${targetFieldStr}" के लिए एक से अधिक फ़ील्ड मिले: ${names}। आप कौन सा फ़ील्ड अपडेट करना चाहते हैं?`;
      } else if (detectedLang === "mr") {
        clarificationQuestion = `"${targetFieldStr}" साठी एकापेक्षा जास्त फील्ड आढळले: ${names}. तुम्हाला कोणते फील्ड अपडेट करायचे आहे?`;
      } else if (detectedLang === "hinglish") {
        clarificationQuestion = `"${targetFieldStr}" ke liye multiple fields mile: ${names}. Aap kaunsa field update karna chahte hain?`;
      }
      return {
        type: "FORM_UPDATE",
        status: "AMBIGUOUS",
        candidateFields,
        requestedTarget: targetFieldStr,
        clarificationQuestion,
      };
    }

    if (matches.length > 0) {
      return resolveFieldValue({
        field: matches[0].field,
        rawValue: targetVal,
        approvedMemories,
        detectedLang,
        conversationId,
      });
    }
  }

  // Update without replacement value ("email address ko update karo", "email address update karo")
  const updateWithoutValMatch =
    !/\b(?:to|with|as)\s+[^\s]+/i.test(rawTrimmed) && (
      rawTrimmed.match(/^(.+?)\s+(?:ko\s+)?(?:update|change|correct)\s+(?:karo|kar\s+do|kijiye|करा|बदला)[.!?।]?$/i) ||
      rawTrimmed.match(/^(?:update|change|correct)\s+(?:the\s+|my\s+)?([a-zA-Z\s_-]+)[.!?।]?$/i)
    );

  if (updateWithoutValMatch) {
    const fieldCandidate = normalizeTargetTypos(updateWithoutValMatch[1].trim()).replace(/\b(?:field|input|box|ko|la)\b/gi, "").trim();
    const scored = detectedFields
      .map((f) => ({ field: f, score: matchFieldByTarget(fieldCandidate, f) }))
      .filter((s) => s.score >= 0.6)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const f = scored[0].field;
      const fLabel = f.label || f.fieldIdentifier;
      let promptMsg = `Sure! What would you like to update your ${fLabel} to?`;
      if (detectedLang === "hi") {
        promptMsg = `ज़रूर! आप अपना नया ${fLabel} क्या रखना चाहते हैं?`;
      } else if (detectedLang === "mr") {
        promptMsg = `नक्कीच! तुम्हाला तुमचा नवीन ${fLabel} काय ठेवायचा आहे?`;
      } else if (detectedLang === "hinglish") {
        promptMsg = `Sure! Apna naya ${fLabel} bata dijiye.`;
      }
      return {
        type: "CONVERSATIONAL_RESPONSE",
        response: promptMsg,
        intent: "PROMPT_FOR_FIELD_UPDATE",
      };
    }
  }

  // [VALUE] ko update karein (e.g. "आदर्श झा को update करें", "Adarsh Jha ko update karo")
  const valKoUpdateMatch = rawTrimmed.match(
    /^(.+?)\s+(?:ko|la|ला|को)\s+(?:update|badal|change|अपडेट|बदलें|बदला)\s*(?:karein|karo|kar\s+do|kijiye|करा|करें|कीजिए)[.!?।]?$/i
  );
  if (valKoUpdateMatch) {
    const valText = valKoUpdateMatch[1].trim();
    const nameField = detectedFields.find((f) => isNameField(f));
    if (nameField) {
      const cleanVal = cleanNameValue(valText);
      const resolvedVal = detectedLang === "en" || detectedLang === "hinglish" ? devanagariToLatin(cleanVal) : cleanVal;
      return {
        type: "FORM_UPDATE",
        status: "RESOLVED",
        field: nameField,
        value: resolvedVal,
        resolvedValue: resolvedVal,
        confidence: 1.0,
        intentReason: "UPDATE_EXISTING_FIELD",
        updates: [{
          field: nameField,
          value: resolvedVal,
          resolvedValue: resolvedVal,
          confidence: 1.0,
          intentReason: "UPDATE_EXISTING_FIELD",
        }],
      };
    }
  }

  // =========================================================================
  // Strategy 1: Targeted Command Extraction Patterns
  // =========================================================================
  // Pattern A: "set/change/update/fill/write/enter [FIELD] to/with/as [VALUE]"
  const patternFieldToValue =
    rawTrimmed.match(/(?:change|update|set|fill|write|enter|put|type)\s+(?:the\s+|my\s+)?(.+?)\s+(?:to|with|as)\s+(.+?)[.!?।]?$/i);

  // Pattern B: "select/enter/fill/put/add/insert [VALUE] in/for/as/to/into (the/my)? [FIELD]"
  const patternValueForField =
    rawTrimmed.match(/(?:select|choose|pick|enter|fill|write|type|put|add|insert)\s+(.+?)\s+(?:for|in|into|as|to)\s+(?:the\s+|my\s+)?(.+?)[.!?।]?$/i);

  // Pattern C: "my/the [FIELD] is [VALUE]" (e.g. "My phone number is 9004234499", "My name is Adarsh Jha")
  const patternMyFieldIs =
    rawTrimmed.match(/^(?:my|the)\s+([a-zA-Z\s_-]+?)\s+(?:is|to)\s+([^\n\r]+?)[.!?।]?$/i);

  // Pattern D: "schedule delivery at [VALUE]" / "preferred delivery time [VALUE]"
  const patternDeliveryTime =
    rawTrimmed.match(/(?:schedule|set|preferred)?\s*(?:delivery|appointment)?\s*(?:time)?\s*(?:at|to|for|is)\s+(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|[a-zA-Z0-9\s]+(?:am|pm))[.!?।]?$/i);

  // Pattern E: "please add [VALUE] in the delivery instructions"
  const patternInstructions =
    rawTrimmed.match(/(?:please\s+)?(?:add|put|write|enter|include)?\s*(.+?)\s+in\s+(?:the\s+)?(?:delivery\s+instructions|instructions|notes|comments)[.!?।]?$/i);

  // Pattern F: "[FIELD] mein/me/madhe [VALUE] [select/daal/bhar/likho/write...]" (Hinglish/Hindi/Marathi)
  const patternHindiIn =
    rawTrimmed.match(/(.+?)\s+(?:mein|madhe|मध्ये|में|साठी|च्या|(?<!\b(?:help|tell|guide|let|show|ask|for|with|give)\s+)me\b(?!\s+to\b))\s+(.+?)(?:\s+(?:select|choose|kar\s+do|daal\s+do|bhar\s+do|likho|likhein|likhe|likhiye|likh\s+do|likh\s+dijiye|karo|bana\s+do|add\s+karo|add\s+kar\s+do|enter\s+karo|enter|type\s+karo|type|write|चुनें|चुनिये|चुनो|निवडा|करा|टाका|भरा|लिखें|लिखो|लिखिए|लिहा|जोड़ें|नोंदवा))?[.!?।]?$/i);

  // Pattern G: "[FIELD] ko [VALUE] kar do / update karo"
  const patternKoKarDo =
    rawTrimmed.match(/(?:change\s+)?(.+?)\s+(?:ko|ला)\s+(.+?)\s+(?:kar\s+do|bana\s+do|करा|बदला|update\s+karo|set\s+karo|likh\s+do|likho|अपडेट\s+करें|अपडेट\s+करो)[.!?।]?$/i);

  // Pattern H: "tick/check/uncheck [FIELD]" (checkbox)
  const patternCheck =
    rawTrimmed.match(/(?:tick|check|uncheck|mark|unmark)\s+(?:the\s+)?(.+?)(?:\s+checkbox|\s+box|\s+option)?[.!?।]?$/i);

  // Pattern I: "[FIELD]: [VALUE]" or "[FIELD] = [VALUE]"
  const patternColon = rawTrimmed.match(/^([^:\-=]+)\s*[:=\-]\s*([^:\-=]+)$/);

  let targetFieldStr: string | undefined;
  let targetValueStr: string | undefined;

  if (patternFieldToValue) {
    const candidate1 = patternFieldToValue[1].trim();
    const candidate2 = patternFieldToValue[2].trim();
    const cand2MatchesField = detectedFields.some((f) => matchFieldByTarget(candidate2, f) >= 0.6);
    const cand1MatchesField = detectedFields.some((f) => matchFieldByTarget(candidate1, f) >= 0.6);
    if (cand2MatchesField && !cand1MatchesField) {
      targetFieldStr = candidate2;
      targetValueStr = candidate1;
    } else {
      targetFieldStr = candidate1;
      targetValueStr = candidate2;
    }
  } else if (patternValueForField) {
    const candidateVal = patternValueForField[1].trim();
    const candidateField = patternValueForField[2].trim();
    const isScriptTarget = new RegExp(`^(?:${SCRIPT_LANGS})(?:\\s+(?:script|letters|same\\s+name))?$`, "i").test(candidateField);
    const isFieldVal = isInstructionFragment(candidateVal);
    if (!isScriptTarget && !isFieldVal) {
      targetValueStr = candidateVal;
      targetFieldStr = candidateField;
    }
  } else if (patternMyFieldIs && !/^(?:name|phone|email)$/i.test(patternMyFieldIs[1].trim())) {
    targetFieldStr = patternMyFieldIs[1].trim();
    targetValueStr = patternMyFieldIs[2].trim();
  } else if (patternDeliveryTime) {
    targetFieldStr = "delivery time";
    targetValueStr = patternDeliveryTime[1].trim();
  } else if (patternInstructions) {
    targetFieldStr = "delivery instructions";
    targetValueStr = patternInstructions[1].trim();
  } else if (patternCheck) {
    targetFieldStr = patternCheck[1].trim();
    targetValueStr = /uncheck|unmark/i.test(patternCheck[0]) ? "false" : "true";
  } else if (patternHindiIn) {
    targetFieldStr = patternHindiIn[1].trim();
    targetValueStr = patternHindiIn[2].trim();
  } else if (patternKoKarDo) {
    targetFieldStr = patternKoKarDo[1].trim();
    targetValueStr = patternKoKarDo[2].trim();
  } else if (patternColon) {
    targetFieldStr = patternColon[1].trim();
    targetValueStr = patternColon[2].trim();
  }

  if (targetFieldStr && targetValueStr) {
    targetFieldStr = targetFieldStr.replace(/\b(?:field|input|box|checkbox|option|फ़ील्ड|फील्ड)\b/gi, "").trim();

    if (!isValidTargetFieldCandidate(targetFieldStr)) {
      targetFieldStr = undefined;
    }
  }

  if (targetFieldStr && targetValueStr) {

    const matches: Array<{ field: ContextDetectedField; score: number }> = [];
    for (const f of detectedFields) {
      const score = matchFieldByTarget(targetFieldStr, f, targetValueStr);
      if (score >= 0.7) {
        matches.push({ field: f, score });
      }
    }

    matches.sort((a, b) => b.score - a.score);

    // Ambiguity check
    if (matches.length > 1 && Math.abs(matches[0].score - matches[1].score) < 0.1) {
      const candidateFields = matches.slice(0, 3).map((m) => m.field);
      const names = candidateFields.map((cf) => cf.label || cf.fieldIdentifier).join(", ");
      let clarificationQuestion = `Multiple fields match "${targetFieldStr}": ${names}. Which field would you like to update?`;
      if (detectedLang === "hi") {
        clarificationQuestion = `"${targetFieldStr}" के लिए एक से अधिक फ़ील्ड मिले: ${names}। आप कौन सा फ़ील्ड अपडेट करना चाहते हैं?`;
      } else if (detectedLang === "mr") {
        clarificationQuestion = `"${targetFieldStr}" साठी एकापेक्षा जास्त फील्ड आढळले: ${names}. तुम्हाला कोणते फील्ड अपडेट करायचे आहे?`;
      } else if (detectedLang === "hinglish") {
        clarificationQuestion = `"${targetFieldStr}" ke liye multiple fields mile: ${names}. Aap kaunsa field update karna chahte hain?`;
      }
      logObservabilityEvent("INTENT_DETECTED", {
        conversationId,
        requestId,
        intent: "FORM_UPDATE_AMBIGUOUS",
        targetField: targetFieldStr,
        matchesCount: matches.length,
      });
      return {
        type: "FORM_UPDATE",
        status: "AMBIGUOUS",
        candidateFields,
        requestedTarget: targetFieldStr,
        clarificationQuestion,
      };
    }

    if (matches.length > 0) {
      const bestField = matches[0].field;
      logObservabilityEvent("INTENT_DETECTED", {
        conversationId,
        requestId,
        intent: "EXPLICIT_FORM_UPDATE",
        targetField: targetFieldStr,
        matchedFieldId: bestField.id,
      });
      logObservabilityEvent("FORM_FIELD_MATCHED", {
        conversationId,
        fieldId: bestField.id,
        fieldIdentifier: bestField.fieldIdentifier,
        label: bestField.label,
      });

      return resolveFieldValue({
        field: bestField,
        rawValue: targetValueStr,
        approvedMemories,
        detectedLang,
        conversationId,
      });
    }

    // Explicit command attempted, but no field matched
    let noFieldMsg = `I could not find a field for "${targetFieldStr}" in the active form.`;
    if (detectedLang === "hi") {
      noFieldMsg = `सक्रिय फ़ॉर्म में "${targetFieldStr}" के लिए कोई फ़ील्ड नहीं मिला।`;
    } else if (detectedLang === "mr") {
      noFieldMsg = `सक्रिय फॉर्ममध्ये "${targetFieldStr}" साठी कोणतेही फील्ड सापडले नाही.`;
    } else if (detectedLang === "hinglish") {
      noFieldMsg = `Active form mein "${targetFieldStr}" ke liye koi field nahi mila.`;
    }
    return {
      type: "FORM_UPDATE",
      status: "NO_FIELD_MATCH",
      requestedTarget: targetFieldStr,
      clarificationQuestion: noFieldMsg,
    };
  }

  // =========================================================================
  // Strategy 2: Multi-Field / Batch Field Extraction (e.g. name, phone, size together)
  // =========================================================================

  // A. Check options on option fields (radio, select, checkbox with options)
  for (const f of detectedFields) {
    if (f.options && Array.isArray(f.options) && f.options.length > 0) {
      const optMatch = matchOption(rawTrimmed, f.options as FormOption[]);
      if (optMatch.matched && optMatch.option) {
        const mentionsField = matchFieldByTarget(rawTrimmed, f) > 0.6;
        const onlyOptionField = detectedFields.filter((df) => Array.isArray(df.options) && df.options.length > 0).length === 1;

        if (mentionsField || onlyOptionField || hasActionVerb || /want|select|choose|take|order|size|topping|pizza/i.test(rawTrimmed)) {
          logObservabilityEvent("INTENT_DETECTED", {
            conversationId,
            requestId,
            intent: "EXPLICIT_OPTION_SELECTION",
            fieldId: f.id,
          });
          logObservabilityEvent("FORM_FIELD_MATCHED", {
            conversationId,
            fieldId: f.id,
            fieldIdentifier: f.fieldIdentifier,
            label: f.label,
          });
          logObservabilityEvent("FORM_VALUE_MATCHED", {
            conversationId,
            fieldId: f.id,
            matchedValue: optMatch.option.value,
            confidence: optMatch.confidence,
          });

          updates.push({
            field: f,
            value: optMatch.option.value,
            resolvedValue: optMatch.option.value,
            confidence: optMatch.confidence,
            intentReason: `Matched option '${optMatch.option.label}' for field '${f.label || f.fieldIdentifier}'`,
          });
        }
      }

      // Check multi-checkbox options (e.g. "Add extra cheese and mushrooms", "bacon and extra cheese")
      if (f.inputType === "checkbox" || (f.elementType === "input" && f.inputType === "checkbox")) {
        const words = rawTrimmed.split(/\s+(?:and|&|,|\+)\s+/i);
        for (const w of words) {
          const subMatch = matchOption(w, f.options as FormOption[]);
          if (subMatch.matched && subMatch.option) {
            if (!updates.some((u) => u.field.id === f.id && u.resolvedValue === subMatch.option!.value)) {
              updates.push({
                field: f,
                value: subMatch.option.value,
                resolvedValue: subMatch.option.value,
                confidence: subMatch.confidence,
                intentReason: `Matched checkbox option '${subMatch.option.label}'`,
              });
            }
          }
        }
      }
    }
  }

  // B. Check telephone / phone (with spoken number normalization & leading-zero preservation)
  const phoneExtracted = extractPhoneNumber(rawTrimmed) || extractPhoneNumber(normalizedSpokenDigits);
  if (phoneExtracted) {
    const phoneField = detectedFields.find((f) =>
      conceptForField({
        id: f.id,
        fieldIdentifier: f.fieldIdentifier,
        label: f.label,
        searchableText: `${f.label || ""} ${f.fieldIdentifier}`,
        inputType: f.inputType || "text",
        options: [],
        required: Boolean(f.required),
        disabled: Boolean(f.disabled),
        readOnly: Boolean(f.readOnly),
      }) === "phone" || (f.inputType && f.inputType.toLowerCase() === "tel") || /phone|telephone|mobile|contact|दूरभाष/i.test(`${f.label || ""} ${f.fieldIdentifier}`)
    );
    if (phoneField && !updates.some((u) => u.field.id === phoneField.id)) {
      logObservabilityEvent("FORM_FIELD_MATCHED", { fieldId: phoneField.id, label: phoneField.label });
      logObservabilityEvent("FORM_VALUE_MATCHED", { fieldId: phoneField.id, matchedValue: phoneExtracted });
      updates.push({
        field: phoneField,
        value: phoneExtracted,
        resolvedValue: phoneExtracted,
        confidence: 0.98,
        intentReason: "User provided telephone number",
      });
    }
  }

  // C. Check email (supporting spoken emails, Devanagari transliteration, and conversational inputs)
  const emailExtracted = extractSpokenEmail(rawTrimmed);
  if (emailExtracted) {
    const emailField = detectedFields.find((f) =>
      conceptForField({
        id: f.id,
        fieldIdentifier: f.fieldIdentifier,
        label: f.label,
        searchableText: `${f.label || ""} ${f.fieldIdentifier}`,
        inputType: f.inputType || "text",
        options: [],
        required: Boolean(f.required),
        disabled: Boolean(f.disabled),
        readOnly: Boolean(f.readOnly),
      }) === "email" || (f.inputType && f.inputType.toLowerCase() === "email") || /email|e-mail|ईमेल/i.test(`${f.label || ""} ${f.fieldIdentifier}`)
    );
    if (emailField && !updates.some((u) => u.field.id === emailField.id)) {
      logObservabilityEvent("FORM_FIELD_MATCHED", { fieldId: emailField.id, label: emailField.label });
      logObservabilityEvent("FORM_VALUE_MATCHED", { fieldId: emailField.id, matchedValue: emailExtracted });
      updates.push({
        field: emailField,
        value: emailExtracted,
        resolvedValue: emailExtracted,
        confidence: 0.98,
        intentReason: "User provided email address",
      });
    }
  }

  // D. Check full name / customer name (strictly preserving proper noun spelling and Latin casing)
  const namePatterns = [
    /(?:my name is|name is)\s+([A-Za-z\s]+?)(?:,|$|\.|\band\b)/i,
    /(?:add|put|enter|fill)\s+([A-Za-z\s]+?)\s+(?:in|for|as|into)\s+(?:the\s+)?(?:customer\s+name|name)/i,
    /(?:i am|i'm)\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,3})(?:,|$|\.|\band\b)/,
    /(?:मेरा नाम|नाम)\s*(?:है)?\s*([^\s.!?।]+(?:\s+[^\s.!?।]+)?)/i,
    /(?:माझे नाव|नाव)\s*([^\s.!?।]+(?:\s+[^\s.!?।]+)?)/i,
  ];

  let extractedName: string | undefined;
  for (const np of namePatterns) {
    const m = rawTrimmed.match(np);
    if (m && m[1]) {
      const candidate = m[1].trim();
      if (isValidPersonalName(candidate)) {
        extractedName = candidate;
        break;
      }
    }
  }

  if (extractedName && extractedName.length >= 2 && isValidPersonalName(extractedName)) {
    const nameField = detectedFields.find((f) =>
      conceptForField({
        id: f.id,
        fieldIdentifier: f.fieldIdentifier,
        label: f.label,
        searchableText: `${f.label || ""} ${f.fieldIdentifier}`,
        inputType: f.inputType || "text",
        options: [],
        required: Boolean(f.required),
        disabled: Boolean(f.disabled),
        readOnly: Boolean(f.readOnly),
      }) === "full_name" || /customer\s*name|full\s*name|applicant\s*name|नाम|नाव/i.test(`${f.label || ""} ${f.fieldIdentifier}`)
    );
    if (nameField && !updates.some((u) => u.field.id === nameField.id)) {
      logObservabilityEvent("FORM_FIELD_MATCHED", { fieldId: nameField.id, label: nameField.label });
      logObservabilityEvent("FORM_VALUE_MATCHED", { fieldId: nameField.id, matchedValue: extractedName });
      updates.push({
        field: nameField,
        value: extractedName,
        resolvedValue: extractedName,
        confidence: 0.98,
        intentReason: "User provided full name",
      });
    }
  }

  // E. Check time for appointment/delivery time fields
  const timeField = detectedFields.find((f) => f.inputType === "time" || /delivery\s*time|appointment\s*time|preferred\s*time|समय|वेळ/i.test(`${f.label || ""} ${f.fieldIdentifier}`));
  if (timeField && !updates.some((u) => u.field.id === timeField.id)) {
    const parsedTime = parseSpokenTime(rawTrimmed, detectedLang);
    if (parsedTime) {
      if (parsedTime.isAmbiguous && parsedTime.clarificationMessage) {
        return {
          type: "FORM_UPDATE",
          status: "AMBIGUOUS",
          candidateFields: [timeField],
          requestedTarget: timeField.label || timeField.fieldIdentifier,
          clarificationQuestion: parsedTime.clarificationMessage,
        };
      }
      if (parsedTime.formattedTime) {
        updates.push({
          field: timeField,
          value: parsedTime.formattedTime,
          resolvedValue: parsedTime.formattedTime,
          confidence: 0.95,
          intentReason: `Resolved delivery time '${parsedTime.formattedTime}'`,
        });
      }
    }
  }

  // Filter out any sensitive fields from automated batch resolution
  const safeUpdates = updates.filter((u) => !isSensitiveField(u.field));
  if (safeUpdates.length > 0) {
    return {
      type: "FORM_UPDATE",
      status: "RESOLVED",
      field: safeUpdates[0].field,
      value: safeUpdates[0].value,
      resolvedValue: safeUpdates[0].resolvedValue,
      confidence: safeUpdates[0].confidence,
      intentReason: safeUpdates.map((u) => u.intentReason).join("; "),
      updates: safeUpdates,
    };
  }

  return { type: "NOT_FORM_ACTION" };
}

function resolveFieldValue(params: {
  field: ContextDetectedField;
  rawValue: string;
  approvedMemories: ContextProfileFact[];
  detectedLang: string;
  conversationId?: string;
}): FormActionRouteResult {
  const { field, rawValue, approvedMemories, detectedLang, conversationId } = params;

  if ((field.inputType || "").toLowerCase() === "file") {
    return {
      type: "CONVERSATIONAL_RESPONSE",
      response: `The field "${field.label || field.fieldIdentifier}" is a file attachment field. To attach a file, please select it through your browser's native file picker button on the page.`,
      intent: "INCOMPATIBLE_FIELD_TYPE",
    };
  }

  if (isSensitiveField(field)) {
    return {
      type: "FORM_UPDATE",
      status: "OPTION_NOT_FOUND",
      field,
      requestedOption: rawValue,
      availableOptions: [],
      clarificationMessage:
        "For your security, sensitive fields (passwords, payment cards, CVV, authentication credentials, and government IDs) cannot be autofilled and must be entered directly on the webpage.",
    };
  }

  let valueToUse: unknown = rawValue.trim();

  // If email field, normalize spoken email first
  const isEmailField = (field.inputType || "").toLowerCase() === "email" || conceptForField({
    id: field.id,
    fieldIdentifier: field.fieldIdentifier,
    label: field.label,
    searchableText: `${field.label || ""} ${field.fieldIdentifier}`,
    inputType: field.inputType || "text",
    options: [],
    required: Boolean(field.required),
    disabled: Boolean(field.disabled),
    readOnly: Boolean(field.readOnly),
  }) === "email";

  if (isEmailField) {
    const spoken = extractSpokenEmail(String(valueToUse));
    if (spoken) {
      valueToUse = spoken;
    }
  }

  // Validate centralized field compatibility
  const compat = isFieldTypeCompatible(field, valueToUse);
  if (!compat.compatible) {
    return {
      type: "CONVERSATIONAL_RESPONSE",
      response: compat.reason || `Value "${valueToUse}" is incompatible with field "${field.label || field.fieldIdentifier}".`,
      intent: "INCOMPATIBLE_FIELD_TYPE",
    };
  }

  // Reject instruction fragments (e.g. "the customer name", "cutomer name", "english same name", "same name", etc.)
  if (isInstructionFragment(valueToUse)) {
    let askMsg = `What value would you like to enter for ${field.label || field.fieldIdentifier}?`;
    if (detectedLang === "hi") {
      askMsg = `आप ${field.label || field.fieldIdentifier} में क्या दर्ज करना चाहते हैं?`;
    } else if (detectedLang === "mr") {
      askMsg = `तुम्ही ${field.label || field.fieldIdentifier} मध्ये काय नोंदवू इच्छिता?`;
    } else if (detectedLang === "hinglish") {
      askMsg = `Aap ${field.label || field.fieldIdentifier} mein kya enter karna chahte hain?`;
    }
    return {
      type: "CONVERSATIONAL_RESPONSE",
      response: askMsg,
      intent: "CLARIFY_FIELD_VALUE",
    };
  }

  // If user says "my email" or "my phone" or "my address", check approved memories
  const isProfileRef =
    /\b(?:my\s+email|my\s+phone|my\s+address|my\s+name|मेरा\s+ईमेल|मेरा\s+फोन|माझा\s+ईमेल)\b/i.test(rawValue);
  if (isProfileRef && approvedMemories.length > 0) {
    const fieldConcept = conceptForField({
      id: field.id,
      fieldIdentifier: field.fieldIdentifier,
      label: field.label,
      searchableText: `${field.label || ""} ${field.fieldIdentifier}`,
      inputType: field.inputType || "text",
      options: (field.options as FormOption[]) || [],
      required: Boolean(field.required),
      disabled: Boolean(field.disabled),
      readOnly: Boolean(field.readOnly),
    });
    if (fieldConcept) {
      const memoryFact = approvedMemories.find((fact) => {
        const factConcept = conceptForText(`${fact.key} ${fact.category}`);
        return factConcept === fieldConcept;
      });
      if (memoryFact && memoryFact.value) {
        valueToUse = memoryFact.value;
      }
    }
  }

  // Handle options for select / radio / checkbox
  if (field.options && Array.isArray(field.options) && field.options.length > 0) {
    const matchRes = matchOption(String(valueToUse), field.options as FormOption[]);
    if (matchRes.matched && matchRes.option) {
      logObservabilityEvent("FORM_VALUE_MATCHED", {
        conversationId,
        fieldId: field.id,
        matchedValue: matchRes.option.value,
        confidence: matchRes.confidence,
      });
      return {
        type: "FORM_UPDATE",
        status: "RESOLVED",
        field,
        value: matchRes.option.value,
        resolvedValue: matchRes.option.value,
        confidence: matchRes.confidence,
        intentReason: `Matched option '${matchRes.option.label}' for field '${field.label || field.fieldIdentifier}'`,
        updates: [{
          field,
          value: matchRes.option.value,
          resolvedValue: matchRes.option.value,
          confidence: matchRes.confidence,
          intentReason: `Matched option '${matchRes.option.label}' for field '${field.label || field.fieldIdentifier}'`,
        }],
      };
    }

    const availStr = (field.options as FormOption[]).map((o) => o.label || o.value).join(", ");
    let optErrMsg = `The option "${valueToUse}" is not available for ${field.label || field.fieldIdentifier}. Available options are: ${availStr}.`;
    if (detectedLang === "hi") {
      optErrMsg = `${field.label || field.fieldIdentifier} के लिए "${valueToUse}" विकल्प उपलब्ध नहीं है। उपलब्ध विकल्प हैं: ${availStr}।`;
    } else if (detectedLang === "mr") {
      optErrMsg = `${field.label || field.fieldIdentifier} साठी "${valueToUse}" पर्याय उपलब्ध नाही. उपलब्ध पर्याय आहेत: ${availStr}.`;
    } else if (detectedLang === "hinglish") {
      optErrMsg = `${field.label || field.fieldIdentifier} ke liye "${valueToUse}" option available nahi hai. Available options hain: ${availStr}.`;
    }

    return {
      type: "FORM_UPDATE",
      status: "OPTION_NOT_FOUND",
      field,
      requestedOption: String(valueToUse),
      availableOptions: field.options as Array<{ label: string; value: string }>,
      clarificationMessage: optErrMsg,
    };
  }

  // Handle numeric / quantity field
  const isNumericField = field.inputType === "number" || /quantity|amount|count|मात्रा|संख्या/i.test(field.label || "");
  if (isNumericField && typeof valueToUse === "string") {
    const numMatch = valueToUse.match(/\d+/);
    if (numMatch) {
      valueToUse = Number(numMatch[0]);
    }
  }

  // Handle telephone / phone field (normalize spoken words, preserve leading zeros, store as string)
  const isPhoneField = field.inputType === "tel" || /phone|telephone|mobile|contact|दूरभाष/i.test(`${field.label || ""} ${field.fieldIdentifier}`);
  if (isPhoneField) {
    const cleanPhone = extractPhoneNumber(String(valueToUse)) || String(valueToUse).replace(/[^0-9+]/g, "");
    if (cleanPhone) {
      valueToUse = cleanPhone;
    }
  }

  // Handle time fields (normalize to HH:MM, detect ambiguity)
  const isTimeField = field.inputType === "time" || /time|delivery\s*time|appointment\s*time|समय|वेळ/i.test(`${field.label || ""} ${field.fieldIdentifier}`);
  if (isTimeField) {
    const parsedTime = parseSpokenTime(String(valueToUse), detectedLang);
    if (parsedTime) {
      if (parsedTime.isAmbiguous && parsedTime.clarificationMessage) {
        return {
          type: "FORM_UPDATE",
          status: "AMBIGUOUS",
          candidateFields: [field],
          requestedTarget: field.label || field.fieldIdentifier,
          clarificationQuestion: parsedTime.clarificationMessage,
        };
      }
      if (parsedTime.formattedTime) {
        valueToUse = parsedTime.formattedTime;
      }
    }
  }

  // Handle boolean checkbox
  if (field.inputType === "checkbox" && (!field.options || (Array.isArray(field.options) && field.options.length === 0))) {
    if (/\b(?:uncheck|remove|false|no|disable)\b/i.test(String(valueToUse))) {
      valueToUse = false;
    } else {
      valueToUse = true;
    }
  }

  logObservabilityEvent("FORM_VALUE_MATCHED", {
    conversationId,
    fieldId: field.id,
    matchedValue: valueToUse,
    confidence: 1.0,
  });

  return {
    type: "FORM_UPDATE",
    status: "RESOLVED",
    field,
    value: valueToUse,
    resolvedValue: valueToUse,
    confidence: 1.0,
    intentReason: `Resolved value '${valueToUse}' for field '${field.label || field.fieldIdentifier}'`,
    updates: [{
      field,
      value: valueToUse,
      resolvedValue: valueToUse,
      confidence: 1.0,
      intentReason: `Resolved value '${valueToUse}' for field '${field.label || field.fieldIdentifier}'`,
    }],
  };
}
