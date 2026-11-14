import test from "node:test";
import assert from "node:assert/strict";

import { routeFormAction } from "../../dist/modules/form-intelligence/form-action-router.js";
import { convertFieldScript, devanagariToLatin, latinToDevanagari, cleanNameValue } from "../../dist/modules/form-intelligence/script-converter.service.js";

const mockDetectedFields = [
  {
    id: "f-name",
    fieldIdentifier: "customer_name",
    label: "Customer name",
    inputType: "text",
    elementType: "input",
    required: true,
    disabled: false,
    readOnly: false,
    status: "ACTIVE",
    sourceReference: { type: "field", id: "f-name", createdAt: new Date().toISOString() },
    collectedValue: "मैं आदर्श",
    isEmpty: false,
    isCollected: true,
  },
  {
    id: "f-phone",
    fieldIdentifier: "telephone",
    label: "Telephone",
    inputType: "tel",
    elementType: "input",
    required: true,
    disabled: false,
    readOnly: false,
    status: "ACTIVE",
    sourceReference: { type: "field", id: "f-phone", createdAt: new Date().toISOString() },
    collectedValue: "9004234499",
    isEmpty: false,
    isCollected: true,
  },
  {
    id: "f-email",
    fieldIdentifier: "email",
    label: "E-mail address",
    inputType: "email",
    elementType: "input",
    required: true,
    disabled: false,
    readOnly: false,
    status: "ACTIVE",
    sourceReference: { type: "field", id: "f-email", createdAt: new Date().toISOString() },
    collectedValue: "aadarshjha@gmail.com",
    isEmpty: false,
    isCollected: true,
  },
  {
    id: "f-time",
    fieldIdentifier: "delivery_time",
    label: "Preferred delivery time",
    inputType: "time",
    elementType: "input",
    required: false,
    disabled: false,
    readOnly: false,
    status: "ACTIVE",
    sourceReference: { type: "field", id: "f-time", createdAt: new Date().toISOString() },
    isEmpty: true,
    isCollected: false,
  },
];

// ============================================================================
// Phase 7A: Existing Field Script Conversion
// ============================================================================
test("7A.1: Transliterates 'आदर्श झा' to 'Adarsh Jha' without inventing surnames or literal translation", () => {
  const result = convertFieldScript("आदर्श झा", "latin");
  assert.equal(result.convertedValue, "Adarsh Jha");
  assert.equal(result.targetScript, "latin");
  assert.equal(result.changed, true);
});

test("7A.2: Transliterates 'Adarsh Jha' to 'आदर्श झा'", () => {
  const result = convertFieldScript("Adarsh Jha", "devanagari");
  assert.equal(result.convertedValue, "आदर्श झा");
  assert.equal(result.targetScript, "devanagari");
  assert.equal(result.changed, true);
});

test("7A.3: Transliterates 'राहुल शर्मा' to 'Rahul Sharma'", () => {
  const result = convertFieldScript("राहुल शर्मा", "latin");
  assert.equal(result.convertedValue, "Rahul Sharma");
});

test("7A.4: Preserves Latin proper noun 'Adarsh Jha' when already in English", () => {
  const result = convertFieldScript("Adarsh Jha", "latin");
  assert.equal(result.convertedValue, "Adarsh Jha");
  assert.equal(result.changed, false);
});

test("7A.5: Cleans conversational prefix 'मैं आदर्श' from screenshot and transliterates to 'Adarsh'", () => {
  const cleaned = cleanNameValue("मैं आदर्श");
  assert.equal(cleaned, "आदर्श");
  const result = convertFieldScript("मैं आदर्श", "latin");
  assert.equal(result.convertedValue, "Adarsh", "Must produce Adarsh without inventing missing surname");
});

test("7A.6: Ambiguous or empty existing name asks for clarification without guessing", () => {
  const emptyResult = convertFieldScript("", "latin");
  assert.equal(emptyResult.isAmbiguous, true);

  const routeRes = routeFormAction({
    content: "customer name ko english mein likho",
    detectedFields: [
      {
        ...mockDetectedFields[0],
        collectedValue: "",
        isEmpty: true,
      },
    ],
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "CONVERSATIONAL_RESPONSE");
  assert.ok(routeRes.response.includes("English mein kya likhna chahte hain") || routeRes.response.includes("full name"));
});

// ============================================================================
// Phase 7B: Natural Correction Instructions
// ============================================================================
test("7B.1: Exact screenshot scenario: 'customer name ko english mein likho' converts 'मैं आदर्श' to 'Adarsh'", () => {
  const routeRes = routeFormAction({
    content: "customer name ko english mein likho",
    detectedFields: mockDetectedFields,
    detectedLang: "hinglish",
    recentMessages: [
      { role: "user", content: "मेरा नाम आदर्श है" },
    ],
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.field.fieldIdentifier, "customer_name");
  assert.equal(routeRes.resolvedValue, "Adarsh");
  assert.equal(routeRes.intentReason, "CONVERT_FIELD_SCRIPT");
});

test("7B.2: Typo tolerance: 'cutomer name ko english mein likho' correctly matches 'customer_name'", () => {
  const routeRes = routeFormAction({
    content: "cutomer name ko english mein likho",
    detectedFields: mockDetectedFields,
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.field.fieldIdentifier, "customer_name");
  assert.equal(routeRes.resolvedValue, "Adarsh");
});

test("7B.3: 'name english mein kar do' resolves to Customer name and converts script", () => {
  const fields = [
    { ...mockDetectedFields[0], collectedValue: "आदर्श झा" },
    ...mockDetectedFields.slice(1),
  ];
  const routeRes = routeFormAction({
    content: "name english mein kar do",
    detectedFields: fields,
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.resolvedValue, "Adarsh Jha");
});

test("7B.4: 'Change customer name to Adarsh Kumar Jha' updates name with replacement value", () => {
  const routeRes = routeFormAction({
    content: "Change customer name to Adarsh Kumar Jha",
    detectedFields: mockDetectedFields,
    detectedLang: "en",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.field.fieldIdentifier, "customer_name");
  assert.equal(routeRes.resolvedValue, "Adarsh Kumar Jha");
});

test("7B.5: 'Actually my name is Adarsh Jha' updates name", () => {
  const routeRes = routeFormAction({
    content: "Actually my name is Adarsh Jha",
    detectedFields: mockDetectedFields,
    detectedLang: "en",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.resolvedValue, "Adarsh Jha");
});

test("7B.6: 'Phone number correct karo to 9876543210' updates telephone field", () => {
  const routeRes = routeFormAction({
    content: "Phone number correct karo to 9876543210",
    detectedFields: mockDetectedFields,
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.field.fieldIdentifier, "telephone");
  assert.equal(routeRes.resolvedValue, "9876543210");
});

test("7B.7: 'Phone number mein last digit galat hai, use 5 kar do' replaces last digit '9004234499' -> '9004234495'", () => {
  const routeRes = routeFormAction({
    content: "Phone number mein last digit galat hai, use 5 kar do",
    detectedFields: mockDetectedFields,
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.field.fieldIdentifier, "telephone");
  assert.equal(routeRes.resolvedValue, "9004234495");
});

test("7B.8: 'Email address ko update karo' asks for new email address without prematurely modifying field", () => {
  const routeRes = routeFormAction({
    content: "Email address ko update karo",
    detectedFields: mockDetectedFields,
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "CONVERSATIONAL_RESPONSE");
  assert.ok(routeRes.response.toLowerCase().includes("mail") || routeRes.response.includes("ईमेल"));
});

// ============================================================================
// Phase 7C: Conversation Context
// ============================================================================
test("7C.1: 'Isko English mein likho' resolves 'isko' to the active Customer name field", () => {
  const routeRes = routeFormAction({
    content: "Isko English mein likho",
    detectedFields: mockDetectedFields,
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.field.fieldIdentifier, "customer_name");
  assert.equal(routeRes.resolvedValue, "Adarsh");
});

test("7C.2: 'Maine jo naam diya tha usko English letters mein likho' resolves to Customer name", () => {
  const fields = [
    { ...mockDetectedFields[0], collectedValue: "आदर्श झा" },
    ...mockDetectedFields.slice(1),
  ];
  const routeRes = routeFormAction({
    content: "Maine jo naam diya tha usko English letters mein likho",
    detectedFields: fields,
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.field.fieldIdentifier, "customer_name");
  assert.equal(routeRes.resolvedValue, "Adarsh Jha");
});

test("7C.3: 'Customer name Hindi mein likho' converts 'Adarsh Jha' to 'आदर्श झा'", () => {
  const fields = [
    { ...mockDetectedFields[0], collectedValue: "Adarsh Jha" },
    ...mockDetectedFields.slice(1),
  ];
  const routeRes = routeFormAction({
    content: "Customer name Hindi mein likho",
    detectedFields: fields,
    detectedLang: "hinglish",
  });

  assert.equal(routeRes.type, "FORM_UPDATE");
  assert.equal(routeRes.status, "RESOLVED");
  assert.equal(routeRes.field.fieldIdentifier, "customer_name");
  assert.equal(routeRes.resolvedValue, "आदर्श झा");
});

// ============================================================================
// Phase 7E: Screenshot Failure Reproduction & Regression Suite
// ============================================================================
test("7E.1: Screenshot 2 input 1: 'customer name को english में लिखें, आदर्श झा।' resolves to Adarsh Jha", () => {
  const fields = [
    {
      id: "f-custname",
      fieldIdentifier: "custname",
      label: "Customer name:",
      name: "custname",
      inputType: "text",
      elementType: "input",
      required: true,
      disabled: false,
      readOnly: false,
      status: "ACTIVE",
      sourceReference: { type: "field", id: "f-custname", createdAt: new Date().toISOString() },
      currentValue: "आदर्श झा",
      isEmpty: false,
      isCollected: true,
    },
  ];
  const res = routeFormAction({
    content: "customer name को english में लिखें, आदर्श झा।",
    detectedFields: fields,
    detectedLang: "hi",
  });

  assert.equal(res.type, "FORM_UPDATE");
  assert.equal(res.status, "RESOLVED");
  assert.equal(res.field.fieldIdentifier, "custname");
  assert.equal(res.resolvedValue, "Adarsh Jha");
  assert.equal(res.intentReason, "CONVERT_FIELD_SCRIPT");
});

test("7E.2: Screenshot 2 input 2: 'customer name को english में लिखें।' converts existing 'आदर्श झा' to Adarsh Jha", () => {
  const fields = [
    {
      id: "f-custname",
      fieldIdentifier: "custname",
      label: "Customer name:",
      name: "custname",
      inputType: "text",
      elementType: "input",
      required: true,
      disabled: false,
      readOnly: false,
      status: "ACTIVE",
      sourceReference: { type: "field", id: "f-custname", createdAt: new Date().toISOString() },
      currentValue: "आदर्श झा",
      isEmpty: false,
      isCollected: true,
    },
  ];
  const res = routeFormAction({
    content: "customer name को english में लिखें।",
    detectedFields: fields,
    detectedLang: "hi",
  });

  assert.equal(res.type, "FORM_UPDATE");
  assert.equal(res.status, "RESOLVED");
  assert.equal(res.field.fieldIdentifier, "custname");
  assert.equal(res.resolvedValue, "Adarsh Jha");
  assert.equal(res.intentReason, "CONVERT_FIELD_SCRIPT");
});

test("7E.3: Screenshot 2 input 3: 'आदर्श झा उसे English में लिखें।' resolves to Adarsh Jha", () => {
  const fields = [
    {
      id: "f-custname",
      fieldIdentifier: "custname",
      label: "Customer name:",
      name: "custname",
      inputType: "text",
      elementType: "input",
      required: true,
      disabled: false,
      readOnly: false,
      status: "ACTIVE",
      sourceReference: { type: "field", id: "f-custname", createdAt: new Date().toISOString() },
      currentValue: "आदर्श झा",
      isEmpty: false,
      isCollected: true,
    },
  ];
  const res = routeFormAction({
    content: "आदर्श झा उसे English में लिखें।",
    detectedFields: fields,
    detectedLang: "hi",
  });

  assert.equal(res.type, "FORM_UPDATE");
  assert.equal(res.status, "RESOLVED");
  assert.equal(res.field.fieldIdentifier, "custname");
  assert.equal(res.resolvedValue, "Adarsh Jha");
  assert.equal(res.intentReason, "CONVERT_FIELD_SCRIPT");
});

test("7E.4: Screenshot 1 input 1: 'आदर्श झा को update करें' updates name field", () => {
  const fields = [
    {
      id: "f-custname",
      fieldIdentifier: "custname",
      label: "Customer name:",
      name: "custname",
      inputType: "text",
      elementType: "input",
      required: true,
      disabled: false,
      readOnly: false,
      status: "ACTIVE",
      sourceReference: { type: "field", id: "f-custname", createdAt: new Date().toISOString() },
      currentValue: "मैं आदर्श",
      isEmpty: false,
      isCollected: true,
    },
  ];
  const res = routeFormAction({
    content: "आदर्श झा को update करें",
    detectedFields: fields,
    detectedLang: "hi",
  });

  assert.equal(res.type, "FORM_UPDATE");
  assert.equal(res.status, "RESOLVED");
  assert.equal(res.field.fieldIdentifier, "custname");
  assert.equal(res.resolvedValue, "आदर्श झा");
  assert.equal(res.intentReason, "UPDATE_EXISTING_FIELD");
});

// ============================================================================
// Phase 7F: Instruction Fragment Protection & Real-World Regression Safeguards
// ============================================================================
test("7F.1: 'the cutomer name' and 'english same name' are never extracted as field values", () => {
  const fields = [
    {
      id: "f-custname",
      fieldIdentifier: "custname",
      label: "Customer name:",
      inputType: "text",
      isEmpty: false,
      collectedValue: "मैं आदर्श",
    },
  ];
  const res = routeFormAction({
    content: "write the cutomer name in english same name",
    detectedFields: fields,
    detectedLang: "en",
    recentMessages: [],
  });

  assert.equal(res.type, "FORM_UPDATE");
  assert.equal(res.status, "RESOLVED");
  assert.equal(res.field.fieldIdentifier, "custname");
  // Value MUST be the converted on-page value 'Adarsh', NEVER 'the cutomer name' or 'same name'
  assert.equal(res.resolvedValue, "Adarsh");
  assert.notEqual(res.resolvedValue, "the cutomer name");
  assert.notEqual(res.resolvedValue, "english same name");
});

test("7F.2: Screenshot 2 input 1: 'customer name को english में लिखें, आदर्श झा।' resolves to 'Adarsh Jha'", () => {
  const fields = [
    {
      id: "f-custname",
      fieldIdentifier: "custname",
      label: "Customer name:",
      inputType: "text",
      isEmpty: false,
      collectedValue: "आदर्श झा",
    },
  ];
  const res = routeFormAction({
    content: "customer name को english में लिखें, आदर्श झा।",
    detectedFields: fields,
    detectedLang: "hi",
    recentMessages: [],
  });

  assert.equal(res.type, "FORM_UPDATE");
  assert.equal(res.status, "RESOLVED");
  assert.equal(res.field.fieldIdentifier, "custname");
  assert.equal(res.resolvedValue, "Adarsh Jha");
});

test("7F.3: Command fragment as explicit value falls back to conversational clarification instead of malformed proposal", () => {
  const fields = [
    {
      id: "f-custname",
      fieldIdentifier: "custname",
      label: "Customer name:",
      inputType: "text",
      isEmpty: true,
    },
  ];
  // Empty existing value with command tokens
  const res = routeFormAction({
    content: "set customer name to same name",
    detectedFields: fields,
    detectedLang: "en",
    recentMessages: [],
  });

  // Must not approve "same name" as a valid customer name
  assert.notEqual(res.type, "FORM_UPDATE");
});
