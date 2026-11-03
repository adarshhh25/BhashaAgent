import { Prisma } from "@prisma/client";
import { HttpError } from "../../common/errors";
import { prisma } from "../../config/database";
import { buildAgentContext } from "../context/context.service";
import { persistIntelligentMappings } from "../form-tasks/form-task.service";
import { normalizeField } from "./field-normalizer.service";
import { conceptForField, matchApprovedMemories } from "./field-matcher.service";
import { validateFieldValue } from "./field-type-validator.service";
import { summarizeMappings } from "./review-summary.service";
import type {
  FieldMappingResult,
  FormIntelligenceResult,
  MappingCandidate,
  MappingSource,
} from "./form-intelligence.types";

function conversationCandidates(
  fieldConcept: string | undefined,
  messages: Array<{ id?: string; content: string; role: string }>,
): MappingCandidate[] {
  if (!fieldConcept) return [];
  const candidates: MappingCandidate[] = [];
  for (const message of messages) {
    if (message.role !== "USER") continue;
    const content = message.content.trim();
    const isCorrection = /\b(?:actually|correction|correct(?:ion)?|i meant|instead)\b/i.test(content);
    if (isCorrection) candidates.length = 0;
    let value: string | undefined;
    if (fieldConcept === "email") value = content.match(/[^\s,;]+@[^\s,;]+\.[^\s,;]+/)?.[0];
    if (fieldConcept === "phone") value = content.match(/(?:\+?\d[\d\s()-]{7,}\d)/)?.[0].trim();
    if (fieldConcept === "full_name") value = content.match(/(?:my name is|name is)\s+([^.!?]+)/i)?.[1]?.trim();
    if (fieldConcept === "graduation_year") value = content.match(/\b(?:19|20)\d{2}\b/)?.[0];
    if (fieldConcept === "highest_qualification") {
      value = content.match(/(?:qualification|degree|education)\s*(?:is|:|-)?\s*(bachelor(?:'s)?|master(?:'s)?|ph\.?d|diploma|b\.?e\.?|b\.?tech|m\.?e\.?|m\.?tech)[^.!?]*/i)?.[1]?.trim();
    }
    if (value) {
      candidates.push({
        source: "conversation_answer",
        sourceReference: message.id ? { messageId: message.id } : {},
        value,
        score: 0.9,
        labelScore: 0.9,
      });
    }
  }
  return candidates;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function conflictResult(
  field: ReturnType<typeof normalizeField>,
  candidates: MappingCandidate[],
): FieldMappingResult {
  return {
    fieldId: field.id,
    fieldIdentifier: field.fieldIdentifier,
    label: field.label,
    status: "conflict",
    proposedValue: null,
    confidence: 0,
    reason: "Multiple trusted sources provide different values",
    conflicts: candidates.map((candidate) => ({
      source: candidate.source,
      sourceReference: candidate.sourceReference,
    })),
  };
}

export async function runIntelligentMapping(
  userId: string,
  taskId: string,
  expectedVersion?: number,
): Promise<FormIntelligenceResult> {
  const task = await prisma.formTask.findFirst({
    where: { id: taskId, userId },
    select: { conversationId: true },
  });
  if (!task) throw new HttpError(404, "FORM_TASK_NOT_FOUND", "Form task not found");
  const contextResult = await buildAgentContext({
    userId,
    conversationId: task.conversationId,
    currentMessage: { content: "", source: "unknown" },
    formTaskId: taskId,
  });
  const context = contextResult.context;
  if (!context.formTask.id) throw new HttpError(409, "FORM_TASK_NOT_FOUND", "Form task not found");
  if (expectedVersion !== undefined && context.formTask.version !== expectedVersion) {
    throw new HttpError(409, "STALE_TASK_VERSION", "Task has changed; reload before mapping");
  }
  if (context.formTask.detectedFields.length === 0) {
    throw new HttpError(409, "NO_DETECTED_FIELDS", "The form task has no detected fields");
  }
  if (context.formTask.detectedFields.length > 100) {
    throw new HttpError(413, "FORM_TASK_TOO_LARGE", "Form task contains too many fields to map safely");
  }
  if (!["CREATED", "FIELDS_DETECTED", "MAPPING_IN_PROGRESS", "AWAITING_INFORMATION", "REVIEW", "PAUSED", "APPROVED_FOR_FILLING"].includes(context.formTask.status ?? "")) {
    throw new HttpError(409, "TASK_NOT_MAPPABLE", "Form task cannot be mapped in its current state");
  }

  const messages = [...context.conversation.relevantOlderContext, ...context.conversation.recentMessages];
  const results: FieldMappingResult[] = [];
  const plans: Array<{
    detectedFieldId: string;
    value: Prisma.InputJsonValue;
    source: string;
    sourceMemoryId?: string;
    sourceReferenceId?: string;
    sourceKey?: string;
    confidence: number;
  }> = [];
  for (const rawField of context.formTask.detectedFields) {
    const field = normalizeField({
      ...rawField,
      fieldKey: rawField.fieldKey,
      options: rawField.options,
      isRequired: rawField.required,
      isDisabled: rawField.disabled,
      isReadOnly: rawField.readOnly,
    });
    if (field.disabled || field.readOnly) {
      results.push({ fieldId: field.id, fieldIdentifier: field.fieldIdentifier, label: field.label, status: "unsupported", proposedValue: null, confidence: 0, reason: "Field is disabled or read-only" });
      continue;
    }
    const existing = context.formTask.proposedValues.find((value) => value.fieldId === field.id);
    const existingCandidate: MappingCandidate[] = existing && !existing.redacted
      ? [{
          source: "existing_task_value" as const,
          sourceReference: { fieldValueId: existing.id },
          value: existing.value,
          score: 1,
          labelScore: 1,
        }]
      : [];
    const candidates: MappingCandidate[] = existingCandidate.length > 0
      ? existingCandidate
      : [
          ...conversationCandidates(conceptForField(field), messages),
          ...matchApprovedMemories(field, context.profileMemory.approvedFacts),
        ];
    const distinct = candidates.filter((candidate, index) =>
      candidates.findIndex((other) => sameValue(other.value, candidate.value)) === index,
    );
    if (distinct.length === 0) {
      results.push({ fieldId: field.id, fieldIdentifier: field.fieldIdentifier, label: field.label, status: "missing", proposedValue: null, confidence: 0, reason: field.required ? "No trusted value is available for this required field" : "No trusted value is available" });
      continue;
    }
    if (distinct.length > 1) {
      results.push(conflictResult(field, distinct));
      continue;
    }
    const candidate = distinct[0];
    const validation = validateFieldValue(field, candidate.value);
    if (!validation.valid) {
      results.push({ fieldId: field.id, fieldIdentifier: field.fieldIdentifier, label: field.label, status: "invalid", proposedValue: null, source: candidate.source, sourceReference: candidate.sourceReference, confidence: 0, reason: validation.reason ?? "Candidate value is invalid" });
      continue;
    }
    const result: FieldMappingResult = {
      fieldId: field.id,
      fieldIdentifier: field.fieldIdentifier,
      label: field.label,
      status: "proposed",
      proposedValue: validation.value,
      source: candidate.source,
      sourceReference: candidate.sourceReference,
      confidence: Math.max(0, Math.min(1, candidate.score)),
      reason: candidate.source === "approved_profile"
        ? "Matched an approved profile memory"
        : candidate.source === "existing_task_value"
          ? "Preserved the existing task-specific value"
          : "Matched an explicit conversation answer",
    };
    if (existing?.approvalStatus === "APPROVED") {
      result.status = "already_approved";
    } else if (!existing) {
      plans.push({
        detectedFieldId: field.id,
        value: result.proposedValue as Prisma.InputJsonValue,
        source: candidate.source === "approved_profile" ? "APPROVED_PROFILE_MEMORY" : "CONVERSATION",
        sourceMemoryId: candidate.sourceReference.memoryId,
        sourceKey: candidate.sourceKey,
        sourceReferenceId: candidate.sourceReference.messageId,
        confidence: result.confidence,
      });
    }
    results.push(result);
  }
  if (plans.length > 0) {
    await persistIntelligentMappings(userId, taskId, context.formTask.version ?? 0, plans);
  }
  return {
    taskId,
    taskVersion: (context.formTask.version ?? 0) + (plans.length > 0 ? 1 : 0),
    mappingVersion: 1,
    results,
    summary: summarizeMappings(results),
  };
}
