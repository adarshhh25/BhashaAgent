import { z } from "zod";

export const BROWSER_PROTOCOL_VERSION = "bhasha.browser.v1" as const;
export const browserActionType = z.enum(["SET_VALUE", "SELECT_OPTION", "CHECK", "UNCHECK"]);
export type BrowserActionType = z.infer<typeof browserActionType>;

const uuid = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(255);
const jsonValue: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValue),
  z.record(z.string(), jsonValue),
]));
const snapshotDate = z.string().datetime({ offset: true });
const snapshotOption = z.object({
  value: z.union([z.string(), z.number().finite(), z.boolean()]),
  label: z.string().max(255).nullable().optional(),
  checked: z.boolean().optional(),
  disabled: z.boolean().optional(),
});
const snapshotFieldValue = z.object({
  id: uuid,
  detectedFieldId: uuid,
  value: jsonValue,
  source: z.enum(["USER_PROVIDED", "PROFILE_MEMORY", "CONVERSATION", "USER_INPUT", "AI_SUGGESTION", "APPROVED_PROFILE_MEMORY", "AGENT_PROPOSED", "SYSTEM_DEFAULT", "USER_CORRECTED"]),
  sourceReferenceId: uuid.nullable(),
  confidence: z.number().finite().nullable(),
  status: z.enum(["NOT_REVIEWED", "PENDING_APPROVAL", "PROPOSED", "APPROVED", "FILLED", "REJECTED", "FAILED"]),
  executionStatus: z.enum(["NOT_STARTED", "READY", "IN_PROGRESS", "FILLED", "SKIPPED", "FAILED"]),
  dataType: z.string().max(30).nullable(),
  sourceMemoryId: uuid.nullable(),
  attemptCount: z.number().int().nonnegative(),
  lastAttemptAt: snapshotDate.nullable(),
  lastError: z.string().max(500).nullable(),
  approvedAt: snapshotDate.nullable(),
  filledAt: snapshotDate.nullable(),
  createdAt: snapshotDate,
  updatedAt: snapshotDate,
}).strict();
const snapshotField = z.object({
  id: uuid,
  formTaskId: uuid,
  fieldIdentifier: z.string().min(1).max(255),
  fieldKey: z.string().max(255).nullable(),
  label: z.string().max(500),
  name: z.string().max(255).nullable(),
  elementType: z.string().max(50),
  inputType: z.string().max(50),
  placeholder: z.string().max(500).nullable(),
  isRequired: z.boolean(),
  isDisabled: z.boolean(),
  isReadOnly: z.boolean(),
  detectedOrder: z.number().int().nonnegative().nullable(),
  groupName: z.string().max(255).nullable(),
  sectionName: z.string().max(255).nullable(),
  detectionConfidence: z.number().finite().nullable(),
  status: z.enum(["ACTIVE", "REMOVED"]),
  options: z.array(snapshotOption).nullable(),
  fieldMetadata: z.record(z.string(), jsonValue).nullable(),
  createdAt: snapshotDate,
  updatedAt: snapshotDate,
  fieldValues: z.array(snapshotFieldValue),
}).strict().superRefine((field, context) => {
  if (!field.options) return;
  const identifiers = field.options.map((option) => JSON.stringify(option.value));
  if (new Set(identifiers).size !== identifiers.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Option identifiers must be unique" });
  }
});

export const approvalSnapshotSchema = z.object({
  taskId: uuid,
  version: z.number().int().nonnegative(),
  webpageUrl: z.string().url().nullable(),
  webpageTitle: z.string().max(500).nullable(),
  fields: z.array(snapshotField),
}).strict();

export const browserPageContextSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().max(500).optional(),
  detectedAt: z.coerce.date(),
  fingerprint: z.string().trim().max(255).optional(),
  tabId: z.string().trim().max(255).optional(),
}).strict();

export const browserDetectedFieldSchema = z.object({
  fieldIdentifier: z.string().trim().min(1).max(255),
  fieldKey: z.string().trim().max(255).optional(),
  label: z.string().trim().min(1).max(500),
  name: z.string().max(255).optional(),
  elementType: z.string().trim().min(1).max(50),
  inputType: z.string().trim().min(1).max(50),
  placeholder: z.string().max(500).optional(),
  isRequired: z.boolean().default(false),
  isDisabled: z.boolean().default(false),
  isReadOnly: z.boolean().default(false),
  detectedOrder: z.number().int().nonnegative().optional(),
  groupName: z.string().max(255).optional(),
  sectionName: z.string().max(255).optional(),
  detectionConfidence: z.number().min(0).max(1).optional(),
  options: z.array(z.object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    label: z.string().max(255).optional(),
    checked: z.boolean().optional(),
    disabled: z.boolean().optional(),
  })).max(100).optional(),
  fingerprint: z.string().trim().max(255).optional(),
}).strict();

export const registrationSchema = z.object({
  protocolVersion: z.literal(BROWSER_PROTOCOL_VERSION),
  messageId: uuid,
  messageType: z.literal("TASK_REGISTER"),
  taskId: uuid,
  timestamp: z.coerce.date(),
  idempotencyKey,
  payload: z.object({ pageContext: browserPageContextSchema, fields: z.array(browserDetectedFieldSchema).min(1).max(100) }).strict(),
}).strict();

export const fillInstructionSchema = z.object({
  protocolVersion: z.literal(BROWSER_PROTOCOL_VERSION),
  messageId: uuid,
  messageType: z.literal("FILL_INSTRUCTIONS_REQUEST"),
  taskId: uuid,
  timestamp: z.coerce.date(),
  idempotencyKey,
  pageSessionId: uuid,
}).strict();

export const acknowledgementSchema = z.object({
  protocolVersion: z.literal(BROWSER_PROTOCOL_VERSION),
  messageId: uuid,
  messageType: z.literal("FORM_FILL_ACK"),
  taskId: uuid,
  timestamp: z.coerce.date(),
  idempotencyKey,
  executionId: uuid,
  actionId: z.string().trim().min(1).max(255),
  pageSessionId: uuid,
  status: z.enum(["COMPLETED", "PARTIAL", "FAILED"]),
  results: z.array(z.object({
    fieldId: uuid,
    actionId: uuid,
    actionType: browserActionType,
    status: z.enum(["SUCCESS", "FAILED", "SKIPPED"]),
    errorCode: z.string().trim().max(100).optional(),
    message: z.string().trim().max(500).optional(),
    executedAt: z.coerce.date().optional(),
  }).strict()).max(100),
}).strict();

export const retrySchema = z.object({ protocolVersion: z.literal(BROWSER_PROTOCOL_VERSION).default(BROWSER_PROTOCOL_VERSION), taskId: uuid, idempotencyKey, pageSessionId: uuid, actionIds: z.array(uuid).max(100).optional() }).strict();
export const cancellationSchema = z.object({ taskId: uuid, idempotencyKey }).strict();

export type BrowserPageContext = z.infer<typeof browserPageContextSchema>;
export type BrowserDetectedField = z.infer<typeof browserDetectedFieldSchema>;
