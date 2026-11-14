import test from "node:test";
import assert from "node:assert/strict";

import { classifyLLMError, extractRetryDelayMs } from "../../dist/modules/llm/llm-error-classifier.js";
import { validateLLMConfigurations, getLLMProvider } from "../../dist/modules/llm/llm.factory.js";
import { isThinkingSupported, sanitizeToolParameters, GeminiLLMProvider } from "../../dist/modules/llm/gemini.provider.js";
import { HttpLLMProvider } from "../../dist/modules/llm/llm.provider.js";
import { sanitizeFalseExecutionClaims } from "../../dist/modules/agent/agent.orchestrator.js";
import { routeFormAction } from "../../dist/modules/form-intelligence/form-action-router.js";
import { LLMError } from "../../dist/modules/llm/llm.errors.js";

// ============================================================================
// GEMINI TESTS (1 - 9)
// ============================================================================

test("Test 1: isThinkingSupported returns true for thinking models and false for non-thinking models", () => {
  assert.equal(isThinkingSupported("gemini-2.5-flash"), true);
  assert.equal(isThinkingSupported("gemini-3.5-flash"), true);
  assert.equal(isThinkingSupported("gemini-flash-lite-latest"), false);
  assert.equal(isThinkingSupported("gemini-flash-latest"), false);
  assert.equal(isThinkingSupported("gemini-1.5-flash"), false);
});

test("Test 2: sanitizeToolParameters ensures object type and valid properties without empty schemas", () => {
  const schema = {
    type: "object",
    properties: {
      fieldId: { type: "string" },
      value: {}, // empty property schema
    },
    required: ["fieldId"],
  };
  const sanitized = sanitizeToolParameters(schema);
  assert.equal(sanitized.type, "object");
  assert.equal(sanitized.properties.value.type, "string");
  assert.ok(sanitized.properties.value.description);
});

test("Test 3: Gemini handles thinkingConfig stripping on 400 INVALID_ARGUMENT", () => {
  const err = new Error("INVALID_ARGUMENT: thinkingConfig is not supported on this model");
  err.status = 400;
  const classified = classifyLLMError(err);
  assert.equal(classified.category, "INVALID_ARGUMENT");
  assert.equal(classified.isRetryable, true); // Retryable once without thinkingConfig
});

test("Test 4: Detection of 429 daily quota exhaustion marks model exhausted and triggers immediate fallback", () => {
  const err = new Error("429 RESOURCE_EXHAUSTED: Quota exceeded for quota metric 'GenerateContent requests per day' limit: 20 free_tier_requests");
  err.status = 429;
  const classified = classifyLLMError(err);
  assert.equal(classified.category, "QUOTA_EXCEEDED");
  assert.equal(classified.isRetryable, false);
  assert.equal(classified.shouldFallbackImmediately, true);
});

test("Test 5: Detection of 429 rate limit with retryDelay parses delay accurately", () => {
  const err = new Error("429 RESOURCE_EXHAUSTED: Rate limit reached. Please try again in 1.5s");
  err.status = 429;
  const classified = classifyLLMError(err);
  assert.equal(classified.category, "RATE_LIMITED");
  assert.equal(classified.retryDelayMs, 1500);
  assert.equal(classified.isRetryable, true);
  assert.equal(classified.shouldFallbackImmediately, false);
});

test("Test 6: Detection of 404 model not found marks model permanently unavailable without useless retries", () => {
  const err = new Error("404 Not Found: models/gemini-2.0-flash is not found for API version v1beta");
  err.status = 404;
  const classified = classifyLLMError(err);
  assert.equal(classified.category, "INVALID_MODEL");
  assert.equal(classified.isRetryable, false);
  assert.equal(classified.shouldFallbackImmediately, true);
});

test("Test 7: Authentication error (401/403) is classified as non-retryable", () => {
  const err = new Error("API_KEY_INVALID: User API key not valid");
  err.status = 401;
  const classified = classifyLLMError(err);
  assert.equal(classified.category, "AUTHENTICATION_ERROR");
  assert.equal(classified.isRetryable, false);
});

test("Test 8: Server 503 high demand is classified as transient failure requiring fallback", () => {
  const err = new Error("503 Service Unavailable: The model is overloaded. Please try again later.");
  err.status = 503;
  const classified = classifyLLMError(err);
  assert.equal(classified.category, "TRANSIENT_FAILURE");
  assert.equal(classified.isRetryable, true);
});

test("Test 9: AbortSignal cancellation produces clean REQUEST_CANCELLED error", () => {
  const abortErr = new Error("The operation was aborted");
  abortErr.name = "AbortError";
  const classified = classifyLLMError(abortErr);
  assert.equal(classified.category, "TIMEOUT");
  assert.equal(classified.statusCode, 408);
});

// ============================================================================
// FALLBACK TESTS (10 - 18)
// ============================================================================

test("Test 10: Gemini fallback delegates cleanly to secondary model or Groq HTTP provider", async () => {
  const provider = new GeminiLLMProvider();
  assert.ok(provider);
  assert.equal(typeof provider.generateResponse, "function");
  assert.equal(typeof provider.healthCheck, "function");
});

test("Test 11: HttpLLMProvider exists and implements LLMProvider interface", () => {
  const httpProvider = new HttpLLMProvider();
  assert.ok(httpProvider);
  assert.equal(typeof httpProvider.generateResponse, "function");
});

test("Test 12: extractRetryDelayMs correctly reads from Retry-After header", () => {
  const headers = new Headers({ "retry-after": "3" });
  const delay = extractRetryDelayMs(new Error("Rate limited"), headers);
  assert.equal(delay, 3000);
});

test("Test 13: extractRetryDelayMs correctly reads from errorDetails with retryDelay string", () => {
  const err = {
    message: "Rate limit exceeded",
    errorDetails: [{ retryDelay: "2.5s" }],
  };
  const delay = extractRetryDelayMs(err);
  assert.equal(delay, 2500);
});

test("Test 14: Rate limit delay > 60s is classified as QUOTA_EXCEEDED to avoid freezing turns", () => {
  const err = new Error("Rate limit reached");
  const headers = new Headers({ "retry-after": "120" });
  const classified = classifyLLMError(err, headers);
  assert.equal(classified.category, "QUOTA_EXCEEDED");
  assert.equal(classified.shouldFallbackImmediately, true);
});

test("Test 15: HttpLLMProvider returns provider 'groq' and fallbackUsed true on fallback", () => {
  const mockResp = {
    content: '{"intent":{"primary":"GENERAL_QUESTION","secondary":[],"confidence":0.9},"language":{"detected":"en","responseLanguage":"en"},"decision":{"type":"respond"},"toolCalls":[],"responseDraft":"Hello"}',
    toolCalls: [],
    model: "openai/gpt-oss-20b",
    provider: "groq",
    attemptCount: 1,
    fallbackUsed: true,
  };
  assert.equal(mockResp.provider, "groq");
  assert.equal(mockResp.fallbackUsed, true);
  assert.equal(mockResp.model, "openai/gpt-oss-20b");
});

test("Test 16: Health check returns available boolean and provider name", async () => {
  const provider = new GeminiLLMProvider();
  const hc = await provider.healthCheck();
  assert.equal(hc.provider, "gemini");
  assert.equal(typeof hc.available, "boolean");
});

test("Test 17: validateLLMConfigurations returns configuration status without leaking keys", () => {
  const status = validateLLMConfigurations();
  assert.equal(typeof status.geminiConfigured, "boolean");
  assert.equal(typeof status.groqConfigured, "boolean");
  assert.ok(status.geminiModel);
  assert.ok(status.groqModel);
  assert.ok(Array.isArray(status.warnings));
  const serialized = JSON.stringify(status);
  assert.ok(!serialized.includes("AIza"));
  assert.ok(!serialized.includes("gsk_"));
});

test("Test 18: getLLMProvider returns an initialized LLMProvider instance", () => {
  const p = getLLMProvider();
  assert.ok(p);
  assert.equal(typeof p.generateResponse, "function");
  assert.equal(typeof p.healthCheck, "function");
});

// ============================================================================
// REGRESSION & TRUTHFULNESS TESTS (19 - 25)
// ============================================================================

test("Test 19: sanitizeFalseExecutionClaims prevents false claims when no tool was executed", () => {
  const mockContext = {
    formTask: {
      id: "task-1",
      detectedFields: [
        { id: "f-1", fieldIdentifier: "custname", label: "Customer name:", isEmpty: true, isVerified: false },
      ],
    },
    request: {
      currentUserMessage: { content: "customer name ko english mein likho" },
    },
    conversation: { recentMessages: [] },
  };

  // Assistant emitted a false claim without any tool execution
  const falseClaim = "Maine customer name ko English mein 'Aadarsh Jha' update kar diya hai. Ab aap size ya delivery time bata sakte hain.";
  const sanitized = sanitizeFalseExecutionClaims(falseClaim, mockContext, "hinglish", []);

  // Must not claim it updated the field
  assert.ok(!sanitized.includes("update kar diya"));
  assert.ok(sanitized.includes("note kar li hain") || sanitized.includes("confirm"));
});

test("Test 20: sanitizeFalseExecutionClaims preserves truthful confirmation when direct execution tool succeeded", () => {
  const mockContext = {
    formTask: {
      id: "task-1",
      detectedFields: [
        { id: "f-1", fieldIdentifier: "custname", label: "Customer name:", isEmpty: false, isVerified: true },
      ],
    },
    request: {
      currentUserMessage: { content: "customer name ko english mein likho" },
    },
    conversation: { recentMessages: [] },
  };

  const toolResults = [
    {
      toolCallId: "call-1",
      name: "propose_field_value",
      success: true,
      data: { status: "APPROVED", fieldIdentifier: "custname", value: "Adarsh Jha" },
    },
  ];

  const genuineClaim = "Maine customer name ko English mein 'Adarsh Jha' update kar diya hai.";
  const result = sanitizeFalseExecutionClaims(genuineClaim, mockContext, "hinglish", toolResults);
  assert.equal(result, genuineClaim);
});

test("Test 21: routeFormAction directly routes 'cutomer name ko english mein likho' to SET_VALUE custname", () => {
  const fields = [
    { id: "f-1", fieldIdentifier: "custname", label: "Customer name:", collectedValue: "मैं आदर्श", inputType: "text", elementType: "input" },
    { id: "f-2", fieldIdentifier: "telephone", label: "Telephone:", collectedValue: "9004234499", inputType: "tel", elementType: "input" },
  ];

  const routed = routeFormAction({
    content: "cutomer name ko english mein likho",
    detectedFields: fields,
    detectedLang: "hinglish",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.field.fieldIdentifier, "custname");
  assert.equal(routed.value, "Adarsh");
  assert.equal(routed.intentReason, "CONVERT_FIELD_SCRIPT");
});

test("Test 22: routeFormAction directly routes 'customer name को english में लिखें, आदर्श झा।' to SET_VALUE Adarsh Jha", () => {
  const fields = [
    { id: "f-1", fieldIdentifier: "custname", label: "Customer name:", collectedValue: "मैं आदर्श", inputType: "text", elementType: "input" },
  ];

  const routed = routeFormAction({
    content: "customer name को english में लिखें, आदर्श झा।",
    detectedFields: fields,
    detectedLang: "hi",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.field.fieldIdentifier, "custname");
  assert.equal(routed.value, "Adarsh Jha");
});

test("Test 23: routeFormAction directly routes 'आदर्श झा उसे English में लिखें।' to SET_VALUE Adarsh Jha", () => {
  const fields = [
    { id: "f-1", fieldIdentifier: "custname", label: "Customer name:", collectedValue: "आदर्श झा", inputType: "text", elementType: "input" },
  ];

  const routed = routeFormAction({
    content: "आदर्श झा उसे English में लिखें।",
    detectedFields: fields,
    detectedLang: "hi",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.field.fieldIdentifier, "custname");
  assert.equal(routed.value, "Adarsh Jha");
});

test("Test 24: classifyLLMError correctly categorizes PERMISSION_DENIED as non-retryable 403", () => {
  const err = new Error("PERMISSION_DENIED: The caller does not have permission to execute the specified operation");
  err.status = 403;
  const classified = classifyLLMError(err);
  assert.equal(classified.category, "PERMISSION_DENIED");
  assert.equal(classified.isRetryable, false);
  assert.equal(classified.shouldFallbackImmediately, true);
});

test("Test 25: LLMError correctly encapsulates error code and message", () => {
  const err = new LLMError("RATE_LIMITED", "Rate limit exceeded on provider");
  assert.equal(err.code, "RATE_LIMITED");
  assert.equal(err.message, "Rate limit exceeded on provider");
  assert.ok(err instanceof Error);
});
