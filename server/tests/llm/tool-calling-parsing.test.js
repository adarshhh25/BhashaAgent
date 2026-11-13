const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAgentOutput, sanitizeResponseText } = require("../../dist/modules/agent/agent.validator");
const { detectConversationLanguage } = require("../../dist/modules/agent/language-detector");
const { isThinkingSupported, sanitizeToolParameters } = require("../../dist/modules/llm/gemini.provider");

test("Case A: Text-only response is preserved cleanly without leaking JSON", () => {
  const jsonResponse = JSON.stringify({
    intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
    language: { detected: "hi", responseLanguage: "hi" },
    decision: { type: "respond" },
    toolCalls: [],
    responseDraft: "मैंने आपका फ़ॉर्म देख लिया है।",
  });
  const parsed = parseAgentOutput(jsonResponse, "hi");
  assert.equal(parsed.responseDraft, "मैंने आपका फ़ॉर्म देख लिया है।");
  assert.equal(parsed.language.responseLanguage, "hi");
});

test("Case B: Truncated JSON from Screenshot 2 does not leak schema or throw", () => {
  const truncatedScreenshotJson = '{"intent":{"primary":"FORM_STATUS","secondary":[],"confidence":0.9},"language":{"detected":"hi","responseLanguage":"en"},"decision":{"type":"respond"},"';
  const parsed = parseAgentOutput(truncatedScreenshotJson, "hi");
  assert.equal(typeof parsed.responseDraft, "string");
  assert.ok(parsed.responseDraft.length > 0);
  assert.ok(!parsed.responseDraft.includes('"intent"'));
  assert.ok(!parsed.responseDraft.includes('"decision"'));
  assert.ok(!parsed.responseDraft.startsWith("{"));
});

test("Case C: sanitizeResponseText prevents raw JSON from leaking into the UI", () => {
  const rawSchema = '{"intent":{"primary":"FORM_STATUS"},"decision":{"type":"respond"}}';
  const sanitized = sanitizeResponseText(rawSchema, "hi");
  assert.ok(!sanitized.includes('"intent"'));
  assert.ok(!sanitized.startsWith("{"));
  assert.ok(sanitized.includes("फ़ॉर्म"));
});

test("Case D: Latin transliterated Hindi / Hinglish phrases are not misclassified as English", () => {
  assert.equal(detectConversationLanguage("aur rajya"), "hinglish");
  assert.equal(detectConversationLanguage("bihar se"), "hinglish");
  assert.equal(detectConversationLanguage("bihar bhar do"), "hinglish");
  assert.equal(detectConversationLanguage("और राज्य?"), "hi");
  assert.equal(detectConversationLanguage("बिहार बिहार से।"), "hi");
  assert.equal(detectConversationLanguage("किन चीज़ों को मुझे भरना है?"), "hi");
});

test("Case E: Thinking config is disabled on models that reject thinkingBudget", () => {
  assert.equal(isThinkingSupported("gemini-flash-lite-latest"), false);
  assert.equal(isThinkingSupported("gemini-1.5-flash"), false);
  assert.equal(isThinkingSupported("gemini-2.5-flash"), true);
});

test("Case F: Tool parameter schemas are sanitized for Gemini compatibility", () => {
  const schema = {
    type: "object",
    properties: {
      fieldId: { type: "string", description: "Identifier" },
      value: { description: "Any value" }, // missing type
    },
    required: ["fieldId"],
  };
  const sanitized = sanitizeToolParameters(schema);
  assert.equal(sanitized.type, "object");
  assert.equal(sanitized.properties.value.type, "string");
});

