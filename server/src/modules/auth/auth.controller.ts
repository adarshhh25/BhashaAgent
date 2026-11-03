import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../common/errors";
import { accountDeletionSchema, loginSchema, passwordChangeSchema, profileUpdateSchema, refreshSchema, registerSchema } from "./auth.validator";
import * as authService from "./auth.service";
import * as usersService from "../users/users.service";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, "VALIDATION_ERROR", result.error.issues[0]?.message ?? "Invalid request");
  return result.data;
}

function userId(request: Request): string {
  if (!request.user) throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Authentication is required");
  return request.user.id;
}

export async function register(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await authService.register(parse(registerSchema, request.body));
    response.status(201).json({ success: true, message: "Account created successfully", data: { user } });
  } catch (error) { next(error); }
}

export async function login(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(loginSchema, request.body);
    const result = await authService.login(input.email, input.password);
    response.json({ success: true, message: "Login successful", data: result });
  } catch (error) { next(error); }
}

export async function refresh(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await authService.refresh(parse(refreshSchema, request.body).refreshToken);
    response.json({ success: true, data: result });
  } catch (error) { next(error); }
}

export async function logout(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(refreshSchema, request.body);
    await authService.revokeRefreshToken(input.refreshToken, userId(request));
    response.json({ success: true, message: "Logged out successfully" });
  } catch (error) { next(error); }
}

export async function logoutAll(request: Request, response: Response, next: NextFunction) {
  try {
    await authService.revokeAllRefreshTokens(userId(request));
    response.json({ success: true, message: "All sessions revoked successfully" });
  } catch (error) { next(error); }
}

export async function getMe(request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: { user: await usersService.getUser(userId(request)) } }); }
  catch (error) { next(error); }
}

export async function updateMe(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await usersService.updateUser(userId(request), parse(profileUpdateSchema, request.body));
    response.json({ success: true, data: { user } });
  } catch (error) { next(error); }
}

export async function changePassword(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(passwordChangeSchema, request.body);
    await usersService.changePassword(userId(request), input.currentPassword, input.newPassword);
    response.json({ success: true, message: "Password changed; existing sessions were revoked" });
  } catch (error) { next(error); }
}

export async function deleteMe(request: Request, response: Response, next: NextFunction) {
  try {
    const input = parse(accountDeletionSchema, request.body);
    await usersService.deleteAccount(userId(request), input.currentPassword);
    response.json({ success: true, message: "Account deleted successfully" });
  } catch (error) { next(error); }
}
