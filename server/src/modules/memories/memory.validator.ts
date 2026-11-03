import { z } from "zod";
import { MEMORY_CATEGORIES } from "./memory.types";

const value = z.union([
  z.string().min(1).max(10_000),
  z.number().finite(),
  z.boolean(),
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
]);

export const proposalSchema = z.object({
  operation: z.enum(["CREATE", "UPDATE", "DELETE"]),
  category: z.enum(MEMORY_CATEGORIES),
  key: z.string().trim().min(1).max(150),
  proposedValue: value,
  sourceConversationId: z.string().uuid().optional(),
  sourceMessageId: z.string().uuid().optional(),
  existingMemoryId: z.string().uuid().optional(),
}).strict();

export const proposalListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
}).strict();

export const memoryListSchema = proposalListSchema.extend({
  category: z.enum(MEMORY_CATEGORIES).optional(),
  key: z.string().trim().min(1).max(150).optional(),
}).strict();

export const rejectionSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

export const memoryUpdateSchema = z.object({
  category: z.enum(MEMORY_CATEGORIES).optional(),
  key: z.string().trim().min(1).max(150).optional(),
  proposedValue: value,
}).strict();

export const extractionSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
}).strict();
