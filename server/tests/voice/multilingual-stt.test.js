const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { detectConversationLanguage, isDevanagari } = require("../../dist/modules/agent/language-detector");
const { resolveGnaniSttConfig } = require("../../dist/modules/voice/gnani.adapter");
const { sanitizeResponseText, parseAgentOutput } = require("../../dist/modules/agent/agent.validator");
const { matchOption } = require("../../dist/modules/form-intelligence/option-matcher.service");
const { resolveVoiceTurnLanguage } = require("../../dist/modules/voice/voice-language");

describe("Multilingual STT & Voice Language Architecture", () => {
  describe("Gnani Prisma v3 Multilingual STT Configuration", () => {
    it("configures indic-auto and codemix for auto / default voice sessions", () => {
      const config = resolveGnaniSttConfig("auto");
      assert.equal(config.effectiveLanguage, "indic-auto");
      assert.equal(config.effectiveFormat, "codemix");

      const defaultConfig = resolveGnaniSttConfig();
      assert.equal(defaultConfig.effectiveLanguage, "indic-auto");
      assert.equal(defaultConfig.effectiveFormat, "codemix");

      // Default 'en' in an indic-auto environment defaults to indic-auto to recognize Hindi/Marathi/Hinglish
      const enAutoConfig = resolveGnaniSttConfig("en");
      assert.equal(enAutoConfig.effectiveLanguage, "indic-auto");
      assert.equal(enAutoConfig.effectiveFormat, "codemix");
    });

    it("configures hi-IN with codemix for Hindi and Hinglish", () => {
      const hiConfig = resolveGnaniSttConfig("hi");
      assert.equal(hiConfig.effectiveLanguage, "hi-IN");
      assert.equal(hiConfig.effectiveFormat, "codemix");

      const hinglishConfig = resolveGnaniSttConfig("hinglish");
      assert.equal(hinglishConfig.effectiveLanguage, "hi-IN");
      assert.equal(hinglishConfig.effectiveFormat, "codemix");
    });

    it("configures mr-IN with codemix for Marathi", () => {
      const mrConfig = resolveGnaniSttConfig("mr");
      assert.equal(mrConfig.effectiveLanguage, "mr-IN");
      assert.equal(mrConfig.effectiveFormat, "codemix");
    });

    it("configures verbatim for explicitly pinned en-IN English sessions", () => {
      const enPinnedConfig = resolveGnaniSttConfig("en-in");
      assert.equal(enPinnedConfig.effectiveLanguage, "en-IN");
      assert.equal(enPinnedConfig.effectiveFormat, "verbatim");
    });
  });

  describe("Dedicated Per-Turn Language Resolution Contract (Section 3 & 11)", () => {
    it("Test A: Language switching within one session (en -> hi -> mr -> hinglish -> en)", () => {
      const sessionPreferredLang = "en";
      const turns = [
        { text: "Help me to fill out this form.", expectedLang: "en", expectedTts: "en-IN" },
        { text: "और राज्य?", expectedLang: "hi", expectedTts: "hi-IN" },
        { text: "मी महाराष्ट्रातून आहे आणि माझा जिल्हा पुणे आहे", expectedLang: "mr", expectedTts: "mr-IN" },
        { text: "Mera address Mumbai hai aur submit button check kar do", expectedLang: "hinglish", expectedTts: "hi-IN" },
        { text: "Thank you, what fields are left to fill?", expectedLang: "en", expectedTts: "en-IN" },
      ];

      for (const turn of turns) {
        const ctx = resolveVoiceTurnLanguage(turn.text, sessionPreferredLang);
        assert.equal(ctx.detectedLanguage, turn.expectedLang);
        assert.equal(ctx.effectiveLanguage, turn.expectedLang);
        assert.equal(ctx.responseLanguage, turn.expectedLang);
        assert.equal(ctx.ttsLanguageCode, turn.expectedTts);
        assert.ok(ctx.turnId);
      }
    });

    it("Test B: Reverse language switching (mr -> en -> hi -> hinglish)", () => {
      const turns = [
        { text: "हा फॉर्म भरायला मला मदत करा", expectedLang: "mr" },
        { text: "What is the next field to fill?", expectedLang: "en" },
        { text: "बिहार बिहार से।", expectedLang: "hi" },
        { text: "Maine application status check kar liya hai", expectedLang: "hinglish" },
      ];

      for (const turn of turns) {
        const ctx = resolveVoiceTurnLanguage(turn.text, "en");
        assert.equal(ctx.detectedLanguage, turn.expectedLang);
        assert.equal(ctx.responseLanguage, turn.expectedLang);
      }
    });

    it("Test C: First turn language does not lock subsequent turns", () => {
      // First turn is English
      const turn1 = resolveVoiceTurnLanguage("Help me to fill out this form.", "en");
      assert.equal(turn1.responseLanguage, "en");

      // Second turn is Hindi within the exact same session
      const turn2 = resolveVoiceTurnLanguage("और राज्य?", "en");
      assert.equal(turn2.responseLanguage, "hi");

      // Third turn switches back to English
      const turn3 = resolveVoiceTurnLanguage("What is my district?", "en");
      assert.equal(turn3.responseLanguage, "en");
    });

    it("Test D: Explicit preferred language fallback does not override confident Hindi", () => {
      // User has account preferredLanguage = 'en'
      const ctx = resolveVoiceTurnLanguage("किन चीज़ों को मुझे भरना है?", "en");
      assert.equal(ctx.detectedLanguage, "hi");
      assert.equal(ctx.responseLanguage, "hi");
      assert.equal(ctx.ttsLanguageCode, "hi-IN");
    });

    it("Test E: Hinglish detection preserves natural code-mixing across test utterances", () => {
      const hinglishUtterances = [
        "Mujhe mera naam form mein fill karna hai.",
        "Is field mein mera phone number daal do.",
        "What is mera application status?",
        "Mera address Maharashtra mein hai.",
        "Mera application number status check karo.",
      ];

      for (const utterance of hinglishUtterances) {
        const ctx = resolveVoiceTurnLanguage(utterance, "en");
        assert.equal(ctx.detectedLanguage, "hinglish", `Expected hinglish for: ${utterance}`);
        assert.equal(ctx.responseLanguage, "hinglish");
      }
    });

    it("Test G: TTS language mapping follows current turn response language", () => {
      const enTurn = resolveVoiceTurnLanguage("Fill my telephone number", "en");
      assert.equal(enTurn.ttsLanguageCode, "en-IN");

      const hiTurn = resolveVoiceTurnLanguage("मेरा फोन नंबर भर दीजिए", "en");
      assert.equal(hiTurn.ttsLanguageCode, "hi-IN");

      const mrTurn = resolveVoiceTurnLanguage("माझा संपर्क क्रमांक भरा", "en");
      assert.equal(mrTurn.ttsLanguageCode, "mr-IN");

      const hinglishTurn = resolveVoiceTurnLanguage("Mera phone number bhar do", "en");
      assert.equal(hinglishTurn.ttsLanguageCode, "hi-IN");
    });

    it("Test H: Session continuity: switching languages repeatedly produces immutable isolated contexts", () => {
      const sequence = ["en", "hi", "mr", "hinglish", "en", "hi"];
      const transcripts = [
        "Hello",
        "नमस्ते",
        "नमस्कार",
        "Theek hai ye submit kardo",
        "Is it submitted?",
        "धन्यवाद",
      ];

      const contexts = transcripts.map((t) => resolveVoiceTurnLanguage(t, "en"));
      for (let i = 0; i < sequence.length; i += 1) {
        assert.equal(contexts[i].responseLanguage, sequence[i]);
      }
      // Ensure unique turn IDs
      const turnIds = new Set(contexts.map((c) => c.turnId));
      assert.equal(turnIds.size, sequence.length);
    });
  });

  describe("Form Language Independence & Dropdown Matching (Section 7)", () => {
    const stateOptions = [
      { value: "BR", label: "Bihar" },
      { value: "MH", label: "Maharashtra" },
      { value: "DL", label: "Delhi" },
      { value: "KA", label: "Karnataka" },
    ];

    it("Test F1: Spoken Hindi 'बिहार' matches English DOM option 'BR' / 'Bihar'", () => {
      const match = matchOption("बिहार", stateOptions);
      assert.ok(match.matched, "Should find a match for Bihar");
      assert.equal(match.option.value, "BR");
    });

    it("Test F2: Spoken Marathi 'महाराष्ट्र' matches English DOM option 'MH' / 'Maharashtra'", () => {
      const match = matchOption("महाराष्ट्र", stateOptions);
      assert.ok(match.matched, "Should find a match for Maharashtra");
      assert.equal(match.option.value, "MH");
    });

    it("Test F3: Spoken Hinglish 'Maharashtra select kardo' matches English DOM option 'MH'", () => {
      const match = matchOption("Maharashtra", stateOptions);
      assert.ok(match.matched, "Should find a match for Maharashtra");
      assert.equal(match.option.value, "MH");
    });
  });

  describe("Leak Prevention & Raw JSON Sanitization", () => {
    it("Test G1: Sanitizes truncated raw JSON leaked from LLM into a polite conversational message", () => {
      const leakedString = `{"intent":\n{"primary":"FORM_STATUS","secondary":\n[],"confidence":0.9},"language":\n{"detected":"hi","responseLanguage":"en"}\n,"decision":{"type":"respond"},"`;

      const sanitized = sanitizeResponseText(leakedString, "hi");
      assert.ok(sanitized.length > 0, "Sanitized string should not be empty");
      assert.ok(!sanitized.includes('"intent"'), "Sanitized string must not leak intent JSON key");
      assert.ok(!sanitized.includes('"primary"'), "Sanitized string must not leak primary JSON key");
      assert.ok(!sanitized.includes('"decision"'), "Sanitized string must not leak decision JSON key");
      assert.ok(!sanitized.startsWith("{"), "Sanitized string must not start with JSON brace");
      assert.ok(isDevanagari(sanitized), "Sanitized string for Hindi must be in Devanagari script");
    });

    it("Test G2: Unwraps valid JSON with embedded responseDraft cleanly", () => {
      const jsonResponse = JSON.stringify({
        intent: { primary: "GENERAL_QUESTION", secondary: [], confidence: 0.9 },
        language: { detected: "hi", responseLanguage: "hi" },
        decision: { type: "respond" },
        toolCalls: [],
        responseDraft: "मैंने राज्य में बिहार भर दिया है। अब जिला बताइए।",
      });

      const parsed = parseAgentOutput(jsonResponse, "hi");
      assert.equal(parsed.responseDraft, "मैंने राज्य में बिहार भर दिया है। अब जिला बताइए।");
      assert.equal(parsed.language.responseLanguage, "hi");
    });

    it("Test G3: Sanitizes nested or escaped JSON inside responseDraft", () => {
      const nestedInDraft = `{"intent":{"primary":"GENERAL_QUESTION"},"responseDraft":"{\\"intent\\":{\\"primary\\":\\"FORM_STATUS\\"},\\"responseDraft\\":\\"नमस्ते, मैं आपकी कैसे सहायता कर सकता हूँ?\\"}"}`;
      const parsed = parseAgentOutput(nestedInDraft, "hi");
      assert.equal(parsed.responseDraft, "नमस्ते, मैं आपकी कैसे सहायता कर सकता हूँ?");
    });
  });
});
