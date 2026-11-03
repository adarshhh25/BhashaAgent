import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import { runAgentTurn } from "./agent.service";
import { agentTurnSchema } from "./agent.validator";

export async function turn(request: Request, response: Response, next: NextFunction) {
  try {
    if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const conversationId = z.string().uuid().safeParse(request.params.id);
    if (!conversationId.success) throw new HttpError(400, "VALIDATION_ERROR", "Invalid conversation ID");
    const input = agentTurnSchema.safeParse(request.body);
    if (!input.success) throw new HttpError(400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid request");
    const result = await runAgentTurn({
      userId: request.user.id,
      conversationId: conversationId.data,
      ...input.data,
    });
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
