import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import { extractCandidatesFromMessage } from "./memory-extraction.service";
import * as memoryService from "./memory.service";
import {
  extractionSchema,
  memoryListSchema,
  memoryUpdateSchema,
  proposalListSchema,
  proposalSchema,
  rejectionSchema,
} from "./memory.validator";
import type { MemoryCategory } from "./memory.types";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "VALIDATION_ERROR", result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

function userId(request: Request): string {
  if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return request.user.id;
}

function uuid(value: unknown): string {
  return parse(z.string().uuid(), value);
}

export async function listMemories(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(memoryListSchema, request.query);
    response.json({
      success: true,
      data: await memoryService.listApprovedMemories(userId(request), input),
    });
  } catch (error) {
    next(error);
  }
}

export async function createProposal(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(proposalSchema, request.body);
    const proposal = await memoryService.createProposal({
      userId: userId(request),
      operation: input.operation,
      category: input.category,
      key: input.key,
      proposedValue: input.proposedValue as Prisma.InputJsonValue,
      sourceConversationId: input.sourceConversationId,
      sourceMessageId: input.sourceMessageId,
      existingMemoryId: input.existingMemoryId,
    });
    response.status(201).json({ success: true, data: { proposal } });
  } catch (error) {
    next(error);
  }
}

export async function listProposals(request: Request, response: Response, next: NextFunction) {
  try {
    response.json({
      success: true,
      data: await memoryService.listProposals(userId(request), parse(proposalListSchema, request.query)),
    });
  } catch (error) {
    next(error);
  }
}

export async function approveProposal(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await memoryService.approveProposal(userId(request), uuid(request.params.id));
    response.json({ success: true, message: "Memory proposal approved", data: result });
  } catch (error) {
    next(error);
  }
}

export async function rejectProposal(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await memoryService.rejectProposal(
      userId(request),
      uuid(request.params.id),
      parse(rejectionSchema, request.body ?? {}).reason,
    );
    response.json({ success: true, message: "Memory proposal rejected", data: { proposal: result } });
  } catch (error) {
    next(error);
  }
}

export async function editMemory(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(memoryUpdateSchema, request.body);
    const memoryId = uuid(request.params.id);
    const existing = await memoryService.getApprovedMemory(userId(request), memoryId);
    if (!existing) {
      throw new HttpError(404, "MEMORY_NOT_FOUND", "Approved memory not found");
    }
    const proposal = await memoryService.createProposal({
      userId: userId(request),
      operation: "UPDATE",
      category: input.category ?? (existing.category as MemoryCategory),
      key: input.key ?? existing.key,
      proposedValue: input.proposedValue as Prisma.InputJsonValue,
      existingMemoryId: memoryId,
    });
    response.status(201).json({ success: true, data: { proposal } });
  } catch (error) {
    next(error);
  }
}

export async function deleteMemory(request: Request, response: Response, next: NextFunction) {
  try {
    const memoryId = uuid(request.params.id);
    const existing = await memoryService.getApprovedMemory(userId(request), memoryId);
    if (!existing) throw new HttpError(404, "MEMORY_NOT_FOUND", "Approved memory not found");
    const proposal = await memoryService.createProposal({
      userId: userId(request),
      operation: "DELETE",
      category: existing.category as MemoryCategory,
      key: existing.key,
      proposedValue: existing.value as Prisma.InputJsonValue,
      existingMemoryId: memoryId,
    });
    response.status(201).json({ success: true, data: { proposal } });
  } catch (error) {
    next(error);
  }
}

export async function extractCandidates(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(extractionSchema, request.body);
    const candidates = await extractCandidatesFromMessage({
      userId: userId(request),
      conversationId: input.conversationId,
      messageId: input.messageId,
    });
    response.json({ success: true, data: { candidates } });
  } catch (error) {
    next(error);
  }
}
