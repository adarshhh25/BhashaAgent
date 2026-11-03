import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import { issueVoiceTicket } from "./voice.tickets";

const ticketSchema = z.object({ conversationId: z.string().uuid() });

export async function createTicket(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const parsed = ticketSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "conversationId must be a UUID");
    response.status(201).json({ success: true, data: { voice: await issueVoiceTicket(request.user.id, parsed.data.conversationId) } });
  } catch (error) { next(error); }
}
