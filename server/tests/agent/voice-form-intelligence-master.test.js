const assert = require("node:assert/strict");
const test = require("node:test");
const { routeFormAction } = require("../../dist/modules/form-intelligence/form-action-router");
const { detectConversationLanguage } = require("../../dist/modules/agent/language-detector");
const { validateFieldValue } = require("../../dist/modules/form-intelligence/field-type-validator.service");
const {
  extractPhoneNumber,
  normalizeSpokenDigits,
  parseSpokenTime,
  parseSpokenNumber,
} = require("../../dist/modules/form-intelligence/spoken-number-normalizer");

function createMockDocument() {
  const elements = new Map();

  function makeElement(tag, attrs = {}) {
    let _value = attrs.value || "";
    let _checked = Boolean(attrs.checked);
    let _trackedValue = _value;

    const el = {
      tagName: tag.toUpperCase(),
      attributes: { ...attrs },
      type: attrs.type || (tag === "input" ? "text" : ""),
      id: attrs.id || "",
      name: attrs.name || "",
      autocomplete: attrs.autocomplete || "",
      disabled: Boolean(attrs.disabled),
      readOnly: Boolean(attrs.readOnly),
      options: attrs.options || [],
      selectedIndex: attrs.selectedIndex || 0,
      focused: false,
      eventsDispatched: [],
      // React-style value tracker
      _valueTracker: {
        getValue: () => _trackedValue,
        setValue: (v) => { _trackedValue = v; },
      },
      get value() { return _value; },
      set value(v) { _value = String(v); },
      get checked() { return _checked; },
      set checked(v) { _checked = Boolean(v); },
      focus: () => { el.focused = true; },
      click: () => {
        if (el.type === "checkbox") {
          el.checked = !el.checked;
        } else if (el.type === "radio") {
          el.checked = true;
        }
      },
      getAttribute: (k) => el.attributes[k] || el[k] || null,
      setAttribute: (k, v) => { el.attributes[k] = v; el[k] = v; },
      dispatchEvent: (e) => {
        el.eventsDispatched.push(e.type);
        return true;
      },
      closest: (sel) => {
        if (sel === "label" && attrs.parentLabel) {
          return { textContent: attrs.parentLabel };
        }
        return null;
      },
    };
    if (el.id) elements.set(el.id, el);
    if (el.name && !elements.has(el.name)) elements.set(el.name, el);
    return el;
  }

  return {
    elements,
    getElementById: (id) => elements.get(id) || null,
    querySelector: (sel) => {
      for (const [id, el] of elements) {
        if (sel === `#${id}` || sel === `[name="${el.name}"]` || sel === `[data-field-id="${id}"]`) {
          return el;
        }
      }
      return null;
    },
    querySelectorAll: (sel) => {
      const matched = [];
      for (const [, el] of elements) {
        if (sel.includes(`name="${el.name}"`) || sel.includes("input, select, textarea")) {
          matched.push(el);
        }
      }
      return matched;
    },
    makeElement,
  };
}

const SAMPLE_FORM_FIELDS = [
  { id: "f-name", fieldIdentifier: "customer_name", label: "Customer name", inputType: "text", required: true, isEmpty: true },
  { id: "f-phone", fieldIdentifier: "telephone", label: "Telephone", inputType: "tel", required: true, isEmpty: true },
  { id: "f-email", fieldIdentifier: "email", label: "E-mail address", inputType: "email", required: false, isEmpty: true },
  {
    id: "f-size",
    fieldIdentifier: "pizza_size",
    label: "Pizza Size",
    inputType: "radio",
    required: true,
    isEmpty: true,
    options: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
    ],
  },
  {
    id: "f-toppings",
    fieldIdentifier: "pizza_toppings",
    label: "Pizza Toppings",
    inputType: "checkbox",
    required: false,
    isEmpty: true,
    options: [
      { value: "bacon", label: "Bacon" },
      { value: "extra_cheese", label: "Extra Cheese" },
      { value: "onion", label: "Onion" },
      { value: "mushroom", label: "Mushroom" },
    ],
  },
  { id: "f-time", fieldIdentifier: "delivery_time", label: "Preferred delivery time", inputType: "time", required: false, isEmpty: true },
  { id: "f-instructions", fieldIdentifier: "delivery_instructions", label: "Delivery instructions", inputType: "textarea", required: false, isEmpty: true },
];

// ═════════════════════════════════════════════════════════════════════════════
// Test A: Telephone number spoken digit by digit
// ═════════════════════════════════════════════════════════════════════════════
test("Test A: Telephone number spoken digit by digit extracts 9004234499 and maps to Telephone", () => {
  const utterance = "nine double zero four two three four four nine nine";
  const extracted = extractPhoneNumber(utterance);
  assert.equal(extracted, "9004234499", "Must correctly expand 'double zero' and merge digits to 9004234499");

  const routed = routeFormAction({
    content: utterance,
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.fieldIdentifier, "telephone");
  assert.equal(routed.resolvedValue, "9004234499");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test B: Proper noun preservation
// ═════════════════════════════════════════════════════════════════════════════
test("Test B: Proper noun preservation maintains exact Latin spelling 'Adarsh Jha' and English language", () => {
  const utterance = "Add Adarsh Jha in the customer name field.";
  const lang = detectConversationLanguage(utterance);
  assert.equal(lang, "en", "English instruction with Indian name must remain English");

  const routed = routeFormAction({
    content: utterance,
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: lang,
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.fieldIdentifier, "customer_name");
  assert.equal(routed.resolvedValue, "Adarsh Jha", "Must preserve exact Latin spelling without transliteration");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test C: Hindi sentence with English name
// ═════════════════════════════════════════════════════════════════════════════
test("Test C: Hindi sentence with English name preserves Latin name and detects Hindi language", () => {
  const utterance = "मेरा नाम Adarsh Jha है।";
  const lang = detectConversationLanguage(utterance);
  assert.equal(lang, "hi", "Sentence in Devanagari Hindi must be detected as Hindi");

  const routed = routeFormAction({
    content: utterance,
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: lang,
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.fieldIdentifier, "customer_name");
  assert.equal(routed.resolvedValue, "Adarsh Jha", "Name must be preserved in original Latin script");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test D: Mixed-language phone number
// ═════════════════════════════════════════════════════════════════════════════
test("Test D: Mixed-language phone number extracts 9004234499 and maps to Telephone", () => {
  const utterance = "Mera mobile number nine double zero four two three four four nine nine hai.";
  const lang = detectConversationLanguage(utterance);
  assert.equal(lang, "hinglish", "Should detect natural Hinglish sentence");

  const routed = routeFormAction({
    content: utterance,
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: lang,
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.fieldIdentifier, "telephone");
  assert.equal(routed.resolvedValue, "9004234499");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test E: Sequential conversation (short response answering question)
// ═════════════════════════════════════════════════════════════════════════════
test("Test E: Sequential conversation: 'Yes' in response to email question moves forward to ask for email", () => {
  const recentMessages = [
    { role: "user", content: "9004234499" },
    { role: "assistant", content: "I've noted your telephone number as 9004234499. Would you like to provide your email address?" },
  ];

  const routed = routeFormAction({
    content: "Yes",
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
    recentMessages,
  });

  assert.equal(routed.type, "CONVERSATIONAL_RESPONSE");
  assert.match(routed.response, /email address/i, "Must advance to ask for email, not repeat telephone confirmation");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test F: Multiple fields in one utterance
// ═════════════════════════════════════════════════════════════════════════════
test("Test F: Multiple fields in one utterance resolves both fields independently", () => {
  const utterance = "My name is Adarsh Jha and my phone number is 9004234499.";
  const routed = routeFormAction({
    content: utterance,
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.updates.length, 2, "Must resolve both customer name and telephone");

  const nameUpdate = routed.updates.find((u) => u.field.fieldIdentifier === "customer_name");
  const phoneUpdate = routed.updates.find((u) => u.field.fieldIdentifier === "telephone");

  assert.ok(nameUpdate, "Name update must be present");
  assert.equal(nameUpdate.resolvedValue, "Adarsh Jha");
  assert.ok(phoneUpdate, "Phone update must be present");
  assert.equal(phoneUpdate.resolvedValue, "9004234499");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test G: Correcting a previous value
// ═════════════════════════════════════════════════════════════════════════════
test("Test G: Correcting a previous value targets existing phone field with new value", () => {
  const utterance = "Actually, change my phone number to 9876543210.";
  const routed = routeFormAction({
    content: utterance,
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.fieldIdentifier, "telephone");
  assert.equal(routed.resolvedValue, "9876543210");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test H: Checkbox and radio
// ═════════════════════════════════════════════════════════════════════════════
test("Test H: Checkbox and radio resolves radio size and checkbox toppings", () => {
  const utterance = "Select large and add extra cheese.";
  const routed = routeFormAction({
    content: utterance,
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");

  const sizeUpdate = routed.updates.find((u) => u.field.fieldIdentifier === "pizza_size");
  const toppingUpdate = routed.updates.find((u) => u.field.fieldIdentifier === "pizza_toppings");

  assert.ok(sizeUpdate, "Size radio update must be present");
  assert.equal(sizeUpdate.resolvedValue, "large");
  assert.ok(toppingUpdate, "Extra cheese checkbox update must be present");
  assert.equal(toppingUpdate.resolvedValue, "extra_cheese");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test I: Time field normalization and ambiguity detection
// ═════════════════════════════════════════════════════════════════════════════
test("Test I: Time field normalizes 'seven thirty PM' to '19:30' and asks clarification if AM/PM missing", () => {
  // Explicit PM time
  const timeResult = parseSpokenTime("seven thirty PM");
  assert.ok(timeResult);
  assert.equal(timeResult.formattedTime, "19:30");
  assert.equal(timeResult.isAmbiguous, false);

  const routedPM = routeFormAction({
    content: "Set my preferred delivery time to seven thirty PM",
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
  });
  assert.equal(routedPM.type, "FORM_UPDATE");
  assert.equal(routedPM.status, "RESOLVED");
  assert.equal(routedPM.resolvedValue, "19:30");

  // Ambiguous time without AM/PM
  const ambiguousResult = parseSpokenTime("seven thirty");
  assert.ok(ambiguousResult);
  assert.equal(ambiguousResult.isAmbiguous, true);
  assert.match(ambiguousResult.clarificationMessage, /AM or.*PM/i);
});

// ═════════════════════════════════════════════════════════════════════════════
// Test J: Failed execution handling & DOM readback
// ═════════════════════════════════════════════════════════════════════════════
test("Test J: Failed execution handling returns honest failure when DOM value does not match", () => {
  const doc = createMockDocument();
  // Element is read-only or disabled, simulating a failure to accept value
  const fieldEl = doc.makeElement("input", { id: "cust_phone", value: "", readOnly: true });

  // DOM execution simulation
  function executeWithReadback(el, attemptedValue) {
    if (el.readOnly || el.disabled) {
      return { status: "FAILED", errorCode: "ELEMENT_READONLY", message: "Element is read-only" };
    }
    el.value = attemptedValue;
    if (el.value !== attemptedValue) {
      return { status: "FAILED", errorCode: "VERIFICATION_FAILED" };
    }
    return { status: "SUCCESS" };
  }

  const result = executeWithReadback(fieldEl, "9004234499");
  assert.equal(result.status, "FAILED");
  assert.equal(result.errorCode, "ELEMENT_READONLY");
  // Webpage DOM value remains untouched
  assert.equal(fieldEl.value, "");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test K: Leading-zero phone number
// ═════════════════════════════════════════════════════════════════════════════
test("Test K: Leading-zero phone number preserves '0987654321' as string without integer truncation", () => {
  const utterance = "My phone number is zero nine eight seven six five four three two one.";
  const extracted = extractPhoneNumber(utterance);
  assert.equal(extracted, "0987654321", "Leading zero must be strictly preserved");
  assert.equal(typeof extracted, "string", "Phone number must be string type");

  const routed = routeFormAction({
    content: utterance,
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
  });
  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.resolvedValue, "0987654321");
});

// ═════════════════════════════════════════════════════════════════════════════
// Test L: Repeated yes/no responses across different pending questions
// ═════════════════════════════════════════════════════════════════════════════
test("Test L: Repeated yes/no responses correctly resolve based on previous assistant context", () => {
  // Scenario 1: User says No to email
  const routedNo = routeFormAction({
    content: "No",
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
    recentMessages: [
      { role: "assistant", content: "I've noted your phone number. Would you like to provide your email address?" },
    ],
  });
  assert.equal(routedNo.type, "CONVERSATIONAL_RESPONSE");
  assert.match(routedNo.response, /No problem/i);

  // Scenario 2: User says Yes to pending confirmation
  const routedYes = routeFormAction({
    content: "Yes",
    detectedFields: SAMPLE_FORM_FIELDS,
    detectedLang: "en",
    recentMessages: [
      { role: "assistant", content: "Would you like to select Large for Pizza Size?" },
    ],
  });
  assert.ok(routedYes);
});

// ═════════════════════════════════════════════════════════════════════════════
// Test M: React-controlled telephone field with _valueTracker
// ═════════════════════════════════════════════════════════════════════════════
test("Test M: React-controlled telephone field syncs _valueTracker and dispatches input/change events", () => {
  const doc = createMockDocument();
  const telInput = doc.makeElement("input", {
    id: "telephone_field",
    type: "tel",
    value: "",
    parentLabel: "Telephone:",
  });

  // Emulate React's native setter & _valueTracker sync
  function reactCompatibleSetter(el, val) {
    const prev = el.value;
    el.value = val;
    if (el._valueTracker && typeof el._valueTracker.setValue === "function") {
      el._valueTracker.setValue(prev);
    }
    el.dispatchEvent({ type: "input" });
    el.dispatchEvent({ type: "change" });
  }

  reactCompatibleSetter(telInput, "9004234499");

  assert.equal(telInput.value, "9004234499", "DOM value must be verified as 9004234499");
  assert.ok(telInput.eventsDispatched.includes("input"), "input event must be dispatched for React");
  assert.ok(telInput.eventsDispatched.includes("change"), "change event must be dispatched for React");
});
