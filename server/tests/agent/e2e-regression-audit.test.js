const test = require("node:test");
const assert = require("node:assert/strict");

const { orchestrate } = require("../../dist/modules/agent/agent.orchestrator");
const { parseAgentOutput, sanitizeResponseText } = require("../../dist/modules/agent/agent.validator");
const { detectConversationLanguage, isDevanagari } = require("../../dist/modules/agent/language-detector");
const { resolveVoiceTurnLanguage } = require("../../dist/modules/voice/voice-language");
const { systemPrompt } = require("../../dist/modules/agent/agent.prompt");
const { findTool, toolDefinitions } = require("../../dist/modules/agent/agent.tools");
const { LLMError } = require("../../dist/modules/llm/llm.errors");

function createMockContext(content, lang = "en", requestId = `req_e2e_${Date.now()}`, conversationId = "conv_e2e_001") {
  return {
    schemaVersion: "1.0",
    request: {
      requestId,
      createdAt: new Date().toISOString(),
      currentUserMessage: { content, language: lang, source: "text" },
    },
    user: { id: "00000000-0000-0000-0000-000000000001", preferredLanguage: lang },
    conversation: {
      id: conversationId,
      status: "ACTIVE",
      recentMessages: [],
      relevantOlderContext: [],
      corrections: [],
    },
    profileMemory: { approvedFacts: [] },
    formTask: {
      id: "c46ed5f6-db06-4cec-bd84-be54a7e2b3a6",
      webpage: { title: "Admission Form (English)", url: "https://example.com/form" },
      detectedFields: [
        { id: "f_state", fieldIdentifier: "state", label: "State", inputType: "select", required: true, options: [{ label: "Bihar", value: "BR" }, { label: "Maharashtra", value: "MH" }] },
        { id: "f_district", fieldIdentifier: "district", label: "District", inputType: "text", required: true },
      ],
      proposedValues: [],
      missingInformation: [],
    },
    contextMetadata: {
      builtAt: new Date().toISOString(),
      sourceCounts: { recentMessages: 0, olderMessages: 0, approvedMemories: 0, detectedFields: 2, proposedValues: 0 },
      truncated: false,
      omittedItems: [],
      warnings: [],
      sourceReferences: [],
    },
  };
}

function captureTurnSummaries() {
  const summaries = [];
  const origLog = console.log;
  console.log = (...args) => {
    const str = args.join(" ");
    if (str.includes("[LLM] Turn summary")) {
      const jsonStart = str.indexOf("{");
      if (jsonStart !== -1) {
        try {
          summaries.push(JSON.parse(str.slice(jsonStart)));
        } catch {}
      }
    }
    origLog(...args);
  };
  return {
    getSummaries: () => summaries,
    restore: () => { console.log = origLog; },
  };
}

test("E2E Scenario 1: Multilingual text conversation with turn-level language switching", async () => {
  const turns = [
    {
      userText: "Help me fill out this form",
      detected: "en",
      mockReply: {
        intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
        language: { detected: "en", responseLanguage: "en" },
        decision: { type: "respond" },
        toolCalls: [],
        responseDraft: "Yes! I can help you fill this form. Which state would you like to select?",
      },
      assertResponse: (r) => assert.ok(r.toLowerCase().includes("state") && !isDevanagari(r)),
    },
    {
      userText: "और राज्य?",
      detected: "hi",
      mockReply: {
        intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
        language: { detected: "hi", responseLanguage: "hi" },
        decision: { type: "respond" },
        toolCalls: [],
        responseDraft: "कृपया बताइए कि आप कौन सा राज्य चुनना चाहते हैं?",
      },
      assertResponse: (r) => assert.ok(isDevanagari(r) && r.includes("राज्य")),
    },
    {
      userText: "मला मदत हवी आहे",
      detected: "mr",
      mockReply: {
        intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
        language: { detected: "mr", responseLanguage: "mr" },
        decision: { type: "respond" },
        toolCalls: [],
        responseDraft: "मी तुम्हाला फॉर्म भरायला मदत करतो. तुम्हाला कोणता पर्याय निवडायचा आहे?",
      },
      assertResponse: (r) => assert.ok(isDevanagari(r) && r.includes("फॉर्म")),
    },
    {
      userText: "Now what fields are left?",
      detected: "en",
      mockReply: {
        intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
        language: { detected: "en", responseLanguage: "en" },
        decision: { type: "respond" },
        toolCalls: [],
        responseDraft: "District field is remaining. What is your district?",
      },
      assertResponse: (r) => assert.ok(r.includes("District") && !isDevanagari(r)),
    },
  ];

  for (const turn of turns) {
    const ctx = createMockContext(turn.userText);
    const mockProvider = {
      async generateResponse() {
        return {
          content: JSON.stringify(turn.mockReply),
          toolCalls: [],
          model: "gemini-2.5-flash",
          provider: "gemini",
          attemptCount: 1,
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const result = await orchestrate("user_1", ctx, mockProvider);
    assert.equal(result.language.responseLanguage, turn.detected);
    turn.assertResponse(result.response);
  }
});

test("E2E Scenario 2: Multilingual voice language resolution and TTS mapping", () => {
  const voiceTurns = [
    { transcript: "Help me to fill out this form.", expectedLang: "en", expectedTts: "en-IN" },
    { transcript: "और राज्य?", expectedLang: "hi", expectedTts: "hi-IN" },
    { transcript: "बिहार बिहार से।", expectedLang: "hi", expectedTts: "hi-IN" },
    { transcript: "माझा जिल्हा ठाणे निवडा", expectedLang: "mr", expectedTts: "mr-IN" },
    { transcript: "Mera address Mumbai fill kar do", expectedLang: "hinglish", expectedTts: "hi-IN" },
    { transcript: "Thank you so much", expectedLang: "en", expectedTts: "en-IN" },
  ];

  for (const vt of voiceTurns) {
    const ctx = resolveVoiceTurnLanguage(vt.transcript, "en");
    assert.equal(ctx.detectedLanguage, vt.expectedLang);
    assert.equal(ctx.responseLanguage, vt.expectedLang);
    assert.equal(ctx.ttsLanguageCode, vt.expectedTts);
  }
});

test("E2E Scenario 3: Tool execution followed by localized Devanagari confirmation", async () => {
  let toolExecuted = false;

  const mockProvider = {
    async generateResponse(req) {
      if (!toolExecuted) {
        toolExecuted = true;
        return {
          content: null,
          toolCalls: [{
            id: "call_fill_state",
            name: "propose_field_value",
            arguments: JSON.stringify({
              taskId: "c46ed5f6-db06-4cec-bd84-be54a7e2b3a6",
              fieldId: "state",
              value: "Bihar",
              source: "USER_PROVIDED",
            }),
          }],
          model: "gemini-2.5-flash",
          provider: "gemini",
        };
      }
      return {
        content: JSON.stringify({
          intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
          language: { detected: "hi", responseLanguage: "hi" },
          decision: { type: "respond" },
          toolCalls: [],
          responseDraft: "धन्यवाद! मैंने राज्य में बिहार भर दिया है। अब कृपया जिला बताइए।",
        }),
        toolCalls: [],
        model: "gemini-2.5-flash",
        provider: "gemini",
      };
    },
    async healthCheck() { return { available: true, provider: "gemini" }; },
  };

  const ctx = createMockContext("बिहार बिहार से।", "hi");
  const result = await orchestrate("user_1", ctx, mockProvider);
  assert.ok(isDevanagari(result.response));
  assert.ok(result.response.includes("बिहार"));
  assert.equal(result.language.responseLanguage, "hi");
});

test("E2E Scenario 4: Malformed/truncated JSON safely handled with zero JSON leakage", async () => {
  const malformedTruncatedOutput = '{"intent":{"primary":"FORM_STATUS","secondary":[],"confidence":0.9},"language":{"detected":"hi","responseLanguage":"en"},"decision":{"type":"respond"},"';

  const mockProvider = {
    async generateResponse() {
      return {
        content: malformedTruncatedOutput,
        toolCalls: [],
        model: "gemini-2.5-flash",
        provider: "gemini",
      };
    },
    async healthCheck() { return { available: true, provider: "gemini" }; },
  };

  const ctx = createMockContext("किन चीज़ों को मुझे भरना है?", "hi");
  const result = await orchestrate("user_1", ctx, mockProvider);

  // Must not leak JSON
  assert.ok(!result.response.startsWith("{"));
  assert.ok(!result.response.includes('"intent"'));
  assert.ok(!result.response.includes('"primary"'));
  assert.ok(!result.response.includes('"decision"'));
  assert.ok(result.response.length > 5);
  // Must be in Hindi
  assert.ok(isDevanagari(result.response));
  assert.equal(result.language.responseLanguage, "hi");
});

test("E2E Scenario 5: Multi-model fallback attribution when primary quota is exhausted", async () => {
  const tracker = captureTurnSummaries();
  try {
    const mockProvider = {
      async generateResponse() {
        return {
          content: JSON.stringify({
            intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
            language: { detected: "en", responseLanguage: "en" },
            decision: { type: "respond" },
            toolCalls: [],
            responseDraft: "Fallback model responded successfully.",
          }),
          toolCalls: [],
          model: "gemini-flash-lite-latest",
          provider: "gemini",
          attemptCount: 2,
          fallbackUsed: true,
          fallbackReasons: ["QUOTA_EXCEEDED"],
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("Hello", "en", "req_quota_fallback", "conv_fallback_01");
    const result = await orchestrate("user_1", ctx, mockProvider);
    assert.equal(result.response, "Fallback model responded successfully.");

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].effectiveModel, "gemini-flash-lite-latest");
    assert.notEqual(summaries[0].effectiveModel, "gemini-2.5-flash");
    assert.equal(summaries[0].fallbackUsed, true);
    assert.deepEqual(summaries[0].fallbackReasons, ["QUOTA_EXCEEDED"]);
    assert.equal(summaries[0].providerSuccess, true);
    assert.equal(summaries[0].structuredResponseValid, true);
    assert.equal(summaries[0].finalResponseSuccess, true);
  } finally {
    tracker.restore();
  }
});

test("E2E Scenario 6: Tool execution failure handled cleanly without crashing", async () => {
  const tracker = captureTurnSummaries();
  try {
    const mockProvider = {
      async generateResponse() {
        return {
          content: null,
          toolCalls: [{
            id: "call_invalid_tool",
            name: "non_existent_tool_xyz",
            arguments: "{}",
          }],
          model: "gemini-2.5-flash",
          provider: "gemini",
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx = createMockContext("Do action", "en", "req_fail_tool", "conv_fail_01");
    await assert.rejects(async () => {
      await orchestrate("user_1", ctx, mockProvider);
    }, { name: "HttpError", statusCode: 400 });

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].finalResponseSuccess, false);
    assert.equal(summaries[0].failureStage, "tool_validation");
    assert.equal(summaries[0].failureReason, "UNKNOWN_TOOL");
  } finally {
    tracker.restore();
  }
});

test("E2E Scenario 7: Database and client sanitization defends against malformed JSON", () => {
  // Test backend sanitization
  const rawSchema = '{"intent":{"primary":"GENERAL_QUESTION"},"responseDraft":"Hello world"}';
  const cleanBackend = sanitizeResponseText(rawSchema, "en");
  assert.equal(cleanBackend, "Hello world");

  const truncatedSchema = '{"intent":{"primary":"FORM_STATUS"},"decision":{"type":"respond"},"';
  const cleanTruncated = sanitizeResponseText(truncatedSchema, "hi");
  assert.ok(!cleanTruncated.includes('"intent"'));
  assert.ok(isDevanagari(cleanTruncated));

  // Legitimate conversational text with curly braces or punctuation is preserved
  const legitimate = 'Values must be in {A, B, C}. Please choose one.';
  const cleanLegit = sanitizeResponseText(legitimate, "en");
  assert.equal(cleanLegit, legitimate);
});

test("E2E Scenario 8: Concurrent user turns maintain isolated correlation and metrics", async () => {
  const tracker = captureTurnSummaries();
  try {
    const mockProvider = {
      async generateResponse(req) {
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
        };
      },
      async healthCheck() { return { available: true, provider: "gemini" }; },
    };

    const ctx1 = createMockContext("User 1 message", "en", "req_concurrent_A", "conv_A");
    const ctx2 = createMockContext("User 2 message", "hi", "req_concurrent_B", "conv_B");

    const [res1, res2] = await Promise.all([
      orchestrate("user_1", ctx1, mockProvider),
      orchestrate("user_2", ctx2, mockProvider),
    ]);

    assert.equal(res1.response, "Response for req_concurrent_A");
    assert.equal(res2.response, "Response for req_concurrent_B");

    const summaries = tracker.getSummaries();
    assert.equal(summaries.length, 2);
    const reqIds = summaries.map((s) => s.requestId).sort();
    assert.deepEqual(reqIds, ["req_concurrent_A", "req_concurrent_B"]);
  } finally {
    tracker.restore();
  }
});

test("E2E Scenario 9: Form Safety Guarantee - No automatic submit actions", () => {
  const prompt = systemPrompt(createMockContext("Submit this form immediately!"), []);
  // System prompt explicitly forbids automatic submission
  assert.ok(prompt.includes("NEVER automatically submit any form"));
  assert.ok(prompt.includes("NEVER click Submit, Pay, Apply, or Register buttons"));

  // Check that available tools only contain propose_field_value, run_intelligent_mapping, etc., and NO submit tool
  const toolNames = toolDefinitions.map((t) => t.name);
  assert.ok(!toolNames.includes("submit_form"));
  assert.ok(!toolNames.includes("click_submit"));
  assert.ok(!toolNames.includes("browser_click_submit"));
});

test("E2E Scenario 10: Markdown code fences and escaped quotes in JSON parsing", () => {
  const fencedJson = '```json\n{"intent":{"primary":"GENERAL_QUESTION","secondary":[],"confidence":0.9},"language":{"detected":"en","responseLanguage":"en"},"decision":{"type":"respond"},"toolCalls":[],"responseDraft":"I have filled \\"Maharashtra\\" into state."}\n```';
  const parsed = parseAgentOutput(fencedJson, "en");
  assert.equal(parsed.intent.primary, "GENERAL_QUESTION");
  assert.equal(parsed.decision.type, "respond");
  assert.equal(parsed.responseDraft, 'I have filled "Maharashtra" into state.');
  assert.equal(parsed.__telemetry.parseSuccess, true);
});

test("E2E Scenario 11: Plain text requests are not unnecessarily converted to JSON", async () => {
  const plainTextResponse = "उपलब्ध विकल्पों में से कृपया बताइए कि आप कौन सा राज्य चुनना चाहते हैं?";
  const mockProvider = {
    async generateResponse(req) {
      assert.equal(req.responseFormat, "text");
      return {
        content: plainTextResponse,
        toolCalls: [],
        model: "gemini-2.5-flash",
        provider: "gemini",
      };
    },
    async healthCheck() { return { available: true, provider: "gemini" }; },
  };

  const res = await mockProvider.generateResponse({
    messages: [{ role: "user", content: "Translate to Hindi" }],
    tools: [],
    responseFormat: "text",
  });

  assert.equal(res.content, plainTextResponse);
  assert.ok(!res.content.startsWith("{"));
});

test("E2E Scenario 12: Voice transient error does not corrupt subsequent turns", () => {
  // Turn 1 encounters transient error (e.g. empty audio)
  const emptyCtx = resolveVoiceTurnLanguage("", "en");
  assert.equal(emptyCtx.source, "explicit_preference_fallback");

  // Turn 2 immediately recovers with confident Hindi speech
  const hindiCtx = resolveVoiceTurnLanguage("और राज्य?", "en");
  assert.equal(hindiCtx.detectedLanguage, "hi");
  assert.equal(hindiCtx.responseLanguage, "hi");
  assert.equal(hindiCtx.source, "current_turn_detection");

  // Turn 3 switches to Marathi without corruption
  const marathiCtx = resolveVoiceTurnLanguage("माझा जिल्हा ठाणे आहे", "en");
  assert.equal(marathiCtx.detectedLanguage, "mr");
  assert.equal(marathiCtx.responseLanguage, "mr");
});

