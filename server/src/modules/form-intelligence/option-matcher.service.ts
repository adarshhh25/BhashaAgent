/**
 * Intelligent Multilingual Dropdown Option Matcher
 *
 * Matches user values spoken or written in English, Hindi, Marathi, or Hinglish
 * to the actual DOM option elements present in the active webpage form.
 *
 * Never invents options or returns unapproved values.
 */

export interface FormOption {
  label: string;
  value: string;
}

export interface OptionMatchResult {
  matched: boolean;
  option?: FormOption;
  confidence: number;
  reason?: string;
}

// Multilingual Equivalence Dictionary for Common Indian Form Options
// Each group contains lowercase equivalents across English, Hindi, Marathi, Hinglish, and standard codes.
const EQUIVALENCE_GROUPS: Array<{ concept: string; terms: string[] }> = [
  // --- Indian States & UTs ---
  { concept: "maharashtra", terms: ["maharashtra", "महाराष्ट्र", "mh", "maha"] },
  { concept: "gujarat", terms: ["gujarat", "गुजरात", "gj"] },
  { concept: "rajasthan", terms: ["rajasthan", "राजस्थान", "rj"] },
  { concept: "karnataka", terms: ["karnataka", "कर्नाटक", "ka"] },
  { concept: "delhi", terms: ["delhi", "new delhi", "दिल्ली", "नई दिल्ली", "dl"] },
  { concept: "madhya_pradesh", terms: ["madhya pradesh", "मध्य प्रदेश", "mp"] },
  { concept: "uttar_pradesh", terms: ["uttar pradesh", "उत्तर प्रदेश", "up"] },
  { concept: "bihar", terms: ["bihar", "बिहार", "br"] },
  { concept: "west_bengal", terms: ["west bengal", "पश्चिम बंगाल", "पश्चिम बंगाल", "wb"] },
  { concept: "tamil_nadu", terms: ["tamil nadu", "तमिलनाडु", "तमिलनाडू", "tn"] },
  { concept: "telangana", terms: ["telangana", "तेलंगाना", "ts", "tg"] },
  { concept: "andhra_pradesh", terms: ["andhra pradesh", "आंध्र प्रदेश", "ap"] },
  { concept: "kerala", terms: ["kerala", "केरल", "केरळ", "kl"] },
  { concept: "punjab", terms: ["punjab", "पंजाब", "pb"] },
  { concept: "haryana", terms: ["haryana", "हरियाणा", "hr"] },
  { concept: "odisha", terms: ["odisha", "orissa", "ओडिशा", "उड़ीसा", "od", "or"] },
  { concept: "assam", terms: ["assam", "असम", "as"] },
  { concept: "jharkhand", terms: ["jharkhand", "झारखंड", "jh"] },
  { concept: "chhattisgarh", terms: ["chhattisgarh", "छत्तीसगढ़", "cg", "ct"] },
  { concept: "uttarakhand", terms: ["uttarakhand", "उत्तराखंड", "uk", "ua"] },
  { concept: "himachal_pradesh", terms: ["himachal pradesh", "हिमाचल प्रदेश", "hp"] },
  { concept: "goa", terms: ["goa", "गोवा", "ga"] },
  { concept: "jammu_kashmir", terms: ["jammu and kashmir", "jammu & kashmir", "जम्मू और कश्मीर", "जम्मू आणि काश्मीर", "jk"] },

  // --- Major Districts & Cities (Maharashtra & India) ---
  { concept: "mumbai", terms: ["mumbai", "bombay", "मुंबई", "mumbai city", "mumbai suburban"] },
  { concept: "pune", terms: ["pune", "poona", "पुणे"] },
  { concept: "thane", terms: ["thane", "ठाणे"] },
  { concept: "nashik", terms: ["nashik", "nasik", "नाशिक", "नासिक"] },
  { concept: "nagpur", terms: ["nagpur", "नागपूर", "नागपुर"] },
  { concept: "aurangabad", terms: ["chhatrapati sambhajinagar", "aurangabad", "छत्रपती संभाजीनगर", "औरंगाबाद"] },
  { concept: "kolhapur", terms: ["kolhapur", "कोल्हापूर", "कोल्हापुर"] },
  { concept: "solapur", terms: ["solapur", "सोलापूर", "सोलापुर"] },
  { concept: "amravati", terms: ["amravati", "अमरावती"] },
  { concept: "navi_mumbai", terms: ["navi mumbai", "नवी मुंबई"] },
  { concept: "bengaluru", terms: ["bengaluru", "bangalore", "बेंगलुरु", "बंगलोर"] },
  { concept: "hyderabad", terms: ["hyderabad", "हैदराबाद"] },
  { concept: "chennai", terms: ["chennai", "madras", "चेन्नई"] },
  { concept: "kolkata", terms: ["kolkata", "calcutta", "कोलकाता"] },
  { concept: "ahmedabad", terms: ["ahmedabad", "अहमदाबाद"] },
  { concept: "jaipur", terms: ["jaipur", "जयपुर"] },
  { concept: "lucknow", terms: ["lucknow", "लखनऊ"] },

  // --- Gender ---
  { concept: "male", terms: ["male", "m", "पुरुष", "नर", "मुलगा", "man", "boy"] },
  { concept: "female", terms: ["female", "f", "महिला", "स्त्री", "नारी", "मुलगी", "woman", "girl"] },
  { concept: "other_gender", terms: ["other", "others", "transgender", "third gender", "अन्य", "तृतीयपंथी", "itara"] },

  // --- Boolean / Choices ---
  { concept: "yes", terms: ["yes", "y", "true", "हाँ", "होय", "आहे", "हो", "1"] },
  { concept: "no", terms: ["no", "n", "false", "नहीं", "नाही", "0"] },

  // --- Marital Status ---
  { concept: "single", terms: ["single", "unmarried", "अविवाहित", "कुंवारा"] },
  { concept: "married", terms: ["married", "विवाहित", "शादीशुदा"] },

  // --- Qualifications & Education ---
  { concept: "bachelor", terms: ["bachelor", "bachelor's", "graduate", "graduation", "स्नातक", "पदवी", "b.e", "b.tech", "btech", "be", "b.sc", "bsc", "b.a", "ba", "b.com", "bcom"] },
  { concept: "master", terms: ["master", "master's", "post graduate", "post graduation", "postgraduate", "स्नातकोत्तर", "पदव्युत्तर", "m.e", "m.tech", "mtech", "me", "m.sc", "msc", "m.a", "ma", "m.com", "mcom", "mba"] },
  { concept: "doctorate", terms: ["phd", "ph.d", "doctorate", "डॉक्टरेट"] },
  { concept: "diploma", terms: ["diploma", "डिप्लोमा", "पदविका"] },
  { concept: "high_school", terms: ["12th", "hsc", "10th", "ssc", "high school", "intermediate", "बारहवीं", "दहावी", "बारावी"] },

  // --- Sizes / Common Web Options ---
  { concept: "small", terms: ["small", "s", "छोटा", "लहान"] },
  { concept: "medium", terms: ["medium", "m", "मध्यम"] },
  { concept: "large", terms: ["large", "l", "बड़ा", "मोठा"] },
  { concept: "extra_large", terms: ["xl", "extra large"] },
];

/**
 * Normalizes an option string for matching.
 */
function cleanString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Finds the concept name for a given term in the equivalence dictionary.
 */
function findConcept(term: string): string | undefined {
  const cleaned = cleanString(term);
  if (!cleaned) return undefined;
  for (const group of EQUIVALENCE_GROUPS) {
    for (const t of group.terms) {
      if (cleaned === cleanString(t) || cleaned === t) {
        return group.concept;
      }
    }
  }
  return undefined;
}

/**
 * Matches a user-provided value against an array of DOM form options.
 *
 * @param userValue What the user said or provided (e.g. "महाराष्ट्र", "Maharashtra", "Thane", "male").
 * @param options The actual DOM options available on the field.
 * @returns Match result with the concrete DOM option to select.
 */
export function matchOption(
  userValue: unknown,
  options: FormOption[],
): OptionMatchResult {
  if (!userValue || !options || options.length === 0) {
    return { matched: false, confidence: 0 };
  }

  const rawUserStr = String(userValue).trim();
  const cleanedUserStr = cleanString(rawUserStr);
  if (!cleanedUserStr) {
    return { matched: false, confidence: 0 };
  }

  // 1. Direct Exact Match on Option Value
  for (const opt of options) {
    if (opt.value.trim().toLowerCase() === rawUserStr.toLowerCase()) {
      return {
        matched: true,
        option: opt,
        confidence: 1.0,
        reason: "Exact match on option value",
      };
    }
  }

  // 2. Direct Exact Match on Option Label
  for (const opt of options) {
    if (opt.label.trim().toLowerCase() === rawUserStr.toLowerCase()) {
      return {
        matched: true,
        option: opt,
        confidence: 1.0,
        reason: "Exact match on option label",
      };
    }
  }

  // 3. Cleaned / Normalized Exact Match
  for (const opt of options) {
    if (cleanString(opt.value) === cleanedUserStr || cleanString(opt.label) === cleanedUserStr) {
      return {
        matched: true,
        option: opt,
        confidence: 0.98,
        reason: "Normalized match on option label/value",
      };
    }
  }

  // 4. Multilingual Equivalence Dictionary Match
  const userConcept = findConcept(rawUserStr);
  if (userConcept) {
    for (const opt of options) {
      const optValConcept = findConcept(opt.value);
      const optLabelConcept = findConcept(opt.label);
      if (optValConcept === userConcept || optLabelConcept === userConcept) {
        return {
          matched: true,
          option: opt,
          confidence: 0.95,
          reason: `Multilingual equivalence match for concept '${userConcept}'`,
        };
      }
    }
  }

  // 5. Substring / Word Match
  for (const opt of options) {
    const cleanedLabel = cleanString(opt.label);
    const cleanedVal = cleanString(opt.value);

    // If user's term is contained in the option label or vice versa (e.g. "Maharashtra" in "State of Maharashtra")
    if (
      (cleanedLabel.length > 2 && (cleanedLabel.includes(cleanedUserStr) || cleanedUserStr.includes(cleanedLabel))) ||
      (cleanedVal.length > 2 && (cleanedVal.includes(cleanedUserStr) || cleanedUserStr.includes(cleanedVal)))
    ) {
      return {
        matched: true,
        option: opt,
        confidence: 0.85,
        reason: "Substring match on option label/value",
      };
    }
  }

  return { matched: false, confidence: 0 };
}

