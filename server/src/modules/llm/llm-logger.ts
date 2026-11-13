/**
 * LLM Observability & Structured Response Tracking
 *
 * Provides structured logging and lifecycle event tracking for LLM turns,
 * multi-model fallback sequences, structured validation, and tool calling.
 * Ensures zero leakage of sensitive user data, form values, or API keys.
 */

export type LLMOutcome =
  | "success"
  | "provider_error"
  | "timeout"
  | "rate_limited"
  | "quota_exceeded"
  | "parsing_failure"
  | "validation_failure";

export type LLMValidationStatus = "valid" | "repaired" | "invalid" | "not_applicable";

export type LLMResponseType = "text" | "function_call" | "mixed" | "structured";

export interface LLMTurnSummary {
  requestId: string;
  conversationId?: string;
  provider: string;
  effectiveModel: string;
  modelsAttempted?: string[];
  modelsUsed?: string[];
  roundModels?: Array<{ round: number; model: string; outcome: string; toolCallCount?: number }>;
  attemptCount: number;
  fallbackUsed: boolean;
  fallbackReasons?: string[];
  providerSuccess: boolean;
  parseSuccess: boolean;
  structuredResponseValid: boolean;
  validationStatus: LLMValidationStatus;
  toolCallCount: number;
  finalResponseSuccess: boolean;
  totalLatencyMs: number;
  failureStage?: string;
  failureReason?: string;
}

const SENSITIVE_KEY_REGEX = /key|token|auth|password|secret|bearer|credential|cookie|session|jwt|authorization|private/i;
const SENSITIVE_FIELD_REGEX = /email|phone|mobile|telephone|address|aadhaar|pan|ssn|passcode|pin/i;
const SENSITIVE_PAYLOAD_KEYS = /request|config|data|payload|headers|body/i;

/**
 * Sanitizes values for logs to ensure no secrets or sensitive user data leak.
 */
export function sanitizeLogValue(key: string, val: unknown): unknown {
  if (val === undefined || val === null) return val;
  if (SENSITIVE_KEY_REGEX.test(key) || SENSITIVE_FIELD_REGEX.test(key)) {
    return "[REDACTED]";
  }
  if (typeof val === "string") {
    // Redact bearer tokens, API keys, JWTs, emails, phone numbers in error strings
    let clean = val
      .replace(/AIza[0-9A-Za-z-_]{35}/g, "[API_KEY_REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
      .replace(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "[JWT_REDACTED]")
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]");
    // Only apply phone redaction to non-ID strings to avoid mutilating UUIDs
    const isIdOrUuid = key.toLowerCase().includes("id") || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if (!isIdOrUuid) {
      clean = clean.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[PHONE_REDACTED]");
    }
    if (clean.length > 300) {
      clean = clean.slice(0, 297) + "...";
    }
    return clean;
  }
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      return val.map((item, idx) => sanitizeLogValue(String(idx), item));
    }
    const cleanObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(k) || SENSITIVE_FIELD_REGEX.test(k)) {
        cleanObj[k] = "[REDACTED]";
      } else if (SENSITIVE_PAYLOAD_KEYS.test(k) && typeof v === "object" && v !== null) {
        cleanObj[k] = "[PAYLOAD_REDACTED]";
      } else {
        cleanObj[k] = sanitizeLogValue(k, v);
      }
    }
    return cleanObj;
  }
  return val;
}

/**
 * Sanitizes all fields in an event metadata map.
 */
export function sanitizeLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    sanitized[k] = sanitizeLogValue(k, v);
  }
  return sanitized;
}

/**
 * Formats key-value pairs for readable, grep-friendly logs.
 */
function formatKeyValues(fields: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (typeof v === "object") {
      parts.push(`${k}=${JSON.stringify(v)}`);
    } else {
      parts.push(`${k}=${v}`);
    }
  }
  return parts.join(" ");
}

/**
 * Emits a structured log line for an LLM lifecycle event.
 */
export function logLLMEvent(event: string, fields: Record<string, unknown>): void {
  const clean = sanitizeLogFields(fields);
  const formatted = formatKeyValues(clean);
  console.log(`[LLM] ${event}${formatted ? "\n" + formatted : ""}`);
}

/**
 * Emits the exact single structured summary at the end of every LLM turn.
 */
export function logLLMTurnSummary(summary: LLMTurnSummary): void {
  const cleanSummary = sanitizeLogFields({
    requestId: summary.requestId,
    conversationId: summary.conversationId,
    provider: summary.provider,
    effectiveModel: summary.effectiveModel,
    ...(summary.modelsAttempted && summary.modelsAttempted.length > 0
      ? { modelsAttempted: Array.from(new Set(summary.modelsAttempted)) }
      : {}),
    ...(summary.modelsUsed && summary.modelsUsed.length > 0
      ? { modelsUsed: Array.from(new Set(summary.modelsUsed)) }
      : {}),
    ...(summary.roundModels && summary.roundModels.length > 0
      ? { roundModels: summary.roundModels }
      : {}),
    attemptCount: summary.attemptCount,
    fallbackUsed: summary.fallbackUsed,
    ...(summary.fallbackReasons && summary.fallbackReasons.length > 0
      ? { fallbackReasons: Array.from(new Set(summary.fallbackReasons)) }
      : {}),
    providerSuccess: summary.providerSuccess,
    parseSuccess: summary.parseSuccess,
    structuredResponseValid: summary.structuredResponseValid,
    validationStatus: summary.validationStatus,
    toolCallCount: summary.toolCallCount,
    finalResponseSuccess: summary.finalResponseSuccess,
    totalLatencyMs: summary.totalLatencyMs,
    ...(summary.failureStage ? { failureStage: summary.failureStage } : {}),
    ...(summary.failureReason ? { failureReason: summary.failureReason } : {}),
  });

  console.log(`[LLM] Turn summary\n${JSON.stringify(cleanSummary, null, 2)}`);
}

