/**
 * Spoken Email Normalizer & Transliteration Utility
 *
 * Extracts and normalizes spoken email addresses across English, Hindi, Marathi,
 * and Hinglish, handling:
 * - Direct standard emails: user@example.com
 * - Spoken symbols: "at the rate", "at", "@", "dot", "डॉट"
 * - Mixed script / Devanagari usernames: "आदर्श झा @ gmail.com" -> "adarshjha@gmail.com"
 * - In-between speech recognition spaces: "adarsh jha @ gmail . com" -> "adarshjha@gmail.com"
 * - Common Hindi/Hinglish speech wrappers: "email address mein X likho", "X likh do"
 */

import { devanagariToLatin, cleanNameValue, containsDevanagari } from "./script-converter.service";

const STANDARD_EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/i;

const COMMON_DOMAINS: Record<string, string> = {
  "gmail": "gmail",
  "जीमेल": "gmail",
  "yahoo": "yahoo",
  "याहू": "yahoo",
  "outlook": "outlook",
  "आउटरुक": "outlook",
  "hotmail": "hotmail",
  "हॉटमेल": "hotmail",
  "icloud": "icloud",
  "आईक्लाउड": "icloud",
  "proton": "proton",
  "rediffmail": "rediffmail",
};

const COMMON_TLDS: Record<string, string> = {
  "com": "com",
  "कॉम": "com",
  "कम": "com",
  "in": "in",
  "इन": "in",
  "org": "org",
  "ऑर्ग": "org",
  "net": "net",
  "नेट": "net",
  "co": "co",
  "edu": "edu",
  "gov": "gov",
  "io": "io",
};

/**
 * Extracts and normalizes an email address from spoken text.
 * Returns normalized lowercase email string or null if no valid email structure exists.
 */
export function extractSpokenEmail(rawText: string): string | null {
  if (!rawText || typeof rawText !== "string") return null;

  const trimmed = rawText.trim();

  // 1. Check for standard email pattern first
  const stdMatch = trimmed.match(STANDARD_EMAIL_REGEX);
  if (stdMatch && stdMatch[0]) {
    const candidate = stdMatch[0].toLowerCase();
    if (isValidEmail(candidate)) return candidate;
  }

  // 2. Look for spoken email pattern with "@" or "at / at the rate" and dot
  // e.g. "आदर्श झा @ gmail.com", "adarsh jha at gmail dot com", "adarshjha @ gmail . com"
  const spokenPattern =
    /(?:(?:email\s+address|email|ईमेल)\s+(?:mein|me|में|madhe|मध्ये)\s+)?([a-zA-Z0-9\u0900-\u097F\s._-]+?)\s*(?:@|\bat\s+the\s+rate\s+of\b|\bat\s+the\s+rate\b|\bat\b)\s*([a-zA-Z0-9\u0900-\u097F\s.-]+?)\s*(?:\.|\bdot\b|\bडॉट\b)\s*([a-zA-Z\u0900-\u097F]{2,})(?:\s+(?:likho|likhein|likhe|likhiye|likh\s+do|likh\s+dijiye|kar\s+do|daal\s+do|bhar\s+do|लिखें|लिखो|लिखिए|लिहा|type|enter|write|karo|करा|करें))?[.!?।]?$/i;

  const match = trimmed.match(spokenPattern);
  if (match) {
    let rawUser = match[1].trim();
    let rawDomain = match[2].trim().toLowerCase();
    let rawTld = match[3].trim().toLowerCase();

    // Strip leading conversational phrases from username
    rawUser = rawUser
      .replace(/^(?:email\s+address|email|ईमेल)\s+(?:mein|me|में|madhe|मध्ये|ko|को)?\s*/i, "")
      .replace(/^(?:my\s+email\s+is|the\s+email\s+is|मेरा\s+ईमेल\s+है|माझा\s+ईमेल)\s*/i, "")
      .trim();

    // If username contains Devanagari, transliterate to Latin
    let userLatin = rawUser;
    if (containsDevanagari(rawUser)) {
      userLatin = devanagariToLatin(cleanNameValue(rawUser));
    }

    // Clean username: remove spaces, punctuation except permitted email characters
    const cleanUser = userLatin
      .toLowerCase()
      .replace(/[\s\-_]+/g, "")
      .replace(/[^a-z0-9._]/g, "");

    // Normalize domain
    let cleanDomain = rawDomain.replace(/[\s.]+/g, "");
    if (COMMON_DOMAINS[cleanDomain]) {
      cleanDomain = COMMON_DOMAINS[cleanDomain];
    }

    // Normalize TLD
    let cleanTld = rawTld.replace(/[\s.]+/g, "");
    if (COMMON_TLDS[cleanTld]) {
      cleanTld = COMMON_TLDS[cleanTld];
    }

    if (cleanUser && cleanDomain && cleanTld) {
      const reconstructed = `${cleanUser}@${cleanDomain}.${cleanTld}`;
      if (isValidEmail(reconstructed)) {
        return reconstructed;
      }
    }
  }

  // 3. Fallback: Check if text contains "@" with domain but username has spaces
  const atIdx = trimmed.indexOf("@");
  if (atIdx > 0) {
    const beforeAt = trimmed.slice(0, atIdx).trim();
    const afterAt = trimmed.slice(atIdx + 1).trim();

    // Clean user part
    let userPart = beforeAt
      .replace(/^.*?\b(?:email\s+address|email|ईमेल)\s+(?:mein|me|में|madhe|मध्ये|ko|को)\s*/i, "")
      .trim();

    if (containsDevanagari(userPart)) {
      userPart = devanagariToLatin(cleanNameValue(userPart));
    }
    const cleanUser = userPart
      .toLowerCase()
      .replace(/[\s\-_]+/g, "")
      .replace(/[^a-z0-9._]/g, "");

    // Clean domain part
    const domainMatch = afterAt.match(/^([a-zA-Z0-9\u0900-\u097F\s]+?)\s*(?:\.|\bdot\b|\bडॉट\b)\s*([a-zA-Z\u0900-\u097F]{2,})/i);
    if (domainMatch) {
      let dom = domainMatch[1].trim().toLowerCase().replace(/\s+/g, "");
      let tld = domainMatch[2].trim().toLowerCase().replace(/\s+/g, "");
      if (COMMON_DOMAINS[dom]) dom = COMMON_DOMAINS[dom];
      if (COMMON_TLDS[tld]) tld = COMMON_TLDS[tld];

      const constructed = `${cleanUser}@${dom}.${tld}`;
      if (isValidEmail(constructed)) {
        return constructed;
      }
    }
  }

  return null;
}

/**
 * Validates basic email structure
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

