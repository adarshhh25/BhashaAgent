/**
 * Script Converter & Proper Noun Transliteration Service
 *
 * Provides bidirectional transliteration between Devanagari (Hindi/Marathi)
 * and Latin (English) scripts for Indian proper nouns (names, surnames, locations)
 * while preserving phonetic identity without unwanted literal translation.
 */

// Common Indian given names (Devanagari <-> Latin)
const NAME_DICTIONARY: Record<string, string> = {
  // First names
  "आदर्श": "Adarsh",
  "राहुल": "Rahul",
  "प्रिया": "Priya",
  "अमित": "Amit",
  "सुनील": "Sunil",
  "सचिन": "Sachin",
  "रोहित": "Rohit",
  "विराट": "Virat",
  "अंजलि": "Anjali",
  "पूजा": "Pooja",
  "नेहा": "Neha",
  "स्नेहा": "Sneha",
  "अजय": "Ajay",
  "विजय": "Vijay",
  "संजय": "Sanjay",
  "राकेश": "Rakesh",
  "सुरेश": "Suresh",
  "महेश": "Mahesh",
  "राजेश": "Rajesh",
  "दिनेश": "Dinesh",
  "मनोज": "Manoj",
  "विकास": "Vikas",
  "दीपक": "Deepak",
  "संदीप": "Sandeep",
  "प्रदीप": "Pradeep",
  "आशीष": "Ashish",
  "मनीष": "Manish",
  "गौरव": "Gaurav",
  "सौरभ": "Saurabh",
  "अभिषेक": "Abhishek",
  "विवेक": "Vivek",
  "कुणाल": "Kunal",
  "वरुण": "Varun",
  "तरुण": "Tarun",
  "अर्जुन": "Arjun",
  "करण": "Karan",
  "कविता": "Kavita",
  "सुनीता": "Sunita",
  "अनिता": "Anita",
  "गीता": "Geeta",
  "सीता": "Sita",
  "रीता": "Rita",
  "मीना": "Meena",
  "टीना": "Tina",
  "स्वाति": "Swati",
  "प्रीति": "Preeti",
  "दीप्ति": "Deepti",
  "आरती": "Aarti",
  "सारिका": "Sarika",
  "पूनम": "Poonam",
  "शीतल": "Sheetal",
  "सीमा": "Seema",
  "ऋतु": "Ritu",
  "निशा": "Nisha",
  "दिव्या": "Divya",
  "रिया": "Riya",
  "श्रेया": "Shreya",

  // Surnames / Family names
  "झा": "Jha",
  "शर्मा": "Sharma",
  "वर्मा": "Verma",
  "कुमार": "Kumar",
  "सिंह": "Singh",
  "गुप्ता": "Gupta",
  "पटेल": "Patel",
  "जोशी": "Joshi",
  "कुलकर्णी": "Kulkarni",
  "देशमुख": "Deshmukh",
  "पाटील": "Patil",
  "पवार": "Pawar",
  "शिंदे": "Shinde",
  "यादव": "Yadav",
  "मिश्रा": "Mishra",
  "तिवारी": "Tiwari",
  "पांडेय": "Pandey",
  "दुबे": "Dubey",
  "चौहान": "Chauhan",
  "राजपूत": "Rajput",
  "मल्होत्रा": "Malhotra",
  "कपूर": "Kapoor",
  "खन्ना": "Khanna",
  "मेहता": "Mehta",
  "शाह": "Shah",
  "जैन": "Jain",
  "अग्रवाल": "Agarwal",
  "बंसल": "Bansal",
  "गोयल": "Goyal",
  "मित्तल": "Mittal",
  "रेड्डी": "Reddy",
  "राव": "Rao",
  "नायर": "Nair",
  "पिल्लई": "Pillai",
  "अय्यर": "Iyer",
  "अय्यंगार": "Iyengar",
  "मुखर्जी": "Mukherjee",
  "बैनर्जी": "Banerjee",
  "चटर्जी": "Chatterjee",
  "घोष": "Ghosh",
  "बोस": "Bose",
  "दास": "Das",
  "दत्त": "Dutta",
  "गांगुली": "Ganguly",
  "सेन": "Sen",
  "भट्टाचार्य": "Bhattacharya",
  "ठाकुर": "Thakur",
  "राठौड़": "Rathore",
  "सोनी": "Soni",
  "महाजन": "Mahajan",
  "गावस्कर": "Gavaskar",
  "तेंदुलकर": "Tendulkar",
};

// Reverse mapping for Latin -> Devanagari lookup
const REVERSE_NAME_DICTIONARY: Record<string, string> = {};
for (const [dev, lat] of Object.entries(NAME_DICTIONARY)) {
  REVERSE_NAME_DICTIONARY[lat.toLowerCase()] = dev;
}
// Add common variants
REVERSE_NAME_DICTIONARY["aadarsh"] = "आदर्श";
REVERSE_NAME_DICTIONARY["deepak"] = "दीपक";
REVERSE_NAME_DICTIONARY["dīpak"] = "दीपक";
REVERSE_NAME_DICTIONARY["pooja"] = "पूजा";
REVERSE_NAME_DICTIONARY["puja"] = "पूजा";
REVERSE_NAME_DICTIONARY["vikash"] = "विकास";

// Conversational pronouns & prefixes to strip from field values like "मैं आदर्श" or "मेरा नाम आदर्श"
const FILLER_PREFIXES_REGEX =
  /^(?:मैं\s+|मेरा\s+नाम\s+|माझे\s+नाव\s+|नाव\s+|नाम\s+|i\s+am\s+|my\s+name\s+is\s+|name\s+is\s+|this\s+is\s+)/i;

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;
const LATIN_REGEX = /[a-zA-Z]/;

export function containsDevanagari(text: string): boolean {
  return DEVANAGARI_REGEX.test(text);
}

export function containsLatin(text: string): boolean {
  return LATIN_REGEX.test(text);
}

/**
 * Cleans conversational fillers from raw form values (e.g. "मैं आदर्श" -> "आदर्श")
 */
export function cleanNameValue(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return "";
  let cleaned = rawText.trim().replace(FILLER_PREFIXES_REGEX, "").trim();
  // Strip trailing punctuation
  cleaned = cleaned.replace(/[.!?।,;:]+$/, "").trim();
  return cleaned;
}

// Algorithmic Devanagari -> Latin maps
const DEVA_VOWELS: Record<string, string> = {
  "अ": "a", "आ": "Aa", "इ": "I", "ई": "Ee", "उ": "U", "ऊ": "Oo", "ऋ": "Ri",
  "ए": "E", "ऐ": "Ai", "ओ": "O", "औ": "Au", "अं": "An", "अः": "Ah",
};

const DEVA_MATRAS: Record<string, string> = {
  "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "oo", "ृ": "ri",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ं": "n", "ः": "h", "ँ": "n",
};

const DEVA_CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
  "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gya", "श्र": "shr",
  "क़": "q", "ख़": "kh", "ग़": "gh", "ज़": "z", "ड़": "d", "ढ़": "dh", "फ़": "f",
};

/**
 * Algorithmic fallback for Devanagari word -> Latin transliteration
 */
function transliterateDevanagariWord(word: string): string {
  const dictMatch = NAME_DICTIONARY[word];
  if (dictMatch) return dictMatch;

  let result = "";
  const chars = Array.from(word);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];

    if (DEVA_VOWELS[ch]) {
      result += DEVA_VOWELS[ch];
      continue;
    }

    if (DEVA_CONSONANTS[ch]) {
      const cons = DEVA_CONSONANTS[ch];
      if (next === "्") {
        // Virama: suppresses vowel
        result += cons;
        i++; // skip virama
      } else if (next && DEVA_MATRAS[next]) {
        result += cons + DEVA_MATRAS[next];
        i++; // skip matra
      } else if (i === chars.length - 1) {
        // Final consonant in Hindi typically drops schwa (e.g. Adarsh not Adarsha)
        result += cons;
      } else {
        // Inherent 'a'
        result += cons + "a";
      }
      continue;
    }

    if (DEVA_MATRAS[ch]) {
      result += DEVA_MATRAS[ch];
      continue;
    }

    // Pass through punctuation or latin
    result += ch;
  }

  // Capitalize first letter
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }
  return result;
}

/**
 * Transliterates Devanagari text into Latin script (English letters)
 */
export function devanagariToLatin(text: string): string {
  const cleaned = cleanNameValue(text);
  if (!cleaned) return "";

  // Split into words while preserving delimiters
  const words = cleaned.split(/\s+/);
  const convertedWords = words.map((w) => {
    // Check dictionary first
    if (NAME_DICTIONARY[w]) return NAME_DICTIONARY[w];
    if (!containsDevanagari(w)) return w;
    return transliterateDevanagariWord(w);
  });

  return convertedWords.join(" ");
}

/**
 * Transliterates Latin text into Devanagari script (Hindi/Marathi letters)
 */
export function latinToDevanagari(text: string): string {
  const cleaned = cleanNameValue(text);
  if (!cleaned) return "";

  const words = cleaned.split(/\s+/);
  const convertedWords = words.map((w) => {
    const lower = w.toLowerCase();
    if (REVERSE_NAME_DICTIONARY[lower]) {
      return REVERSE_NAME_DICTIONARY[lower];
    }
    // If already in Devanagari, keep it
    if (containsDevanagari(w)) return w;
    return w; // fallback
  });

  return convertedWords.join(" ");
}

export interface ScriptConversionResult {
  convertedValue: string;
  originalValue: string;
  targetScript: "latin" | "devanagari";
  changed: boolean;
  isAmbiguous: boolean;
}

/**
 * Converts a field value to the requested script (Latin or Devanagari)
 */
export function convertFieldScript(
  currentValue: string,
  targetScript: "latin" | "devanagari",
): ScriptConversionResult {
  const cleaned = cleanNameValue(currentValue);

  if (!cleaned) {
    return {
      convertedValue: "",
      originalValue: currentValue,
      targetScript,
      changed: false,
      isAmbiguous: true,
    };
  }

  if (targetScript === "latin") {
    // If already purely Latin, no change needed
    if (containsLatin(cleaned) && !containsDevanagari(cleaned)) {
      return {
        convertedValue: cleaned,
        originalValue: currentValue,
        targetScript,
        changed: false,
        isAmbiguous: false,
      };
    }
    const converted = devanagariToLatin(cleaned);
    return {
      convertedValue: converted,
      originalValue: currentValue,
      targetScript,
      changed: converted.toLowerCase() !== cleaned.toLowerCase(),
      isAmbiguous: false,
    };
  } else {
    // targetScript === "devanagari"
    if (containsDevanagari(cleaned) && !containsLatin(cleaned)) {
      return {
        convertedValue: cleaned,
        originalValue: currentValue,
        targetScript,
        changed: false,
        isAmbiguous: false,
      };
    }
    const converted = latinToDevanagari(cleaned);
    return {
      convertedValue: converted,
      originalValue: currentValue,
      targetScript,
      changed: converted !== cleaned,
      isAmbiguous: false,
    };
  }
}

