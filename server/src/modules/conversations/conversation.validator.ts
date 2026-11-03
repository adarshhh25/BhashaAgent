import { z } from "zod";

export const conversationIdSchema = z.string().uuid();
export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
}).strict();

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one conversation field is required",
});

export const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
  inputMode: z.enum(["TEXT", "VOICE"]).default("TEXT"),
  language: z.string().trim().min(1).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const correctionSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
}).strict();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["ACTIVE", "ARCHIVED", "DELETED"]).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  beforeMessageId: z.string().uuid().optional(),
}).strict();
