const assert = require("node:assert/strict");
const test = require("node:test");
const { matchOption } = require("../../dist/modules/form-intelligence/option-matcher.service");
const { routeFormAction } = require("../../dist/modules/form-intelligence/form-action-router");
const { orchestrate } = require("../../dist/modules/agent/agent.orchestrator");
const { setLLMProviderForTests } = require("../../dist/modules/llm/llm.factory");
const { LLMError } = require("../../dist/modules/llm/llm.errors");

function baseContext() {
  return {
    schemaVersion: "1.0",
    request: {
      requestId: "req-test-1",
      createdAt: new Date().toISOString(),
      currentUserMessage: { content: "Hello", source: "text" },
    },
    user: { id: "00000000-0000-0000-0000-000000000001", preferredLanguage: "en" },
    conversation: { id: "00000000-0000-0000-0000-000000000002", status: "ACTIVE", recentMessages: [], relevantOlderContext: [], corrections: [] },
    profileMemory: { approvedFacts: [] },
    formTask: {
      id: "00000000-0000-0000-0000-000000000003",
      detectedFields: [
        {
          id: "field-name",
          fieldIdentifier: "customer_name",
          label: "Customer Name",
          inputType: "text",
          isRequired: true,
          isDisabled: false,
          isReadOnly: false,
          options: null,
        },
        {
          id: "field-size",
          fieldIdentifier: "pizza_size",
          label: "Pizza Size",
          inputType: "select",
          isRequired: true,
          isDisabled: false,
          isReadOnly: false,
          options: [
            { label: "Small", value: "s" },
            { label: "Medium", value: "m" },
            { label: "Large", value: "l" },
          ],
        },
        {
          id: "field-terms",
          fieldIdentifier: "agree_terms",
          label: "Terms and Conditions",
          inputType: "checkbox",
          isRequired: true,
          isDisabled: false,
          isReadOnly: false,
          options: null,
        },
        {
          id: "field-gender",
          fieldIdentifier: "gender",
          label: "Gender",
          inputType: "radio",
          isRequired: false,
          isDisabled: false,
          isReadOnly: false,
          options: [
            { label: "Male", value: "m" },
            { label: "Female", value: "f" },
          ],
        },
        {
          id: "field-password",
          fieldIdentifier: "account_password",
          label: "Password",
          inputType: "password",
          isRequired: true,
          isDisabled: false,
          isReadOnly: false,
          options: null,
        },
      ],
      proposedValues: [],
      missingInformation: [],
    },
    contextMetadata: { builtAt: new Date().toISOString(), sourceCounts: { recentMessages: 0, olderMessages: 0, approvedMemories: 0, detectedFields: 5, proposedValues: 0 }, truncated: false, omittedItems: [], warnings: [], sourceReferences: [] },
  };
}

// =========================================================================
// 1. OPTION MATCHER DEFENSIVE TESTS
// =========================================================================

test("matchOption: handles undefined and null option objects without throwing", () => {
  const malformedOptions = [undefined, null, { label: "Small", value: "s" }];
  const res = matchOption("Small", malformedOptions);
  assert.equal(res.matched, true);
  assert.equal(res.option.value, "s");
});

test("matchOption: handles undefined label or value gracefully", () => {
  const optionsWithMissingProps = [
    { label: undefined, value: undefined },
    { label: null, value: null },
    { label: undefined, value: "opt-1" },
    { label: "Option 2", value: undefined },
    { label: "Medium", value: "m" },
  ];
  // Match on value
  const res1 = matchOption("opt-1", optionsWithMissingProps);
  assert.equal(res1.matched, true);
  assert.equal(res1.option.value, "opt-1");

  // Match on label
  const res2 = matchOption("Option 2", optionsWithMissingProps);
  assert.equal(res2.matched, true);
  assert.equal(res2.option.label, "Option 2");

  // Match regular
  const res3 = matchOption("Medium", optionsWithMissingProps);
  assert.equal(res3.matched, true);
  assert.equal(res3.option.value, "m");
});

test("matchOption: handles empty strings and whitespace-only options without crashing", () => {
  const options = [
    { label: "", value: "" },
    { label: "   ", value: "   " },
    { label: "Large", value: "l" },
  ];
  const res = matchOption("Large", options);
  assert.equal(res.matched, true);
  assert.equal(res.option.value, "l");
});

test("matchOption: returns controlled no-match when all options are invalid or malformed", () => {
  const invalidOptions = [
    null,
    undefined,
    {},
    { label: null, value: undefined },
    { label: "", value: "" },
  ];
  const res = matchOption("Medium", invalidOptions);
  assert.equal(res.matched, false);
  assert.equal(res.confidence, 0);
});

test("matchOption: supports multilingual matching even when mixed with invalid options", () => {
  const mixed = [
    null,
    { label: undefined, value: undefined },
    { label: "महाराष्ट्र", value: "MH" },
  ];
  // English user query matched to Devanagari label
  const res = matchOption("Maharashtra", mixed);
  assert.equal(res.matched, true);
  assert.equal(res.option.value, "MH");
});

// =========================================================================
// 2. DIRECT AUTOFILL / ROUTING (NO MANDATORY APPROVAL)
// =========================================================================

test("routeFormAction: directly resolves explicit text field update", () => {
  const ctx = baseContext();
  const routed = routeFormAction({
    content: "Enter Adarsh Jha as customer name",
    detectedFields: ctx.formTask.detectedFields,
    detectedLang: "en",
  });
  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.id, "field-name");
  assert.equal(routed.resolvedValue, "Adarsh Jha");
});

test("routeFormAction: directly resolves select option update", () => {
  const ctx = baseContext();
  const routed = routeFormAction({
    content: "Select Medium for pizza size",
    detectedFields: ctx.formTask.detectedFields,
    detectedLang: "en",
  });
  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.id, "field-size");
  assert.equal(routed.resolvedValue, "m");
});

test("routeFormAction: directly resolves checkbox toggle", () => {
  const ctx = baseContext();
  const routed = routeFormAction({
    content: "Tick the terms and conditions checkbox",
    detectedFields: ctx.formTask.detectedFields,
    detectedLang: "en",
  });
  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.id, "field-terms");
  assert.equal(routed.resolvedValue, true);
});

test("routeFormAction: returns AMBIGUOUS when multiple fields match target", () => {
  const fields = [
    { id: "f1", fieldIdentifier: "phone_home", label: "Phone Number", inputType: "tel" },
    { id: "f2", fieldIdentifier: "phone_office", label: "Phone Number", inputType: "tel" },
  ];
  const routed = routeFormAction({
    content: "Change phone number to 9876543210",
    detectedFields: fields,
    detectedLang: "en",
  });
  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "AMBIGUOUS");
  assert.ok(routed.clarificationQuestion.includes("Multiple fields match"));
});

test("routeFormAction: rejects automatic filling of sensitive password field", () => {
  const ctx = baseContext();
  const routed = routeFormAction({
    content: "Set password to Secret123",
    detectedFields: ctx.formTask.detectedFields,
    detectedLang: "en",
  });
  // Password fields are excluded from direct routing and return a security refusal
  assert.equal(routed.status, "OPTION_NOT_FOUND");
  assert.match(routed.clarificationMessage, /sensitive fields/i);
});

// =========================================================================
// 3. END-TO-END CANCELLATION
// =========================================================================

test("orchestrator: immediately rejects with 499 when AbortSignal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();

  setLLMProviderForTests({
    async generateResponse() {
      throw new Error("Provider should not be called when already aborted");
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });

  const ctx = baseContext();
  await assert.rejects(
    () => orchestrate("00000000-0000-0000-0000-000000000001", ctx, require("../../dist/modules/llm/llm.factory").getLLMProvider(), { signal: controller.signal }),
    (err) => err.code === "REQUEST_CANCELLED" && err.statusCode === 499,
  );
});

test("orchestrator: cancels in-flight provider request on AbortSignal without fallback", async () => {
  const controller = new AbortController();
  let providerCalls = 0;

  setLLMProviderForTests({
    async generateResponse(request) {
      providerCalls++;
      // Simulate delay during which client cancellation arrives
      await new Promise((resolve) => setTimeout(resolve, 50));
      controller.abort();
      if (request.signal?.aborted) {
        throw new LLMError("REQUEST_CANCELLED", "Turn was cancelled by client");
      }
      return {
        content: JSON.stringify({
          intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
          language: { detected: "en", responseLanguage: "en" },
          decision: { type: "respond" },
          toolCalls: [],
          responseDraft: "Should not reach here",
        }),
        toolCalls: [],
      };
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });

  const ctx = baseContext();
  // Clear form task to exercise main LLM provider loop
  ctx.formTask = null;

  await assert.rejects(
    () => orchestrate("00000000-0000-0000-0000-000000000001", ctx, require("../../dist/modules/llm/llm.factory").getLLMProvider(), { signal: controller.signal }),
    (err) => err.code === "REQUEST_CANCELLED" && err.statusCode === 499,
  );

  // Ensure no retry was attempted after cancellation
  assert.equal(providerCalls, 1);
});

test("orchestrator: cancels before tool execution when signal is aborted after LLM return", async () => {
  const controller = new AbortController();

  setLLMProviderForTests({
    async generateResponse() {
      // Abort signal right as response returns before tool loop
      controller.abort();
      return {
        content: null,
        toolCalls: [{
          id: "call-1",
          name: "propose_field_value",
          arguments: JSON.stringify({ taskId: "00000000-0000-0000-0000-000000000003", fieldId: "field-name", value: "Test" }),
        }],
      };
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });

  const ctx = baseContext();
  await assert.rejects(
    () => orchestrate("00000000-0000-0000-0000-000000000001", ctx, require("../../dist/modules/llm/llm.factory").getLLMProvider(), { signal: controller.signal }),
    (err) => err.code === "REQUEST_CANCELLED",
  );
});

// =========================================================================
// 4. PROVIDER FALLBACK SAFETY
// =========================================================================

test("orchestrator: executes fallback on 503 provider failure when not cancelled", async () => {
  let callCount = 0;
  const attemptedModels = [];

  setLLMProviderForTests({
    async generateResponse(request) {
      callCount++;
      if (callCount === 1) {
        attemptedModels.push("gemini-2.5-flash");
        throw new LLMError("PROVIDER_UNAVAILABLE", "Gemini 503 high demand");
      }
      attemptedModels.push("gemini-flash-lite-latest");
      return {
        content: JSON.stringify({
          intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
          language: { detected: "en", responseLanguage: "en" },
          decision: { type: "respond" },
          toolCalls: [],
          responseDraft: "Hello from fallback model!",
        }),
        toolCalls: [],
        model: "gemini-flash-lite-latest",
        fallbackUsed: true,
      };
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });

  const ctx = baseContext();
  ctx.formTask = null; // Exercise pure conversation path

  const result = await orchestrate("00000000-0000-0000-0000-000000000001", ctx, require("../../dist/modules/llm/llm.factory").getLLMProvider());
  assert.equal(result.response, "Hello from fallback model!");
  assert.equal(callCount, 2);
});
