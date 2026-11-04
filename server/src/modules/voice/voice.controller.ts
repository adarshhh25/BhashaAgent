import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import { issueVoiceTicket } from "./voice.tickets";
import { defaultVoiceSessionRegistry } from "./voice.registry";

const ticketSchema = z.object({
  conversationId: z.string().uuid(),
  formTaskId: z.string().uuid().optional(),
  language: z.string().optional(),
});

export async function createTicket(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const parsed = ticketSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid ticket request");
    response.status(201).json({
      success: true,
      data: {
        voice: await issueVoiceTicket(
          request.user.id,
          parsed.data.conversationId,
          parsed.data.formTaskId,
          parsed.data.language,
        ),
      },
    });
  } catch (error) { next(error); }
}

export async function getSessions(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const diagnostic = defaultVoiceSessionRegistry.getUserDiagnostic(request.user.id);
    response.json({
      success: true,
      data: diagnostic,
    });
  } catch (error) { next(error); }
}
