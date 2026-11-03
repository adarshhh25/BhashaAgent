import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import { buildAgentContext } from "./context.service";
import { buildContextSchema } from "./context.validator";

function identity(request: Request): string {
  if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return request.user.id;
}

export async function build(request: Request, response: Response, next: NextFunction) {
  try {
    const parsed = buildContextSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request");
    }
    const conversationId = z.string().uuid().safeParse(request.params.id);
    if (!conversationId.success) {
      throw new HttpError(400, "VALIDATION_ERROR", "Invalid conversation ID");
    }
    const result = await buildAgentContext({
      userId: identity(request),
      conversationId: conversationId.data,
      ...parsed.data,
    });
    response.json(result);
  } catch (error) {
    next(error);
  }
}
