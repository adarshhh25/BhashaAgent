import { z } from "zod";

const json = z.union([
  z.record(z.string(), z.unknown()),
  z.array(z.unknown()),
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]).optional();
const confidence = z.number().min(0).max(1).optional();

export const taskCreateSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().trim().min(1).max(255).optional(),
  taskType: z.string().trim().min(1).max(100).default("APPLICATION"),
  webpageUrl: z.string().url().max(2048),
}).strict();

export const taskListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  conversationId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
}).strict();

export const webpageSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().trim().max(500).optional(),
  pageLanguage: z.string().trim().max(20).optional(),
  capturedAt: z.coerce.date().optional(),
  metadata: json,
}).strict();

export const transitionSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
}).strict();

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  taskMetadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const failureSchema = z.object({
  code: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(500),
}).strict();

export const fieldSchema = z.object({
  fieldIdentifier: z.string().trim().min(1).max(255),
  fieldKey: z.string().trim().max(255).optional(),
  label: z.string().trim().min(1).max(500),
  name: z.string().max(255).optional(),
  elementType: z.string().trim().min(1).max(50).default("input"),
  inputType: z.string().trim().min(1).max(50).default("TEXT"),
  placeholder: z.string().max(500).optional(),
  isRequired: z.boolean().default(false),
  isDisabled: z.boolean().default(false),
  isReadOnly: z.boolean().default(false),
  detectedOrder: z.number().int().nonnegative().optional(),
  groupName: z.string().max(255).optional(),
  sectionName: z.string().max(255).optional(),
  detectionConfidence: confidence.default(1),
  options: json.optional(),
  fieldMetadata: json.optional(),
  currentValue: z.unknown().optional(),
}).passthrough();

export const fieldsSchema = z.object({
  fields: z.array(fieldSchema).min(1).max(500),
}).strict();

export const fieldUpdateSchema = fieldSchema.partial().strict();

export const valueSchema = z.object({
  value: z.unknown(),
  source: z.enum(["USER_PROVIDED", "PROFILE_MEMORY", "CONVERSATION", "USER_INPUT", "AI_SUGGESTION", "APPROVED_PROFILE_MEMORY", "AGENT_PROPOSED", "SYSTEM_DEFAULT", "USER_CORRECTED"]).default("USER_PROVIDED"),
  sourceMemoryId: z.string().uuid().optional(),
  confidence,
}).strict();

export const mappingSchema = z.object({
  detectedFieldId: z.string().uuid(),
  sourceMemoryId: z.string().uuid().optional(),
  sourceKey: z.string().max(150).optional(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["DETERMINISTIC", "INTERNAL", "USER"]).default("INTERNAL"),
}).strict();

export const taskIdSchema = z.string().uuid();
