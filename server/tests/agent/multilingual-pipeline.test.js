const assert = require("node:assert/strict");
const test = require("node:test");
const { detectConversationLanguage } = require("../../dist/modules/agent/language-detector");
const { matchOption } = require("../../dist/modules/form-intelligence/option-matcher.service");
const { conceptForText } = require("../../dist/modules/form-intelligence/field-matcher.service");
const { systemPrompt } = require("../../dist/modules/agent/agent.prompt");

test("Language Detection: detects conversation language at message/turn level", () => {
  // English inputs
  assert.equal(detectConversationLanguage("Hello, how are you?"), "en");
  assert.equal(detectConversationLanguage("Select Maharashtra"), "en");
  assert.equal(detectConversationLanguage("Help me fill this form"), "en");
  assert.equal(detectConversationLanguage("What is your telephone number?"), "en");

  // Hindi inputs (Devanagari)
  assert.equal(detectConversationLanguage("मेरा नाम आदर्श है।"), "hi");
  assert.equal(detectConversationLanguage("इस फॉर्म में मेरा टेलीफोन नंबर भर दो।"), "hi");
  assert.equal(detectConversationLanguage("महाराष्ट्र चुनो।"), "hi");
  assert.equal(detectConversationLanguage("मुझे यह फॉर्म भरना है"), "hi");

  // Marathi inputs (Devanagari)
  assert.equal(detectConversationLanguage("मला मदत हवी आहे."), "mr");
  assert.equal(detectConversationLanguage("माझा पत्ता भरून दे."), "mr");
  assert.equal(detectConversationLanguage("महाराष्ट्र राज्य निवडा."), "mr");
  assert.equal(detectConversationLanguage("मला हा फॉर्म भरायचा आहे"), "mr");
  assert.equal(detectConversationLanguage("माझा जिल्हा ठाणे आहे."), "mr");

  // Hinglish inputs (Latin script Hindi/English mix)
  assert.equal(detectConversationLanguage("Mera naam Adarsh hai"), "hinglish");
  assert.equal(detectConversationLanguage("Mujhe ye form bharna hai"), "hinglish");
  assert.equal(detectConversationLanguage("Mera phone number is form mein fill kar do"), "hinglish");
  assert.equal(detectConversationLanguage("Mera district Thane select kar do"), "hinglish");
  assert.equal(detectConversationLanguage("Isme mera phone number daal do"), "hinglish");
  assert.equal(detectConversationLanguage("Haan, ye sahi hai"), "hinglish");
  assert.equal(detectConversationLanguage("Nahi, dusra option select karo"), "hinglish");
  assert.equal(detectConversationLanguage("Ab mera address fill karo"), "hinglish");
});

test("Language Detection: supports dynamic switching within the same conversation without locking", () => {
  const turns = [
    { text: "मुझे फॉर्म भरना है।", expected: "hi" },
    { text: "My phone number is 9876543210.", expected: "en" },
    { text: "अब मेरा address भर दो।", expected: "hi" },
    { text: "माझा जिल्हा ठाणे निवडा.", expected: "mr" },
    { text: "Pehle Maharashtra select karo.", expected: "hinglish" },
  ];

  for (const turn of turns) {
    const detected = detectConversationLanguage(turn.text);
    assert.equal(detected, turn.expected, `Expected ${turn.expected} for text: "${turn.text}", got ${detected}`);
  }
});

test("Multilingual Option Matching: Hindi speech to English dropdown options", () => {
  const stateOptions = [
    { label: "Maharashtra", value: "MH" },
    { label: "Gujarat", value: "GJ" },
    { label: "Rajasthan", value: "RJ" },
    { label: "Karnataka", value: "KA" },
  ];

  // User says "महाराष्ट्र"
  const matchResult = matchOption("महाराष्ट्र", stateOptions);
  assert.equal(matchResult.matched, true);
  assert.equal(matchResult.option?.value, "MH");
  assert.equal(matchResult.option?.label, "Maharashtra");
  assert.ok(matchResult.confidence >= 0.9);
});

test("Multilingual Option Matching: English speech to Hindi dropdown options", () => {
  const hindiOptions = [
    { label: "महाराष्ट्र", value: "महाराष्ट्र" },
    { label: "गुजरात", value: "गुजरात" },
    { label: "राजस्थान", value: "राजस्थान" },
  ];

  // User says "Select Maharashtra" or "Maharashtra"
  const matchResult = matchOption("Maharashtra", hindiOptions);
  assert.equal(matchResult.matched, true);
  assert.equal(matchResult.option?.value, "महाराष्ट्र");
  assert.equal(matchResult.option?.label, "महाराष्ट्र");
});

test("Multilingual Option Matching: Hinglish and Marathi speech to English dropdowns", () => {
  const districtOptions = [
    { label: "Mumbai", value: "mumbai" },
    { label: "Thane", value: "thane" },
    { label: "Pune", value: "pune" },
    { label: "Nashik", value: "nashik" },
  ];

  // Hinglish / Marathi: "ठाणे" -> Thane
  const thaneMatch = matchOption("ठाणे", districtOptions);
  assert.equal(thaneMatch.matched, true);
  assert.equal(thaneMatch.option?.value, "thane");

  // Marathi: "पुणे" -> Pune
  const puneMatch = matchOption("पुणे", districtOptions);
  assert.equal(puneMatch.matched, true);
  assert.equal(puneMatch.option?.value, "pune");
});

test("Multilingual Option Matching: Gender options across languages", () => {
  const genderOptions = [
    { label: "Male", value: "M" },
    { label: "Female", value: "F" },
    { label: "Other", value: "O" },
  ];

  // Hindi: "पुरुष" -> M
  const maleMatch = matchOption("पुरुष", genderOptions);
  assert.equal(maleMatch.matched, true);
  assert.equal(maleMatch.option?.value, "M");

  // Hindi/Marathi: "महिला" -> F
  const femaleMatch = matchOption("महिला", genderOptions);
  assert.equal(femaleMatch.matched, true);
  assert.equal(femaleMatch.option?.value, "F");
});

test("Multilingual Option Matching: Never invents options or selects invalid values", () => {
  const options = [
    { label: "Apples", value: "apple" },
    { label: "Bananas", value: "banana" },
  ];
  const invalidMatch = matchOption("महाराष्ट्र", options);
  assert.equal(invalidMatch.matched, false);
});

test("Multilingual Field Concept Matching: identifies concepts across English, Hindi, and Marathi", () => {
  // Full Name
  assert.equal(conceptForText("Full Name"), "full_name");
  assert.equal(conceptForText("Candidate Name"), "full_name");
  assert.equal(conceptForText("पूरा नाम"), "full_name");
  assert.equal(conceptForText("पूर्ण नाव"), "full_name");
  assert.equal(conceptForText("उमेदवाराचे नाव"), "full_name");

  // Phone / Telephone
  assert.equal(conceptForText("Telephone Number"), "phone");
  assert.equal(conceptForText("दूरभाष नंबर"), "phone");
  assert.equal(conceptForText("दूरध्वनी क्रमांक"), "phone");
  assert.equal(conceptForText("मोबाईल नंबर"), "phone");

  // Address
  assert.equal(conceptForText("Address"), "current_address");
  assert.equal(conceptForText("पता"), "current_address");
  assert.equal(conceptForText("पत्ता"), "current_address");

  // State & District
  assert.equal(conceptForText("State"), "state");
  assert.equal(conceptForText("राज्य"), "state");
  assert.equal(conceptForText("District"), "district");
  assert.equal(conceptForText("जिला"), "district");
  assert.equal(conceptForText("जिल्हा"), "district");

  // Date of Birth & Gender
  assert.equal(conceptForText("Date of Birth"), "date_of_birth");
  assert.equal(conceptForText("जन्म तिथि"), "date_of_birth");
  assert.equal(conceptForText("जन्मतारीख"), "date_of_birth");
  assert.equal(conceptForText("Gender"), "gender");
  assert.equal(conceptForText("लिंग"), "gender");
});

test("System Prompt: enforces CONVERSATION LANGUAGE POLICY independently of English Form Context", () => {
  function makeContext(content, userPref = "en") {
    return {
      schemaVersion: "1.0",
      request: {
        requestId: "req-1",
        createdAt: new Date().toISOString(),
        currentUserMessage: { content, source: "text" },
      },
      user: { id: "user-1", preferredLanguage: userPref },
      conversation: { id: "conv-1", status: "ACTIVE", recentMessages: [], relevantOlderContext: [], corrections: [] },
      profileMemory: { approvedFacts: [] },
      formTask: {
        id: "task-1",
        webpage: { title: "Job Portal (English)", url: "https://example.com/apply" },
        detectedFields: [
          { id: "f1", fieldIdentifier: "name", label: "Full Name", inputType: "text", required: true },
          { id: "f2", fieldIdentifier: "phone", label: "Telephone Number", inputType: "tel", required: true },
        ],
        proposedValues: [],
        missingInformation: [],
      },
      contextMetadata: { builtAt: new Date().toISOString(), sourceCounts: { recentMessages: 0, olderMessages: 0, approvedMemories: 0, detectedFields: 2, proposedValues: 0 }, truncated: false, omittedItems: [], warnings: [], sourceReferences: [] },
    };
  }

  // Even with an English FormTask on the page:
  // 1. Hindi turn produces Hindi conversation language policy
  const hindiPrompt = systemPrompt(makeContext("इस फॉर्म में मेरा टेलीफोन नंबर भर दो।"), []);
  assert.ok(hindiPrompt.includes("CONVERSATION LANGUAGE POLICY — STRICT HINDI"));
  assert.ok(hindiPrompt.includes("NEVER reply in English simply because form labels or webpage elements are in English"));

  // 2. Marathi turn produces Marathi conversation language policy
  const marathiPrompt = systemPrompt(makeContext("माझा पत्ता भरून दे."), []);
  assert.ok(marathiPrompt.includes("CONVERSATION LANGUAGE POLICY — STRICT MARATHI"));
  assert.ok(marathiPrompt.includes("NEVER reply in English or Hindi simply because the active webpage is in English"));

  // 3. Hinglish turn produces Hinglish conversation language policy
  const hinglishPrompt = systemPrompt(makeContext("Mera phone number is form mein fill kar do."), []);
  assert.ok(hinglishPrompt.includes("CONVERSATION LANGUAGE POLICY — STRICT HINGLISH"));

  // 4. English turn produces English policy
  const englishPrompt = systemPrompt(makeContext("Please fill in my telephone number."), []);
  assert.ok(englishPrompt.includes("CONVERSATION LANGUAGE POLICY — ENGLISH"));
});

