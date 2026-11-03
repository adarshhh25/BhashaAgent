import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../../common/errors";
import { intelligentMappingRequestSchema } from "./form-intelligence.schemas";
import { runIntelligentMapping } from "./form-intelligence.service";

export async function intelligentMapping(request: Request, response: Response, next: NextFunction) {
  try {
    if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
    const taskId = typeof request.params.id === "string" ? request.params.id : undefined;
    if (!taskId) throw new HttpError(400, "VALIDATION_ERROR", "Form task id is required");
    const parsed = intelligentMappingRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request");
    response.status(200).json({ success: true, data: await runIntelligentMapping(request.user.id, taskId, parsed.data.expectedVersion) });
  } catch (error) {
    next(error);
  }
}
