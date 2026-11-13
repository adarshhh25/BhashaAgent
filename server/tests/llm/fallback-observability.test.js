const test = require("node:test");
const assert = require("node:assert/strict");
const { orchestrate } = require("../../dist/modules/agent/agent.orchestrator");
const { parseAgentOutput } = require("../../dist/modules/agent/agent.validator");
const { sanitizeLogFields } = require("../../dist/modules/llm/llm-logger");
const { LLMError } = require("../../dist/modules/llm/llm.errors");

function createMockContext(requestId = "req_test_001", conversationId = "conv_test_001") {
  return {
    schemaVersion: "1.0",
    request: {
      requestId,
      createdAt: new Date().toISOString(),
      currentUserMessage: { content: "Help me fill the form", source: "text" },
    },
    user: { id: "00000000-0000-0000-0000-000000000001", preferredLanguage: "en" },
    conversation: {
      id: conversationId,
      status: "ACTIVE",
      recentMessages: [],
      relevantOlderContext: [],
      corrections: [],
    },
    profileMemory: { approvedFacts: [] },
    formTask: { detectedFields: [], proposedValues: [], missingInformation: [] },
    contextMetadata: {
      builtAt: new Date().toISOString(),
      sourceCounts: { recentMessages: 0, olderMessages: 0, approvedMemories: 0, detectedFields: 0, proposedValues: 0 },
      truncated: false,
      omittedItems: [],
      warnings: [],
      sourceReferences: [],
    },
  };
}

function captureLogs(fn) {
  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args) => {
    logs.push(args.join(" "));
    origLog(...args);
  };
  console.warn = (...args) => {
    logs.push(args.join(" "));
    origWarn(...args);
  };
  return {
    getLogs: () => logs,
    getSummaries: () => {
      const summaries = [];
      for (let i = 0; i < logs.length; i += 1) {
        if (logs[i].includes("[LLM] Turn summary")) {
          const next = logs[i + 1] || "";
          try {
            summaries.push(JSON.parse(next));
          } catch {
            // maybe in same line
            const jsonPart = logs[i].replace("[LLM] Turn summary", "").trim();
            if (jsonPart) summaries.push(JSON.parse(jsonPart));
          }
        }
      }
      return summaries;
    },
    restore: () => {
      console.log = origLog;
      console.warn = origWarn;
    },
  };
}

test("Scenario A: Primary model succeeds", async () => {
  const tracker = captureLogs();
  try {
    const mockProvider = {
      async generateResponse(req) {
        return {
          content: JSON.stringify({
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.95 },
            language: { detected: "en", responseLanguage: "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: "Sure, I can help you with the form.",
          }),
          toolCalls: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          attemptCount: 1,
          fallbackUsed: false,
          latencyMs: 120,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_a", "conv_a");
    const result = await orchestrate("user_1", ctx, mockProvider);
    assert.equal(result.response, "Sure, I can help you with the form.");

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1, "Exactly one turn summary emitted");
    assert.equal(summaries[0].requestId, "req_scen_a");
    assert.equal(summaries[0].effectiveModel, "gemini-2.5-flash");
    assert.equal(summaries[0].attemptCount, 1);
    assert.equal(summaries[0].fallbackUsed, false);
    assert.equal(summaries[0].providerSuccess, true);
    assert.equal(summaries[0].structuredResponseValid, true);
    assert.equal(summaries[0].validationStatus, "valid");
    assert.equal(summaries[0].finalResponseSuccess, true);
  } finally {
    tracker.restore();
  }
});

test("Scenario B: Primary model fails, fallback succeeds", async () => {
  const tracker = captureLogs();
  try {
    let callIdx = 0;
    const mockProvider = {
      async generateResponse(req) {
        callIdx += 1;
        // Mock fallback resolution: primary failed with quota, fallback model succeeds
        return {
          content: JSON.stringify({
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
            language: { detected: "en", responseLanguage: "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: "Fallback model answering.",
          }),
          toolCalls: [],
          model: "gemini-flash-lite-latest",
          provider: "gemini",
          attemptCount: 2,
          fallbackUsed: true,
          fallbackReasons: ["QUOTA_EXCEEDED"],
          latencyMs: 250,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_b", "conv_b");
    const result = await orchestrate("user_1", ctx, mockProvider);
    assert.equal(result.response, "Fallback model answering.");

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].requestId, "req_scen_b");
    assert.equal(summaries[0].effectiveModel, "gemini-flash-lite-latest");
    assert.equal(summaries[0].fallbackUsed, true);
    assert.deepEqual(summaries[0].fallbackReasons, ["QUOTA_EXCEEDED"]);
    assert.equal(summaries[0].finalResponseSuccess, true);
  } finally {
    tracker.restore();
  }
});

test("Scenario C: Provider succeeds but returns malformed JSON on all attempts", async () => {
  const tracker = captureLogs();
  try {
    const mockProvider = {
      async generateResponse(req) {
        return {
          content: "not valid json text at all",
          toolCalls: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          attemptCount: 1,
          fallbackUsed: false,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_c", "conv_c");
    await assert.rejects(
      () => orchestrate("user_1", ctx, mockProvider),
      (err) => err.statusCode === 502,
    );

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].requestId, "req_scen_c");
    assert.equal(summaries[0].providerSuccess, true);
    assert.equal(summaries[0].structuredResponseValid, false);
    assert.equal(summaries[0].validationStatus, "invalid");
    assert.equal(summaries[0].finalResponseSuccess, false);
    assert.equal(summaries[0].failureStage, "structured_validation");
  } finally {
    tracker.restore();
  }
});

test("Scenario D: Truncated JSON is repaired", async () => {
  const tracker = captureLogs();
  try {
    const truncatedScreenshotJson = '{"intent":{"primary":"FORM_STATUS","secondary":[],"confidence":0.9},"language":{"detected":"en","responseLanguage":"en"},"decision":{"type":"respond"},"';
    const mockProvider = {
      async generateResponse(req) {
        return {
          content: truncatedScreenshotJson,
          toolCalls: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          attemptCount: 1,
          fallbackUsed: false,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_d", "conv_d");
    const result = await orchestrate("user_1", ctx, mockProvider);
    assert.ok(result.response.length > 0);
    assert.ok(!result.response.includes('"intent"'));

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].requestId, "req_scen_d");
    assert.equal(summaries[0].validationStatus, "repaired");
    assert.equal(summaries[0].structuredResponseValid, false);
    assert.equal(summaries[0].finalResponseSuccess, true);
  } finally {
    tracker.restore();
  }
});

test("Scenario E: Both primary and fallback fail with provider errors", async () => {
  const tracker = captureLogs();
  try {
    const mockProvider = {
      async generateResponse() {
        throw new LLMError("PROVIDER_UNAVAILABLE", "All models exhausted");
      },
      async healthCheck() { return { available: false, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_e", "conv_e");
    await assert.rejects(
      () => orchestrate("user_1", ctx, mockProvider),
      (err) => err.statusCode === 503,
    );

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].requestId, "req_scen_e");
    assert.equal(summaries[0].providerSuccess, false);
    assert.equal(summaries[0].finalResponseSuccess, false);
    assert.equal(summaries[0].failureStage, "provider_call");
  } finally {
    tracker.restore();
  }
});

test("Scenario F: Function/tool-call response is logged with tool names and count", async () => {
  const tracker = captureLogs();
  try {
    let callRound = 0;
    const mockProvider = {
      async generateResponse(req) {
        callRound += 1;
        if (callRound === 1) {
          return {
            content: null,
            toolCalls: [
              { id: "call_ctx", name: "retrieve_context", arguments: "{}" },
            ],
            model: "gemini-flash-lite-latest",
            provider: "gemini",
            attemptCount: 1,
            fallbackUsed: false,
          };
        }
        return {
          content: JSON.stringify({
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
            language: { detected: "en", responseLanguage: "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: "Retrieved your context successfully.",
          }),
          toolCalls: [],
          model: "gemini-flash-lite-latest",
          provider: "gemini",
          attemptCount: 1,
          fallbackUsed: false,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_f", "conv_f");
    const result = await orchestrate("user_1", ctx, mockProvider);
    assert.equal(result.response, "Retrieved your context successfully.");

    const logs = tracker.getLogs();
    assert.ok(logs.some((l) => l.includes("Tool calls detected")), "Tool calls detected logged");
    assert.ok(logs.some((l) => l.includes("toolCallCount=1")), "toolCallCount=1 logged");
    assert.ok(logs.some((l) => l.includes("retrieve_context")), "Tool name logged");

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].toolCallCount, 1);
    assert.equal(summaries[0].effectiveModel, "gemini-flash-lite-latest");
  } finally {
    tracker.restore();
  }
});

test("Scenario G: Mixed text and function-call response preserves both", async () => {
  const tracker = captureLogs();
  try {
    let callRound = 0;
    const mockProvider = {
      async generateResponse(req) {
        callRound += 1;
        if (callRound === 1) {
          return {
            content: "Looking up details...",
            toolCalls: [
              { id: "call_ctx", name: "retrieve_context", arguments: "{}" },
            ],
            model: "gemini-2.5-flash",
            provider: "gemini",
            attemptCount: 1,
            fallbackUsed: false,
          };
        }
        return {
          content: JSON.stringify({
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
            language: { detected: "en", responseLanguage: "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: "Here are your details.",
          }),
          toolCalls: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          attemptCount: 1,
          fallbackUsed: false,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_g", "conv_g");
    const result = await orchestrate("user_1", ctx, mockProvider);
    assert.equal(result.response, "Here are your details.");

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].toolCallCount, 1);
  } finally {
    tracker.restore();
  }
});

test("Scenario H: Multi-round tool calling shares same correlation requestId", async () => {
  const tracker = captureLogs();
  const seenRequestIds = [];
  try {
    let round = 0;
    const mockProvider = {
      async generateResponse(req) {
        round += 1;
        seenRequestIds.push(req.requestId);
        if (round === 1) {
          return {
            content: null,
            toolCalls: [{ id: "call_ctx", name: "retrieve_context", arguments: "{}" }],
            model: "gemini-2.5-flash",
            provider: "gemini",
            attemptCount: 1,
          };
        }
        return {
          content: JSON.stringify({
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
            language: { detected: "en", responseLanguage: "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: "Multi-round success.",
          }),
          toolCalls: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          attemptCount: 1,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_h_correlation", "conv_h");
    await orchestrate("user_1", ctx, mockProvider);

    assert.equal(seenRequestIds.length, 2);
    assert.equal(seenRequestIds[0], "req_scen_h_correlation");
    assert.equal(seenRequestIds[1], "req_scen_h_correlation");
  } finally {
    tracker.restore();
  }
});

test("Scenario I: Concurrent turns maintain distinct request IDs", async () => {
  const tracker = captureLogs();
  try {
    const mockProvider = {
      async generateResponse(req) {
        await new Promise((r) => setTimeout(r, 20));
        return {
          content: JSON.stringify({
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
            language: { detected: "en", responseLanguage: "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: `Response for ${req.requestId}`,
          }),
          toolCalls: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          attemptCount: 1,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const [res1, res2] = await Promise.all([
      orchestrate("user_1", createMockContext("req_concurrent_1", "conv_1"), mockProvider),
      orchestrate("user_2", createMockContext("req_concurrent_2", "conv_2"), mockProvider),
    ]);

    assert.equal(res1.response, "Response for req_concurrent_1");
    assert.equal(res2.response, "Response for req_concurrent_2");

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 2);
    const reqIds = summaries.map((s) => s.requestId);
    assert.ok(reqIds.includes("req_concurrent_1"));
    assert.ok(reqIds.includes("req_concurrent_2"));
  } finally {
    tracker.restore();
  }
});

test("Scenario J: Safe application fallback response is logged", async () => {
  const tracker = captureLogs();
  try {
    // Model returns Devanagari Hindi for an English turn, and English translation returns Devanagari again
    const mockProvider = {
      async generateResponse(req) {
        return {
          content: JSON.stringify({
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
            language: { detected: "en", responseLanguage: "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: "मैं आपकी मदद कर सकता हूँ।", // Devanagari for English turn
          }),
          toolCalls: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          attemptCount: 1,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("req_scen_j", "conv_j");
    const result = await orchestrate("user_1", ctx, mockProvider);
    assert.ok(result.response.length > 0);

    const logs = tracker.getLogs();
    assert.ok(
      logs.some((l) => l.includes("Application fallback used") || l.includes("Translating to English")),
      "Fallback usage was logged",
    );
  } finally {
    tracker.restore();
  }
});

test("Sensitive Data Protection: Redacts secrets, auth headers, and full field values", () => {
  const fields = {
    apiKey: "AIzaSyD-abc1234567890123456789012345",
    authorization: "Bearer ya29.a0AfH6SMA-test-token",
    userPassword: "superSecretPassword123",
    email: "user@example.com",
    phoneNumber: "+91 9876543210",
    model: "gemini-2.5-flash",
  };
  const sanitized = sanitizeLogFields(fields);
  assert.equal(sanitized.apiKey, "[REDACTED]");
  assert.equal(sanitized.authorization, "[REDACTED]");
  assert.equal(sanitized.userPassword, "[REDACTED]");
  assert.equal(sanitized.model, "gemini-2.5-flash");
});

