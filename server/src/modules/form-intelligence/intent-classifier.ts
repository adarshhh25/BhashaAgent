/**
 * Centralized Multilingual Intent Classifier
 *
 * Classifies the user's intent BEFORE attempting target-field extraction or form-field matching.
 * Distinguishes general form assistance, form overviews, field queries, field updates,
 * script conversions, and general conversation across English, Hindi, Marathi, and Hinglish.
 */

import type { ContextDetectedField } from "../context/context.types";

export type UserIntentType =
  | "GENERAL_FORM_ASSISTANCE"
  | "FORM_OVERVIEW"
  | "FIELD_INFORMATION_QUERY"
  | "FIELD_VALUE_UPDATE"
  | "FIELD_SCRIPT_CONVERSION"
  | "FIELD_VALUE_CORRECTION"
  | "FORM_COMPLETION_GUIDANCE"
  | "SELECT_ALL_CHECKBOXES"
  | "OBSERVATION_CORRECTION"
  | "GENERAL_CONVERSATION"
  | "CLARIFICATION_REQUIRED";

export interface ClassifiedUserIntent {
  intent: UserIntentType;
  requestedTarget: string | null;
  requestedValue: string | null;
  requestedOperation: string | null;
  requiresFieldResolution: boolean;
  requiresBrowserMutation: boolean;
  requiresConversationalReasoning: boolean;
  confidence: number;
  clarificationReason?: string;
  targetScript?: "latin" | "devanagari";
}

/**
 * Words that must NEVER become field targets merely because they appear in instructions
 */
export const GENERIC_NON_FIELD_WORDS = new Set([
  "help",
  "assist",
  "assistance",
  "form",
  "fill",
  "filling",
  "complete",
  "completing",
  "guide",
  "guidance",
  "walkthrough",
  "please",
  "can",
  "could",
  "would",
  "me",
  "my",
  "this",
  "that",
  "the",
  "a",
  "an",
  "to",
  "for",
  "in",
  "of",
  "karo",
  "karna",
  "madad",
  "sahayata",
  "bharo",
  "bharna",
  "kar do",
  "batao",
  "kya",
  "what",
  "how",
  "why",
  "which",
  "where",
  "who",
  "मदत",
  "सहायता",
  "मदद",
  "करा",
  "करणे",
  "भरा",
  "भरणे",
  "फॉर्म",
  "हा",
  "हे",
  "या",
  "मला",
  "माझे",
  "सांगा",
  "दाखवा",
]);

// Multilingual General Form Assistance patterns
const GENERAL_FORM_ASSISTANCE_PATTERNS = [
  // English
  /\b(?:help(?:\s+me)?(?:\s+to)?\s+fill(?:\s+out)?(?:\s+this|\s+the)?\s+form)\b/i,
  /\b(?:can\s+you\s+help\s+me\s+complete(?:\s+this|\s+the)?\s+form)\b/i,
  /\b(?:(?:i\s+need|need)\s+assistance\s+filling(?:\s+out)?(?:\s+this|\s+the)?\s+form)\b/i,
  /\b(?:guide\s+me\s+through(?:\s+this|\s+the)?\s+form)\b/i,
  /\b(?:let'?s\s+fill(?:\s+out)?(?:\s+this|\s+the)?\s+form(?:\s+together)?)\b/i,
  /\b(?:what\s+information\s+do\s+you\s+need(?:\s+from\s+me)?)\b/i,
  /\b(?:fill(?:\s+out)?\s+this\s+form\s+with\s+my\s+details)\b/i,
  /\b(?:can\s+you\s+walk(?:\s+me)?\s+through(?:\s+the|\s+this)?\s+form)\b/i,
  /\b(?:how\s+(?:do\s+i|to)\s+fill(?:\s+out)?(?:\s+this|\s+the)?\s+form)\b/i,
  /\b(?:help(?:\s+me)?\s+with(?:\s+this|\s+the)?\s+form)\b/i,
  /\b(?:assist\s+me\s+with(?:\s+this|\s+the)?\s+form)\b/i,
  /\b(?:start(?:\s+filling)?(?:\s+the|\s+this)?\s+form)\b/i,
  /^(?:help\s+fill\s+form|fill\s+form\s+help|form\s+filling\s+help|help\s+me\s+fill)$/i,

  // Hindi
  /(?:इस|यह|ये)\s+फ़ॉर्म\s+(?:को\s+)?भरने\s+में\s+(?:मेरी\s+)?(?:मदद|सहायता)\s+(?:करो|करें|कीजिए|कर\s+दो)/i,
  /(?:मुझे|हमे)\s+(?:यह|ये|इस)?\s*फ़ॉर्म\s+भरना\s+है/i,
  /(?:मुझे|हमे)\s+फ़ॉर्म\s+भरने\s+में\s+(?:गाइड|मदद|सहायता)\s+(?:करो|करें|कीजिए)/i,
  /(?:चलो|आइए)\s+(?:यह|ये|इस)?\s*फ़ॉर्म\s+भरते\s+हैं/i,
  /फ़ॉर्म\s+भरवा\s+दो/i,
  /फ़ॉर्म\s+भरने\s+में\s+मदद\s+(?:करो|करें|कीजिए)/i,

  // Marathi
  /(?:मला\s+)?(?:हा|हे)\s+फॉर्म\s+भरण्यास\s+मदत\s+करा/i,
  /(?:हा|हे)\s+फॉर्म\s+कसा\s+भरायचा\s+ते\s+सांगा/i,
  /(?:मला\s+)?(?:हा|हे)\s+फॉर्म\s+भरून\s+घ्यायचा\s+आहे/i,
  /फॉर्म\s+भरण्यासाठी\s+मार्गदर्शन\s+करा/i,
  /(?:मला\s+)?फॉर्म\s+भरायला\s+मदत\s+करा/i,

  // Hinglish
  /(?:is|ye|yeh)\s+form\s+(?:ko\s+)?fill\s+karne\s+mein\s+(?:meri\s+)?help\s+(?:karo|kar\s+do|kijiye)/i,
  /mujhe\s+(?:ye|yeh|is)?\s*form\s+bharna\s+hai/i,
  /form\s+fill\s+karne\s+mein\s+meri\s+help\s+(?:karo|kar\s+do)/i,
  /chalo\s+(?:ye|yeh|is)?\s*form\s+fill\s+karte\s+hain/i,
  /mujhe\s+guide\s+karo\s+ki\s+kya\s+bharna\s+hai/i,
  /form\s+bharne\s+me\s+help\s+karo/i,
  /form\s+bhar\s+do/i,
  /help\s+karo\s+form\s+bharne\s+me/i,
];

// Form Overview patterns
const FORM_OVERVIEW_PATTERNS = [
  /\b(?:what\s+(?:is|are)\s+(?:in|on)\s+this\s+form|what\s+does\s+this\s+form\s+(?:ask|contain))\b/i,
  /\b(?:summarize(?:\s+this)?\s+form|overview\s+of(?:\s+the|\s+this)?\s+form)\b/i,
  /\b(?:what\s+fields\s+are\s+(?:in|on)\s+this\s+form)\b/i,
  /इस\s+फ़ॉर्म\s+में\s+क्या\s+है/i,
  /या\s+फॉर्ममध्ये\s+काय\s+आहे/i,
  /is\s+form\s+mein\s+kya\s+kya\s+hai/i,
];

// Script conversion patterns (e.g. "Customer name ko English mein likho", "Name Hindi mein kar do")
const SCRIPT_CONVERSION_REGEX =
  /(?:customer\s*name|name|नाम|नाव|field|input|isko|use|it|this|that|त्याला|त्यास|उसे|इसको)?\s*(?:ko|la|ला|को)?\s*(english|angrezi|latin|roman|hindi|devanagari|marathi|इंग्लिश|अंग्रेज़ी|मराठी|हिंदी|देवनागरी)\s*(?:mein|me|script\s+mein|letters\s+mein|मध्ये|त|in|into|to|script|letters)?\s*(?:लिखें|लिखिए|लिखो|likho|likh\s+do|kar\s+do|convert\s+karo|convert\s+kar\s+do|badlo|badal\s+do|karo|likhiye|kijiye|करा|बदला|लिहा|करायचे|कीजिए|करें|change|write|convert)[.!?।]?$/i;

// Select All Checkboxes patterns (English, Hindi, Marathi, Hinglish)
const SELECT_ALL_PATTERNS = [
  // English
  /\b(?:select|tick|check|choose|pick)\s+(?:all|every|each|all\s+available|all\s+types\s+of)\s+(?:the\s+)?([a-zA-Z\s_-]+?)(?:\s+options?|\s+checkboxes?|\s+boxes?)?[.!?।]?$/i,
  /\b(?:make\s+sure\s+all\s+(?:the\s+)?([a-zA-Z\s_-]+?)\s+are\s+selected)\b/i,
  /\b(?:select|tick|check)\s+all(?:\s+of\s+them|\s+options|\s+boxes)?\b/i,
  /^(?:select\s+all|check\s+all|tick\s+all|all\s+toppings|select\s+all\s+toppings)$/i,

  // Hindi
  /(?:सभी|सारे|सब)\s+(?:(विकल्प(?:ों)?|ऑप्शन्स?|टॉपिंग्स?|फ़ील्ड्स?))\s*(?:को\s+)?(?:चुनें|चुनो|चुनिये|सिलेक्ट\s+करो|सिलेक्ट\s+करें|टिक\s+करो|टिक\s+लगाओ)/i,
  /(?:(टॉपिंग्स?|विकल्प(?:ों)?))\s+(?:सभी|सारे)\s+(?:चुनो|सिलेक्ट\s+करो|चुनें)/i,

  // Marathi
  /(?:सर्व|सगळे)\s+(?:(पर्याय|ऑप्शन्स?|टॉपिंग्स?))\s*(?:निवडा|सिलेक्ट\s+करा|टिक\s+करा)/i,

  // Hinglish
  /(?:saare|sabhi|all)\s+(?:(toppings?|options?|checkboxes?))\s+(?:select|check|tick)\s+(?:karo|kar\s+do|kijiye)/i,
  /(?:select|check|tick)\s+(?:all|saare|sabhi)\s+(?:(toppings?|options?))/i,
];

// Observation and Correction patterns (e.g. user observing page state or stating assistant claim was incorrect)
const OBSERVATION_CORRECTION_PATTERNS = [
  /\b(?:i\s+am|i'm|im|i\s+can)\s+(?:seeing|looking\s+at|viewing)\s+(?:the\s+)?(?:form|page|screen)\b/i,
  /\b(?:it\s+is\s+not|it's\s+not|has\s+not\s+been|hasn't\s+been|is\s+not)\s+selected(?:\s+yet)?\b/i,
  /\b(?:no\s+it\s+has\s+not\s+been\s+selected|not\s+selected\s+yet|still\s+not\s+selected)\b/i,
  /\b(?:that\s+is\s+not|that's\s+not)\s+what\s+i\s+asked\b/i,
  /\b(?:nothing\s+is\s+selected|none\s+of\s+them\s+are\s+selected|boxes\s+are\s+(?:still\s+)?unchecked)\b/i,
  /(?:फ़ॉर्म\s+में|फॉर्ममध्ये)?\s*(?:कुछ\s+भी|काहीही)\s*(?:सिलेक्ट|निवडले)\s*(?:नहीं\s+हुआ|नाही\s+झाले)/i,
  /(?:ये|यह|हे)\s+(?:सिलेक्ट|निवड)\s+(?:नहीं\s+हुआ|नाही\s+झाले)/i,
  /select\s+nahi\s+hua/i,
];

// Non-name stopwords: tokens that prove a string is a sentence or observation, NOT a person's name
const NON_NAME_WORDS = new Set([
  "seeing", "looking", "trying", "saying", "telling", "checking", "testing",
  "watching", "filling", "typing", "waiting", "confused", "sure", "sorry",
  "form", "field", "selected", "not", "yet", "the", "this", "that", "it",
  "option", "options", "topping", "toppings", "here", "there", "ready",
  "unable", "online", "offline", "page", "webpage", "screen", "browser",
  "help", "assist", "please", "now", "just", "done", "okay", "yes", "no",
  "is", "are", "am", "was", "were", "have", "has", "had", "can", "could",
]);

/**
 * Validates that an extracted string is legitimately a personal name and not a sentence or observation.
 */
export function isValidPersonalName(nameStr?: string | null): boolean {
  if (!nameStr || typeof nameStr !== "string") return false;
  const trimmed = nameStr.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  if (tokens.some((t) => NON_NAME_WORDS.has(t))) return false;
  return true;
}

// Field Information Query patterns (e.g. "What should I enter in email field?", "Email field mein kya likhna chahiye?")
const FIELD_QUERY_PATTERNS = [
  /\b(?:what\s+should\s+i\s+(?:enter|write|put|type)\s+in(?:\s+the)?\s+(.+?)(?:\s+field)?)\b/i,
  /\b(?:what\s+does(?:\s+the)?\s+(.+?)(?:\s+field)?\s+mean)\b/i,
  /\b(?:is(?:\s+the)?\s+(.+?)(?:\s+field)?\s+mandatory|required)\b/i,
  /(.+?)\s+(?:field|फ़ील्ड|फील्ड|बॉक्स)\s+में\s+क्या\s+(?:लिखना|डालना|भरना)\s+चाहिए/i,
  /(.+?)\s+field\s+mein\s+kya\s+(?:likhna|daalna|bharna)\s+chahiye/i,
];

/**
 * Classifies a user's instruction into a high-level intent BEFORE field extraction.
 */
export function classifyUserIntent(
  content: string,
  context?: {
    detectedFields?: ContextDetectedField[];
    recentMessages?: Array<{ role: string; content: string }>;
  },
): ClassifiedUserIntent {
  const trimmed = (content || "").trim();
  if (!trimmed) {
    return {
      intent: "GENERAL_CONVERSATION",
      requestedTarget: null,
      requestedValue: null,
      requestedOperation: null,
      requiresFieldResolution: false,
      requiresBrowserMutation: false,
      requiresConversationalReasoning: true,
      confidence: 1.0,
    };
  }

  // 1. Check for GENERAL_FORM_ASSISTANCE first
  for (const pattern of GENERAL_FORM_ASSISTANCE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        intent: "GENERAL_FORM_ASSISTANCE",
        requestedTarget: null,
        requestedValue: null,
        requestedOperation: "ASSIST_ENTIRE_FORM",
        requiresFieldResolution: false,
        requiresBrowserMutation: false,
        requiresConversationalReasoning: true,
        confidence: 0.98,
      };
    }
  }

  // 1B. Check for SELECT_ALL_CHECKBOXES
  for (const pattern of SELECT_ALL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const targetGroup = match[1]?.trim() || "options";
      return {
        intent: "SELECT_ALL_CHECKBOXES",
        requestedTarget: targetGroup,
        requestedValue: "all",
        requestedOperation: "SELECT_ALL_OPTIONS",
        requiresFieldResolution: true,
        requiresBrowserMutation: true,
        requiresConversationalReasoning: false,
        confidence: 0.98,
      };
    }
  }

  // 1C. Check for OBSERVATION_CORRECTION
  for (const pattern of OBSERVATION_CORRECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      // Check if user also included an action command in the same turn (e.g. "no it has not been selected select all options")
      const selectAllInObservation = SELECT_ALL_PATTERNS.some((p) => p.test(trimmed));
      if (selectAllInObservation) {
        return {
          intent: "SELECT_ALL_CHECKBOXES",
          requestedTarget: "options",
          requestedValue: "all",
          requestedOperation: "SELECT_ALL_OPTIONS",
          requiresFieldResolution: true,
          requiresBrowserMutation: true,
          requiresConversationalReasoning: false,
          confidence: 0.95,
        };
      }

      return {
        intent: "OBSERVATION_CORRECTION",
        requestedTarget: null,
        requestedValue: null,
        requestedOperation: "CORRECT_STATE_OBSERVATION",
        requiresFieldResolution: false,
        requiresBrowserMutation: false,
        requiresConversationalReasoning: true,
        confidence: 0.95,
      };
    }
  }

  // 2. Check for FORM_OVERVIEW
  for (const pattern of FORM_OVERVIEW_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        intent: "FORM_OVERVIEW",
        requestedTarget: null,
        requestedValue: null,
        requestedOperation: "OVERVIEW_FORM",
        requiresFieldResolution: false,
        requiresBrowserMutation: false,
        requiresConversationalReasoning: true,
        confidence: 0.95,
      };
    }
  }

  // 3. Check for SCRIPT_CONVERSION
  const scriptMatch = trimmed.match(SCRIPT_CONVERSION_REGEX);
  if (scriptMatch && /(?:english|angrezi|latin|roman|hindi|devanagari|marathi|इंग्लिश|अंग्रेज़ी|मराठी|हिंदी|देवनागरी)/i.test(scriptMatch[1])) {
    const rawTarget = scriptMatch[0].replace(new RegExp(scriptMatch[1], "i"), "").trim();
    const cleanTarget = rawTarget.replace(/\b(?:ko|la|mein|me|script|letters|में|मध्ये|लिखें|लिखो|likho|kar\s+do)\b/gi, "").trim();
    const targetScript = /hindi|devanagari|marathi|हिंदी|मराठी|देवनागरी/i.test(scriptMatch[1]) ? "devanagari" : "latin";
    return {
      intent: "FIELD_SCRIPT_CONVERSION",
      requestedTarget: cleanTarget || "name",
      requestedValue: null,
      requestedOperation: "CONVERT_FIELD_SCRIPT",
      requiresFieldResolution: true,
      requiresBrowserMutation: true,
      requiresConversationalReasoning: false,
      confidence: 0.95,
      targetScript,
    };
  }

  // 4. Check for FIELD_INFORMATION_QUERY
  for (const pattern of FIELD_QUERY_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m && m[1]) {
      const fieldTarget = m[1].replace(/\b(?:the|my|field)\b/gi, "").trim();
      if (fieldTarget && !GENERIC_NON_FIELD_WORDS.has(fieldTarget.toLowerCase())) {
        return {
          intent: "FIELD_INFORMATION_QUERY",
          requestedTarget: fieldTarget,
          requestedValue: null,
          requestedOperation: "EXPLAIN_FIELD",
          requiresFieldResolution: true,
          requiresBrowserMutation: false,
          requiresConversationalReasoning: true,
          confidence: 0.92,
        };
      }
    }
  }

  // 5. Check for FIELD_VALUE_CORRECTION (e.g. "actually my name is X", "phone mein last digit 5 kar do")
  if (
    /(?:actually,?)\s+(?:the\s+|my\s+)?(.+?)\s+(?:is|should\s+be)\s+(.+?)[.!?।]?$/i.test(trimmed) ||
    /last\s+digit\s+(?:galat\s+hai,?\s*)?(?:use\s+)?([0-9]|zero|one|two|three|four|five|six|seven|eight|nine|शून्य|एक|दो|तीन|चार|पाँच|छह|सात|आठ|नौ)\s+(?:kar\s+do|bana\s+do|रखें|करा)/i.test(trimmed)
  ) {
    return {
      intent: "FIELD_VALUE_CORRECTION",
      requestedTarget: null,
      requestedValue: null,
      requestedOperation: "CORRECT_FIELD",
      requiresFieldResolution: true,
      requiresBrowserMutation: true,
      requiresConversationalReasoning: false,
      confidence: 0.95,
    };
  }

  // 6. Check for FIELD_VALUE_UPDATE (Explicit mutations)
  // Must have an explicit action verb and not be a general question
  const hasUpdateVerb = /\b(?:enter|fill|write|type|set|change|update|add|insert|select|choose|pick|tick|check|uncheck|लिखें|लिखो|लिखिए|लिहा|चुनें|चुनिये|चुनो|निवडा|टाका|भरा|अपडेट|बदलें|बदला)\b/i.test(trimmed) ||
    /\b(?:kar\s+do|likh\s+do|daal\s+do|bhar\s+do|likh\s+dijiye|select\s+karo|choose\s+karo|set\s+karo|add\s+karo)\b/i.test(trimmed);

  if (hasUpdateVerb) {
    return {
      intent: "FIELD_VALUE_UPDATE",
      requestedTarget: null,
      requestedValue: null,
      requestedOperation: "SET_FIELD_VALUE",
      requiresFieldResolution: true,
      requiresBrowserMutation: true,
      requiresConversationalReasoning: false,
      confidence: 0.9,
    };
  }

  // Default to general conversation
  return {
    intent: "GENERAL_CONVERSATION",
    requestedTarget: null,
    requestedValue: null,
    requestedOperation: null,
    requiresFieldResolution: false,
    requiresBrowserMutation: false,
    requiresConversationalReasoning: true,
    confidence: 0.8,
  };
}

/**
 * Validates whether an extracted target string is a legitimate candidate or generic filler
 */
export function isValidTargetFieldCandidate(target: string | null | undefined): boolean {
  if (!target) return false;
  const cleaned = target.trim().toLowerCase();
  if (cleaned.length < 2) return false;
  if (GENERIC_NON_FIELD_WORDS.has(cleaned)) return false;

  // Multi-word phrases made up solely of generic stop words
  const words = cleaned.split(/\s+/);
  if (words.every((w) => GENERIC_NON_FIELD_WORDS.has(w))) return false;

  return true;
}

