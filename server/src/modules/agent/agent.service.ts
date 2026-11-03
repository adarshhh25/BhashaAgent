import { Prisma } from "@prisma/client";
import { HttpError } from "../../common/errors";
import { createAssistantMessage, createUserMessage, createUserMessageInTransaction } from "../conversations/message.service";
import { prisma } from "../../config/database";
import { buildAgentContext } from "../context/context.service";
import { getLLMProvider } from "../llm/llm.factory";
import { orchestrate } from "./agent.orchestrator";
import type { AgentTurnResult } from "./agent.types";

export async function runAgentTurn(input: {
  userId: string;
  conversationId: string;
  content: string;
  language?: string;
  formTaskId?: string;
}): Promise<AgentTurnResult & { assistantMessageId: string }> {
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
  return { ...result, assistantMessageId: assistant.id };
}

type VoiceTranscriptInput = {
  userId: string;
  conversationId: string;
  voiceSessionId: string;
  providerSegmentId: string;
  content: string;
  language?: string;
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
      WHERE conversation_id = ${input.conversationId}::uuid
        AND role = 'USER'
        AND input_mode = 'VOICE'
        AND metadata @> ${JSON.stringify({ voice: { idempotencyKey: key } })}::jsonb
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (matches[0]) {
      const existing = await transaction.message.findUniqueOrThrow({ where: { id: matches[0].id } });
      const assistantMatches = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "messages"
        WHERE conversation_id = ${input.conversationId}::uuid
          AND role = 'ASSISTANT'
          AND metadata @> ${JSON.stringify({ voice: { idempotencyKey: key } })}::jsonb
        ORDER BY created_at ASC
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

export async function processVoiceTranscript(input: VoiceTranscriptInput): Promise<{ response: string; assistantMessageId: string; reused: boolean }> {
  if (!input.content.trim()) throw new HttpError(400, "INVALID_TRANSCRIPT", "Transcript cannot be empty");
  const claimed = await claimVoiceMessage(input);
  if (claimed.assistant) return { response: claimed.assistant.content, assistantMessageId: claimed.assistant.id, reused: true };
  try {
    const contextResult = await buildAgentContext({
      userId: input.userId,
      conversationId: input.conversationId,
      currentMessage: { messageId: claimed.message.id },
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
    return { response: assistant.content, assistantMessageId: assistant.id, reused: false };
  } catch (error) {
    const current = await prisma.message.findUnique({ where: { id: claimed.message.id } });
    const metadata = current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
      ? current.metadata as Record<string, unknown>
      : {};
    await prisma.message.update({ where: { id: claimed.message.id }, data: { metadata: { ...metadata, voice: { ...(metadata.voice as Record<string, unknown> ?? {}), status: "failed" } } as Prisma.InputJsonValue } });
    throw error;
  }
}
