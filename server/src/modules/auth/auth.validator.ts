import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password.service";

const password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const email = z.string().trim().email().max(320).transform((value) => value.toLowerCase());

export const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email,
  password,
  preferredLanguage: z.string().trim().min(1).max(20).optional(),
}).strict();

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
}).strict();

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(256),
}).strict();

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  preferredLanguage: z.string().trim().min(1).max(20).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one profile field is required",
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: password,
}).strict();

export const accountDeletionSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  confirmation: z.literal("DELETE"),
}).strict();
