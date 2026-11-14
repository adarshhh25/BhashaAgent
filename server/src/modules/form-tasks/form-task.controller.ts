import type { NextFunction, Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import * as service from "./form-task.service";
import {
  fieldsSchema, fieldUpdateSchema, mappingSchema, taskCreateSchema, taskIdSchema,
  taskListSchema, transitionSchema, valueSchema, webpageSchema, taskUpdateSchema, failureSchema,
} from "./form-task.validator";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "VALIDATION_ERROR", result.error.issues[0]?.message ?? "Invalid request");
  return result.data;
}
function userId(request: Request) {
  if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return request.user.id;
}
function taskId(request: Request) { return parse(taskIdSchema, request.params.id); }
function fieldId(request: Request) { return parse(taskIdSchema, request.params.fieldId); }

export async function create(request: Request, response: Response, next: NextFunction) {
  try { response.status(201).json({ success: true, data: { task: await service.createTask(userId(request), parse(taskCreateSchema, request.body)) } }); } catch (error) { next(error); }
}
export async function list(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: await service.listTasks(userId(request), parse(taskListSchema, request.query)) }); } catch (error) { next(error); }
}
export async function retrieve(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: await service.getTask(userId(request), taskId(request)) }); } catch (error) { next(error); }
}
export async function update(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(taskUpdateSchema, request.body);
    response.json({ success: true, data: { task: await service.updateTask(userId(request), taskId(request), { ...input, taskMetadata: input.taskMetadata as Prisma.InputJsonObject | undefined }) } });
  } catch (error) { next(error); }
}
export async function webpage(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(webpageSchema, request.body);
    response.json({ success: true, data: { task: await service.updateWebpage(userId(request), taskId(request), { ...input, metadata: input.metadata as Prisma.InputJsonObject | undefined }) } });
  } catch (error) { next(error); }
}
export async function fields(request: Request, response: Response, next: NextFunction) {
  try { response.status(201).json({ success: true, data: { fields: await service.addFields(userId(request), taskId(request), parse(fieldsSchema, request.body).fields as Array<Record<string, unknown>>) } }); } catch (error) { next(error); }
}
export async function fieldList(request: Request, response: Response, next: NextFunction) {
  try {
    await service.getTask(userId(request), taskId(request));
    const fields = await import("../../config/database").then(({ prisma }) => prisma.detectedField.findMany({ where: { formTaskId: taskId(request), status: "ACTIVE" }, include: { fieldValues: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ detectedOrder: "asc" }, { createdAt: "asc" }] }));
    response.json({ success: true, data: { fields } });
  } catch (error) { next(error); }
}
export async function fieldUpdate(request: Request, response: Response, next: NextFunction) {
  try {
    const { prisma } = await import("../../config/database");
    const id = taskId(request);
    await service.getTask(userId(request), id);
    const field = await prisma.detectedField.findFirst({ where: { id: fieldId(request), formTaskId: id } });
    if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "Field not found");
    const input = parse(fieldUpdateSchema, request.body);
    const { currentValue, ...fieldScalars } = input as Record<string, unknown>;
    const updated = await prisma.detectedField.update({
      where: { id: field.id },
      data: {
        ...fieldScalars,
        options: fieldScalars.options as Prisma.InputJsonValue | undefined,
        fieldMetadata: fieldScalars.fieldMetadata as Prisma.InputJsonValue | undefined,
      },
    });
    if (currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== "") {
      await service.setFieldValue(userId(request), id, field.id, {
        value: currentValue as Prisma.InputJsonValue,
        source: "USER_PROVIDED",
      });
    }
    response.json({ success: true, data: { field: updated } });
  } catch (error) { next(error); }
}
export async function fieldRemove(request: Request, response: Response, next: NextFunction) {
  try {
    const { prisma } = await import("../../config/database");
    const id = taskId(request);
    await service.getTask(userId(request), id);
    const field = await prisma.detectedField.findFirst({ where: { id: fieldId(request), formTaskId: id } });
    if (!field) throw new HttpError(404, "FIELD_NOT_FOUND", "Field not found");
    response.json({ success: true, data: { field: await prisma.detectedField.update({ where: { id: field.id }, data: { status: "REMOVED" } }) } });
  } catch (error) { next(error); }
}
export async function value(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(valueSchema, request.body);
    response.status(201).json({ success: true, data: { value: await service.setFieldValue(userId(request), taskId(request), fieldId(request), { ...input, value: input.value as Prisma.InputJsonValue, confidence: input.confidence }) } });
  } catch (error) { next(error); }
}
export async function currentValue(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { value: await service.getCurrentFieldValue(userId(request), taskId(request), fieldId(request)) } }); } catch (error) { next(error); }
}
export async function correctValue(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(valueSchema, request.body);
    response.status(201).json({ success: true, data: { value: await service.setFieldValue(userId(request), taskId(request), fieldId(request), { ...input, source: "USER_CORRECTED", value: input.value as Prisma.InputJsonValue }) } });
  } catch (error) { next(error); }
}
export async function approveValue(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { value: await service.approveField(userId(request), taskId(request), fieldId(request), true) } }); } catch (error) { next(error); }
}
export async function rejectValue(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { value: await service.approveField(userId(request), taskId(request), fieldId(request), false) } }); } catch (error) { next(error); }
}
export async function missing(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: await service.getMissingInformation(userId(request), taskId(request)) }); } catch (error) { next(error); }
}
export async function transition(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(transitionSchema, request.body ?? {});
    const action = request.path.split("/").pop();
    const nextStatus = action === "pause" ? "PAUSED" : action === "resume" ? "REVIEW" : "CANCELLED";
    response.json({ success: true, data: { task: await service.transitionTask(userId(request), taskId(request), nextStatus, input.expectedVersion) } });
  } catch (error) { next(error); }
}
export async function review(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: await service.reviewTask(userId(request), taskId(request)) }); } catch (error) { next(error); }
}
export async function finalApprove(request: Request, response: Response, next: NextFunction) {
  try {
    const input = z.object({ expectedVersion: z.number().int().positive() }).strict().parse(request.body);
    response.json({ success: true, data: { approval: await service.finalApprove(userId(request), taskId(request), input.expectedVersion) } });
  } catch (error) { next(error); }
}
export async function history(request: Request, response: Response, next: NextFunction) {
  try {
    const input = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    response.json({ success: true, data: await service.listHistory(userId(request), taskId(request), input.page, input.limit) });
  } catch (error) { next(error); }
}
export async function mapping(request: Request, response: Response, next: NextFunction) {
  try { response.status(201).json({ success: true, data: { mapping: await service.mapField(userId(request), taskId(request), parse(mappingSchema, request.body)) } }); } catch (error) { next(error); }
}
export async function mappings(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { mappings: await service.listMappings(userId(request), taskId(request)) } }); } catch (error) { next(error); }
}
export async function remove(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { task: await service.deleteTask(userId(request), taskId(request)) } }); } catch (error) { next(error); }
}
export async function fail(request: Request, response: Response, next: NextFunction) {
  try { const input = parse(failureSchema, request.body); response.json({ success: true, data: { task: await service.failTask(userId(request), taskId(request), input.code, input.message) } }); } catch (error) { next(error); }
}
export async function retry(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { task: await service.retryTask(userId(request), taskId(request)) } }); } catch (error) { next(error); }
}
