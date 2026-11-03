import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { HttpError } from "../../common/errors";
import { approvalSnapshotSchema, type BrowserDetectedField, type BrowserPageContext } from "./browser.protocol";
import type { BrowserFillInstruction } from "./browser.types";

const VERSION = "bhasha.browser.v1" as const;
const EXPIRY_MS = 5 * 60 * 1000;
const MAX_RETRIES = 3;

function pageParts(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "INVALID_PAGE_CONTEXT", "Only HTTP and HTTPS pages are supported");
  return { url: url.toString(), origin: url.origin, hostname: url.hostname.toLowerCase(), domain: url.hostname.toLowerCase() };
}

function actionFor(inputType: string, value: unknown): "SET_VALUE" | "SELECT_OPTION" | "CHECK" | "UNCHECK" {
  const type = inputType.toLowerCase();
  if (type === "checkbox") return value === true ? "CHECK" : "UNCHECK";
  if (type === "select" || type === "radio") return "SELECT_OPTION";
  return "SET_VALUE";
}
function browserValue(value: Prisma.JsonValue): string | number | boolean | Array<string | number | boolean> | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")) return value;
  return undefined;
}
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}
function retryHash(input: { userId: string; taskId: string; executionId: string; pageSessionId: string; protocolVersion: string; idempotencyKey: string; actionIds: string[] }): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}
function requestHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export async function registerPage(userId: string, taskId: string, context: BrowserPageContext, fields: BrowserDetectedField[], idempotencyKey: string) {
  const identity = requestHash({ userId, taskId, protocolVersion: VERSION, context, fields });
  const existing = await prisma.browserPageSession.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  if (existing) {
    if (!existing.idempotencyHash || existing.idempotencyHash !== identity) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request");
    return existing;
  }
  const parts = pageParts(context.url);
  try {
    return await prisma.$transaction(async (transaction) => {
      const current = await transaction.formTask.findFirst({
        where: { id: taskId, userId },
        include: { detectedFields: { where: { status: "ACTIVE" } } },
      });
      if (!current) throw new HttpError(404, "FORM_TASK_NOT_FOUND", "Form task not found");
      if (["COMPLETED", "CANCELLED"].includes(current.status)) throw new HttpError(409, "TASK_TERMINAL", "Task is terminal");
      const samePage = current.webpageUrl === parts.url && current.webpageTitle === (context.title ?? null);
      const comparableFieldKeys = ["fieldIdentifier", "fieldKey", "label", "name", "elementType", "inputType", "placeholder", "isRequired", "isDisabled", "isReadOnly", "detectedOrder", "groupName", "sectionName", "detectionConfidence", "options"];
      const sameFields = current.detectedFields.length === fields.length && fields.every((input) => {
        const existing = current.detectedFields.find((candidate) => candidate.fieldIdentifier === input.fieldIdentifier);
        if (!existing) return false;
        const normalized = {
          ...input,
          fieldKey: input.fieldKey ?? null,
          name: input.name ?? null,
          placeholder: input.placeholder ?? null,
          isRequired: input.isRequired ?? false,
          isDisabled: input.isDisabled ?? false,
          isReadOnly: input.isReadOnly ?? false,
          detectedOrder: input.detectedOrder ?? null,
          groupName: input.groupName ?? null,
          sectionName: input.sectionName ?? null,
          detectionConfidence: input.detectionConfidence ?? null,
          options: input.options ?? null,
        };
        return comparableFieldKeys.every((key) => canonicalJson(normalized[key as keyof typeof normalized]) === canonicalJson((existing as unknown as Record<string, unknown>)[key]));
      });
      const unchangedApprovedRegistration = current.status === "APPROVED_FOR_FILLING" && samePage && sameFields;
      const session = await transaction.browserPageSession.create({
        data: {
          userId, formTaskId: taskId, protocolVersion: VERSION, pageUrl: parts.url, origin: parts.origin,
          hostname: parts.hostname, pageTitle: context.title, fingerprint: context.fingerprint, tabId: context.tabId,
          detectedAt: context.detectedAt, idempotencyKey, idempotencyHash: identity,
        },
      });
      const page = pageParts(parts.url);
      if (!unchangedApprovedRegistration) {
        const nextStatus = current.status === "APPROVED_FOR_FILLING" ? "REVIEW" : "FIELDS_DETECTED";
        const updatedTask = await transaction.formTask.updateMany({
          where: { id: taskId, userId, version: current.version },
          data: { webpageUrl: page.url, domain: page.domain, webpageTitle: context.title, detectedAt: context.detectedAt, status: nextStatus, version: { increment: 1 } },
        });
        if (updatedTask.count !== 1) throw new HttpError(409, "STALE_TASK_VERSION", "Task changed during registration");
        if (current.status === "APPROVED_FOR_FILLING") {
          await transaction.approval.updateMany({
            where: { formTaskId: taskId, approvalType: "FORM_FILL", status: "APPROVED", invalidatedAt: null },
            data: { status: "REVOKED", invalidatedAt: new Date(), revokedAt: new Date() },
          });
          await transaction.taskEvent.create({ data: { formTaskId: taskId, eventType: "FINAL_APPROVAL_INVALIDATED", previousStatus: current.status, newStatus: nextStatus } });
        }
      }
      for (const field of fields) {
        await transaction.detectedField.upsert({
          where: { formTaskId_fieldIdentifier: { formTaskId: taskId, fieldIdentifier: field.fieldIdentifier } },
          create: {
            formTaskId: taskId, fieldIdentifier: field.fieldIdentifier, fieldKey: field.fieldKey, label: field.label,
            name: field.name, elementType: field.elementType, inputType: field.inputType, placeholder: field.placeholder,
            isRequired: field.isRequired, isDisabled: field.isDisabled, isReadOnly: field.isReadOnly,
            detectedOrder: field.detectedOrder, groupName: field.groupName, sectionName: field.sectionName,
            detectionConfidence: field.detectionConfidence, options: field.options,
            fieldMetadata: field.fingerprint ? { fingerprint: field.fingerprint } : undefined,
          },
          update: {
            fieldKey: field.fieldKey, label: field.label, name: field.name, elementType: field.elementType,
            inputType: field.inputType, placeholder: field.placeholder, isRequired: field.isRequired,
            isDisabled: field.isDisabled, isReadOnly: field.isReadOnly, detectedOrder: field.detectedOrder,
            groupName: field.groupName, sectionName: field.sectionName, detectionConfidence: field.detectionConfidence,
            options: field.options, fieldMetadata: field.fingerprint ? { fingerprint: field.fingerprint } : undefined,
          },
        });
      }
      if (!unchangedApprovedRegistration) {
        await transaction.detectedField.updateMany({
          where: { formTaskId: taskId, status: "ACTIVE", fieldIdentifier: { notIn: fields.map((field) => field.fieldIdentifier) } },
          data: { status: "REMOVED" },
        });
      }
      if (!unchangedApprovedRegistration) {
        const nextStatus = current.status === "APPROVED_FOR_FILLING" ? "REVIEW" : "FIELDS_DETECTED";
        await transaction.taskEvent.create({ data: { formTaskId: taskId, eventType: "WEBPAGE_METADATA_UPDATED", previousStatus: current.status, newStatus: nextStatus, metadata: { protocolVersion: VERSION } } });
        await transaction.taskEvent.create({ data: { formTaskId: taskId, eventType: "FIELDS_DETECTED", previousStatus: current.status, newStatus: nextStatus, metadata: { count: fields.length } } });
      }
      await transaction.auditLog.create({ data: { userId, action: "BROWSER_PAGE_REGISTERED", resourceType: "BrowserPageSession", resourceId: session.id, metadata: { taskId, protocolVersion: VERSION } } });
      return session;
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const duplicate = await prisma.browserPageSession.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (!duplicate) throw error;
    if (!duplicate.idempotencyHash || duplicate.idempotencyHash !== identity) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request");
    return duplicate;
  }
}

async function authorizedTask(userId: string, taskId: string, pageSessionId: string, database: Prisma.TransactionClient | typeof prisma = prisma) {
  const session = await database.browserPageSession.findFirst({ where: { id: pageSessionId, userId, formTaskId: taskId } });
  if (!session) throw new HttpError(404, "BROWSER_PAGE_NOT_FOUND", "Registered page context not found");
  const task = await database.formTask.findFirst({ where: { id: taskId, userId }, include: { detectedFields: { where: { status: "ACTIVE" }, include: { fieldValues: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
  if (!task) throw new HttpError(404, "FORM_TASK_NOT_FOUND", "Form task not found");
  if (task.status !== "APPROVED_FOR_FILLING") throw new HttpError(409, "APPROVAL_REQUIRED", "Final form approval is required");
  const approval = await database.approval.findFirst({ where: { userId, formTaskId: taskId, approvalType: "FORM_FILL", status: "APPROVED", invalidatedAt: null }, orderBy: { createdAt: "desc" } });
  if (!approval) throw new HttpError(409, "APPROVAL_REQUIRED", "Final form approval is required");
  if (approval.taskVersion === null || approval.taskVersion + 1 !== task.version) {
    throw new HttpError(409, "STALE_APPROVAL", "Final approval does not match the current task version");
  }
  const parsedSnapshot = approvalSnapshotSchema.safeParse(approval.approvedSnapshot);
  if (!parsedSnapshot.success || parsedSnapshot.data.taskId !== taskId || parsedSnapshot.data.version !== approval.taskVersion) {
    throw new HttpError(409, "STALE_APPROVAL", "Final approval snapshot is stale");
  }
  const snapshot = parsedSnapshot.data;
  const approvedFields = snapshot.fields;
  const snapshotById = new Map(approvedFields.map((field) => [field.id, field]));
  const currentIds = new Set(task.detectedFields.map((field) => field.id));
  if (approvedFields.length !== currentIds.size || new Set(approvedFields.map((field) => field.id)).size !== approvedFields.length || approvedFields.some((field) => !currentIds.has(field.id))) throw new HttpError(409, "STALE_APPROVAL", "Approval field set differs from the task");
  for (const field of task.detectedFields) {
    const approved = snapshotById.get(field.id);
    const approvedValue = approved?.fieldValues[0];
    const currentValue = field.fieldValues[0];
    const currentStatus = currentValue?.status ?? null;
    const approvedStatus = approvedValue?.status ?? null;
    if (currentValue && currentStatus !== "APPROVED") throw new HttpError(409, "STALE_APPROVAL", "A non-approved field value cannot be filled");
    const fieldKeys = ["formTaskId", "fieldIdentifier", "fieldKey", "label", "name", "inputType", "elementType", "placeholder", "isRequired", "isDisabled", "isReadOnly", "detectedOrder", "groupName", "sectionName", "detectionConfidence", "status", "options", "fieldMetadata"];
    const fieldMatches = approved && fieldKeys.every((key) => canonicalJson(approved[key as keyof typeof approved]) === canonicalJson((field as unknown as Record<string, unknown>)[key]));
    const valueKeys = ["status", "value", "source", "sourceMemoryId", "sourceReferenceId", "dataType", "executionStatus"];
    const valueMatches = approvedValue && currentValue && valueKeys.every((key) => canonicalJson(approvedValue[key as keyof typeof approvedValue]) === canonicalJson((currentValue as unknown as Record<string, unknown>)[key]));
    if (!fieldMatches || currentStatus !== approvedStatus || (currentStatus === "APPROVED" && !valueMatches)) {
      throw new HttpError(409, "STALE_APPROVAL", "Approved field values differ from the approval snapshot");
    }
  }
  const taskPage = task.webpageUrl ? pageParts(task.webpageUrl) : undefined;
  if (!taskPage || taskPage.url !== session.pageUrl || taskPage.origin !== session.origin || taskPage.hostname !== session.hostname || canonicalJson(snapshot.webpageUrl) !== canonicalJson(task.webpageUrl) || canonicalJson(snapshot.webpageTitle) !== canonicalJson(task.webpageTitle)) {
    throw new HttpError(409, "PAGE_CONTEXT_MISMATCH", "Registered page does not match the task page");
  }
  return { task, session, approval };
}

export async function issueInstructions(userId: string, taskId: string, pageSessionId: string, idempotencyKey: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "form_tasks" WHERE id = ${taskId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
    const { task, session, approval } = await authorizedTask(userId, taskId, pageSessionId, transaction);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPIRY_MS);
    const actions = task.detectedFields.flatMap((field) => {
    const value = field.fieldValues[0];
    if (!value || value.status !== "APPROVED" || field.isDisabled || field.isReadOnly) return [];
    const safeValue = browserValue(value.value);
    if (safeValue === undefined) return [];
    return [{ actionId: randomUUID(), fieldId: field.id, action: actionFor(field.inputType, safeValue), value: safeValue, expectedFieldType: field.inputType, expectedFieldFingerprint: (field.fieldMetadata as { fingerprint?: string } | null)?.fingerprint }];
    });
    if (!actions.length) throw new HttpError(409, "NO_APPROVED_VALUES", "No approved field values are available");
    const pageContext = { url: session.pageUrl, title: session.pageTitle ?? undefined, detectedAt: session.detectedAt, fingerprint: session.fingerprint ?? undefined, tabId: session.tabId ?? undefined };
    const identity = requestHash({ userId, taskId, pageSessionId, protocolVersion: VERSION, approvalId: approval.id, taskVersion: task.version, pageContext, actions: actions.map(({ actionId: _actionId, ...action }) => action) });
    const instruction: BrowserFillInstruction = { protocolVersion: VERSION, type: "FORM_FILL", actionId: randomUUID(), idempotencyKey, taskId, approvalId: approval.id, taskVersion: task.version, pageContext, issuedAt: now.toISOString(), expiresAt: expiresAt.toISOString(), actions };
    const existing = await transaction.browserExecution.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (existing) {
      if (!existing.idempotencyHash || existing.idempotencyHash !== identity) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request");
      return existing;
    }
    let execution;
    try {
      execution = await transaction.browserExecution.create({ data: { userId, formTaskId: taskId, pageSessionId, approvalId: approval.id, protocolVersion: VERSION, taskVersion: task.version, idempotencyKey, idempotencyHash: identity, instruction: instruction as unknown as Prisma.InputJsonValue, expiresAt } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const duplicate = await transaction.browserExecution.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
      if (!duplicate) throw error;
      if (!duplicate.idempotencyHash || duplicate.idempotencyHash !== identity) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request");
      return duplicate;
    }
    await transaction.auditLog.create({ data: { userId, action: "BROWSER_INSTRUCTIONS_ISSUED", resourceType: "BrowserExecution", resourceId: execution.id, metadata: { taskId, actionCount: actions.length, taskVersion: task.version } } });
    return execution;
  });
}

export async function acknowledge(userId: string, input: { taskId: string; executionId: string; pageSessionId: string; actionId: string; status: "COMPLETED" | "PARTIAL" | "FAILED"; results: Array<{ fieldId: string; actionId: string; actionType: "SET_VALUE" | "SELECT_OPTION" | "CHECK" | "UNCHECK"; status: "SUCCESS" | "FAILED" | "SKIPPED"; errorCode?: string; message?: string; executedAt?: Date }> }) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "browser_executions" WHERE id = ${input.executionId}::uuid FOR UPDATE`;
    const execution = await transaction.browserExecution.findFirst({ where: { id: input.executionId, userId, pageSessionId: input.pageSessionId } });
    if (!execution) throw new HttpError(404, "BROWSER_EXECUTION_NOT_FOUND", "Execution not found");
    const currentTask = await transaction.formTask.findFirst({ where: { id: execution.formTaskId, userId }, select: { version: true, status: true } });
    const currentApproval = await transaction.approval.findFirst({ where: { id: execution.approvalId, userId, formTaskId: execution.formTaskId, status: "APPROVED", invalidatedAt: null } });
    if (!currentTask || currentTask.status !== "APPROVED_FOR_FILLING" || currentTask.version !== execution.taskVersion || !currentApproval) {
      throw new HttpError(409, "STALE_APPROVAL", "Execution approval is no longer current");
    }
    const instruction = execution.instruction as unknown as BrowserFillInstruction;
    if (execution.formTaskId !== input.taskId || instruction.approvalId !== execution.approvalId || !input.results.length || instruction.actionId !== input.actionId) throw new HttpError(400, "INVALID_ACKNOWLEDGEMENT", "Acknowledgement does not match issued instructions");
    if (execution.status === "COMPLETED" || execution.status === "CANCELLED" || execution.status === "EXPIRED") throw new HttpError(409, "EXECUTION_TERMINAL", "Execution is already terminal");
    if (execution.expiresAt <= new Date()) throw new HttpError(409, "EXECUTION_EXPIRED", "Execution has expired");
    for (const result of input.results) {
      const action = instruction.actions.find((candidate) => candidate.fieldId === result.fieldId);
      if (!action || action.actionId !== result.actionId || action.action !== result.actionType) throw new HttpError(400, "INVALID_ACKNOWLEDGEMENT", "Unknown or mismatched field action");
      const previous = await transaction.browserActionResult.findUnique({ where: { executionId_fieldId: { executionId: execution.id, fieldId: result.fieldId } } });
      if (previous) throw new HttpError(409, "DUPLICATE_ACTION_RESULT", "This field result was already acknowledged");
      try {
        await transaction.browserActionResult.create({ data: { executionId: execution.id, fieldId: result.fieldId, actionId: result.actionId, status: result.status, errorCode: result.errorCode, message: result.message, executedAt: result.executedAt } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new HttpError(409, "DUPLICATE_ACTION_RESULT", "This field result was already acknowledged");
        }
        throw error;
      }
    }
    const changed = await transaction.browserExecution.updateMany({ where: { id: execution.id, userId, pageSessionId: input.pageSessionId, status: execution.status }, data: { status: input.status, acknowledgedAt: new Date() } });
    if (changed.count !== 1) throw new HttpError(409, "EXECUTION_STATE_CHANGED", "Execution changed; acknowledgement was not applied");
    const updated = await transaction.browserExecution.findUniqueOrThrow({ where: { id: execution.id }, include: { results: true } });
    await transaction.auditLog.create({ data: { userId, action: "BROWSER_EXECUTION_ACKNOWLEDGED", resourceType: "BrowserExecution", resourceId: execution.id, metadata: { status: input.status, resultCount: input.results.length } } });
    return updated;
  });
}

export async function retry(userId: string, taskId: string, executionId: string, idempotencyKey: string, pageSessionId: string, protocolVersion = VERSION, requestedActionIds?: string[]) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "browser_executions" WHERE id = ${executionId}::uuid FOR UPDATE`;
    const execution = await transaction.browserExecution.findFirst({ where: { id: executionId, userId, formTaskId: taskId, pageSessionId } });
    if (!execution) throw new HttpError(404, "BROWSER_EXECUTION_NOT_FOUND", "Execution not found");
    const currentTask = await transaction.formTask.findFirst({ where: { id: taskId, userId }, select: { version: true, status: true } });
    const currentApproval = await transaction.approval.findFirst({ where: { id: execution.approvalId, userId, formTaskId: taskId, status: "APPROVED", invalidatedAt: null } });
    if (!currentTask || currentTask.status !== "APPROVED_FOR_FILLING" || currentTask.version !== execution.taskVersion || !currentApproval) {
      throw new HttpError(409, "STALE_APPROVAL", "Execution approval is no longer current");
    }
    const existing = await transaction.browserExecution.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
    if (existing) {
      const actionIds = requestedActionIds ?? existing.retryActionIds;
      const hash = retryHash({ userId, taskId, executionId, pageSessionId, protocolVersion, idempotencyKey, actionIds: [...actionIds].sort() });
      if (existing.idempotencyHash !== hash) throw new HttpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different retry request");
      return existing;
    }
    if (execution.retryCount >= MAX_RETRIES) throw new HttpError(409, "RETRY_LIMIT_REACHED", "Execution retry limit reached");
    if (execution.expiresAt <= new Date()) throw new HttpError(409, "EXECUTION_EXPIRED", "Execution has expired");
    if (!["FAILED", "PARTIAL"].includes(execution.status)) throw new HttpError(409, "EXECUTION_NOT_RETRYABLE", "Execution is not retryable");
    const instruction = execution.instruction as unknown as BrowserFillInstruction;
    const failed = await transaction.browserActionResult.findMany({ where: { executionId: execution.id, status: "FAILED" }, select: { fieldId: true } });
    const failedIds = new Set(failed.map((result) => result.fieldId));
    if (!failedIds.size) throw new HttpError(409, "NO_FAILED_ACTIONS", "No failed actions are available for retry");
    const actionIds = requestedActionIds ?? instruction.actions.filter((action) => failedIds.has(action.fieldId)).map((action) => action.actionId);
    if (actionIds.length !== new Set(actionIds).size || actionIds.some((actionId) => !instruction.actions.some((action) => action.actionId === actionId && failedIds.has(action.fieldId)))) {
      throw new HttpError(409, "INVALID_RETRY_SCOPE", "Retry scope must contain only failed actions");
    }
    const hash = retryHash({ userId, taskId, executionId, pageSessionId, protocolVersion, idempotencyKey, actionIds: [...actionIds].sort() });
    const retryInstruction: BrowserFillInstruction = {
      ...instruction,
      actionId: randomUUID(),
      idempotencyKey,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + EXPIRY_MS).toISOString(),
      actions: instruction.actions.filter((action) => actionIds.includes(action.actionId)).map((action) => ({ ...action, actionId: randomUUID() })),
    };
    const updated = await transaction.browserExecution.updateMany({
      where: { id: execution.id, userId, pageSessionId, status: execution.status, retryCount: execution.retryCount },
      data: { idempotencyKey, idempotencyHash: hash, retryActionIds: actionIds, status: "ISSUED", retryCount: { increment: 1 }, expiresAt: new Date(Date.now() + EXPIRY_MS), instruction: retryInstruction as unknown as Prisma.InputJsonValue },
    });
    if (updated.count !== 1) throw new HttpError(409, "EXECUTION_STATE_CHANGED", "Execution changed; retry again");
    await transaction.browserActionResult.deleteMany({ where: { executionId: execution.id, fieldId: { in: [...failedIds] } } });
    const result = await transaction.browserExecution.findUniqueOrThrow({ where: { id: execution.id } });
    await transaction.auditLog.create({ data: { userId, action: "BROWSER_EXECUTION_RETRIED", resourceType: "BrowserExecution", resourceId: execution.id, metadata: { retryCount: result.retryCount, actionCount: retryInstruction.actions.length } } });
    return result;
  });
}

export async function cancel(userId: string, taskId: string, executionId: string) {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT id FROM "browser_executions" WHERE id = ${executionId}::uuid FOR UPDATE`;
    const execution = await transaction.browserExecution.findFirst({ where: { id: executionId, userId, formTaskId: taskId } });
    if (!execution) throw new HttpError(404, "BROWSER_EXECUTION_NOT_FOUND", "Execution not found");
    if (["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"].includes(execution.status)) return execution;
    const updated = await transaction.browserExecution.updateMany({ where: { id: execution.id, userId, formTaskId: taskId, status: execution.status }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    if (updated.count !== 1) throw new HttpError(409, "EXECUTION_STATE_CHANGED", "Execution changed; cancel again");
    const result = await transaction.browserExecution.findUniqueOrThrow({ where: { id: execution.id } });
    await transaction.auditLog.create({ data: { userId, action: "BROWSER_EXECUTION_CANCELLED", resourceType: "BrowserExecution", resourceId: execution.id, metadata: {} } });
    return result;
  });
}

export async function status(userId: string, executionId: string) {
  const execution = await prisma.browserExecution.findFirst({ where: { id: executionId, userId }, include: { results: true } });
  if (!execution) throw new HttpError(404, "BROWSER_EXECUTION_NOT_FOUND", "Execution not found");
  return execution;
}
