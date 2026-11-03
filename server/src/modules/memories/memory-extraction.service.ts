import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { HttpError } from "../../common/errors";
import type { MemoryCandidate, MemoryCategory } from "./memory.types";

const patterns: Array<{
  category: MemoryCategory;
  key: string;
  pattern: RegExp;
}> = [
  { category: "EDUCATION", key: "highest_qualification", pattern: /(?:my|meri|मेरी|माझी)\s+(?:highest qualification|उच्चतम शैक्षणिक योग्यता|सर्वोच्च शैक्षणिक पात्रता)\s+(?:is|hai|है|आहे)\s+([^.!?\n]+)/iu },
  { category: "ADDRESS", key: "city", pattern: /(?:my|mera|मेरा|माझे)\s+(?:current )?(?:city|शहर|शहराचे)\s+(?:is|hai|है|आहे)\s+([^.!?\n]+)/iu },
  { category: "CONTACT", key: "phone", pattern: /(?:my|mera|मेरा|माझा)\s+(?:phone|mobile|फोन|मोबाईल)\s*(?:number|नंबर)?\s*(?:is|hai|है|आहे)\s+([+\d][\d\s-]{6,20})/iu },
];

function dataType(value: Prisma.InputJsonValue): MemoryCandidate["dataType"] {
  if (typeof value === "string") return "STRING";
  if (typeof value === "number") return "NUMBER";
  if (typeof value === "boolean") return "BOOLEAN";
  if (Array.isArray(value)) return "ARRAY";
  return "OBJECT";
}

export async function extractCandidatesFromMessage(input: {
  userId: string;
  conversationId: string;
  messageId: string;
}): Promise<MemoryCandidate[]> {
  const message = await prisma.message.findFirst({
    where: {
      id: input.messageId,
      conversationId: input.conversationId,
      role: "USER",
      conversation: { userId: input.userId },
    },
    select: { id: true, content: true, conversationId: true },
  });
  if (!message) throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message not found");

  const candidates: MemoryCandidate[] = [];
  for (const definition of patterns) {
    const match = definition.pattern.exec(message.content);
    if (!match?.[1]) continue;
    const value = match[1].trim() as Prisma.InputJsonValue;
    candidates.push({
      category: definition.category,
      key: definition.key,
      value,
      dataType: dataType(value),
      confidence: "HIGH",
      sourceConversationId: message.conversationId,
      sourceMessageId: message.id,
    });
  }
  return candidates;
}
