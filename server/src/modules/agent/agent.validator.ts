import { z } from "zod";
import { agentIntents } from "./agent.types";

export const agentTurnSchema = z.object({
  content: z.string().trim().min(1).max(32_000),
  language: z.string().trim().max(20).optional(),
  formTaskId: z.string().uuid().optional(),
}).strict();

const outputSchema = z.object({
  intent: z.object({
    primary: z.enum(agentIntents),
    secondary: z.array(z.enum(agentIntents)).max(4).default([]),
    confidence: z.number().min(0).max(1),
  }).strict(),
  language: z.object({
    detected: z.string().trim().min(1).max(20),
    responseLanguage: z.string().trim().min(1).max(20),
  }).strict(),
  decision: z.object({
    type: z.enum(["respond", "clarify", "tool"]),
    reason: z.string().max(500).optional(),
  }).strict(),
  toolCalls: z.array(z.object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(100),
    arguments: z.record(z.string(), z.unknown()),
  }).strict()).max(4),
  clarification: z.object({
    required: z.boolean(),
    question: z.string().max(1000).optional(),
  }).strict().optional(),
  responseDraft: z.string().max(4000).optional(),
}).strict();

export function parseAgentOutput(value: unknown) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return outputSchema.parse(parsed);
}
