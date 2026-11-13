import { Prisma, type MessageInputMode } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../config/database";
import { HttpError } from "../../common/errors";
import { assertConversationWritable } from "./conversation.service";
import { sanitizeResponseText } from "../agent/agent.validator";

const messageSelect = {
  id: true,
  conversationId: true,
  role: true,
  content: true,
  inputMode: true,
  language: true,
  metadata: true,
  createdAt: true,
  revisions: {
    select: { id: true, previousContent: true, revisionNumber: true, revisedAt: true },
    orderBy: { revisionNumber: "asc" as const },
  },
} as const;

async function ownedWritableConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  assertConversationWritable(conversation.status);
  return conversation;
}

export async function createUserMessageInTransaction(
  transaction: Prisma.TransactionClient,
  input: {
    userId: string;
    conversationId: string;
    content: string;
    inputMode: MessageInputMode;
    language?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  const conversation = await transaction.conversation.findFirst({
    where: { id: input.conversationId, userId: input.userId },
  });
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  assertConversationWritable(conversation.status);
  const message = await transaction.message.create({
    data: {
      conversationId: input.conversationId,
      role: "USER",
      content: input.content,
      inputMode: input.inputMode,
      language: input.language,
      metadata: input.metadata,
    },
    select: messageSelect,
  });
  await transaction.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
}

export async function createUserMessage(input: {
  userId: string;
  conversationId: string;
  content: string;
  inputMode: MessageInputMode;
  language?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (transaction) => {
    return createUserMessageInTransaction(transaction, input);
  });
}

export async function createAssistantMessage(input: {
  conversationId: string;
  content: string;
  inputMode?: MessageInputMode;
  language?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const conversation = await prisma.conversation.findUnique({ where: { id: input.conversationId } });
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  assertConversationWritable(conversation.status);
  const cleanContent = sanitizeResponseText(input.content, input.language || "en");
  return prisma.$transaction(async (transaction) => {
    const message = await transaction.message.create({
      data: {
        conversationId: input.conversationId,
        role: "ASSISTANT",
        content: cleanContent,
        inputMode: input.inputMode ?? "TEXT",
        language: input.language,
        metadata: input.metadata,
      },
      select: messageSelect,
    });
    await transaction.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    return message;
  });
}

export async function listMessages(
  userId: string,
  conversationId: string,
  input: { page: number; limit: number; order: "asc" | "desc"; beforeMessageId?: string },
) {
  await ownedWritableConversation(userId, conversationId).catch(async (error) => {
    if (error instanceof HttpError && error.statusCode === 410) {
      const deleted = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
      if (deleted) throw error;
    }
    throw error;
  });
  const where: Prisma.MessageWhereInput = { conversationId };
  if (input.beforeMessageId) {
    const cursor = await prisma.message.findFirst({
      where: { id: input.beforeMessageId, conversationId },
      select: { createdAt: true, id: true },
    });
    if (!cursor) throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message not found");
    where.OR = input.order === "asc"
      ? [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }]
      : [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }];
  }
  const messages = await prisma.message.findMany({
    where,
    select: messageSelect,
    orderBy: [{ createdAt: input.order }, { id: input.order }],
    skip: input.beforeMessageId ? 0 : (input.page - 1) * input.limit,
    take: input.limit,
  });
  const total = await prisma.message.count({ where: { conversationId } });
  return {
    messages,
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) },
  };
}

export async function correctUserMessage(
  userId: string,
  conversationId: string,
  messageId: string,
  content: string,
) {
  await ownedWritableConversation(userId, conversationId);
  return prisma.$transaction(async (transaction) => {
    const message = await transaction.message.findFirst({ where: { id: messageId, conversationId } });
    if (!message) throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message not found");
    if (message.role !== "USER") {
      throw new HttpError(400, "MESSAGE_NOT_EDITABLE", "Only user messages can be corrected");
    }
    const revisionCount = await transaction.messageRevision.count({ where: { messageId } });
    await transaction.messageRevision.create({
      data: {
        id: randomUUID(),
        messageId,
        previousContent: message.content,
        revisionNumber: revisionCount + 1,
      },
    });
    return transaction.message.update({
      where: { id: messageId },
      data: { content },
      select: messageSelect,
    });
  });
}
