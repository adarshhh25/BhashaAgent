import { z } from "zod";
import { agentIntents, type AgentLLMOutput } from "./agent.types";

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

export function sanitizeResponseText(text: string, lang: string = "en"): string {
  let clean = (text || "").trim();
  if (!clean) {
    if (lang === "hi") {
      return "मैंने आपका फ़ॉर्म देख लिया है। कृपया बताइए कि आप कौन सा विवरण भरना चाहते हैं?";
    } else if (lang === "mr") {
      return "मी तुमचा फॉर्म पाहिला आहे. कृपया सांगा की तुम्हाला कोणता तपशील भरायचा आहे?";
    } else if (lang === "hinglish") {
      return "Maine aapka form dekh liya hai. Aap kaunsa detail pehle bharna chahte hain?";
    } else {
      return "I can see your form. Which detail would you like me to help you fill first?";
    }
  }

  if (clean.startsWith("```")) {
    clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    try {
      const unquoted = JSON.parse(clean);
      if (typeof unquoted === "string") {
        clean = unquoted.trim();
      }
    } catch {
      clean = clean.slice(1, -1).trim();
    }
  }
  if (clean.includes('"responseDraft"')) {
    const match = clean.match(/"responseDraft"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
    if (match && match[1]) {
      const extracted = match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
      if (extracted && !extracted.includes('"intent"') && !extracted.startsWith("{")) {
        return extracted;
      }
    }
  }
  if (clean.includes('"question"')) {
    const match = clean.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
    if (match && match[1]) {
      const extracted = match[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
      if (extracted && !extracted.includes('"intent"') && !extracted.startsWith("{")) {
        return extracted;
      }
    }
  }

  // If the text looks like raw JSON / schema output
  const looksLikeSchema = clean.includes('"intent"') || clean.includes('"primary"') || clean.includes('"decision"') || clean.includes('"toolCalls"') || clean.includes('"responseDraft"') || clean.includes('"clarification"');
  if (clean.startsWith("{") || looksLikeSchema) {
    try {
      const parsed = JSON.parse(clean);
      if (typeof parsed === "object" && parsed !== null) {
        if (parsed.responseDraft && typeof parsed.responseDraft === "string") {
          return sanitizeResponseText(parsed.responseDraft, lang);
        }
        if (parsed.clarification?.question && typeof parsed.clarification.question === "string") {
          return sanitizeResponseText(parsed.clarification.question, lang);
        }
        if (looksLikeSchema) {
          if (lang === "hi") {
            return "मैंने आपका फ़ॉर्म देख लिया है। कृपया बताइए कि आप कौन सा विवरण भरना चाहते हैं?";
          } else if (lang === "mr") {
            return "मी तुमचा फॉर्म पाहिला आहे. कृपया सांगा की तुम्हाला कोणता तपशील भरायचा आहे?";
          } else if (lang === "hinglish") {
            return "Maine aapka form dekh liya hai. Aap kaunsa detail pehle bharna chahte hain?";
          } else {
            return "I can see your form. Which detail would you like me to help you fill first?";
          }
        }
      }
    } catch {
      // Truncated or malformed JSON - try regex extraction before falling back
      const draftMatch = clean.match(/"responseDraft"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
      if (draftMatch && draftMatch[1]) {
        const extracted = draftMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
        if (extracted && !extracted.includes('"intent"') && !extracted.startsWith("{")) {
          return extracted;
        }
      }
      const questionMatch = clean.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
      if (questionMatch && questionMatch[1]) {
        const extracted = questionMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
        if (extracted && !extracted.includes('"intent"') && !extracted.startsWith("{")) {
          return extracted;
        }
      }
      if (looksLikeSchema) {
        if (lang === "hi") {
          return "मैंने आपका फ़ॉर्म देख लिया है। कृपया बताइए कि आप कौन सा विवरण भरना चाहते हैं?";
        } else if (lang === "mr") {
          return "मी तुमचा फॉर्म पाहिला आहे. कृपया सांगा की तुम्हाला कोणता तपशील भरायचा आहे?";
        } else if (lang === "hinglish") {
          return "Maine aapka form dekh liya hai. Aap kaunsa detail pehle bharna chahte hain?";
        } else {
          return "I can see your form. Which detail would you like me to help you fill first?";
        }
      }
    }
  }
  return clean;
}

export function parseAgentOutput(value: unknown, expectedLang?: string) {
  let parsed = value;
  let parseSuccess = false;
  let requiredRepair = false;

  if (typeof parsed === "string") {
    let clean = parsed.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(clean.slice(firstBrace, lastBrace + 1));
        parseSuccess = true;
      } catch {
        // Continue to fallback parse
      }
    }
    if (!parseSuccess) {
      try {
        parsed = JSON.parse(clean);
        parseSuccess = true;
      } catch (jsonErr) {
        // Robust recovery ONLY if clean was an attempted JSON/schema object that got truncated
        if (clean.startsWith("{") || clean.includes('"intent"') || clean.includes('"primary"') || clean.includes('"responseDraft"')) {
          requiredRepair = true;
          const draftMatch = clean.match(/"responseDraft"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
          const questionMatch = clean.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
          const fallbackDraft = draftMatch?.[1]?.replace(/\\n/g, "\n")?.replace(/\\"/g, '"')
            || questionMatch?.[1]?.replace(/\\n/g, "\n")?.replace(/\\"/g, '"')
            || "";
          parsed = {
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
            language: { detected: expectedLang || "en", responseLanguage: expectedLang || "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: sanitizeResponseText(fallbackDraft, expectedLang || "en"),
          };
        } else {
          throw jsonErr;
        }
      }
    }
  }

  // Check if original parsed structure matched outputSchema without repairs/normalizations
  const rawSchemaCheck = outputSchema.safeParse(parsed);
  if (!rawSchemaCheck.success) {
    requiredRepair = true;
  }

  // Normalize structure for schema robustness
  if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, any>;
    if (!p.intent || typeof p.intent !== "object") {
      p.intent = { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 };
    } else {
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
    if (!p.decision || typeof p.decision !== "object") {
      p.decision = { type: "respond" };
    } else {
      if (!["respond", "clarify", "tool"].includes(p.decision.type)) {
        p.decision.type = "respond";
      }
    }
    if (!Array.isArray(p.toolCalls)) {
      p.toolCalls = [];
    }
    if (!p.language || typeof p.language !== "object") {
      p.language = { detected: expectedLang || "en", responseLanguage: expectedLang || "en" };
    }

    const activeLang = expectedLang || p.language?.responseLanguage || "en";
    // Safeguard: unwrap nested or leaked JSON so raw JSON never leaks into the user chat UI
    if (typeof p.responseDraft === "string" && p.responseDraft.trim()) {
      const origDraft = p.responseDraft;
      p.responseDraft = sanitizeResponseText(p.responseDraft, activeLang);
      if (p.responseDraft !== origDraft) requiredRepair = true;
    } else if (!p.clarification?.required && (!Array.isArray(p.toolCalls) || p.toolCalls.length === 0)) {
      p.responseDraft = sanitizeResponseText("", activeLang);
      requiredRepair = true;
    }

    if (p.clarification?.question && typeof p.clarification.question === "string") {
      const origQ = p.clarification.question;
      p.clarification.question = sanitizeResponseText(p.clarification.question, activeLang);
      if (p.clarification.question !== origQ) requiredRepair = true;
    }
  }

  const finalOutput = outputSchema.parse(parsed) as AgentLLMOutput;
  finalOutput.__telemetry = {
    parseSuccess: parseSuccess || requiredRepair,
    structuredResponseValid: !requiredRepair,
    validationStatus: requiredRepair ? "repaired" : "valid",
    isFallbackResponseUsed: requiredRepair,
  };

  return finalOutput;
}
