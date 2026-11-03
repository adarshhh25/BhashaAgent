import { randomUUID } from "node:crypto";
import { HttpError } from "../../common/errors";
import { getUser } from "../users/users.service";
import { getOwnedConversation } from "../conversations/conversation.service";
import { getConversationContext, getOwnedMessage } from "../conversations/context.service";
import { getRelevantMemories } from "../memories/memory.service";
import { listTasks, getTask, getTaskVersion } from "../form-tasks/form-task.service";
import type {
  AgentContext, BuildAgentContextInput, BuildAgentContextResult, ContextCorrection,
  ContextDetectedField, ContextFieldValue, ContextMessage, ContextProfileFact,
  ContextSourceReference, MissingInformation, WebpageContext,
} from "./context.types";

const DEFAULT_RECENT = 20;
const DEFAULT_OLDER = 10;
const ACTIVE_TASK_STATUSES = [
  "CREATED", "FIELDS_DETECTED", "MAPPING_IN_PROGRESS", "AWAITING_INFORMATION",
  "REVIEW", "AWAITING_FINAL_APPROVAL", "APPROVED_FOR_FILLING", "FILLING", "PAUSED",
] as const;

function iso(value: Date | null | undefined): string | undefined {
  return value?.toISOString();
}

function numberValue(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

function messageReference(message: { id: string; createdAt: Date }): ContextSourceReference {
  return { type: "message", id: message.id, createdAt: message.createdAt.toISOString() };
}

function toMessage(message: {
  id: string; role: "USER" | "ASSISTANT" | "SYSTEM"; content: string; language: string | null;
  createdAt: Date; revisions?: Array<{ revisedAt: Date }>;
}): ContextMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    language: message.language ?? undefined,
    createdAt: message.createdAt.toISOString(),
    corrected: Boolean(message.revisions?.length),
    revisionCount: message.revisions?.length ?? 0,
    latestCorrectedAt: message.revisions?.length
      ? message.revisions[message.revisions.length - 1].revisedAt.toISOString()
      : undefined,
    sourceReference: messageReference(message),
  };
}

function sourceReferences(context: AgentContext): ContextSourceReference[] {
  const refs = [
    ...context.conversation.recentMessages,
    ...context.conversation.relevantOlderContext,
  ].flatMap((message) => message.sourceReference ? [message.sourceReference] : []);
  refs.push(...context.profileMemory.approvedFacts.flatMap((fact) => fact.sourceReference ? [fact.sourceReference] : []));
  refs.push(...context.formTask.detectedFields.map((field) => field.sourceReference));
  refs.push(...context.formTask.proposedValues.map((value) => value.sourceReference));
  return Array.from(new Map(refs.map((ref) => [`${ref.type}:${ref.id}`, ref])).values());
}

function relevantOlder(messages: ContextMessage[], currentContent: string, limit: number): ContextMessage[] {
  const terms = new Set(currentContent.toLowerCase().split(/[^a-z0-9\u0900-\u097f]+/u).filter((term) => term.length >= 3));
  return messages
    .map((message, index) => ({
      message,
      score: message.content.toLowerCase().split(/[^a-z0-9\u0900-\u097f]+/u)
        .filter((term) => terms.has(term)).length,
      index,
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.message);
}

async function resolveTask(userId: string, conversationId: string, taskId?: string) {
  if (taskId) {
    const result = await getTask(userId, taskId);
    if (result.task.conversationId !== conversationId) {
      throw new HttpError(404, "FORM_TASK_NOT_FOUND", "Form task not found");
    }
    return { task: result, resolution: { status: "resolved" as const, selectedTaskId: taskId } };
  }
  const listed = await listTasks(userId, { page: 1, limit: 50, conversationId });
  const candidates = listed.tasks.filter((task) =>
    (ACTIVE_TASK_STATUSES as readonly string[]).includes(task.status),
  );
  if (candidates.length === 0) return { task: undefined, resolution: { status: "not_requested" as const } };
  if (candidates.length > 1) {
    return {
      task: undefined,
      resolution: { status: "ambiguous" as const, candidateTaskIds: candidates.map((task) => task.id).sort() },
    };
  }
  return {
    task: await getTask(userId, candidates[0].id),
    resolution: { status: "resolved" as const, selectedTaskId: candidates[0].id },
  };
}

function taskProjection(taskResult: Awaited<ReturnType<typeof getTask>>) {
  const task = taskResult.task;
  const fields: ContextDetectedField[] = taskResult.fields
    .filter((field) => field.status === "ACTIVE")
    .map((field) => ({
      id: field.id,
      fieldIdentifier: field.fieldIdentifier,
      fieldKey: field.fieldKey ?? undefined,
      label: field.label,
      name: field.name ?? undefined,
      elementType: field.elementType,
      inputType: field.inputType,
      placeholder: field.placeholder ?? undefined,
      required: field.isRequired,
      disabled: field.isDisabled,
      readOnly: field.isReadOnly,
      status: field.status,
      detectedOrder: field.detectedOrder ?? undefined,
      groupName: field.groupName ?? undefined,
      sectionName: field.sectionName ?? undefined,
      detectionConfidence: numberValue(field.detectionConfidence),
      options: field.options ?? undefined,
      sourceReference: { type: "field", id: field.id, createdAt: field.createdAt.toISOString() },
    }));
  const fieldIds = new Set(fields.map((field) => field.id));
  const values: ContextFieldValue[] = taskResult.fields.flatMap((field) => {
    if (!fieldIds.has(field.id) || !field.fieldValues[0]) return [];
    const value = field.fieldValues[0];
    const redacted = field.inputType.toLowerCase() === "password";
    return [{
      id: value.id,
      fieldId: field.id,
      value: redacted ? "[REDACTED]" : value.value,
      redacted,
      source: value.source,
      confidence: numberValue(value.confidence),
      approvalStatus: value.status,
      executionStatus: value.executionStatus,
      sourceMemoryId: value.sourceMemoryId ?? undefined,
      correctionCount: value.revisions.length,
      createdAt: value.createdAt.toISOString(),
      updatedAt: value.updatedAt.toISOString(),
      sourceReference: { type: "field_value", id: value.id, createdAt: value.createdAt.toISOString() },
    }];
  });
  const missing: MissingInformation[] = [
    ...taskResult.missingInformation.missingRequiredFields,
    ...taskResult.missingInformation.missingOptionalFields,
  ].map((field) => ({
    fieldId: field.id,
    label: field.label,
    required: field.isRequired,
    reason: field.isRequired ? "Required field has no approved value" : "Optional field has no approved value",
    clarificationRequired: field.isRequired,
  }));
  const approval = taskResult.approvals.find((item) => item.approvalType === "FORM_FILL");
  return {
    task,
    fields,
    values,
    missing,
    webpage: {
      url: task.webpageUrl,
      title: task.webpageTitle ?? undefined,
      domain: task.domain ?? undefined,
      metadata: task.webpageMetadata ?? undefined,
      detectedAt: iso(task.detectedAt),
    } satisfies WebpageContext,
    approval: approval ? {
      status: approval.status,
      valid: approval.status === "APPROVED"
        && approval.invalidatedAt === null
        && task.status === "APPROVED_FOR_FILLING"
        && approval.taskVersion !== null
        && approval.taskVersion + 1 === task.version,
      approvalId: approval.id,
      taskVersion: approval.taskVersion ?? undefined,
      approvedAt: iso(approval.approvedAt),
    } : undefined,
  };
}

export async function buildAgentContext(input: BuildAgentContextInput): Promise<BuildAgentContextResult> {
  const now = new Date();
  const requestId = randomUUID();
  const recentLimit = Math.min(input.options?.maxRecentMessages ?? DEFAULT_RECENT, DEFAULT_RECENT);
  const olderLimit = Math.min(input.options?.maxOlderMessages ?? DEFAULT_OLDER, DEFAULT_OLDER);
  const user = await getUser(input.userId);
  if (user.status !== "ACTIVE") {
    throw new HttpError(401, "ACCOUNT_INACTIVE", "Authentication is required");
  }
  const conversation = await getOwnedConversation(input.userId, input.conversationId);

  let currentMessage: AgentContext["request"]["currentUserMessage"];
  let persistedCurrentId: string | undefined;
  let currentCorrection: ContextCorrection | undefined;
  const requestedMessage = input.currentMessage;
  if ("messageId" in requestedMessage) {
    const current = await getOwnedMessage({
      conversationId: input.conversationId,
      userId: input.userId,
      messageId: requestedMessage.messageId,
    });
    if (current.role !== "USER") throw new HttpError(400, "INVALID_CURRENT_MESSAGE", "Current message must be a user message");
    persistedCurrentId = current.id;
    currentMessage = {
      id: current.id,
      content: current.content,
      language: current.language ?? undefined,
      source: current.inputMode === "VOICE" ? "voice_transcript" : "text",
      createdAt: current.createdAt.toISOString(),
    };
    if (current.revisions.length > 0) {
      currentCorrection = {
        messageId: current.id,
        revisionCount: current.revisions.length,
        latestCorrectedAt: current.revisions[current.revisions.length - 1].revisedAt.toISOString(),
      };
    }
  } else if ("content" in requestedMessage) {
    currentMessage = {
      content: requestedMessage.content,
      language: requestedMessage.language,
      source: requestedMessage.source ?? "unknown",
    };
  } else {
    throw new HttpError(400, "INVALID_CURRENT_MESSAGE", "Current message is invalid");
  }

  const allRecent = await getConversationContext({
    conversationId: input.conversationId,
    userId: input.userId,
    limit: recentLimit + (persistedCurrentId ? 1 : 0),
  });
  const recentRaw = allRecent.filter((message) => message.id !== persistedCurrentId).slice(-recentLimit);
  const omittedItems: AgentContext["contextMetadata"]["omittedItems"] = allRecent
    .filter((message) => !recentRaw.some((recent) => recent.id === message.id) && message.id !== persistedCurrentId)
    .map((message) => ({ type: "message" as const, id: message.id, reason: "recent message budget" }));
  const recentMessages = recentRaw.map((message) => toMessage(message));
  let olderMessages: ContextMessage[] = [];
  const olderCursor = persistedCurrentId ?? recentRaw[0]?.id;
  if (input.options?.includeOlderContext !== false && olderCursor) {
    const olderRaw = await getConversationContext({
      conversationId: input.conversationId,
      userId: input.userId,
      limit: 200,
      beforeMessageId: olderCursor,
    });
    const olderCandidates = olderRaw.map((message) => toMessage(message));
    const selectedOlder = relevantOlder(olderCandidates, currentMessage.content, olderLimit);
    omittedItems.push(
      ...olderRaw
        .filter((message) => !selectedOlder.some((selected) => selected.id === message.id))
        .map((message) => ({ type: "message" as const, id: message.id, reason: "older context relevance or budget" })),
    );
    olderMessages = selectedOlder;
  }

  const memories = input.options?.includeProfileMemory === false
    ? []
    : await getRelevantMemories({ userId: input.userId, limit: 50 });
  const profileFacts: ContextProfileFact[] = memories.map((memory) => ({
    id: memory.id,
    category: memory.category,
    key: memory.key,
    value: memory.value,
    approvalStatus: "APPROVED",
    sourceReference: memory.sourceMessageId
      ? { type: "memory", id: memory.id, createdAt: memory.approvedAt?.toISOString() }
      : { type: "memory", id: memory.id },
    provenance: {
      conversationId: memory.sourceConversationId ?? undefined,
      messageId: memory.sourceMessageId ?? undefined,
    },
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
  }));

  const taskResolution = input.options?.includeFormTask === false
    ? { task: undefined, resolution: { status: "not_requested" as const } }
    : await resolveTask(input.userId, input.conversationId, input.formTaskId);
  const projected = taskResolution.task ? taskProjection(taskResolution.task) : undefined;
  if (projected) {
    const currentTask = await getTaskVersion(input.userId, projected.task.id);
    if (currentTask.version !== projected.task.version) {
      throw new HttpError(409, "CONTEXT_STALE", "Form task changed while context was being built");
    }
  }
  const warnings = taskResolution.resolution.status === "ambiguous"
    ? [{ code: "AMBIGUOUS_FORM_TASK", message: "More than one active form task could match this conversation" }]
    : [];
  const context: AgentContext = {
    schemaVersion: "1.0",
    request: { requestId, createdAt: now.toISOString(), currentUserMessage: currentMessage },
    user: { id: user.id, preferredLanguage: user.preferredLanguage ?? undefined },
    conversation: {
      id: conversation.id,
      status: conversation.status,
      recentMessages,
      summary: conversation.summary ?? undefined,
      relevantOlderContext: olderMessages,
      corrections: (currentCorrection ? [currentCorrection] : []).concat(
        recentMessages.concat(olderMessages)
          .filter((message) => message.corrected && message.id)
          .map((message) => ({
            messageId: message.id as string,
            revisionCount: message.revisionCount,
            latestCorrectedAt: message.latestCorrectedAt,
          })),
      ),
    },
    profileMemory: { approvedFacts: profileFacts },
    formTask: projected ? {
      id: projected.task.id,
      status: projected.task.status,
      version: projected.task.version,
      webpage: projected.webpage,
      detectedFields: projected.fields,
      proposedValues: projected.values,
      missingInformation: projected.missing,
      approvalState: projected.approval,
    } : { detectedFields: [], proposedValues: [], missingInformation: [] },
    contextMetadata: {
      builtAt: now.toISOString(),
      sourceCounts: {
        recentMessages: recentMessages.length,
        olderMessages: olderMessages.length,
        approvedMemories: profileFacts.length,
        detectedFields: projected?.fields.length ?? 0,
        proposedValues: projected?.values.length ?? 0,
      },
      truncated: omittedItems.length > 0,
      omittedItems,
      warnings,
      sourceReferences: [],
    },
  };
  context.contextMetadata.sourceReferences = sourceReferences(context);
  return { success: true, context, taskResolution: taskResolution.resolution };
}
