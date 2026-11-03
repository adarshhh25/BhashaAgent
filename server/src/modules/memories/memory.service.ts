import { Prisma, type MemoryChangeOperation } from "@prisma/client";
import { prisma } from "../../config/database";
import { HttpError } from "../../common/errors";
import type { MemoryCategory, MemoryValue } from "./memory.types";

const memorySelect = {
  id: true,
  category: true,
  key: true,
  value: true,
  dataType: true,
  status: true,
  sourceConversationId: true,
  sourceMessageId: true,
  approvedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const proposalSelect = {
  id: true,
  userId: true,
  conversationId: true,
  sourceMessageId: true,
  existingMemoryId: true,
  operation: true,
  category: true,
  proposedKey: true,
  proposedValue: true,
  previousValue: true,
  status: true,
  rejectionReason: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function verifySource(
  userId: string,
  sourceConversationId?: string,
  sourceMessageId?: string,
): Promise<void> {
  if (!sourceConversationId && !sourceMessageId) return;
  if (!sourceConversationId || !sourceMessageId) {
    throw new HttpError(400, "INVALID_SOURCE", "Source conversation and message must be provided together");
  }
  const message = await prisma.message.findFirst({
    where: {
      id: sourceMessageId,
      conversationId: sourceConversationId,
      conversation: { userId },
    },
    select: { id: true },
  });
  if (!message) throw new HttpError(404, "SOURCE_NOT_FOUND", "Source message not found");
}

function inferDataType(value: MemoryValue): "STRING" | "NUMBER" | "BOOLEAN" | "OBJECT" | "ARRAY" {
  if (typeof value === "string") return "STRING";
  if (typeof value === "number") return "NUMBER";
  if (typeof value === "boolean") return "BOOLEAN";
  return Array.isArray(value) ? "ARRAY" : "OBJECT";
}

async function writeAudit(
  transaction: Prisma.TransactionClient,
  userId: string,
  proposalId: string,
  action: string,
  metadata: Prisma.InputJsonObject,
) {
  await transaction.auditLog.create({
    data: {
      userId,
      action,
      resourceType: "MEMORY_CHANGE_REQUEST",
      resourceId: proposalId,
      metadata,
    },
  });
}

export async function listApprovedMemories(
  userId: string,
  input: { page: number; limit: number; category?: MemoryCategory; key?: string },
) {
  const where = {
    userId,
    isApproved: true,
    status: "APPROVED" as const,
    deletedAt: null,
    ...(input.category ? { category: input.category } : {}),
    ...(input.key ? { key: input.key } : {}),
  };
  const [memories, total] = await prisma.$transaction([
    prisma.profileMemory.findMany({
      where,
      select: memorySelect,
      orderBy: [{ category: "asc" }, { key: "asc" }, { updatedAt: "desc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.profileMemory.count({ where }),
  ]);
  return {
    memories,
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) },
  };
}

export async function getApprovedMemory(userId: string, memoryId: string) {
  return prisma.profileMemory.findFirst({
    where: {
      id: memoryId,
      userId,
      isApproved: true,
      status: "APPROVED",
      deletedAt: null,
    },
    select: memorySelect,
  });
}

export async function listProposals(
  userId: string,
  input: { page: number; limit: number; status?: "PENDING" | "APPROVED" | "REJECTED" },
) {
  const where = { userId, ...(input.status ? { status: input.status } : {}) };
  const [proposals, total] = await prisma.$transaction([
    prisma.memoryChangeRequest.findMany({
      where,
      select: proposalSelect,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.memoryChangeRequest.count({ where }),
  ]);
  return {
    proposals,
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) },
  };
}

export async function createProposal(input: {
  userId: string;
  operation: MemoryChangeOperation;
  category: MemoryCategory;
  key: string;
  proposedValue: MemoryValue;
  sourceConversationId?: string;
  sourceMessageId?: string;
  existingMemoryId?: string;
}) {
  await verifySource(input.userId, input.sourceConversationId, input.sourceMessageId);
  const activeMemory = await prisma.profileMemory.findFirst({
    where: {
      userId: input.userId,
      category: input.category,
      key: input.key,
      isApproved: true,
      status: "APPROVED",
      deletedAt: null,
    },
  });

  if (input.operation === "CREATE" && activeMemory) {
    if (valuesEqual(activeMemory.value, input.proposedValue)) {
      throw new HttpError(409, "MEMORY_ALREADY_EXISTS", "This memory is already approved");
    }
    throw new HttpError(409, "MEMORY_CONFLICT", "An approved memory already exists for this key");
  }
  if (input.operation === "UPDATE" && !input.existingMemoryId) {
    if (!activeMemory) throw new HttpError(404, "MEMORY_NOT_FOUND", "Approved memory not found");
    input.existingMemoryId = activeMemory.id;
  }
  if (input.operation === "UPDATE" && activeMemory && valuesEqual(activeMemory.value, input.proposedValue)) {
    throw new HttpError(409, "MEMORY_UNCHANGED", "The proposed value matches the approved value");
  }
  if (input.operation === "DELETE" && !input.existingMemoryId) {
    if (!activeMemory) throw new HttpError(404, "MEMORY_NOT_FOUND", "Approved memory not found");
    input.existingMemoryId = activeMemory.id;
  }

  const existing = input.existingMemoryId
    ? await prisma.profileMemory.findFirst({
        where: { id: input.existingMemoryId, userId: input.userId, isApproved: true, status: "APPROVED", deletedAt: null },
      })
    : null;
  if ((input.operation === "UPDATE" || input.operation === "DELETE") && !existing) {
    throw new HttpError(404, "MEMORY_NOT_FOUND", "Approved memory not found");
  }
  const pending = await prisma.memoryChangeRequest.findFirst({
    where: {
      userId: input.userId,
      status: "PENDING",
      operation: input.operation,
      proposedKey: input.key,
      category: input.category,
      ...(input.existingMemoryId ? { existingMemoryId: input.existingMemoryId } : {}),
    },
  });
  if (pending) return pending;
  const priorDecision = input.sourceMessageId
    ? await prisma.memoryChangeRequest.findFirst({
        where: {
          userId: input.userId,
          sourceMessageId: input.sourceMessageId,
          operation: input.operation,
          category: input.category,
          proposedKey: input.key,
          status: { in: ["APPROVED", "REJECTED"] },
        },
        orderBy: { createdAt: "desc" },
      })
    : null;
  if (priorDecision) {
    throw new HttpError(
      409,
      "PROPOSAL_ALREADY_REVIEWED",
      "This source message has already been reviewed for this memory",
    );
  }

  return prisma.memoryChangeRequest.create({
    data: {
      userId: input.userId,
      conversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
      existingMemoryId: input.existingMemoryId,
      operation: input.operation,
      category: input.category,
      proposedKey: input.key,
      proposedValue: input.proposedValue,
      previousValue: existing?.value as Prisma.InputJsonValue | undefined,
    },
    select: proposalSelect,
  });
}

export async function approveProposal(userId: string, proposalId: string) {
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.memoryChangeRequest.updateMany({
      where: { id: proposalId, userId, status: "PENDING" },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "PROPOSAL_NOT_PENDING", "Proposal is no longer pending");
    }
    const proposal = await transaction.memoryChangeRequest.findUniqueOrThrow({ where: { id: proposalId } });
    let memory;
    if (proposal.operation === "CREATE") {
      const deleted = await transaction.profileMemory.findFirst({
        where: { userId, category: proposal.category, key: proposal.proposedKey },
      });
      memory = deleted
        ? await transaction.profileMemory.update({
            where: { id: deleted.id },
            data: {
              value: proposal.proposedValue as Prisma.InputJsonValue,
              dataType: inferDataType(proposal.proposedValue as MemoryValue),
              status: "APPROVED",
              isApproved: true,
              deletedAt: null,
              approvedAt: new Date(),
              sourceConversationId: proposal.conversationId,
              sourceMessageId: proposal.sourceMessageId,
            },
            select: memorySelect,
          })
        : await transaction.profileMemory.create({
            data: {
              userId,
              category: proposal.category,
              key: proposal.proposedKey,
              value: proposal.proposedValue as Prisma.InputJsonValue,
              dataType: inferDataType(proposal.proposedValue as MemoryValue),
              isApproved: true,
              approvedAt: new Date(),
              sourceConversationId: proposal.conversationId,
              sourceMessageId: proposal.sourceMessageId,
            },
            select: memorySelect,
          });
    } else if (proposal.existingMemoryId) {
      memory = await transaction.profileMemory.update({
        where: { id: proposal.existingMemoryId },
        data: proposal.operation === "DELETE"
          ? { status: "DELETED", isApproved: false, deletedAt: new Date() }
          : {
              category: proposal.category,
              key: proposal.proposedKey,
              value: proposal.proposedValue as Prisma.InputJsonValue,
              dataType: inferDataType(proposal.proposedValue as MemoryValue),
              isApproved: true,
              status: "APPROVED",
              approvedAt: new Date(),
              sourceConversationId: proposal.conversationId,
              sourceMessageId: proposal.sourceMessageId,
            },
        select: memorySelect,
      });
    }
    await transaction.approval.create({
      data: {
        userId,
        conversationId: proposal.conversationId,
        memoryChangeRequestId: proposal.id,
        approvalType: "PROFILE_MEMORY",
        status: "APPROVED",
        approvedAt: new Date(),
        approvedPayload: { operation: proposal.operation, memoryId: memory?.id },
      },
    });
    await writeAudit(transaction, userId, proposal.id, "MEMORY_PROPOSAL_APPROVED", {
      operation: proposal.operation,
      memoryId: memory?.id ?? null,
    });
    return { proposal, memory };
  });
}

export async function rejectProposal(userId: string, proposalId: string, reason?: string) {
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.memoryChangeRequest.updateMany({
      where: { id: proposalId, userId, status: "PENDING" },
      data: { status: "REJECTED", reviewedAt: new Date(), rejectionReason: reason },
    });
    if (updated.count !== 1) throw new HttpError(409, "PROPOSAL_NOT_PENDING", "Proposal is no longer pending");
    const proposal = await transaction.memoryChangeRequest.findUniqueOrThrow({ where: { id: proposalId }, select: proposalSelect });
    await transaction.approval.create({
      data: {
        userId,
        conversationId: proposal.conversationId,
        memoryChangeRequestId: proposal.id,
        approvalType: "PROFILE_MEMORY",
        status: "REJECTED",
        approvedPayload: { reason: reason ?? null },
      },
    });
    await writeAudit(transaction, userId, proposal.id, "MEMORY_PROPOSAL_REJECTED", { reason: reason ?? null });
    return proposal;
  });
}

export async function getRelevantMemories(input: {
  userId: string;
  categories?: MemoryCategory[];
  keys?: string[];
  query?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  return prisma.profileMemory.findMany({
    where: {
      userId: input.userId,
      isApproved: true,
      status: "APPROVED",
      deletedAt: null,
      ...(input.categories?.length ? { category: { in: input.categories } } : {}),
      ...(input.keys?.length ? { key: { in: input.keys } } : {}),
      ...(input.query ? {
        OR: [
          { key: { contains: input.query, mode: "insensitive" } },
          { category: { contains: input.query, mode: "insensitive" } },
        ],
      } : {}),
    },
    select: memorySelect,
    orderBy: [{ category: "asc" }, { key: "asc" }],
    take: limit,
  });
}
