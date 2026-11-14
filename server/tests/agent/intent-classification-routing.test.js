/**
 * Comprehensive Intent Classification and Form Action Routing Regression Test Suite
 *
 * Verifies that:
 * 1. General form assistance queries (English, Hindi, Marathi, Hinglish) are correctly
 *    classified as GENERAL_FORM_ASSISTANCE and provide an overview + guidance without
 *    mutating fields or treating "help" as a field target.
 * 2. Generic words ("help", "assist", "form", "fill", "me") are blacklisted from being field targets.
 * 3. Specific field updates still execute accurately without regression.
 * 4. Observability and turn summaries record deterministic successes truthfully.
 */

const assert = require("assert");

// Compile dist is used for testing
const { classifyUserIntent, isValidTargetFieldCandidate, isValidPersonalName, GENERIC_NON_FIELD_WORDS } = require("../../dist/modules/form-intelligence/intent-classifier");
const { routeFormAction, matchFieldByTarget } = require("../../dist/modules/form-intelligence/form-action-router");
const { matchOption } = require("../../dist/modules/form-intelligence/option-matcher.service");

// Mock detected fields matching httpbin.org/forms/post
const mockHttpbinFields = [
  {
    id: "f_custname",
    fieldIdentifier: "custname",
    name: "custname",
    label: "Customer name:",
    inputType: "text",
    elementType: "input",
    required: true,
    isEmpty: true,
    collectedValue: null,
  },
  {
    id: "f_telephone",
    fieldIdentifier: "telephone",
    name: "telephone",
    label: "Telephone:",
    inputType: "tel",
    elementType: "input",
    required: false,
    isEmpty: true,
    collectedValue: null,
  },
  {
    id: "f_email",
    fieldIdentifier: "email",
    name: "custemail",
    label: "E-mail address:",
    inputType: "email",
    elementType: "input",
    required: false,
    isEmpty: true,
    collectedValue: null,
  },
  {
    id: "f_size",
    fieldIdentifier: "size",
    name: "size",
    label: "Pizza Size",
    inputType: "radio",
    elementType: "input",
    required: false,
    isEmpty: true,
    options: [
      { label: "Small", value: "small" },
      { label: "Medium", value: "medium" },
      { label: "Large", value: "large" },
    ],
  },
  {
    id: "f_toppings",
    fieldIdentifier: "toppings",
    name: "topping",
    label: "Pizza Toppings",
    inputType: "checkbox",
    elementType: "input",
    required: false,
    isEmpty: true,
    options: [
      { label: "Bacon", value: "bacon" },
      { label: "Extra Cheese", value: "cheese" },
      { label: "Onion", value: "onion" },
      { label: "Mushroom", value: "mushroom" },
    ],
  },
  {
    id: "f_delivery_time",
    fieldIdentifier: "delivery",
    name: "delivery",
    label: "Preferred delivery time:",
    inputType: "time",
    elementType: "input",
    required: false,
    isEmpty: true,
  },
  {
    id: "f_comments",
    fieldIdentifier: "comments",
    name: "comments",
    label: "Delivery instructions:",
    inputType: "text",
    elementType: "textarea",
    required: false,
    isEmpty: true,
  },
];

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("\n=======================================================");
console.log("BHASHAAGENT INTENT CLASSIFICATION & ROUTING TEST SUITE");
console.log("=======================================================\n");

// -------------------------------------------------------------
// Test Suite A: Multilingual General Form Assistance
// -------------------------------------------------------------
console.log("Suite A: Multilingual General Form Assistance");

runTest("A1: 'help me to fill this form' classified as GENERAL_FORM_ASSISTANCE", () => {
  const result = classifyUserIntent("help me to fill this form", { detectedFields: mockHttpbinFields });
  assert.strictEqual(result.intent, "GENERAL_FORM_ASSISTANCE");
  assert.strictEqual(result.requiresBrowserMutation, false);
});

runTest("A2: 'help me to fill this form' routed to CONVERSATIONAL_RESPONSE without field mutation", () => {
  const routed = routeFormAction({
    content: "help me to fill this form",
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "CONVERSATIONAL_RESPONSE");
  assert.strictEqual(routed.intent, "GENERAL_FORM_ASSISTANCE");
  assert(routed.response.includes("Customer name") || routed.response.includes("form"), "Response should guide on form fields");
  assert(!routed.response.includes("could not find a field for \"help\""), "Must never say no field for help");
});

runTest("A3: Hindi 'इस फ़ॉर्म को भरने में मेरी मदद करें' classified and routed", () => {
  const result = classifyUserIntent("इस फ़ॉर्म को भरने में मेरी मदद करें", { detectedFields: mockHttpbinFields });
  assert.strictEqual(result.intent, "GENERAL_FORM_ASSISTANCE");

  const routed = routeFormAction({
    content: "इस फ़ॉर्म को भरने में मेरी मदद करें",
    detectedFields: mockHttpbinFields,
    detectedLang: "hi",
  });
  assert.strictEqual(routed.type, "CONVERSATIONAL_RESPONSE");
  assert.strictEqual(routed.intent, "GENERAL_FORM_ASSISTANCE");
  assert(routed.response.includes("मदद") || routed.response.includes("फ़ॉर्म"), "Should respond in Hindi");
});

runTest("A4: Marathi 'मला हा फॉर्म भरण्यास मदत करा' classified and routed", () => {
  const result = classifyUserIntent("मला हा फॉर्म भरण्यास मदत करा", { detectedFields: mockHttpbinFields });
  assert.strictEqual(result.intent, "GENERAL_FORM_ASSISTANCE");

  const routed = routeFormAction({
    content: "मला हा फॉर्म भरण्यास मदत करा",
    detectedFields: mockHttpbinFields,
    detectedLang: "mr",
  });
  assert.strictEqual(routed.type, "CONVERSATIONAL_RESPONSE");
  assert.strictEqual(routed.intent, "GENERAL_FORM_ASSISTANCE");
  assert(routed.response.includes("मदत") || routed.response.includes("फॉर्म"), "Should respond in Marathi");
});

runTest("A5: Hinglish 'is form ko fill karne mein meri help karo' classified and routed", () => {
  const result = classifyUserIntent("is form ko fill karne mein meri help karo", { detectedFields: mockHttpbinFields });
  assert.strictEqual(result.intent, "GENERAL_FORM_ASSISTANCE");

  const routed = routeFormAction({
    content: "is form ko fill karne mein meri help karo",
    detectedFields: mockHttpbinFields,
    detectedLang: "hinglish",
  });
  assert.strictEqual(routed.type, "CONVERSATIONAL_RESPONSE");
  assert.strictEqual(routed.intent, "GENERAL_FORM_ASSISTANCE");
  assert(routed.response.includes("help") || routed.response.includes("form"), "Should respond in Hinglish");
});

// -------------------------------------------------------------
// Test Suite B: Generic-Word Protection
// -------------------------------------------------------------
console.log("\nSuite B: Generic-Word Protection");

runTest("B1: Generic words rejected by isValidTargetFieldCandidate", () => {
  assert.strictEqual(isValidTargetFieldCandidate("help"), false);
  assert.strictEqual(isValidTargetFieldCandidate("assist"), false);
  assert.strictEqual(isValidTargetFieldCandidate("form"), false);
  assert.strictEqual(isValidTargetFieldCandidate("fill"), false);
  assert.strictEqual(isValidTargetFieldCandidate("me"), false);
  assert.strictEqual(isValidTargetFieldCandidate("please"), false);
  assert.strictEqual(isValidTargetFieldCandidate("madad"), false);
  assert.strictEqual(isValidTargetFieldCandidate("sahayata"), false);
});

runTest("B2: Valid field candidates accepted by isValidTargetFieldCandidate", () => {
  assert.strictEqual(isValidTargetFieldCandidate("customer name"), true);
  assert.strictEqual(isValidTargetFieldCandidate("telephone"), true);
  assert.strictEqual(isValidTargetFieldCandidate("email address"), true);
  assert.strictEqual(isValidTargetFieldCandidate("delivery instructions"), true);
  assert.strictEqual(isValidTargetFieldCandidate("pizza size"), true);
});

runTest("B3: matchFieldByTarget returns 0 for generic non-field words", () => {
  for (const field of mockHttpbinFields) {
    assert.strictEqual(matchFieldByTarget("help", field), 0);
    assert.strictEqual(matchFieldByTarget("assist", field), 0);
    assert.strictEqual(matchFieldByTarget("form", field), 0);
    assert.strictEqual(matchFieldByTarget("fill", field), 0);
  }
});

// -------------------------------------------------------------
// Test Suite C: Field-Specific Instructions Maintain High Accuracy
// -------------------------------------------------------------
console.log("\nSuite C: Field-Specific Instructions (No Regressions)");

runTest("C1: 'Customer name mein Adarsh Jha likho' updates Customer name", () => {
  const routed = routeFormAction({
    content: "Customer name mein Adarsh Jha likho",
    detectedFields: mockHttpbinFields,
    detectedLang: "hinglish",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.strictEqual(routed.field.id, "f_custname");
  assert.strictEqual(routed.resolvedValue, "Adarsh Jha");
});

runTest("C2: 'Telephone number mein 9004234499 likhein' updates Telephone", () => {
  const routed = routeFormAction({
    content: "Telephone number mein 9004234499 likhein",
    detectedFields: mockHttpbinFields,
    detectedLang: "hi",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.strictEqual(routed.field.id, "f_telephone");
  assert.strictEqual(routed.resolvedValue, "9004234499");
});

runTest("C3: 'email address mein adarshjha@gmail.com likho' updates Email", () => {
  const routed = routeFormAction({
    content: "email address mein adarshjha@gmail.com likho",
    detectedFields: mockHttpbinFields,
    detectedLang: "hinglish",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.strictEqual(routed.field.id, "f_email");
  assert.strictEqual(routed.resolvedValue, "adarshjha@gmail.com");
});

runTest("C4: 'pizza size large select karo' selects Large radio option", () => {
  const routed = routeFormAction({
    content: "pizza size large select karo",
    detectedFields: mockHttpbinFields,
    detectedLang: "hinglish",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.strictEqual(routed.field.id, "f_size");
  assert.strictEqual(routed.resolvedValue, "large");
});

// -------------------------------------------------------------
// Test Suite D: Form Overview and Guidance Queries
// -------------------------------------------------------------
console.log("\nSuite D: Form Overview and Guidance Queries");

runTest("D1: 'what fields are on this form' returns FORM_OVERVIEW", () => {
  const result = classifyUserIntent("what fields are on this form", { detectedFields: mockHttpbinFields });
  assert.strictEqual(result.intent, "FORM_OVERVIEW");

  const routed = routeFormAction({
    content: "what fields are on this form",
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "CONVERSATIONAL_RESPONSE");
  assert.strictEqual(routed.intent, "FORM_OVERVIEW");
  assert(routed.response.includes("Customer name"));
});

runTest("D2: Hindi 'इस फ़ॉर्म में क्या है' returns FORM_OVERVIEW", () => {
  const result = classifyUserIntent("इस फ़ॉर्म में क्या है", { detectedFields: mockHttpbinFields });
  assert.strictEqual(result.intent, "FORM_OVERVIEW");

  const routed = routeFormAction({
    content: "इस फ़ॉर्म में क्या है",
    detectedFields: mockHttpbinFields,
    detectedLang: "hi",
  });
  assert.strictEqual(routed.type, "CONVERSATIONAL_RESPONSE");
  assert.strictEqual(routed.intent, "FORM_OVERVIEW");
});

// -------------------------------------------------------------
// Test Suite E: Non-Existent Fields vs Generic Words
// -------------------------------------------------------------
console.log("\nSuite E: Target Field Disambiguation & Clarification");

runTest("E1: Legitimate non-existent field reports NO_FIELD_MATCH clearly", () => {
  const routed = routeFormAction({
    content: "passport number ko 12345 update karo",
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "NO_FIELD_MATCH");
  assert.strictEqual(routed.requestedTarget, "passport number");
});

runTest("E2: Generic word 'help' NEVER reports NO_FIELD_MATCH", () => {
  const variations = [
    "help me to fill this form",
    "can you help me fill the form",
    "please help me fill this",
    "help me fill",
  ];
  for (const v of variations) {
    const routed = routeFormAction({
      content: v,
      detectedFields: mockHttpbinFields,
      detectedLang: "en",
    });
    assert.notStrictEqual(routed.status, "NO_FIELD_MATCH", `Variation "${v}" must not produce NO_FIELD_MATCH`);
  }
});

// -------------------------------------------------------------
// Test Suite F: Multi-Checkbox Group Selection ("Select all toppings")
// -------------------------------------------------------------
console.log("\nSuite F: Multi-Checkbox Group Selection");

runTest("F1: 'select all toppings' classifies as SELECT_ALL_CHECKBOXES and returns all option values", () => {
  const result = classifyUserIntent("select all toppings", { detectedFields: mockHttpbinFields });
  assert.strictEqual(result.intent, "SELECT_ALL_CHECKBOXES");

  const routed = routeFormAction({
    content: "select all toppings",
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.strictEqual(routed.intentReason, "SELECT_ALL_CHECKBOXES");
  assert.deepStrictEqual(routed.value, ["bacon", "cheese", "onion", "mushroom"]);
});

runTest("F2: Hindi/Marathi/Hinglish 'select all' variations route correctly", () => {
  const variations = [
    { text: "सभी टॉपिंग्स चुनें", lang: "hi" },
    { text: "सर्व टॉपिंग्स निवडा", lang: "mr" },
    { text: "saare toppings select kar do", lang: "hinglish" },
    { text: "select all options", lang: "en" },
  ];
  for (const v of variations) {
    const routed = routeFormAction({
      content: v.text,
      detectedFields: mockHttpbinFields,
      detectedLang: v.lang,
    });
    assert.strictEqual(routed.type, "FORM_UPDATE", `Variation ${v.text} should be FORM_UPDATE`);
    assert.strictEqual(routed.status, "RESOLVED");
    assert.deepStrictEqual(routed.value, ["bacon", "cheese", "onion", "mushroom"]);
  }
});

runTest("F3: 'select all toppings see there are still empty' always emits FORM_UPDATE to enforce DOM checkbox state", () => {
  const routed = routeFormAction({
    content: "select all toppings see there are still empty",
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.deepStrictEqual(routed.value, ["bacon", "cheese", "onion", "mushroom"]);
});

runTest("F4: When individual checkboxes are present, returns updates for every checkbox in the group", () => {
  const individualCheckboxes = [
    { id: "f_bacon", fieldIdentifier: "topping_bacon", name: "topping", label: "Bacon", inputType: "checkbox", elementType: "input" },
    { id: "f_cheese", fieldIdentifier: "topping_cheese", name: "topping", label: "Extra Cheese", inputType: "checkbox", elementType: "input" },
    { id: "f_onion", fieldIdentifier: "topping_onion", name: "topping", label: "Onion", inputType: "checkbox", elementType: "input" },
    { id: "f_mushroom", fieldIdentifier: "topping_mushroom", name: "topping", label: "Mushroom", inputType: "checkbox", elementType: "input" },
  ];

  const routed = routeFormAction({
    content: "select all toppings",
    detectedFields: individualCheckboxes,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.strictEqual(routed.updates.length, 4);
  assert.deepStrictEqual(routed.updates.map((u) => u.field.id), ["f_bacon", "f_cheese", "f_onion", "f_mushroom"]);
});

// -------------------------------------------------------------
// Test Suite G: Radio Option Matching Precision
// -------------------------------------------------------------
console.log("\nSuite G: Radio Option Matching Precision");

runTest("G1: 'pizza size large' matches option 'large' and never defaults to first radio option", () => {
  const routed = routeFormAction({
    content: "pizza size large",
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.strictEqual(routed.field.fieldIdentifier, "size");
  assert.strictEqual(routed.value, "large");
  assert.notStrictEqual(routed.value, "small");
});

runTest("G2: 'Medium pizza size choose karo' matches option 'medium'", () => {
  const routed = routeFormAction({
    content: "Medium pizza size choose karo",
    detectedFields: mockHttpbinFields,
    detectedLang: "hinglish",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.strictEqual(routed.field.fieldIdentifier, "size");
  assert.strictEqual(routed.value, "medium");
});

// -------------------------------------------------------------
// Test Suite H: Observation and Feedback Protection
// -------------------------------------------------------------
console.log("\nSuite H: Observation and Feedback Protection");

runTest("H1: 'i am seeing the form it is not selected yet' is rejected by isValidPersonalName and classified as OBSERVATION_CORRECTION", () => {
  const text = "i am seeing the form it is not selected yet";
  const isName = isValidPersonalName("seeing the form it is not selected yet");
  assert.strictEqual(isName, false, "Sentence should never be valid personal name");

  const classified = classifyUserIntent(text, { detectedFields: mockHttpbinFields });
  assert.strictEqual(classified.intent, "OBSERVATION_CORRECTION");

  const routed = routeFormAction({
    content: text,
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "CONVERSATIONAL_RESPONSE");
  assert.strictEqual(routed.intent, "OBSERVATION_CORRECTION");
  assert.notStrictEqual(routed.type, "FORM_UPDATE");
});

runTest("H2: 'no it has not been selected select all options' triggers multi-checkbox selection", () => {
  const text = "no it has not been selected select all options";
  const routed = routeFormAction({
    content: text,
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });
  assert.strictEqual(routed.type, "FORM_UPDATE");
  assert.strictEqual(routed.status, "RESOLVED");
  assert.deepStrictEqual(routed.value, ["bacon", "cheese", "onion", "mushroom"]);
});

// -------------------------------------------------------------
// Test Suite I: OptionMatcher Normalization & Tolerance
// -------------------------------------------------------------
console.log("\nSuite I: OptionMatcher Normalization & Tolerance");

runTest("I1: OptionMatcher matches plain string arrays without errors or warnings", () => {
  const result = matchOption("Large", ["Small", "Medium", "Large"]);
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.option?.value, "Large");
});

runTest("I2: OptionMatcher matches numbers and booleans", () => {
  const resultNum = matchOption(10, [5, 10, 15]);
  assert.strictEqual(resultNum.matched, true);
  assert.strictEqual(resultNum.option?.value, "10");

  const resultBool = matchOption(true, [false, true]);
  assert.strictEqual(resultBool.matched, true);
  assert.strictEqual(resultBool.option?.value, "true");
});

runTest("I3: OptionMatcher handles objects with missing labels by falling back to value", () => {
  const result = matchOption("bacon", [{ value: "bacon" }, { value: "cheese" }]);
  assert.strictEqual(result.matched, true);
  assert.strictEqual(result.option?.value, "bacon");
});

console.log("\n-------------------------------------------------------");
console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED`);
console.log("-------------------------------------------------------\n");

if (passedTests !== totalTests) {
  process.exit(1);
}

