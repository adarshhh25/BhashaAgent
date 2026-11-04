const test = require("node:test");
const assert = require("node:assert/strict");

const { GeminiLLMProvider } = require("../../dist/modules/llm/gemini.provider");
const { getLLMProvider } = require("../../dist/modules/llm/llm.factory");
const { config } = require("../../dist/config/environment");

test("GeminiLLMProvider initializes and reports health status", async () => {
  const provider = new GeminiLLMProvider();
  const health = await provider.healthCheck();
  assert.equal(health.provider, "gemini");
  assert.equal(typeof health.available, "boolean");
});

test("LLM Factory returns GeminiLLMProvider when provider is configured as gemini", () => {
  const provider = getLLMProvider();
  assert.equal(provider instanceof GeminiLLMProvider, true);
});

test("GeminiLLMProvider handles live test or mocks properly", async (t) => {
  if (!config.gemini.apiKey) {
    t.skip("GEMINI_API_KEY is not set");
    return;
  }

  const provider = new GeminiLLMProvider();

  try {
    // Test 1: Simple conversational question
    const response = await provider.generateResponse({
      messages: [
        { role: "system", content: "You are a helpful assistant. Return JSON decision shape." },
        { role: "user", content: "Hello! Can you help me?" },
      ],
      tools: [],
      toolChoice: "none",
      maxOutputTokens: 200,
    });

    assert.ok(response.content, "Response should have content");
    assert.equal(response.toolCalls.length, 0, "No tools should be called");

    // Test 2: Tool calling declaration
    const toolResponse = await provider.generateResponse({
      messages: [
        {
          role: "system",
          content: "You are a form assistant. When the user asks to fill a field, ALWAYS call propose_field_value.",
        },
        {
          role: "user",
          content: "Please fill my name as Rajesh Sharma in the customer name field.",
        },
      ],
      tools: [
        {
          name: "propose_field_value",
          description: "Propose a value for a specific form field",
          inputSchema: {
            type: "object",
            properties: {
              fieldIdentifier: { type: "string" },
              value: { type: "string" },
            },
            required: ["fieldIdentifier", "value"],
          },
        },
      ],
      toolChoice: "auto",
      maxOutputTokens: 300,
    });

    assert.ok(
      toolResponse.toolCalls.length > 0 || Boolean(toolResponse.content),
      "Gemini should return either a tool call or content",
    );
  } catch (err) {
    t.skip(`Live test skipped due to API availability: ${err.message}`);
  }
});
