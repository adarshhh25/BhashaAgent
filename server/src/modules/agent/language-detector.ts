/**
 * Language Detector for BhashaAgent
 *
 * Provides high-accuracy, turn-level detection for:
 * - English ('en')
 * - Hindi ('hi')
 * - Marathi ('mr')
 * - Hinglish ('hinglish')
 *
 * Distinguishes Devanagari Hindi vs Devanagari Marathi, and Latin English vs Latin Hinglish.
 */

export type ConversationLanguage = "en" | "hi" | "mr" | "hinglish";

// Devanagari Unicode range: \u0900-\u097F
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

// Broad Indic Unicode range (Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam): \u0900-\u0D7F
const INDIC_SCRIPT_REGEX = /[\u0900-\u0D7F]/;

// Exclusive Marathi character: ळ (U+0933)
const MARATHI_EXCLUSIVE_CHARS = /[\u0933]/;

// Distinctive Marathi words (Devanagari)
const MARATHI_WORDS = new Set([
  "आहे", "आहेत", "नाही", "नाहीत", "होते", "होती", "होता",
  "माझा", "माझे", "माझी", "माझं", "मला", "आम्हाला",
  "तुमचा", "तुमची", "तुमचे", "तुमचं", "तुम्हाला",
  "त्याचा", "त्याची", "त्याचे", "त्यांना",
  "करा", "करावे", "करावा", "करावी", "करावेस", "द्या", "द्यावे", "करायला",
  "भरून", "भरा", "भरावे", "भरून दे", "भरून द्या", "भरायला",
  "निवडा", "निवडावे", "सांगा", "पाहिजे", "हवे", "हवी", "हवा",
  "जिल्हा", "पत्ता", "नाव", "क्रमांक", "दिनांक", "जन्मतारीख",
  "होय", "काही", "कसे", "कसा", "कशी", "कुठे",
  "आणि", "किंवा", "पण", "परंतु", "कारण", "म्हणून",
  "राज्य", "शहर", "गाव", "अर्ज", "अर्जदाराचे", "उमेदवाराचे",
  "हा", "ही", "हे", "ह्या", "मदत", "नमस्कार", "संपर्क",
]);

// Distinctive Hindi words (Devanagari)
const HINDI_WORDS = new Set([
  "है", "हैं", "था", "थी", "थे", "होगा", "होगी", "होंगे",
  "मेरा", "मेरी", "मेरे", "मुझे", "मुझको", "हम", "हमारा", "हमारी", "हमारे",
  "आपका", "आपकी", "आपके", "तुम", "तुम्हारा", "तुम्हारी", "तुम्हारे",
  "उसका", "उसकी", "उसके", "उनका", "उनकी", "उनके",
  "करना", "करो", "करें", "कर", "कीजिए", "दीजिए", "दें", "दो",
  "भर", "भरें", "भरो", "भरना", "भर दो", "भर दीजिए",
  "चुनें", "चुनो", "चुनना", "बताओ", "बताएं", "चाहिए",
  "नाम", "पता", "और", "या", "हाँ", "नहीं", "क्या", "कैसे", "कैसा", "कैसी", "कहाँ",
  "इस", "इसमे", "इसमें", "यह", "ये", "वह", "वो", "उस", "उसमे", "उसमें",
  "का", "के", "की", "में", "से", "को", "पर", "ने", "तक",
  "दूरभाष", "जन्म तिथि", "कृपया",
]);

// Distinctive Hinglish words (Latin script transliterated Hindi/Urdu)
// Note: Exclude common English words (like 'me', 'to', 'form', 'select') to avoid false positives.
const HINGLISH_WORDS = new Set([
  "mera", "meri", "mere", "mujhe", "mujhko", "hum", "humara", "humari", "humare",
  "aapka", "aapki", "aapke", "tum", "tumhara", "tumhari", "tumhare",
  "uska", "uski", "uske", "unka", "unki", "unke",
  "naam", "nam", "bhar", "bharo", "bharna", "bharde", "bhardijiye", "bhardena",
  "kardo", "karo", "karna", "kariye", "kar", "kijiye", "de", "do", "dena", "dijiye",
  "hai", "hain", "tha", "thi", "the", "hoga", "hogi", "hoge", "hoon", "hu",
  "ye", "yeh", "wo", "woh", "isme", "ismein", "isse", "usme", "usmein", "usse",
  "kya", "kyun", "kyu", "kaise", "kaha", "kahan", "kab", "kitna", "kitni",
  "pehle", "baad", "mein", "se", "ko", "ka", "ke", "ki", "ne", "bhi",
  "toh", "par", "aur", "ya", "haan", "ha", "nahi", "na", "mat",
  "chuno", "daal", "daalo", "daalna", "daalde", "batao", "batayein", "bata", "bataiye", "pucho", "puchiye",
  "chahiye", "sahi", "galat", "dusra", "dusri", "baaki", "thik", "theek", "achha", "accha",
  "kripya", "namaste", "shukriya", "dhanyawad",
  "rajya", "rajy", "jila", "zila", "zilla", "pradesh", "desh", "shahar", "gaon", "kaun", "kaunsa", "kaunsi",
  "maza", "mazi", "maze", "mala", "ahe", "nav", "patta", "dya", "krun",
]);

// Strong English function words
const ENGLISH_STRONG_WORDS = new Set([
  "the", "this", "that", "these", "those",
  "is", "are", "am", "was", "were", "be", "been", "being",
  "have", "has", "had", "having",
  "do", "does", "did", "doing",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
  "my", "your", "his", "her", "its", "our", "their",
  "please", "fill", "select", "choose", "enter", "update", "change",
  "what", "where", "when", "who", "which", "how", "why",
  "help", "form", "field", "telephone", "phone", "number", "address", "email", "name",
]);

/**
 * Tokenizes text into lowercase word tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/**
 * Detects whether text contains Indic scripts.
 */
export function isIndicScript(text: string): boolean {
  return INDIC_SCRIPT_REGEX.test(text);
}

/**
 * Detects whether text is primarily Devanagari script.
 */
export function isDevanagari(text: string): boolean {
  return DEVANAGARI_REGEX.test(text);
}

/**
 * De-duplicates immediately repeated words from transcripts caused by speech buffering/stutter
 * (e.g. "बिहार बिहार से।" -> "बिहार से।", "name name" -> "name").
 */
export function deduplicateConsecutiveWords(text: string): string {
  if (!text) return "";
  return text.replace(/\b(\p{L}+)(?:\s+\1\b)+/giu, "$1").trim();
}

/**
 * Detects the conversation language for a user turn.
 *
 * @param text The current message or transcript content.
 * @param fallback Optional preferred or fallback language code.
 * @returns "en" | "hi" | "mr" | "hinglish"
 */
export function detectConversationLanguage(
  text: string,
  fallback?: string,
): ConversationLanguage {
  const trimmed = text.trim();
  if (!trimmed) {
    return normalizeLanguageCode(fallback ?? "en");
  }

  // 1. Indic Script Analysis (Devanagari, Telugu, Tamil, etc.)
  if (isIndicScript(trimmed)) {
    if (isDevanagari(trimmed)) {
      // Check for Marathi-exclusive characters (like ळ)
      if (MARATHI_EXCLUSIVE_CHARS.test(trimmed)) {
        return "mr";
      }

      const tokens = tokenize(trimmed);
      let marathiScore = 0;
      let hindiScore = 0;

      for (const token of tokens) {
        if (MARATHI_WORDS.has(token)) marathiScore += 1;
        if (HINDI_WORDS.has(token)) hindiScore += 1;
      }

      // Compound phrases check (e.g. "भरून दे", "मदत हवी")
      const lowerText = trimmed.toLowerCase();
      if (
        /भरून|हवी आहे|हवे आहे|करावे|द्यावे|माझा|माझे|माझी|मला|जिल्हा|पत्ता|नाव|निवडा|मदत|भरायला|करायला/.test(lowerText)
      ) {
        marathiScore += 2;
      }
      if (
        /भर दो|भर दीजिए|करना है|करना चाहते|मेरा|मेरी|मेरे|मुझे|आपका|आपकी|चुनो|चुनें/.test(lowerText)
      ) {
        hindiScore += 2;
      }

      if (marathiScore > hindiScore) {
        return "mr";
      }
      return "hi";
    }

    // For non-Devanagari Indic scripts (e.g. Telugu "అదివनि సల్ల.", Tamil, etc.)
    if (fallback && (fallback.startsWith("hi") || fallback.startsWith("mr") || fallback.includes("hinglish"))) {
      return normalizeLanguageCode(fallback);
    }
    return "hi";
  }

  // 2. Latin Script Analysis (English vs Hinglish)
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return normalizeLanguageCode(fallback ?? "en");
  }

  let hinglishCount = 0;
  let englishCount = 0;

  for (const token of tokens) {
    if (HINGLISH_WORDS.has(token)) {
      hinglishCount += 1;
    }
    if (ENGLISH_STRONG_WORDS.has(token)) {
      englishCount += 1;
    }
  }

  // Key Hinglish marker phrases (e.g., "mera naam", "fill kar do", "chuno", "select karo", "aur rajya")
  const lowerLatin = trimmed.toLowerCase();
  const hasStrongHinglishPhrase =
    /\b(mera|meri|mere|mujhe|mujhko|apna|apni|apne)\b/.test(lowerLatin) ||
    /\b(kar do|kardo|kar de|karo|karna|kariye|kijiye|daal do|daaldo)\b/.test(lowerLatin) ||
    /\b(bhar do|bharde|bharo|bharna|bhardijiye)\b/.test(lowerLatin) ||
    /\b(hai|hain|tha|thi|hoga|hogi)\b/.test(lowerLatin) ||
    /\b(isme|ismein|isse|usme|usmein|usse|kya|kyun|kaise)\b/.test(lowerLatin) ||
    /\b(chuno|pehle|baad mein|dusra|baaki|thik hai|theek hai)\b/.test(lowerLatin) ||
    /\b(rajya|jila|zila|zilla|kaunsa|kaunsi|batao|bataiye|aur rajya)\b/.test(lowerLatin) ||
    /\b(maza|maze|mazi|mala|ahe|krun dya)\b/.test(lowerLatin);

  if (hasStrongHinglishPhrase) {
    return "hinglish";
  }

  // If there are strong English function words and no strong Hinglish phrase
  if (englishCount >= 2 && englishCount > hinglishCount) {
    return "en";
  }

  if (hinglishCount >= 2 && hinglishCount > englishCount) {
    return "hinglish";
  }

  // If there are Hinglish words present and ZERO English words, treat as Hinglish
  if (hinglishCount >= 1 && englishCount === 0) {
    return "hinglish";
  }

  // Pure digits (phone number, pincode, etc.) or pure emails without context words:
  // default to fallback if specified, otherwise English
  const isPureData = /^[0-9+\-()\s@.]+$/.test(trimmed);
  if (isPureData && fallback) {
    return normalizeLanguageCode(fallback);
  }

  // Default Latin script to English
  return "en";
}

/**
 * Normalizes any language code/string to our 4 supported types.
 */
export function normalizeLanguageCode(code: string): ConversationLanguage {
  const lower = code.toLowerCase().trim();
  if (lower.startsWith("hi-en") || lower.includes("hinglish")) return "hinglish";
  if (lower.startsWith("hi") || lower === "hindi") return "hi";
  if (lower.startsWith("mr") || lower === "marathi") return "mr";
  return "en";
}

