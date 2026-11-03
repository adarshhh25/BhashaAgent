import { z } from "zod";

const currentMessage = z.union([
  z.object({ messageId: z.string().uuid() }).strict(),
  z.object({
    content: z.string().trim().min(1).max(32_000),
    language: z.string().trim().max(20).optional(),
    source: z.enum(["text", "voice_transcript", "unknown"]).optional(),
  }).strict(),
]);

export const buildContextSchema = z.object({
  currentMessage,
  formTaskId: z.string().uuid().optional(),
  options: z.object({
    includeOlderContext: z.boolean().optional(),
    includeProfileMemory: z.boolean().optional(),
    includeFormTask: z.boolean().optional(),
    maxRecentMessages: z.coerce.number().int().min(1).max(50).optional(),
    maxOlderMessages: z.coerce.number().int().min(0).max(25).optional(),
  }).strict().optional(),
}).strict();
