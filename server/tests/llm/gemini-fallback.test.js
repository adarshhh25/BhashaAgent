require("../support/environment");
require("dotenv/config");

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GeminiLLMProvider,
  isThinkingSupported,
  sanitizeToolParameters,
} = require("../../dist/modules/llm/gemini.provider");
const { config } = require("../../dist/config/environment");

test("Capability Matrix: isThinkingSupported identifies thinking models accurately", () => {
  // Thinking supported
  assert.equal(isThinkingSupported("gemini-2.5-flash"), true);
  assert.equal(isThinkingSupported("gemini-3.5-flash"), true);
  assert.equal(isThinkingSupported("gemini-3.1-flash-lite"), true);
  assert.equal(isThinkingSupported("models/gemini-2.5-flash"), true);

  // Thinking unsupported (rejects thinkingConfig with 400 INVALID_ARGUMENT)
  assert.equal(isThinkingSupported("gemini-flash-lite-latest"), false);
  assert.equal(isThinkingSupported("gemini-flash-latest"), false);
  assert.equal(isThinkingSupported("gemini-1.5-flash"), false);
  assert.equal(isThinkingSupported("models/gemini-flash-lite-latest"), false);
});

test("Tool Parameter Sanitization: converts empty property schemas to valid typed definitions", () => {
  const productionToolSchema = {
    type: "object",
    properties: {
      taskId: { type: "string" },
      fieldId: { type: "string", description: "The field id or label" },
      value: {}, // Empty schema previously causing potential schema validator rejections
      proposals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fieldId: { type: "string" },
            value: {},
          },
        },
      },
    },
    required: ["taskId"],
  };

  const sanitized = sanitizeToolParameters(productionToolSchema);

  assert.equal(sanitized.type, "object");
  assert.equal(sanitized.properties.taskId.type, "string");
  assert.equal(sanitized.properties.value.type, "string");
  assert.ok(sanitized.properties.value.description);
  assert.equal(sanitized.properties.proposals.items.properties.value.type, "string");
});

test("Content Builder: merges multiple consecutive tool responses into single user turn", () => {
  const provider = new GeminiLLMProvider();

  // Access private method for testing via any cast
  const messages = [
    { role: "user", content: "Fill name and state" },
    {
      role: "assistant",
      content: null,
      toolCalls: [
        { id: "call_1", name: "propose_field_value", arguments: JSON.stringify({ fieldId: "name", value: "Raj" }) },
        { id: "call_2", name: "propose_field_value", arguments: JSON.stringify({ fieldId: "state", value: "Bihar" }) },
      ],
    },
    { role: "tool", toolCallId: "call_1", content: JSON.stringify({ success: true, field: "name" }) },
    { role: "tool", toolCallId: "call_2", content: JSON.stringify({ success: true, field: "state" }) },
  ];

  const { contents, systemInstruction } = provider.buildContentsAndSystem(messages);

  assert.equal(systemInstruction, undefined);
  // User -> Model -> User (holding BOTH functionResponse parts)
  assert.equal(contents.length, 3);
  assert.equal(contents[0].role, "user");
  assert.equal(contents[1].role, "model");
  assert.equal(contents[1].parts.length, 2);
  assert.equal(contents[2].role, "user");
  assert.equal(contents[2].parts.length, 2);
  assert.ok(contents[2].parts[0].functionResponse);
  assert.equal(contents[2].parts[0].functionResponse.name, "propose_field_value");
  assert.ok(contents[2].parts[1].functionResponse);
  assert.equal(contents[2].parts[1].functionResponse.name, "propose_field_value");
});

test("Error Classification: Permanent 400 INVALID_ARGUMENT triggers fallback without blind retries", async () => {
  const provider = new GeminiLLMProvider();

  let attempts = 0;
  const mockAi = {
    models: {
      generateContent: async ({ model }) => {
        attempts += 1;
        if (model === "gemini-2.5-flash") {
          const err = new Error("Request contains an invalid argument.");
          err.status = 400;
          throw err;
        }
        return {
          text: JSON.stringify({ intent: { primary: "GENERAL_QUESTION" }, decision: { type: "respond" }, responseDraft: "Fallback success!" }),
          candidates: [{ content: { parts: [{ text: "Fallback success!" }] } }],
        };
      },
    },
  };

  provider.client = mockAi;

  const response = await provider.generateResponse({
    messages: [{ role: "user", content: "Test invalid arg fallback" }],
    tools: [],
    toolChoice: "none",
  });

  assert.ok(response.content);
  // Should NOT retry gemini-2.5-flash multiple times with identical invalid argument
  // It tries gemini-2.5-flash, encounters 400, falls back immediately to fallback model
  assert.ok(attempts <= 3, `Expected quick fallback without blind infinite retries, got ${attempts} attempts`);
});

test("Error Classification: Daily quota exhaustion marks model and immediately falls back", async () => {
  const provider = new GeminiLLMProvider();

  const modelsAttempted = [];
  const mockAi = {
    models: {
      generateContent: async ({ model }) => {
        modelsAttempted.push(model);
        if (model === "gemini-2.5-flash") {
          const err = new Error("Resource has been exhausted (e.g. check quota). GenerateRequestsPerDayPerProjectPerModel-FreeTier limit: 20 per day");
          err.status = 429;
          throw err;
        }
        return {
          candidates: [{ content: { parts: [{ text: "OK from fallback" }] } }],
        };
      },
    },
  };

  provider.client = mockAi;

  const response = await provider.generateResponse({
    messages: [{ role: "user", content: "Test quota fallback" }],
    tools: [],
    toolChoice: "none",
  });

  assert.ok(response.content);
  assert.equal(modelsAttempted[0], "gemini-2.5-flash");
  assert.ok(modelsAttempted.length >= 2, "Should fall back to next model");
  // Ensure the primary model was attempted only ONCE before immediate fallback
  const primaryAttempts = modelsAttempted.filter((m) => m === "gemini-2.5-flash").length;
  assert.equal(primaryAttempts, 1, "Daily quota must NOT retry the exhausted model");
});

test("Error Classification: Authentication error surfaces actionable configuration error immediately", async () => {
  const provider = new GeminiLLMProvider();

  let attempts = 0;
  const mockAi = {
    models: {
      generateContent: async () => {
        attempts += 1;
        const err = new Error("API_KEY_INVALID: The provided API key is invalid.");
        err.status = 401;
        throw err;
      },
    },
  };

  provider.client = mockAi;

  await assert.rejects(
    async () => {
      await provider.generateResponse({
        messages: [{ role: "user", content: "Test auth failure" }],
      });
    },
    (err) => {
      assert.equal(err.code, "PROVIDER_UNAVAILABLE");
      assert.match(err.message, /invalid or unauthorized/i);
      return true;
    },
  );

  assert.equal(attempts, 1, "Auth failure must fail immediately on first attempt without fallback loop");
});

test("Live Model Verification: gemini-flash-lite-latest text & production tools", async (t) => {
  if (!config.gemini.apiKey) {
    t.skip("GEMINI_API_KEY is not configured");
    return;
  }

  const provider = new GeminiLLMProvider();

  // Test text & tools on gemini-flash-lite-latest
  const toolResponse = await provider.generateResponse({
    model: "gemini-flash-lite-latest",
    messages: [
      { role: "system", content: "You are an assistant. When asked to fill a state, invoke propose_field_value." },
      { role: "user", content: "Mera state Bihar bhar do" },
    ],
    tools: [
      {
        name: "propose_field_value",
        description: "Fill or propose a value for one or more fields in the active webpage form.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            fieldId: { type: "string" },
            value: {},
          },
          required: ["taskId", "fieldId"],
        },
      },
    ],
    toolChoice: "auto",
  });

  assert.ok(toolResponse.toolCalls.length > 0, "gemini-flash-lite-latest must return toolCalls");
  const call = toolResponse.toolCalls[0];
  assert.equal(call.name, "propose_field_value");
  const parsedArgs = JSON.parse(call.arguments);
  assert.ok(parsedArgs.fieldId);
  assert.match(String(parsedArgs.value || "").toLowerCase(), /bihar/);
});

test("Live Model Verification: gemini-3.5-flash text & production tools", async (t) => {
  if (!config.gemini.apiKey) {
    t.skip("GEMINI_API_KEY is not configured");
    return;
  }

  const provider = new GeminiLLMProvider();

  const toolResponse = await provider.generateResponse({
    model: "gemini-3.5-flash",
    messages: [
      { role: "system", content: "You are an assistant. When asked to fill a state, invoke propose_field_value." },
      { role: "user", content: "Please fill the state as Bihar for the current form." },
    ],
    tools: [
      {
        name: "propose_field_value",
        description: "Fill or propose a value for one or more fields in the active webpage form.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            fieldId: { type: "string" },
            value: {},
          },
          required: ["taskId", "fieldId"],
        },
      },
    ],
    toolChoice: "auto",
  });

  assert.ok(toolResponse.toolCalls.length > 0, "gemini-3.5-flash must return toolCalls");
  const call = toolResponse.toolCalls[0];
  assert.equal(call.name, "propose_field_value");
  const parsedArgs = JSON.parse(call.arguments);
  assert.ok(parsedArgs.fieldId);
  assert.match(String(parsedArgs.value || "").toLowerCase(), /bihar/);
});

test("Live Tool Round Trip: executes tool response and generates final confirmation", async (t) => {
  if (!config.gemini.apiKey) {
    t.skip("GEMINI_API_KEY is not configured");
    return;
  }

  const provider = new GeminiLLMProvider();

  // Turn 1: Assistant calls tool
  const t1 = await provider.generateResponse({
    model: "gemini-flash-lite-latest",
    messages: [{ role: "user", content: "Mera state Bihar bhar do" }],
    tools: [
      {
        name: "propose_field_value",
        description: "Fill or propose a value for one or more fields in the active webpage form.",
        inputSchema: {
          type: "object",
          properties: {
            fieldId: { type: "string" },
            value: { type: "string" },
          },
          required: ["fieldId", "value"],
        },
      },
    ],
    toolChoice: "auto",
  });

  assert.ok(t1.toolCalls.length > 0, "Turn 1 must produce tool call");
  const call = t1.toolCalls[0];

  // Turn 2: Provide tool execution result with thought signature preserved
  const roundTripResponse = await provider.generateResponse({
    model: "gemini-flash-lite-latest",
    messages: [
      { role: "user", content: "Mera state Bihar bhar do" },
      { role: "assistant", content: null, toolCalls: t1.toolCalls },
      {
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify({
          success: true,
          data: { field: "state", value: "Bihar", status: "PENDING_APPROVAL" },
          mandatoryDirective: "Tool executed. Now output final JSON decision shape with responseDraft in Hindi.",
        }),
      },
    ],
    tools: [],
    toolChoice: "none",
  });

  assert.ok(roundTripResponse.content, "Should produce content after tool execution");
  const parsed = JSON.parse(roundTripResponse.content);
  assert.ok(parsed.responseDraft || parsed.message || parsed.decision, "Should contain responseDraft or valid message");
});
