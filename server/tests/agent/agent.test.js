const assert = require("node:assert/strict");
const test = require("node:test");
const { orchestrate } = require("../../dist/modules/agent/agent.orchestrator");
const { setLLMProviderForTests } = require("../../dist/modules/llm/llm.factory");

function context() {
  return {
    schemaVersion: "1.0",
    request: {
      requestId: "request",
      createdAt: new Date().toISOString(),
      currentUserMessage: { content: "Hello", source: "text" },
    },
    user: { id: "00000000-0000-0000-0000-000000000001" },
    conversation: { id: "00000000-0000-0000-0000-000000000002", status: "ACTIVE", recentMessages: [], relevantOlderContext: [], corrections: [] },
    profileMemory: { approvedFacts: [] },
    formTask: { detectedFields: [], proposedValues: [], missingInformation: [] },
    contextMetadata: { builtAt: new Date().toISOString(), sourceCounts: { recentMessages: 0, olderMessages: 0, approvedMemories: 0, detectedFields: 0, proposedValues: 0 }, truncated: false, omittedItems: [], warnings: [], sourceReferences: [] },
  };
}

test("orchestrator validates structured responses and returns a natural response", async () => {
  setLLMProviderForTests({
    async generateResponse() {
      return {
        content: JSON.stringify({
          intent: { primary: "GREETING", secondary: [], confidence: 0.99 },
          language: { detected: "en", responseLanguage: "en" },
          decision: { type: "respond" },
          toolCalls: [],
          responseDraft: "Hello! How can I help?",
        }),
        toolCalls: [],
      };
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });
  const result = await orchestrate("00000000-0000-0000-0000-000000000001", context(), require("../../dist/modules/llm/llm.factory").getLLMProvider());
  assert.equal(result.response, "Hello! How can I help?");
  assert.equal(result.intent.primary, "GREETING");
});

test("unknown tools are rejected instead of executed", async () => {
  setLLMProviderForTests({
    async generateResponse() {
      return {
        content: null,
        toolCalls: [{ id: "call-1", name: "run_sql", arguments: "{}" }],
      };
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });
  await assert.rejects(
    () => orchestrate("00000000-0000-0000-0000-000000000001", context(), require("../../dist/modules/llm/llm.factory").getLLMProvider()),
    (error) => error.code === "UNKNOWN_TOOL",
  );
});

test("preserves native tool-call protocol and does not execute tools during repair", async () => {
  const requests = [];
  let callCount = 0;
  setLLMProviderForTests({
    async generateResponse(request) {
      requests.push(request);
      callCount += 1;
      if (callCount === 1) {
        return {
          content: null,
          toolCalls: [{ id: "call-context", name: "retrieve_context", arguments: "{}" }],
        };
      }
      if (callCount === 2) {
        return { content: "malformed", toolCalls: [] };
      }
      return {
        content: JSON.stringify({
          intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
          language: { detected: "en", responseLanguage: "en" },
          decision: { type: "respond" },
          toolCalls: [],
          responseDraft: "Here is the answer.",
        }),
        toolCalls: [],
      };
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });

  const result = await orchestrate(
    "00000000-0000-0000-0000-000000000001",
    context(),
    require("../../dist/modules/llm/llm.factory").getLLMProvider(),
  );

  assert.equal(result.response, "Here is the answer.");
  assert.equal(requests.length, 3);
  assert.equal(requests[0].toolChoice, "auto");
  assert.equal(requests[1].toolChoice, "none");
  assert.equal(requests[1].tools.length, 7);
  const toolIndex = requests[1].messages.findIndex((message) => message.role === "tool");
  assert.notEqual(toolIndex, -1);
  assert.equal(requests[1].messages[toolIndex - 1].role, "assistant");
  assert.equal(requests[1].messages[toolIndex].toolCallId, "call-context");
  assert.equal(requests[2].messages.filter((message) => message.role === "tool").length, 1);
});
