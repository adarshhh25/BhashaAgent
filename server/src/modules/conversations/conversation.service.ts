import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { HttpError } from "../../common/errors";

const conversationSelect = {
  id: true,
  title: true,
  status: true,
  summary: true,
  startedAt: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: { select: { messages: true } },
} as const;

function assertConversationWritable(status: string): void {
  if (status === "DELETED") {
    throw new HttpError(410, "CONVERSATION_DELETED", "Deleted conversations cannot be modified");
  }
}

export function createConversation(userId: string, title?: string) {
  return prisma.conversation.create({
    data: { userId, title: title ?? "New Conversation" },
    select: conversationSelect,
  });
}

export async function listConversations(
  userId: string,
  input: { page: number; limit: number; status?: "ACTIVE" | "ARCHIVED" | "DELETED"; search?: string },
) {
  const where: Prisma.ConversationWhereInput = {
    userId,
    ...(input.status ? { status: input.status } : { status: { not: "DELETED" as const } }),
  };
  if (input.search && input.search.trim().length > 0) {
    where.title = { contains: input.search.trim(), mode: "insensitive" };
  }
  const [conversations, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where,
      select: conversationSelect,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.conversation.count({ where }),
  ]);
  const hasMore = input.page * input.limit < total;
  return {
    conversations,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
      hasMore,
      nextPage: hasMore ? input.page + 1 : null,
    },
  };
}

export async function getOwnedConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: conversationSelect,
  });
  if (!conversation) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  if (conversation.status === "DELETED") {
    throw new HttpError(410, "CONVERSATION_DELETED", "Conversation has been deleted");
  }
  return conversation;
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  data: { title?: string; status?: "ACTIVE" | "ARCHIVED" },
) {
  const existing = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!existing) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  assertConversationWritable(existing.status);
  return prisma.conversation.update({
    where: { id: conversationId },
    data,
    select: conversationSelect,
  });
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const existing = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!existing) throw new HttpError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "DELETED", deletedAt: new Date() },
  });
}

export { assertConversationWritable };
