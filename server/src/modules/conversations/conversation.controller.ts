import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import * as conversationService from "./conversation.service";
import * as messageService from "./message.service";
import { getConversationContext } from "./context.service";
import {
  conversationIdSchema,
  correctionSchema,
  createConversationSchema,
  createMessageSchema,
  paginationSchema,
  updateConversationSchema,
} from "./conversation.validator";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "VALIDATION_ERROR", result.error.issues[0]?.message ?? "Invalid request");
  return result.data;
}
function identity(request: Request): string {
  if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return request.user.id;
}
function id(request: Request): string {
  return parse(conversationIdSchema, request.params.id);
}

export async function create(request: Request, response: Response, next: NextFunction) {
  try { response.status(201).json({ success: true, message: "Conversation created successfully", data: { conversation: await conversationService.createConversation(identity(request), parse(createConversationSchema, request.body).title) } }); }
  catch (error) { next(error); }
}
export async function list(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: await conversationService.listConversations(identity(request), parse(paginationSchema, request.query)) }); }
  catch (error) { next(error); }
}
export async function retrieve(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { conversation: await conversationService.getOwnedConversation(identity(request), id(request)) } }); }
  catch (error) { next(error); }
}
export async function update(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { conversation: await conversationService.updateConversation(identity(request), id(request), parse(updateConversationSchema, request.body)) } }); }
  catch (error) { next(error); }
}
export async function remove(request: Request, response: Response, next: NextFunction) {
  try { await conversationService.deleteConversation(identity(request), id(request)); response.json({ success: true, message: "Conversation deleted successfully" }); }
  catch (error) { next(error); }
}
export async function createMessage(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(createMessageSchema, request.body);
    const message = await messageService.createUserMessage({
      userId: identity(request),
      conversationId: id(request),
      content: input.content,
      inputMode: input.inputMode,
      language: input.language,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    });
    response.status(201).json({ success: true, data: { message } });
  } catch (error) { next(error); }
}
export async function messages(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: await messageService.listMessages(identity(request), id(request), parse(paginationSchema, request.query)) }); }
  catch (error) { next(error); }
}
export async function correctMessage(request: Request, response: Response, next: NextFunction) {
  try {
    const messageId = parse(conversationIdSchema, request.params.messageId);
    const message = await messageService.correctUserMessage(identity(request), id(request), messageId, parse(correctionSchema, request.body).content);
    response.json({ success: true, data: { message } });
  } catch (error) { next(error); }
}

export { getConversationContext };
