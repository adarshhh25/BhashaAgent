require("dotenv/config");

const assert = require("node:assert/strict");
const test = require("node:test");
const { config } = require("../../dist/config/environment");
const { TtsConfigurationError, validateTtsConfiguration } = require("../../dist/modules/voice/timbre.adapter");

test("rejects mismatched timbre-v2.5 and Shivani combination", () => {
  assert.throws(
    () => validateTtsConfiguration({
      ...config.gnaniTts,
      model: "timbre-v2.5",
      voice: "Shivani",
    }),
    (error) => error instanceof TtsConfigurationError
      && error.code === "TTS_CONFIGURATION_ERROR"
      && error.message.includes("not available"),
  );
});

test("validates active configured environment TTS settings", () => {
  assert.equal(config.gnaniTts.model, "timbre-v3.0");
  assert.equal(config.gnaniTts.voice, "Shivani");
  assert.doesNotThrow(() => validateTtsConfiguration(config.gnaniTts));
});

test("accepts documented v3.0 multilingual Shivani configuration", () => {
  assert.doesNotThrow(() => validateTtsConfiguration({
    ...config.gnaniTts,
    model: "timbre-v3.0",
    voice: "Shivani",
    language: "auto",
  }));
});

test("accepts documented v2.5 language-specific voices", () => {
  for (const [voice, language] of [["Bhavna", "hi-IN"], ["Kaveri", "en-IN"], ["Zahira", "mr-IN"], ["Poorvi", "hi-en"]]) {
    assert.doesNotThrow(() => validateTtsConfiguration({
      ...config.gnaniTts,
      model: "timbre-v2.5",
      voice,
      language,
    }));
  }
});
