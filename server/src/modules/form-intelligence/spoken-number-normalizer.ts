/**
 * Spoken Number & Time Normalizer for BhashaAgent
 *
 * Normalizes numbers, repeated digits (double/triple), telephone numbers,
 * currency, and times spoken naturally in English, Hindi, and Hinglish.
 *
 * Guarantees:
 * - Telephone numbers are treated as identifier STRINGS, never parsed via parseInt or float.
 * - Leading zeros and spoken country codes are strictly preserved.
 * - Repeated digits ("double zero", "triple five") are accurately expanded.
 * - Times ("seven thirty PM", "7:30") are normalized to standard HH:MM formats.
 */

// 1. Single Digit Word Maps
const ENGLISH_DIGITS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const HINDI_DIGITS: Record<string, string> = {
  // Devanagari
  "शून्य": "0",
  "एक": "1",
  "दो": "2",
  "तीन": "3",
  "चार": "4",
  "पाँच": "5",
  "पांच": "5",
  "छह": "6",
  "छः": "6",
  "सात": "7",
  "आठ": "8",
  "नौ": "9",
  // Transliterated / Hinglish
  shunya: "0",
  ek: "1",
  do: "2",
  teen: "3",
  char: "4",
  paanch: "5",
  panch: "5",
  chhe: "6",
  che: "6",
  saat: "7",
  sat: "7",
  aath: "8",
  ath: "8",
  nau: "9",
};

// 2. Compound and Word Numbers (for non-phone quantities)
const ENGLISH_TEENS_AND_TENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const HINDI_WORD_NUMBERS: Record<string, number> = {
  "दस": 10, "ग्यारह": 11, "बारह": 12, "तेरह": 13, "चौदह": 14, "पंद्रह": 15,
  "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19, "बीस": 20,
  "पच्चीस": 25, "तीस": 30, "चालीस": 40, "पचास": 50, "साठ": 60, "सत्तर": 70,
  "अस्सी": 80, "नब्बे": 90, "सौ": 100,
  // Hinglish
  das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15,
  solah: 16, satrah: 17, atharah: 18, unnees: 19, bees: 20,
  pachis: 25, pacchees: 25, tees: 30, chalis: 40, pachas: 50,
  saath: 60, sattar: 70, assi: 80, nabbe: 90, sau: 100,
};

/**
 * Normalizes a digit word (English, Hindi Devanagari, or Hinglish) to its single digit '0'-'9'.
 */
export function wordToDigit(word: string): string | null {
  const lower = word.toLowerCase().trim();
  if (ENGLISH_DIGITS[lower] !== undefined) return ENGLISH_DIGITS[lower];
  if (HINDI_DIGITS[lower] !== undefined) return HINDI_DIGITS[lower];
  if (HINDI_DIGITS[word.trim()] !== undefined) return HINDI_DIGITS[word.trim()];
  if (/^\d$/.test(lower)) return lower;
  return null;
}

/**
 * Expands repeated-digit speech patterns like "double zero" -> "00", "triple five" -> "555".
 * Supports English ("double", "triple") and Hindi ("डबल", "ट्रिपल").
 */
export function normalizeSpokenDigits(text: string): string {
  if (!text) return "";

  // Tokenize preserving spaces
  const tokens = text.split(/\s+/).filter(Boolean);
  const result: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const rawToken = tokens[i];
    const lowerToken = rawToken.toLowerCase();

    // Strip trailing punctuation (like periods or commas from end of utterance)
    const cleanWord = lowerToken.replace(/[.,!?;:।]+$/, "");

    // Check for country code prefix: "plus nine one" -> "+91"
    if ((cleanWord === "plus" || cleanWord === "+") && i + 2 < tokens.length) {
      const d1 = wordToDigit(tokens[i + 1].replace(/[.,!?;:।]+$/, ""));
      const d2 = wordToDigit(tokens[i + 2].replace(/[.,!?;:।]+$/, ""));
      if (d1 === "9" && d2 === "1") {
        result.push("+91");
        i += 3;
        continue;
      }
    }

    // Check multiplier: "double" / "डबल"
    if (cleanWord === "double" || rawToken === "डबल") {
      if (i + 1 < tokens.length) {
        const nextWord = tokens[i + 1].replace(/[.,!?;:।]+$/, "");
        const nextDigit = wordToDigit(nextWord);
        if (nextDigit !== null) {
          result.push(nextDigit + nextDigit);
          i += 2;
          continue;
        }
      }
    }

    // Check multiplier: "triple" / "ट्रिपल"
    if (cleanWord === "triple" || rawToken === "ट्रिपल") {
      if (i + 1 < tokens.length) {
        const nextWord = tokens[i + 1].replace(/[.,!?;:।]+$/, "");
        const nextDigit = wordToDigit(nextWord);
        if (nextDigit !== null) {
          result.push(nextDigit + nextDigit + nextDigit);
          i += 2;
          continue;
        }
      }
    }

    // Check single digit
    const singleDigit = wordToDigit(cleanWord);
    if (singleDigit !== null) {
      result.push(singleDigit);
      i += 1;
      continue;
    }

    // Preserve non-digit word as is
    result.push(rawToken);
    i += 1;
  }

  // Group contiguous individual digits into consolidated numbers
  // e.g. ["my", "number", "is", "9", "00", "4", "2", "3", "4", "4", "9", "9"]
  // -> ["my", "number", "is", "9004234499"]
  const merged: string[] = [];
  let digitBuffer = "";

  for (const token of result) {
    if (/^\+?\d+$/.test(token)) {
      digitBuffer += token;
    } else {
      if (digitBuffer) {
        merged.push(digitBuffer);
        digitBuffer = "";
      }
      merged.push(token);
    }
  }
  if (digitBuffer) {
    merged.push(digitBuffer);
  }

  return merged.join(" ");
}

/**
 * Extracts a candidate phone number from natural spoken text.
 * Strictly preserves leading zeros and returns as string.
 */
export function extractPhoneNumber(text: string): string | null {
  if (!text) return null;

  // First normalize any spoken digits in text
  const normalized = normalizeSpokenDigits(text);

  // Match 10 to 13-digit phone numbers (with optional +91 / 0 prefix)
  const phoneRegex = /(?:\+91[\s-]?)?0?[6-9]\d{9}\b|\b0\d{9,10}\b|\b\d{10}\b/;
  const match = normalized.match(phoneRegex);
  if (match) {
    // Clean spaces and hyphens, keeping leading zero and '+' if present
    const clean = match[0].replace(/[\s-]+/g, "");
    return clean;
  }

  // Also check if entire normalized string is a valid phone sequence
  const digitsOnly = normalized.replace(/[^0-9+]/g, "");
  if (digitsOnly.length === 10 || (digitsOnly.length === 11 && digitsOnly.startsWith("0")) || (digitsOnly.startsWith("+91") && digitsOnly.length === 13)) {
    return digitsOnly;
  }

  return null;
}

/**
 * Normalizes spoken quantities and cardinal numbers (e.g. "twenty five" -> 25, "one hundred and twenty five" -> 125).
 */
export function parseSpokenNumber(text: string): number | null {
  const trimmed = text.trim().toLowerCase();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (ENGLISH_TEENS_AND_TENS[trimmed] !== undefined) {
    return ENGLISH_TEENS_AND_TENS[trimmed];
  }
  if (HINDI_WORD_NUMBERS[trimmed] !== undefined) {
    return HINDI_WORD_NUMBERS[trimmed];
  }

  // Check compound like "twenty five"
  const parts = trimmed.split(/[\s-]+/).filter((p) => p !== "and");
  let total = 0;
  let current = 0;

  for (const part of parts) {
    if (ENGLISH_TEENS_AND_TENS[part] !== undefined) {
      current += ENGLISH_TEENS_AND_TENS[part];
    } else if (ENGLISH_DIGITS[part] !== undefined) {
      current += Number(ENGLISH_DIGITS[part]);
    } else if (part === "hundred" || part === "सौ") {
      current = (current === 0 ? 1 : current) * 100;
    } else if (part === "thousand" || part === "हजार") {
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
    } else if (HINDI_WORD_NUMBERS[part] !== undefined) {
      current += HINDI_WORD_NUMBERS[part];
    } else {
      return null;
    }
  }

  total += current;
  return total > 0 ? total : null;
}

export interface TimeParseResult {
  formattedTime?: string; // Standard HTML5 input format: "HH:MM" (24-hour)
  displayTime?: string;   // e.g. "7:30 PM"
  isAmbiguous: boolean;   // True if AM/PM was omitted and ambiguous (e.g. "seven thirty")
  clarificationMessage?: string;
}

/**
 * Normalizes spoken delivery/appointment times to standard 24-hr "HH:MM" format.
 * Examples:
 * - "seven thirty PM" -> { formattedTime: "19:30", isAmbiguous: false }
 * - "7:30 AM" -> { formattedTime: "07:30", isAmbiguous: false }
 * - "seven thirty" -> { formattedTime: "19:30", isAmbiguous: true, clarificationMessage: "Do you mean 7:30 AM or 7:30 PM?" }
 */
export function parseSpokenTime(text: string, lang = "en"): TimeParseResult | null {
  if (!text) return null;
  const rawLower = text.toLowerCase().trim();

  // Helper map for minutes
  const wordMinutesMap: Record<string, number> = {
    "zero": 0, "oh": 0, "o'clock": 0, "oclock": 0,
    "five": 5, "ten": 10, "fifteen": 15, "twenty": 20, "twenty five": 25,
    "thirty": 30, "thirty five": 35, "forty": 40, "forty five": 45, "fifty": 50, "fifty five": 55,
  };

  // Convert spoken number words to numerical digits first
  let working = rawLower;

  // Replace phrases like "seven thirty" -> "7:30", "eight forty five" -> "8:45"
  for (const [hourWord, hourDigit] of Object.entries(ENGLISH_DIGITS)) {
    for (const [minWord, minNum] of Object.entries(wordMinutesMap)) {
      const minStr = String(minNum).padStart(2, "0");
      const pattern = new RegExp(`\\b${hourWord}\\s+${minWord}\\b`, "gi");
      working = working.replace(pattern, `${hourDigit}:${minStr}`);
    }
  }

  // Also replace solitary hour words: "seven pm" -> "7 pm"
  for (const [hourWord, hourDigit] of Object.entries(ENGLISH_DIGITS)) {
    const pattern = new RegExp(`\\b${hourWord}\\s*(am|pm|in the|o'clock|oclock|बजे|वागता)?`, "gi");
    working = working.replace(pattern, (match, suffix) => {
      return suffix ? `${hourDigit} ${suffix}` : match;
    });
  }

  const normalized = normalizeSpokenDigits(working).toLowerCase();

  // Pattern 1: HH:MM with optional AM/PM (e.g. "7:30 pm", "19:30", "07:30")
  const standardMatch = normalized.match(/(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (standardMatch) {
    let hours = parseInt(standardMatch[1], 10);
    const minutes = parseInt(standardMatch[2], 10);
    const period = standardMatch[3]?.replace(/\./g, "").toLowerCase();

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;

    const formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const isAmbiguous = !period && hours <= 12;

    let clarificationMessage: string | undefined;
    if (isAmbiguous) {
      if (lang === "hi") {
        clarificationMessage = `क्या आपका मतलब सुबह ${hours}:${String(minutes).padStart(2, "0")} से है या शाम ${hours}:${String(minutes).padStart(2, "0")} से?`;
      } else if (lang === "mr") {
        clarificationMessage = `तुमचा अर्थ सकाळचे ${hours}:${String(minutes).padStart(2, "0")} की संध्याकाळचे ${hours}:${String(minutes).padStart(2, "0")} असा आहे?`;
      } else if (lang === "hinglish") {
        clarificationMessage = `Kya aapka matlab ${hours}:${String(minutes).padStart(2, "0")} AM se hai ya PM se?`;
      } else {
        clarificationMessage = `Do you mean ${hours}:${String(minutes).padStart(2, "0")} AM or ${hours}:${String(minutes).padStart(2, "0")} PM?`;
      }
    }

    return {
      formattedTime,
      displayTime: `${standardMatch[1]}:${standardMatch[2]} ${period ? period.toUpperCase() : ""}`.trim(),
      isAmbiguous,
      clarificationMessage,
    };
  }

  // Pattern 2: Word times like "7 pm", "seven pm", "7 o'clock pm"
  const wordTimeMatch = normalized.match(/(\d{1,2})\s*(?:hours|o'clock)?\s*(am|pm|in the morning|in the evening|at night|सुबह|शाम|सकाळी|संध्याकाळी)?/i);
  if (wordTimeMatch && (wordTimeMatch[2] || normalized.includes("time") || normalized.includes("delivery"))) {
    let hours = parseInt(wordTimeMatch[1], 10);
    const mod = (wordTimeMatch[2] || "").toLowerCase();
    const isEvening = /pm|evening|night|शाम|संध्याकाळी/.test(mod);
    const isMorning = /am|morning|सुबह|सकाळी/.test(mod);

    if (isEvening && hours < 12) hours += 12;
    if (isMorning && hours === 12) hours = 0;

    const formattedTime = `${String(hours).padStart(2, "0")}:00`;
    const isAmbiguous = !isEvening && !isMorning && hours <= 12;

    return {
      formattedTime,
      displayTime: `${wordTimeMatch[1]}:00 ${isEvening ? "PM" : isMorning ? "AM" : ""}`.trim(),
      isAmbiguous,
      clarificationMessage: isAmbiguous ? `Do you mean ${hours}:00 AM or ${hours}:00 PM?` : undefined,
    };
  }

  return null;
}
