import type { ContextProfileFact } from "../context/context.types";
import type { MappingCandidate, NormalizedField, MappingSource } from "./form-intelligence.types";

const aliases: Record<string, string[]> = {
  full_name: [
    "full name", "applicant name", "candidate name", "name of candidate", "your name", "first and last name",
    "customer name", "client name", "custname", "customer_name",
    "पूरा नाम", "नाम", "ग्राहक का नाम", "आवेदक का नाम", "अभ्यर्थी का नाम", "उम्मीदवार का नाम",
    "पूर्ण नाव", "नाव", "ग्राहकाचे नाव", "अर्जदाराचे नाव", "उमेदवाराचे नाव",
    "poora naam", "pura naam", "purna naav", "apna naam",
  ],
  first_name: [
    "first name", "given name", "पहला नाम", "पहिले नाव", "first_name",
  ],
  last_name: [
    "last name", "surname", "family name", "अंतिम नाम", "उपनाम", "आडनाव", "last_name",
  ],
  email: [
    "email", "e mail", "email address", "e-mail address",
    "ईमेल", "ई-मेल", "ईमेल पता", "ईमेल पत्ता", "email_id",
  ],
  phone: [
    "phone", "phone number", "mobile", "mobile number", "telephone", "telephone number", "contact number", "cell", "cell phone",
    "फोन", "फोन नंबर", "मोबाइल", "मोबाइल नंबर", "दूरभाष", "दूरभाष संख्या", "दूरभाष क्रमांक", "संपर्क नंबर",
    "दूरध्वनी", "दूरध्वनी क्रमांक", "मोबाईल", "मोबाईल नंबर", "संपर्क क्रमांक",
    "phone_number", "mobile_number", "contact_no",
  ],
  date_of_birth: [
    "date of birth", "dob", "birth date", "birthdate",
    "जन्म तिथि", "जन्म तारीख", "जन्म दिनांक",
    "जन्मतारीख", "जन्म दिनांक",
  ],
  gender: [
    "gender", "sex", "लिंग", "gender_identity",
  ],
  state: [
    "state", "province", "राज्य", "प्रांत", "state_name",
  ],
  district: [
    "district", "जिला", "जिल्हा", "district_name",
  ],
  city: [
    "city", "town", "शहर", "गाव", "गाव/शहर", "city_name",
  ],
  permanent_address: [
    "permanent address", "home address", "native address",
    "स्थायी पता", "मूल पता", "घर का पता",
    "कायमचा पत्ता", "मूळ पत्ता", "permanent_address",
  ],
  current_address: [
    "current address", "present address", "residential address", "communication address", "mailing address", "address",
    "वर्तमान पता", "पता", "निवासी पता", "पत्राचार का पता",
    "सध्याचा पत्ता", "पत्ता", "निवासी पत्ता", "पत्रव्यवहाराचा पत्ता",
    "residential_address",
  ],
  pin_code: [
    "pin code", "pincode", "postal code", "zip code", "zip",
    "पिन कोड", "पिनकोड", "पोस्ट कोड", "pin", "postal_code",
  ],
  highest_qualification: [
    "highest qualification", "qualification", "education qualification", "educational qualification", "degree",
    "उच्चतम योग्यता", "शैक्षणिक योग्यता", "डिग्री",
    "उच्चतम शैक्षणिक पात्रता", "शैक्षणिक पात्रता", "पदवी",
  ],
  university: [
    "university", "university name", "institution", "institution name",
    "विश्वविद्यालय", "विद्यापीठ",
  ],
  graduation_year: [
    "graduation year", "year of graduation", "passing year", "year of passing", "उत्तीर्ण वर्ष", "passing_year",
  ],
  current_employer: [
    "current employer", "current company", "employer", "organization",
    "कंपनी", "नियोक्ता", "सध्याची कंपनी",
  ],
  experience_years: [
    "years of experience", "experience", "work experience", "total experience",
    "अनुभव", "कार्य अनुभव", "कामाचा अनुभव",
  ],
};

function normalize(value?: string | null): string {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim();
}

function conceptFor(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = normalize(value);
  if (!normalized) return undefined;
  if (/(father|mother|guardian|spouse|husband|wife|parent)/.test(normalized)) return undefined;

  // Non-person entity names (university, company, file, document) must never match person name concepts
  const isEntityName = /(university|college|institution|company|employer|organization|file|document|attachment|folder)/.test(normalized);

  // Exact alias match first
  for (const [concept, values] of Object.entries(aliases)) {
    if (isEntityName && (concept === "full_name" || concept === "first_name" || concept === "last_name")) {
      continue;
    }
    if (values.some((alias) => normalized === normalize(alias))) {
      return concept;
    }
  }

  // Substring alias match
  for (const [concept, values] of Object.entries(aliases)) {
    if (isEntityName && (concept === "full_name" || concept === "first_name" || concept === "last_name")) {
      continue;
    }
    if (values.some((alias) => normalized.includes(normalize(alias)))) {
      return concept;
    }
  }

  return undefined;
}

function fieldConcept(field: NormalizedField): string | undefined {
  if ((field.inputType || "").toLowerCase() === "file") return undefined;
  return (field.searchableText ? conceptFor(field.searchableText) : undefined) ?? (field.label ? conceptFor(field.label) : undefined);
}

function sourceConcept(fact: ContextProfileFact): string | undefined {
  return conceptFor(`${fact.key} ${fact.category}`);
}

function sourceKind(fact: ContextProfileFact): MappingSource {
  return "approved_profile";
}

export function matchApprovedMemories(field: NormalizedField, facts: ContextProfileFact[]): MappingCandidate[] {
  const targetConcept = fieldConcept(field);
  if (!targetConcept) return [];
  return facts
    .filter((fact) => sourceConcept(fact) === targetConcept)
    .map((fact) => ({
      source: sourceKind(fact),
      sourceReference: { memoryId: fact.id },
      sourceKey: fact.key,
      value: fact.value,
      score: 0.96,
      labelScore: 0.96,
    }));
}

export function conceptForField(field: NormalizedField): string | undefined {
  return fieldConcept(field);
}

export function conceptForText(value: string): string | undefined {
  return conceptFor(value);
}
