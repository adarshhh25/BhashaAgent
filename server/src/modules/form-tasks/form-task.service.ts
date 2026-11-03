import { Prisma, type FormTaskStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../config/database";
import { HttpError } from "../../common/errors";
import { getApprovedMemory, getRelevantMemories } from "../memories/memory.service";

const taskSelect = {
  id: true, userId: true, conversationId: true, title: true, taskType: true,
  webpageUrl: true, webpageTitle: true, domain: true, status: true, taskMetadata: true,
  webpageMetadata: true, detectedAt: true, startedAt: true, pausedAt: true,
  completedAt: true, failedAt: true, cancelledAt: true, previousStatus: true,
  version: true, failureCode: true, failureMessage: true, createdAt: true, updatedAt: true,
  _count: { select: { detectedFields: true, taskEvents: true } },
} as const;

const allowed: Record<string, string[]> = {
  CREATED: ["FIELDS_DETECTED", "PAUSED", "CANCELLED", "FAILED"],
  FIELDS_DETECTED: ["MAPPING_IN_PROGRESS", "AWAITING_INFORMATION", "REVIEW", "PAUSED", "CANCELLED", "FAILED"],
  MAPPING_IN_PROGRESS: ["AWAITING_INFORMATION", "REVIEW", "AWAITING_FINAL_APPROVAL", "PAUSED", "FAILED", "CANCELLED"],
  AWAITING_INFORMATION: ["MAPPING_IN_PROGRESS", "REVIEW", "PAUSED", "CANCELLED", "FAILED"],
  REVIEW: ["MAPPING_IN_PROGRESS", "AWAITING_INFORMATION", "AWAITING_FINAL_APPROVAL", "PAUSED", "CANCELLED"],
  AWAITING_FINAL_APPROVAL: ["REVIEW", "APPROVED_FOR_FILLING", "PAUSED", "CANCELLED"],
  APPROVED_FOR_FILLING: ["FILLING", "PAUSED", "CANCELLED"],
  FILLING: ["COMPLETED", "FAILED", "PAUSED"],
  PAUSED: ["CREATED", "FIELDS_DETECTED", "MAPPING_IN_PROGRESS", "AWAITING_INFORMATION", "REVIEW", "AWAITING_FINAL_APPROVAL", "APPROVED_FOR_FILLING", "CANCELLED"],
  FAILED: ["MAPPING_IN_PROGRESS", "REVIEW", "CANCELLED"],
};

function assertTransition(current: string, next: string) {
  if (!allowed[current]?.includes(next)) {
    throw new HttpError(409, "INVALID_TASK_TRANSITION", `Cannot transition task from ${current} to ${next}`);
  }
}

function normalizedUrl(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new HttpError(400, "INVALID_WEBPAGE_URL", "Only HTTP and HTTPS URLs are supported");
  }
  return { url: url.toString(), domain: url.hostname.toLowerCase() };
}

async function ownedTask(userId: string, taskId: string) {
  const task = await prisma.formTask.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new HttpError(404, "FORM_TASK_NOT_FOUND", "Form task not found");
  return task;
}

async function event(transaction: Prisma.TransactionClient, taskId: string, eventType: string, previousStatus?: FormTaskStatus, newStatus?: FormTaskStatus, entityId?: string, metadata?: Prisma.InputJsonObject) {
  await transaction.taskEvent.create({
    data: { formTaskId: taskId, eventType, previousStatus, newStatus, entityId, metadata },
  });
}

export async function createTask(userId: string, input: { conversationId: string; title?: string; taskType: string; webpageUrl: string }) {
  const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, userId }, select: { id: true } });
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  const page = normalizedUrl(input.webpageUrl);
  return prisma.$transaction(async (transaction) => {
    const task = await transaction.formTask.create({
      data: {
        userId, conversationId: input.conversationId, title: input.title ?? "Form Task",
        taskType: input.taskType, webpageUrl: page.url, domain: page.domain, status: "CREATED",
      },
      select: taskSelect,
    });
    await event(transaction, task.id, "TASK_CREATED", undefined, "CREATED");
    return task;
  });
}

export async function listTasks(userId: string, input: { page: number; limit: number; status?: string; conversationId?: string; search?: string }) {
  const where: Prisma.FormTaskWhereInput = {
    userId,
    ...(input.status ? { status: input.status as FormTaskStatus } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.search ? { OR: [{ title: { contains: input.search, mode: "insensitive" } }, { domain: { contains: input.search, mode: "insensitive" } }] } : {}),
  };
  const [tasks, total] = await prisma.$transaction([
    prisma.formTask.findMany({ where, select: taskSelect, orderBy: { updatedAt: "desc" }, skip: (input.page - 1) * input.limit, take: input.limit }),
    prisma.formTask.count({ where }),
  ]);
  return { tasks, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) } };
}

export async function getTask(userId: string, taskId: string) {
  const task = await ownedTask(userId, taskId);
  const [fields, missing, approvals] = await Promise.all([
    prisma.detectedField.findMany({ where: { formTaskId: taskId }, include: { fieldValues: { include: { revisions: true }, orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ detectedOrder: "asc" }, { createdAt: "asc" }] }),
    getMissingInformation(userId, taskId),
    prisma.approval.findMany({ where: { formTaskId: taskId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { task, fields, missingInformation: missing, approvals };
}

export async function getTaskVersion(userId: string, taskId: string) {
  const task = await ownedTask(userId, taskId);
  return { id: task.id, version: task.version };
}

export async function transitionTask(userId: string, taskId: string, next: FormTaskStatus, expectedVersion?: number, metadata?: Prisma.InputJsonObject) {
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.formTask.findFirst({ where: { id: taskId, userId } });
    if (!current) throw new HttpError(404, "FORM_TASK_NOT_FOUND", "Form task not found");
    if (expectedVersion !== undefined && current.version !== expectedVersion) throw new HttpError(409, "STALE_TASK_VERSION", "Task has changed; reload before retrying");
    assertTransition(current.status, next);
    if (next === "FILLING" && current.status !== "APPROVED_FOR_FILLING") throw new HttpError(409, "APPROVAL_REQUIRED", "Final approval is required before filling");
    const updated = await transaction.formTask.updateMany({
      where: { id: taskId, userId, version: current.version },
      data: {
        status: next, previousStatus: current.status, version: { increment: 1 },
        pausedAt: next === "PAUSED" ? new Date() : null,
        failedAt: next === "FAILED" ? new Date() : null,
        cancelledAt: next === "CANCELLED" ? new Date() : null,
      },
      });
    if (updated.count !== 1) throw new HttpError(409, "STALE_TASK_VERSION", "Task changed during update");
    await event(transaction, taskId, `TASK_${next}`, current.status, next, undefined, metadata);
    return transaction.formTask.findUniqueOrThrow({ where: { id: taskId }, select: taskSelect });
  });
}

export async function updateWebpage(userId: string, taskId: string, input: { url: string; title?: string; pageLanguage?: string; capturedAt?: Date; metadata?: Prisma.InputJsonObject }) {
  await ownedTask(userId, taskId);
  const page = normalizedUrl(input.url);
  return prisma.$transaction(async (transaction) => {
    const task = await transaction.formTask.update({ where: { id: taskId }, data: { webpageUrl: page.url, domain: page.domain, webpageTitle: input.title, webpageMetadata: { ...(input.metadata ?? {}), pageLanguage: input.pageLanguage, capturedAt: input.capturedAt?.toISOString() } } });
    await event(transaction, taskId, "WEBPAGE_METADATA_UPDATED", task.status, task.status, undefined, input.metadata);
    return task;
  });
}

export async function addFields(userId: string, taskId: string, fields: Array<Record<string, unknown>>) {
  const task = await ownedTask(userId, taskId);
  if (["COMPLETED", "CANCELLED"].includes(task.status)) throw new HttpError(409, "TASK_TERMINAL", "Task is terminal");
  const identifiers = fields.map((field) => field.fieldIdentifier as string);
  if (new Set(identifiers).size !== identifiers.length) throw new HttpError(409, "DUPLICATE_FIELD", "Field identifiers must be unique in a batch");
  return prisma.$transaction(async (transaction) => {
    const created = [];
    for (const field of fields) {
      created.push(await transaction.detectedField.upsert({
        where: { formTaskId_fieldIdentifier: { formTaskId: taskId, fieldIdentifier: field.fieldIdentifier as string } },
        create: { ...(field as object), formTaskId: taskId } as Prisma.DetectedFieldUncheckedCreateInput,
        update: { ...field } as Prisma.DetectedFieldUncheckedUpdateInput,
      }));
    }
    await transaction.formTask.update({ where: { id: taskId }, data: { status: "FIELDS_DETECTED", detectedAt: new Date(), version: { increment: 1 } } });
    await event(transaction, taskId, "FIELDS_DETECTED", task.status, "FIELDS_DETECTED", undefined, { count: fields.length });
    return created;
  });
}

function validateValue(field: { inputType: string; options: Prisma.JsonValue | null }, value: unknown) {
  if (field.inputType.toLowerCase() === "email" && (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new HttpError(400, "INVALID_FIELD_VALUE", "Invalid email value");
  if (["number", "tel"].includes(field.inputType.toLowerCase()) && typeof value !== "number" && typeof value !== "string") throw new HttpError(400, "INVALID_FIELD_VALUE", "Invalid field value");
  if (["select", "radio"].includes(field.inputType.toLowerCase()) && Array.isArray(field.options)) {
    const options = field.options as Array<{ value?: unknown }>;
    if (!options.some((option) => option.value === value)) throw new HttpError(400, "INVALID_FIELD_VALUE", "Value is not one of the field options");
  }
}

export async function setFieldValue(userId: string, taskId: string, fieldId: string, input: { value: Prisma.InputJsonValue; source: string; sourceMemoryId?: string; sourceReferenceId?: string; confidence?: number }) {
  await ownedTask(userId, taskId);
  const field = await prisma.detectedField.findFirst({ where: { id: fieldId, formTaskId: taskId } });
  if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "Field not found");
  validateValue(field, input.value);
  return prisma.$transaction(async (transaction) => {
    const previous = await transaction.fieldValue.findFirst({ where: { detectedFieldId: fieldId }, orderBy: { createdAt: "desc" } });
    if (previous && JSON.stringify(previous.value) === JSON.stringify(input.value)) return previous;
    const value = await transaction.fieldValue.create({
      data: { detectedFieldId: fieldId, value: input.value, source: input.source as never, sourceMemoryId: input.sourceMemoryId, sourceReferenceId: input.sourceReferenceId, confidence: input.confidence, status: "PENDING_APPROVAL", dataType: typeof input.value, executionStatus: "NOT_STARTED" },
    });
    await event(transaction, taskId, "VALUE_PROPOSED", undefined, undefined, value.id);
    if (previous) await transaction.fieldValueRevision.create({ data: { id: randomUUID(), fieldValueId: value.id, previousValue: previous.value as Prisma.InputJsonValue, previousStatus: previous.status } });
    const invalidated = await transaction.approval.updateMany({
      where: { formTaskId: taskId, approvalType: "FORM_FILL", status: "APPROVED", invalidatedAt: null },
      data: { status: "REVOKED", invalidatedAt: new Date(), revokedAt: new Date() },
    });
    if (invalidated.count > 0) await event(transaction, taskId, "FINAL_APPROVAL_INVALIDATED");
    await transaction.formTask.update({ where: { id: taskId }, data: { version: { increment: 1 }, status: "REVIEW" } });
    return value;
  });
}

export async function persistIntelligentMappings(
  userId: string,
  taskId: string,
  expectedVersion: number,
  plans: Array<{
    detectedFieldId: string;
    value: Prisma.InputJsonValue;
    source: string;
    sourceMemoryId?: string;
    sourceReferenceId?: string;
    sourceKey?: string;
    confidence: number;
  }>,
) {
  return prisma.$transaction(async (transaction) => {
    const task = await transaction.formTask.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new HttpError(404, "FORM_TASK_NOT_FOUND", "Form task not found");
    if (task.version !== expectedVersion) throw new HttpError(409, "STALE_TASK_VERSION", "Task has changed; reload before mapping");
    if (!["CREATED", "FIELDS_DETECTED", "MAPPING_IN_PROGRESS", "AWAITING_INFORMATION", "REVIEW", "PAUSED"].includes(task.status)) {
      throw new HttpError(409, "TASK_NOT_MAPPABLE", "Form task cannot be mapped in its current state");
    }

    const claimed = await transaction.formTask.updateMany({
      where: { id: taskId, userId, version: expectedVersion },
      data: { status: "MAPPING_IN_PROGRESS", version: { increment: 1 } },
    });
    if (claimed.count !== 1) throw new HttpError(409, "STALE_TASK_VERSION", "Task changed during mapping");

    for (const plan of plans) {
      const field = await transaction.detectedField.findFirst({ where: { id: plan.detectedFieldId, formTaskId: taskId, status: "ACTIVE" } });
      if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "Field not found");
      validateValue(field, plan.value);
      const previous = await transaction.fieldValue.findFirst({ where: { detectedFieldId: field.id }, orderBy: { createdAt: "desc" } });
      if (previous) continue;
      await transaction.fieldMapping.upsert({
        where: { formTaskId_detectedFieldId: { formTaskId: taskId, detectedFieldId: field.id } },
        create: {
          formTaskId: taskId, detectedFieldId: field.id, sourceMemoryId: plan.sourceMemoryId,
          sourceKey: plan.sourceKey, confidence: plan.confidence,
          source: plan.source === "APPROVED_PROFILE_MEMORY" ? "DETERMINISTIC" : "INTERNAL",
        },
        update: {
          sourceMemoryId: plan.sourceMemoryId, sourceKey: plan.sourceKey,
          confidence: plan.confidence,
          source: plan.source === "APPROVED_PROFILE_MEMORY" ? "DETERMINISTIC" : "INTERNAL",
        },
      });
      const value = await transaction.fieldValue.create({
        data: {
          detectedFieldId: field.id, value: plan.value, source: plan.source as never,
          sourceMemoryId: plan.sourceMemoryId, sourceReferenceId: plan.sourceReferenceId,
          confidence: plan.confidence, status: "PENDING_APPROVAL",
          dataType: typeof plan.value, executionStatus: "NOT_STARTED",
        },
      });
      await event(transaction, taskId, "FIELD_MAPPED", undefined, undefined, field.id, { confidence: plan.confidence });
      await event(transaction, taskId, "VALUE_PROPOSED", undefined, undefined, value.id);
    }
    const invalidated = plans.length > 0
      ? await transaction.approval.updateMany({
        where: { formTaskId: taskId, approvalType: "FORM_FILL", status: "APPROVED", invalidatedAt: null },
        data: { status: "REVOKED", invalidatedAt: new Date(), revokedAt: new Date() },
      })
      : { count: 0 };
    if (invalidated.count > 0) await event(transaction, taskId, "FINAL_APPROVAL_INVALIDATED");
    return { version: expectedVersion + 1 };
  });
}

export async function getCurrentFieldValue(userId: string, taskId: string, fieldId: string) {
  await ownedTask(userId, taskId);
  const field = await prisma.detectedField.findFirst({ where: { id: fieldId, formTaskId: taskId }, select: { id: true } });
  if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "Field not found");
  return prisma.fieldValue.findFirst({ where: { detectedFieldId: fieldId }, orderBy: { createdAt: "desc" }, include: { revisions: true } });
}

export async function getMissingInformation(userId: string, taskId: string) {
  await ownedTask(userId, taskId);
  const fields = await prisma.detectedField.findMany({ where: { formTaskId: taskId, status: "ACTIVE" }, include: { fieldValues: { where: { status: { in: ["APPROVED", "FILLED"] } }, orderBy: { createdAt: "desc" }, take: 1 } } });
  const missingRequiredFields = fields.filter((field) => field.isRequired && !field.fieldValues[0] && !field.isDisabled);
  const missingOptionalFields = fields.filter((field) => !field.isRequired && !field.fieldValues[0] && !field.isDisabled);
  return { taskId, missingRequiredFields, missingOptionalFields, isReadyForReview: missingRequiredFields.length === 0 };
}

export async function approveField(userId: string, taskId: string, fieldId: string, approved: boolean) {
  await ownedTask(userId, taskId);
  const field = await prisma.detectedField.findFirst({ where: { id: fieldId, formTaskId: taskId }, include: { fieldValues: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const value = field?.fieldValues[0];
  if (!value) throw new HttpError(404, "FIELD_VALUE_NOT_FOUND", "Field value not found");
  if (approved) validateValue(field, value.value);
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.fieldValue.update({ where: { id: value.id }, data: { status: approved ? "APPROVED" : "REJECTED", approvedAt: approved ? new Date() : null } });
    await transaction.formTask.update({ where: { id: taskId }, data: { version: { increment: 1 }, status: "REVIEW" } });
    await event(transaction, taskId, approved ? "VALUE_APPROVED" : "VALUE_REJECTED", undefined, undefined, value.id);
    return updated;
  });
}

export async function reviewTask(userId: string, taskId: string) {
  const task = await ownedTask(userId, taskId);
  const missing = await getMissingInformation(userId, taskId);
  const fields = await prisma.detectedField.findMany({ where: { formTaskId: taskId, status: "ACTIVE" }, include: { fieldValues: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const snapshot = { taskId, version: task.version, webpageUrl: task.webpageUrl, webpageTitle: task.webpageTitle, fields };
  return { snapshot, missing, ready: missing.isReadyForReview && fields.every((field) => !field.fieldValues[0] || field.fieldValues[0].status === "APPROVED") };
}

export async function finalApprove(userId: string, taskId: string, expectedVersion: number) {
  const review = await reviewTask(userId, taskId);
  if (!review.ready) throw new HttpError(409, "TASK_NOT_READY", "Required fields must be valid and approved");
  const task = await ownedTask(userId, taskId);
  if (task.version !== expectedVersion) throw new HttpError(409, "STALE_TASK_VERSION", "Task has changed; reload before approval");
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.formTask.updateMany({ where: { id: taskId, userId, version: expectedVersion, status: { in: ["REVIEW", "AWAITING_FINAL_APPROVAL"] } }, data: { status: "APPROVED_FOR_FILLING", version: { increment: 1 } } });
    if (updated.count !== 1) throw new HttpError(409, "STALE_TASK_VERSION", "Task changed during approval");
    const approval = await transaction.approval.create({ data: { userId, formTaskId: taskId, approvalType: "FORM_FILL", status: "APPROVED", approvedAt: new Date(), taskVersion: expectedVersion, approvedSnapshot: review.snapshot } });
    await event(transaction, taskId, "FINAL_APPROVAL_GRANTED", "REVIEW", "APPROVED_FOR_FILLING", approval.id);
    return approval;
  });
}

export async function listHistory(userId: string, taskId: string, page: number, limit: number) {
  await ownedTask(userId, taskId);
  const [events, total] = await prisma.$transaction([
    prisma.taskEvent.findMany({ where: { formTaskId: taskId }, orderBy: { createdAt: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.taskEvent.count({ where: { formTaskId: taskId } }),
  ]);
  return { events, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function mapField(userId: string, taskId: string, input: { detectedFieldId: string; sourceMemoryId?: string; sourceKey?: string; confidence: number; source: "DETERMINISTIC" | "INTERNAL" | "USER" }) {
  await ownedTask(userId, taskId);
  const field = await prisma.detectedField.findFirst({ where: { id: input.detectedFieldId, formTaskId: taskId } });
  if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "Field not found");
  if (input.sourceMemoryId && !(await getApprovedMemory(userId, input.sourceMemoryId))) throw new HttpError(404, "MEMORY_NOT_FOUND", "Approved memory not found");
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.fieldMapping.findUnique({
      where: { formTaskId_detectedFieldId: { formTaskId: taskId, detectedFieldId: input.detectedFieldId } },
    });
    if (existing &&
      existing.source === input.source &&
      existing.sourceMemoryId === (input.sourceMemoryId ?? null) &&
      existing.sourceKey === (input.sourceKey ?? null) &&
      existing.confidence?.toNumber() === input.confidence) return existing;
    const mapping = await transaction.fieldMapping.upsert({ where: { formTaskId_detectedFieldId: { formTaskId: taskId, detectedFieldId: input.detectedFieldId } }, create: { ...input, formTaskId: taskId }, update: input });
    await transaction.formTask.update({ where: { id: taskId }, data: { status: "MAPPING_IN_PROGRESS", version: { increment: 1 } } });
    await event(transaction, taskId, "FIELD_MAPPED", undefined, undefined, field.id, { confidence: input.confidence });
    return mapping;
  });
}

export async function listMappings(userId: string, taskId: string) {
  await ownedTask(userId, taskId);
  return prisma.fieldMapping.findMany({ where: { formTaskId: taskId }, include: { detectedField: true }, orderBy: { createdAt: "asc" } });
}

export async function deleteTask(userId: string, taskId: string) {
  const task = await ownedTask(userId, taskId);
  if (["FILLING", "COMPLETED"].includes(task.status)) throw new HttpError(409, "TASK_NOT_DELETABLE", "Task cannot be deleted in its current state");
  return transitionTask(userId, taskId, "CANCELLED");
}

export async function updateTask(userId: string, taskId: string, input: { title?: string; taskMetadata?: Prisma.InputJsonObject }) {
  const task = await ownedTask(userId, taskId);
  if (["COMPLETED", "CANCELLED"].includes(task.status)) throw new HttpError(409, "TASK_TERMINAL", "Task is terminal");
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.formTask.update({ where: { id: taskId }, data: input });
    await event(transaction, taskId, "TASK_METADATA_UPDATED", task.status, task.status);
    return updated;
  });
}

export async function failTask(userId: string, taskId: string, code: string, message: string) {
  await ownedTask(userId, taskId);
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.formTask.findFirstOrThrow({ where: { id: taskId, userId } });
    assertTransition(current.status, "FAILED");
    const updated = await transaction.formTask.update({ where: { id: taskId }, data: { status: "FAILED", failedAt: new Date(), failureCode: code, failureMessage: message, previousStatus: current.status, version: { increment: 1 } } });
    await event(transaction, taskId, "TASK_FAILED", current.status, "FAILED", undefined, { code });
    return updated;
  });
}

export async function retryTask(userId: string, taskId: string) {
  const task = await ownedTask(userId, taskId);
  if (task.status !== "FAILED") throw new HttpError(409, "TASK_NOT_FAILED", "Only failed tasks can be retried");
  return transitionTask(userId, taskId, "REVIEW", task.version, { recovery: true });
}
