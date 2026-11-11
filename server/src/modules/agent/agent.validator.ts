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
  let parsed = value;
  if (typeof parsed === "string") {
    let clean = parsed.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    parsed = JSON.parse(clean);
  }

  // Normalize structure for schema robustness
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, any>;
    if (p.intent && typeof p.intent === "object") {
      if (!agentIntents.includes(p.intent.primary)) {
        p.intent.primary = "GENERAL_QUESTION";
      }
      if (!Array.isArray(p.intent.secondary)) {
        p.intent.secondary = [];
      } else {
        p.intent.secondary = p.intent.secondary.filter((s: string) => agentIntents.includes(s as any));
      }
      if (typeof p.intent.confidence !== "number" || Number.isNaN(p.intent.confidence)) {
        p.intent.confidence = 0.9;
      }
    }
    if (p.decision && typeof p.decision === "object") {
      if (!["respond", "clarify", "tool"].includes(p.decision.type)) {
        p.decision.type = "respond";
      }
    }
    if (!Array.isArray(p.toolCalls)) {
      p.toolCalls = [];
    }
    if (!p.language || typeof p.language !== "object") {
      p.language = { detected: "en", responseLanguage: "en" };
    }
    // Safeguard: unwrap nested JSON in responseDraft so raw JSON never leaks into the user chat UI
    if (typeof p.responseDraft === "string" && p.responseDraft.trim().startsWith("{")) {
      try {
        const nested = JSON.parse(p.responseDraft.trim());
        if (nested.responseDraft && typeof nested.responseDraft === "string") {
          p.responseDraft = nested.responseDraft;
        }
      } catch {
        const match = p.responseDraft.match(/"responseDraft"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
        if (match && match[1]) {
          p.responseDraft = match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
      }
    }
  }

  return outputSchema.parse(parsed);
}
