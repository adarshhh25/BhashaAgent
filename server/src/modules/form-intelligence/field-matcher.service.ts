import type { ContextProfileFact } from "../context/context.types";
import type { MappingCandidate, NormalizedField, MappingSource } from "./form-intelligence.types";

const aliases: Record<string, string[]> = {
  full_name: ["full name", "applicant name", "candidate name", "name of candidate", "पूरा नाम"],
  email: ["email", "e mail", "email address", "e-mail address"],
  phone: ["phone", "phone number", "mobile", "mobile number", "telephone", "contact number"],
  date_of_birth: ["date of birth", "dob", "birth date", "जन्म तिथि"],
  highest_qualification: ["highest qualification", "qualification", "education qualification"],
  university: ["university", "university name", "institution", "institution name"],
  graduation_year: ["graduation year", "year of graduation", "passing year"],
  current_employer: ["current employer", "current company", "employer"],
  experience_years: ["years of experience", "experience", "work experience"],
  current_address: ["current address", "present address", "residential address"],
  permanent_address: ["permanent address", "home address"],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim();
}

function conceptFor(value: string): string | undefined {
  const normalized = normalize(value);
  if (/(father|mother|guardian|spouse|husband|wife|parent)/.test(normalized)) return undefined;
  return Object.entries(aliases).find(([, values]) =>
    values.some((alias) => normalized === normalize(alias) || normalized.includes(normalize(alias))),
  )?.[0];
}

function fieldConcept(field: NormalizedField): string | undefined {
  return conceptFor(field.searchableText) ?? conceptFor(field.label);
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
