import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import { acknowledgementSchema, cancellationSchema, fillInstructionSchema, registrationSchema, retrySchema } from "./browser.protocol";
import * as service from "./browser.service";
import { runIntelligentMapping } from "../form-intelligence/form-intelligence.service";

function userId(request: Request) {
  if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return request.user.id;
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid request");
  return parsed.data;
}
function id(request: Request, key: string) {
  return parse(z.string().uuid(), request.params[key]);
}
function run(action: (request: Request) => Promise<unknown>, request: Request, response: Response, next: NextFunction, statusCode = 200) {
  action(request).then((data) => response.status(statusCode).json({ success: true, data })).catch(next);
}
export function register(request: Request, response: Response, next: NextFunction) {
  run(async (req) => { const input = parse(registrationSchema, req.body); return { pageSession: await service.registerPage(userId(req), input.taskId, input.payload.pageContext, input.payload.fields, input.idempotencyKey) }; }, request, response, next, 201);
}
export function issue(request: Request, response: Response, next: NextFunction) {
  run(async (req) => { const input = parse(fillInstructionSchema, req.body); return { execution: await service.issueInstructions(userId(req), input.taskId, input.pageSessionId, input.idempotencyKey) }; }, request, response, next, 201);
}
export function mappings(request: Request, response: Response, next: NextFunction) {
  run(async (req) => ({ mappings: await runIntelligentMapping(userId(req), id(req, "taskId")) }), request, response, next);
}
export function acknowledge(request: Request, response: Response, next: NextFunction) {
  run(async (req) => { const input = parse(acknowledgementSchema, req.body); return { execution: await service.acknowledge(userId(req), input) }; }, request, response, next);
}
export function retry(request: Request, response: Response, next: NextFunction) {
  run(async (req) => { const input = parse(retrySchema, req.body); return { execution: await service.retry(userId(req), input.taskId, id(req, "executionId"), input.idempotencyKey, input.pageSessionId, input.protocolVersion, input.actionIds) }; }, request, response, next);
}
export function cancel(request: Request, response: Response, next: NextFunction) {
  run(async (req) => { const input = parse(cancellationSchema, req.body); return { execution: await service.cancel(userId(req), input.taskId, id(req, "executionId")) }; }, request, response, next);
}
export function status(request: Request, response: Response, next: NextFunction) {
  run(async (req) => ({ execution: await service.status(userId(req), id(req, "executionId")) }), request, response, next);
}
