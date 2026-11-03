import { HttpError } from "../../common/errors";
import { prisma } from "../../config/database";

export async function getConversationContext(input: {
  conversationId: string;
  userId: string;
  limit?: number;
  beforeMessageId?: string;
}) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, userId: input.userId, status: { not: "DELETED" } },
    select: { id: true },
  });
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  const cursor = input.beforeMessageId
    ? await prisma.message.findFirst({
        where: { id: input.beforeMessageId, conversationId: input.conversationId },
        select: { createdAt: true, id: true },
      })
    : null;
  if (input.beforeMessageId && !cursor) throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message not found");
  const messages = await prisma.message.findMany({
    where: {
      conversationId: input.conversationId,
      ...(cursor ? {
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      } : {}),
    },
    select: {
      id: true, role: true, content: true, inputMode: true, language: true, metadata: true, createdAt: true,
      revisions: { select: { id: true, revisedAt: true, revisionNumber: true }, orderBy: { revisionNumber: "asc" } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return messages.reverse();
}

export async function getOwnedMessage(input: {
  conversationId: string;
  userId: string;
  messageId: string;
}) {
  const message = await prisma.message.findFirst({
    where: {
      id: input.messageId,
      conversationId: input.conversationId,
      conversation: { userId: input.userId, status: { not: "DELETED" } },
    },
    select: {
      id: true, role: true, content: true, inputMode: true, language: true, createdAt: true,
      revisions: { select: { id: true, revisedAt: true, revisionNumber: true }, orderBy: { revisionNumber: "asc" } },
    },
  });
  if (!message) throw new HttpError(404, "MESSAGE_NOT_FOUND", "Message not found");
  return message;
}
