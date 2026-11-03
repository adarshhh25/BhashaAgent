import type { Prisma } from "@prisma/client";

export const MEMORY_CATEGORIES = [
  "PERSONAL",
  "CONTACT",
  "ADDRESS",
  "EDUCATION",
  "EXPERIENCE",
  "SKILLS",
  "CERTIFICATIONS",
  "PREFERENCES",
  "LANGUAGE",
  "OTHER",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
export type MemoryValue = Prisma.InputJsonValue;

export interface MemoryCandidate {
  category: MemoryCategory;
  key: string;
  value: MemoryValue;
  dataType: "STRING" | "NUMBER" | "BOOLEAN" | "DATE" | "OBJECT" | "ARRAY";
  confidence: "HIGH" | "LOW";
  sourceConversationId: string;
  sourceMessageId: string;
}
