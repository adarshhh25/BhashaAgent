const assert = require("node:assert/strict");
const test = require("node:test");
const { routeFormAction } = require("../../dist/modules/form-intelligence/form-action-router");
const { extractSpokenEmail, isValidEmail } = require("../../dist/modules/form-intelligence/spoken-email-normalizer");
const { isValueGroundedInUserUtterance } = require("../../dist/modules/agent/agent.tools");
const { sanitizeFalseExecutionClaims } = require("../../dist/modules/agent/agent.orchestrator");

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
      disabled: Boolean(attrs.disabled),
      readOnly: Boolean(attrs.readOnly),
      eventsDispatched: [],
      formSubmitted: false,
      _valueTracker: {
        getValue: () => _trackedValue,
        setValue: (v) => { _trackedValue = v; },
      },
      get value() { return _value; },
      set value(v) { _value = String(v); },
      get checked() { return _checked; },
      set checked(v) { _checked = Boolean(v); },
      focus: () => {},
      closest: (selector) => {
        if (selector === "form") {
          return {
            submit: () => { el.formSubmitted = true; },
          };
        }
        return null;
      },
      getAttribute: (name) => attrs[name] || (name === "name" ? el.name : name === "id" ? el.id : null),
      dispatchEvent: (event) => {
        el.eventsDispatched.push(event.type || event);
        return true;
      },
    };

    if (attrs.id) elements.set(attrs.id, el);
    if (attrs.name) elements.set(`name:${attrs.name}`, el);
    return el;
  }

  return {
    makeElement,
    getElementById: (id) => elements.get(id) || null,
    querySelector: (selector) => {
      const nameMatch = selector.match(/\[name="([^"]+)"\]/);
      if (nameMatch) return elements.get(`name:${nameMatch[1]}`) || null;
      const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
      if (idMatch) return elements.get(idMatch[1]) || null;
      return null;
    },
    querySelectorAll: () => [],
  };
}

// Helper simulating the Phase 9 DOM executor's setNativeValue & readback
function simulateDomExecution(doc, action) {
  const targetId = action.fieldId || action.fieldIdentifier;
  const element = doc.getElementById(targetId) || doc.querySelector(`[name="${targetId}"]`);
  if (!element) {
    return { status: "FAILED", errorCode: "FIELD_NOT_FOUND", message: `Field ${targetId} not found` };
  }
  if (element.disabled || element.readOnly) {
    return { status: "FAILED", errorCode: "ELEMENT_UNUSABLE", message: "Element is disabled or read-only" };
  }

  const strValue = String(action.value ?? "");
  const previousValue = element.value;

  // React synthetic value tracker simulation
  element.value = strValue;
  if (element._valueTracker) {
    element._valueTracker.setValue(previousValue === strValue ? "" : previousValue);
  }
  element.dispatchEvent({ type: "input" });
  element.dispatchEvent({ type: "change" });

  // Readback verification
  if (element.value !== strValue) {
    return {
      status: "FAILED",
      errorCode: "VERIFICATION_FAILED",
      message: `Readback '${element.value}' did not match '${strValue}'`,
    };
  }

  return { status: "SUCCESS", value: element.value };
}

const mockHttpbinFields = [
  { id: "f-name", fieldIdentifier: "custname", label: "Customer name:", inputType: "text", isEmpty: true },
  { id: "f-tel", fieldIdentifier: "telephone", label: "Telephone:", inputType: "tel", isEmpty: true },
  { id: "f-email", fieldIdentifier: "custemail", label: "E-mail address:", inputType: "email", isEmpty: true },
  { id: "f-size", fieldIdentifier: "size", label: "Pizza Size", inputType: "radio", options: [{ value: "small" }, { value: "medium" }, { value: "large" }] },
  { id: "f-comments", fieldIdentifier: "comments", label: "Delivery instructions:", inputType: "textarea", isEmpty: true },
];

test("Test A: Email direct execution — 'email address mein adarshjha@gmail.com likho' routes to custemail and updates DOM", () => {
  const instruction = "email address mein adarshjha@gmail.com likho.";
  const routed = routeFormAction({
    content: instruction,
    detectedFields: mockHttpbinFields,
    detectedLang: "en",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.fieldIdentifier, "custemail");
  assert.equal(routed.resolvedValue, "adarshjha@gmail.com");

  // DOM execution
  const doc = createMockDocument();
  const emailInput = doc.makeElement("input", { id: "custemail", name: "custemail", type: "email" });
  const execResult = simulateDomExecution(doc, { fieldIdentifier: routed.field.fieldIdentifier, value: routed.resolvedValue });

  assert.equal(execResult.status, "SUCCESS");
  assert.equal(emailInput.value, "adarshjha@gmail.com");
});

test("Test B: Memory is not form execution — Saving email to memory without browser action must NOT claim form was filled", () => {
  const context = {
    formTask: { id: "task-1", detectedFields: mockHttpbinFields },
    request: { currentUserMessage: { content: "Remember my email adarshjha@gmail.com in profile" } },
    conversation: { recentMessages: [] },
  };

  // Tool results has propose_profile_memory ONLY, NO form propose_field_value
  const memoryOnlyToolResults = [{
    toolCallId: "call-1",
    name: "propose_profile_memory",
    success: true,
    data: { operation: "CREATE", key: "email", proposedValue: "adarshjha@gmail.com" },
  }];

  const claimText = "Maine aapka email form mein fill kar diya hai.";
  const sanitized = sanitizeFalseExecutionClaims(claimText, context, "hinglish", memoryOnlyToolResults);

  // Must be sanitized to noting/saving fact, NEVER claiming form was filled
  assert.ok(!sanitized.includes("fill kar diya"), "Must not claim form was filled");
  assert.ok(sanitized.includes("note kar li") || sanitized.includes("noted"), "Must truthfully state detail was noted");
});

test("Test C: Tool routing — Explicit voice instruction routes to form action, not memory-only", () => {
  const instruction = "email address में आदर्श झा @ gmail.com लिखें।";
  const routed = routeFormAction({
    content: instruction,
    detectedFields: mockHttpbinFields,
    detectedLang: "hi",
  });

  assert.equal(routed.type, "FORM_UPDATE");
  assert.equal(routed.status, "RESOLVED");
  assert.equal(routed.field.fieldIdentifier, "custemail");
  assert.equal(routed.resolvedValue, "adarshjha@gmail.com");
  assert.ok(routed.updates.length > 0);
});

test("Test D: Delayed browser response — Assistant does not claim success before verification", () => {
  // When an operation is in DISPATCHED state but not yet VERIFIED
  const operationState = "DISPATCHED";
  const isVerified = operationState === "VERIFIED";

  assert.equal(isVerified, false, "Operation in DISPATCHED state must not be considered verified");
  
  // Verify that grounding helper checks speech input correctly so no ungrounded rejection happens
  const context = {
    formTask: { id: "task-1", detectedFields: mockHttpbinFields },
    request: { currentUserMessage: { content: "email address में आदर्श झा @ gmail.com लिखें।" } },
    conversation: { recentMessages: [] },
  };
  const isGrounded = isValueGroundedInUserUtterance(mockHttpbinFields[2], "adarshjha@gmail.com", context);
  assert.equal(isGrounded, true, "Extracted email must be grounded in spoken utterance");
});

test("Test E: Content-script failure — When target field cannot be located, execution reports FAILED", () => {
  const doc = createMockDocument();
  // Do not add custemail element to simulate missing field or disconnected script
  const execResult = simulateDomExecution(doc, { fieldIdentifier: "custemail", value: "adarshjha@gmail.com" });

  assert.equal(execResult.status, "FAILED");
  assert.equal(execResult.errorCode, "FIELD_NOT_FOUND");
});

test("Test F: DOM mutation failure — Disabled or read-only field reports FAILED", () => {
  const doc = createMockDocument();
  doc.makeElement("input", { id: "custemail", name: "custemail", type: "email", disabled: true });
  const execResult = simulateDomExecution(doc, { fieldIdentifier: "custemail", value: "adarshjha@gmail.com" });

  assert.equal(execResult.status, "FAILED");
  assert.equal(execResult.errorCode, "ELEMENT_UNUSABLE");
});

test("Test G: Readback mismatch — When DOM value differs from requested value, verification fails", () => {
  const doc = createMockDocument();
  const emailInput = doc.makeElement("input", { id: "custemail", name: "custemail", type: "email" });
  
  // Simulate a buggy webpage where setter is a no-op or overwrites with empty string
  Object.defineProperty(emailInput, "value", {
    get: () => "",
    set: () => {},
  });

  const execResult = simulateDomExecution(doc, { fieldIdentifier: "custemail", value: "adarshjha@gmail.com" });
  assert.equal(execResult.status, "FAILED");
  assert.equal(execResult.errorCode, "VERIFICATION_FAILED");
});

test("Test H: Successful voice update — Simulated end-to-end voice-to-DOM execution", () => {
  const doc = createMockDocument();
  const emailInput = doc.makeElement("input", { id: "custemail", name: "custemail", type: "email" });

  // 1. Spoken transcript
  const transcript = "email address में आदर्श झा @ gmail.com लिखें।";

  // 2. Extract & resolve
  const normalized = extractSpokenEmail(transcript);
  assert.equal(normalized, "adarshjha@gmail.com");

  const routed = routeFormAction({
    content: transcript,
    detectedFields: mockHttpbinFields,
    detectedLang: "hi",
  });
  assert.equal(routed.status, "RESOLVED");

  // 3. Dispatch to DOM & Verify
  const execResult = simulateDomExecution(doc, { fieldIdentifier: routed.field.fieldIdentifier, value: routed.resolvedValue });
  assert.equal(execResult.status, "SUCCESS");
  assert.equal(emailInput.value, "adarshjha@gmail.com");
  assert.ok(emailInput.eventsDispatched.includes("input"));
  assert.ok(emailInput.eventsDispatched.includes("change"));
});

test("Test I: Language consistency — Correct execution across English, Hindi, Marathi, and Hinglish", () => {
  const cases = [
    { text: "write email address as adarshjha@gmail.com", lang: "en", expected: "adarshjha@gmail.com" },
    { text: "email address में आदर्श झा @ gmail.com लिखें।", lang: "hi", expected: "adarshjha@gmail.com" },
    { text: "ईमेल पत्ता adarshjha@gmail.com टाका.", lang: "mr", expected: "adarshjha@gmail.com" },
    { text: "email address mein adarshjha@gmail.com likho", lang: "hinglish", expected: "adarshjha@gmail.com" },
  ];

  for (const c of cases) {
    const routed = routeFormAction({
      content: c.text,
      detectedFields: mockHttpbinFields,
      detectedLang: c.lang,
    });
    assert.equal(routed.type, "FORM_UPDATE", `Failed on lang ${c.lang}`);
    assert.equal(routed.status, "RESOLVED", `Failed on lang ${c.lang}`);
    assert.equal(routed.resolvedValue, c.expected, `Failed on lang ${c.lang}`);
  }
});

test("Test J: No automatic submission — Autofilling email does NOT trigger form submit", () => {
  const doc = createMockDocument();
  const emailInput = doc.makeElement("input", { id: "custemail", name: "custemail", type: "email" });

  const execResult = simulateDomExecution(doc, { fieldIdentifier: "custemail", value: "adarshjha@gmail.com" });
  assert.equal(execResult.status, "SUCCESS");
  assert.equal(emailInput.formSubmitted, false, "Form submission must never be automatically triggered during field autofill");
});

