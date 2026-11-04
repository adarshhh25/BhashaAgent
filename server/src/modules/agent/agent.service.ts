import { Prisma } from "@prisma/client";
import { HttpError } from "../../common/errors";
import { createAssistantMessage, createUserMessage, createUserMessageInTransaction } from "../conversations/message.service";
import { prisma } from "../../config/database";
import { buildAgentContext } from "../context/context.service";
import { getLLMProvider } from "../llm/llm.factory";
import { orchestrate } from "./agent.orchestrator";
import type { AgentTurnResult } from "./agent.types";

export interface FormBrowserAction {
  actionType: "SET_VALUE" | "SELECT_OPTION" | "CHECK" | "UNCHECK";
  fieldIdentifier: string;
  fieldId?: string;
  value: string | number | boolean | Array<string | number | boolean>;
  label?: string;
}

function actionTypeForInput(inputType: string, value: unknown): "SET_VALUE" | "SELECT_OPTION" | "CHECK" | "UNCHECK" {
  const type = (inputType || "").toLowerCase();
  if (type === "checkbox") return value === true || value === "true" || value === 1 ? "CHECK" : "UNCHECK";
  if (type === "select" || type === "radio") return "SELECT_OPTION";
  return "SET_VALUE";
}

function extractFormActions(toolResults: AgentTurnResult["toolResults"]): FormBrowserAction[] {
  const actions: FormBrowserAction[] = [];
  for (const tr of toolResults) {
    if (!tr.success || !tr.data || typeof tr.data !== "object") continue;
    const data = tr.data as Record<string, unknown>;

    if (tr.name === "propose_field_value") {
      if (data.fieldIdentifier) {
        actions.push({
          actionType: actionTypeForInput(String(data.inputType || ""), data.value),
          fieldIdentifier: String(data.fieldIdentifier),
          fieldId: data.fieldId ? String(data.fieldId) : undefined,
          value: data.value as never,
          label: data.label ? String(data.label) : undefined,
        });
      } else if (Array.isArray(data.results)) {
        for (const item of data.results as Array<Record<string, unknown>>) {
          if (item.fieldIdentifier) {
            actions.push({
              actionType: actionTypeForInput(String(item.inputType || ""), item.value),
              fieldIdentifier: String(item.fieldIdentifier),
              fieldId: item.fieldId ? String(item.fieldId) : undefined,
              value: item.value as never,
              label: item.label ? String(item.label) : undefined,
            });
          }
        }
      }
    }
  }
  return actions;
}

export async function runAgentTurn(input: {
  userId: string;
  conversationId: string;
  content: string;
  language?: string;
  formTaskId?: string;
}): Promise<AgentTurnResult & { assistantMessageId: string; formActions?: FormBrowserAction[] }> {
  const message = await createUserMessage({
    userId: input.userId,
    conversationId: input.conversationId,
    content: input.content,
    inputMode: "TEXT",
    language: input.language,
  });
  const contextResult = await buildAgentContext({
    userId: input.userId,
    conversationId: input.conversationId,
    currentMessage: { messageId: message.id },
    formTaskId: input.formTaskId,
  });
  const result = await orchestrate(input.userId, contextResult.context, getLLMProvider());
  if (!result.response.trim()) throw new HttpError(502, "EMPTY_AGENT_RESPONSE", "The assistant returned an empty response");
  const assistant = await createAssistantMessage({
    conversationId: input.conversationId,
    content: result.response,
    inputMode: "VOICE",
    language: input.language,
    metadata: { intent: result.intent.primary, decision: result.decision.type },
  });
  const formActions = extractFormActions(result.toolResults);
  return { ...result, assistantMessageId: assistant.id, formActions: formActions.length > 0 ? formActions : undefined };
}

export type VoiceTranscriptInput = {
  userId: string;
  conversationId: string;
  voiceSessionId: string;
  providerSegmentId: string;
  content: string;
  language?: string;
  formTaskId?: string;
};

function voiceIdempotencyKey(input: VoiceTranscriptInput): string {
  return `${input.userId}:${input.conversationId}:${input.voiceSessionId}:${input.providerSegmentId}`;
}

async function claimVoiceMessage(input: VoiceTranscriptInput) {
  const key = voiceIdempotencyKey(input);
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const matches = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "messages"
      WHERE metadata->'voice'->>'idempotencyKey' = ${key}
      LIMIT 1
    `;
    if (matches[0]) {
      const existing = await transaction.message.findUniqueOrThrow({ where: { id: matches[0].id } });
      const assistantMatches = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "messages"
        WHERE metadata->'voice'->>'idempotencyKey' = ${key}
          AND role = 'ASSISTANT'
        LIMIT 1
      `;
      if (assistantMatches[0]) {
        const assistant = await transaction.message.findUniqueOrThrow({ where: { id: assistantMatches[0].id } });
        return { key, message: existing, assistant, reused: true };
      }
      const metadata = (existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata))
        ? existing.metadata as Record<string, unknown>
        : {};
      if (metadata.voice && typeof metadata.voice === "object" && (metadata.voice as Record<string, unknown>).status === "processing") {
        throw new HttpError(409, "VOICE_TURN_IN_PROGRESS", "This voice segment is already being processed");
      }
      const updated = await transaction.message.update({
        where: { id: existing.id },
        data: { metadata: { ...metadata, voice: { ...(metadata.voice as Record<string, unknown> ?? {}), status: "processing" } } as Prisma.InputJsonValue },
      });
      return { key, message: updated, assistant: null, reused: false };
    }
    const message = await createUserMessageInTransaction(transaction, {
      userId: input.userId,
      conversationId: input.conversationId,
      content: input.content,
      inputMode: "VOICE",
      language: input.language,
      metadata: {
        source: "voice",
        voice: {
          idempotencyKey: key,
          sessionId: input.voiceSessionId,
          provider: "gnani",
          providerSegmentId: input.providerSegmentId,
          status: "processing",
        },
      },
    });
    return { key, message, assistant: null, reused: false };
  });
}

export async function processVoiceTranscript(input: VoiceTranscriptInput): Promise<{ response: string; assistantMessageId: string; reused: boolean; formActions?: FormBrowserAction[] }> {
  if (!input.content.trim()) throw new HttpError(400, "INVALID_TRANSCRIPT", "Transcript cannot be empty");
  const claimed = await claimVoiceMessage(input);
  if (claimed.assistant) return { response: claimed.assistant.content, assistantMessageId: claimed.assistant.id, reused: true };
  try {
    const contextResult = await buildAgentContext({
      userId: input.userId,
      conversationId: input.conversationId,
      currentMessage: { messageId: claimed.message.id },
      formTaskId: input.formTaskId,
    });
    const result = await orchestrate(input.userId, contextResult.context, getLLMProvider());
    if (!result.response.trim()) throw new HttpError(502, "EMPTY_AGENT_RESPONSE", "The assistant returned an empty response");
    const assistant = await createAssistantMessage({
      conversationId: input.conversationId,
      content: result.response,
      language: input.language,
      metadata: { intent: result.intent.primary, decision: result.decision.type, source: "voice", voice: { idempotencyKey: claimed.key, userMessageId: claimed.message.id } },
    });
    await prisma.message.update({
      where: { id: claimed.message.id },
      data: { metadata: { source: "voice", voice: { idempotencyKey: claimed.key, sessionId: input.voiceSessionId, provider: "gnani", providerSegmentId: input.providerSegmentId, status: "completed" } } },
    });
    const formActions = extractFormActions(result.toolResults);
    return { response: assistant.content, assistantMessageId: assistant.id, reused: false, formActions: formActions.length > 0 ? formActions : undefined };
  } catch (error) {
    const current = await prisma.message.findUnique({ where: { id: claimed.message.id } });
    const metadata = current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? current.metadata as Record<string, unknown>
      : {};
    await prisma.message.update({ where: { id: claimed.message.id }, data: { metadata: { ...metadata, voice: { ...(metadata.voice as Record<string, unknown> ?? {}), status: "failed" } } as Prisma.InputJsonValue } });
    throw error;
  }
}
