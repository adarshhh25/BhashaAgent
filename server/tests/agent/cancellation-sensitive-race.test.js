const assert = require("node:assert/strict");
const test = require("node:test");
const { isSensitiveField, validateFieldValue } = require("../../dist/modules/form-intelligence/field-type-validator.service");
const { routeFormAction } = require("../../dist/modules/form-intelligence/form-action-router");
const { orchestrate } = require("../../dist/modules/agent/agent.orchestrator");
const { setLLMProviderForTests } = require("../../dist/modules/llm/llm.factory");
const { LLMError } = require("../../dist/modules/llm/llm.errors");

function createMockDocument() {
  const elements = new Map();

  function makeElement(tag, attrs = {}) {
    const el = {
      tagName: tag.toUpperCase(),
      attributes: { ...attrs },
      value: attrs.value || "",
      checked: Boolean(attrs.checked),
      type: attrs.type || (tag === "input" ? "text" : ""),
      id: attrs.id || "",
      name: attrs.name || "",
      autocomplete: attrs.autocomplete || "",
      disabled: Boolean(attrs.disabled),
      readOnly: Boolean(attrs.readOnly),
      options: attrs.options || [],
      selectedIndex: attrs.selectedIndex || 0,
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
      dispatchEvent: () => true,
      closest: (sel) => null,
    };
    if (el.id) elements.set(el.id, el);
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
        if (sel.includes(`name="${el.name}"`)) {
          matched.push(el);
        }
      }
      return matched;
    },
    makeElement,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Sensitive-Field Positive Cases: MUST be classified as sensitive
// ═══════════════════════════════════════════════════════════════════════
test("Sensitive-Field: correctly classifies all protected field categories", () => {
  // Password family
  assert.equal(isSensitiveField({ inputType: "password" }), true, "inputType=password");
  assert.equal(isSensitiveField({ name: "password", inputType: "text" }), true, "name=password");
  assert.equal(isSensitiveField({ name: "user_passcode", inputType: "text" }), true, "name=user_passcode");
  assert.equal(isSensitiveField({ name: "new_password", inputType: "text" }), true, "name=new_password");
  assert.equal(isSensitiveField({ name: "confirm_password", inputType: "text" }), true, "name=confirm_password");

  // Payment card family
  assert.equal(isSensitiveField({ name: "credit_card", inputType: "text" }), true, "name=credit_card");
  assert.equal(isSensitiveField({ name: "creditcard", inputType: "text" }), true, "name=creditcard");
  assert.equal(isSensitiveField({ label: "Card Number", inputType: "text" }), true, "label=Card Number");
  assert.equal(isSensitiveField({ name: "debit_card", inputType: "text" }), true, "name=debit_card");
  assert.equal(isSensitiveField({ name: "cvv", inputType: "text" }), true, "name=cvv");
  assert.equal(isSensitiveField({ name: "cvc", inputType: "text" }), true, "name=cvc");
  assert.equal(isSensitiveField({ label: "Security Code", inputType: "text" }), true, "label=Security Code");

  // Auth credential family
  assert.equal(isSensitiveField({ name: "auth_token", inputType: "text" }), true, "name=auth_token");
  assert.equal(isSensitiveField({ name: "access_token", inputType: "text" }), true, "name=access_token");
  assert.equal(isSensitiveField({ name: "api_key", inputType: "text" }), true, "name=api_key");
  assert.equal(isSensitiveField({ name: "private_key", inputType: "text" }), true, "name=private_key");
  assert.equal(isSensitiveField({ name: "client_secret", inputType: "text" }), true, "name=client_secret");

  // OTP / PIN
  assert.equal(isSensitiveField({ label: "OTP", inputType: "text" }), true, "label=OTP");
  assert.equal(isSensitiveField({ name: "otp", inputType: "text" }), true, "name=otp");
  assert.equal(isSensitiveField({ name: "upi_pin", inputType: "text" }), true, "name=upi_pin");

  // Government ID family
  assert.equal(isSensitiveField({ name: "aadhaar_number", inputType: "text" }), true, "name=aadhaar_number");
  assert.equal(isSensitiveField({ name: "pan_card", inputType: "text" }), true, "name=pan_card");
  assert.equal(isSensitiveField({ name: "pan", inputType: "text" }), true, "name=pan");
  assert.equal(isSensitiveField({ name: "ssn", inputType: "text" }), true, "name=ssn");
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Sensitive-Field Negative Cases: MUST NOT be classified as sensitive
//    These are the false-positive regressions fixed by word-boundary anchors.
// ═══════════════════════════════════════════════════════════════════════
test("Sensitive-Field: does NOT false-positive on ordinary fields (word-boundary precision)", () => {
  // Ordinary fields with no sensitive substring
  assert.equal(isSensitiveField({ name: "full_name", inputType: "text" }), false, "full_name");
  assert.equal(isSensitiveField({ name: "first_name", inputType: "text" }), false, "first_name");
  assert.equal(isSensitiveField({ name: "email", inputType: "email" }), false, "email");
  assert.equal(isSensitiveField({ name: "phone_number", inputType: "tel" }), false, "phone_number");
  assert.equal(isSensitiveField({ name: "state", inputType: "select" }), false, "state");
  assert.equal(isSensitiveField({ name: "district", inputType: "text" }), false, "district");
  assert.equal(isSensitiveField({ name: "city", inputType: "text" }), false, "city");
  assert.equal(isSensitiveField({ name: "qualification", inputType: "select" }), false, "qualification");
  assert.equal(isSensitiveField({ name: "address", inputType: "text" }), false, "address");
  assert.equal(isSensitiveField({ name: "date_of_birth", inputType: "date" }), false, "date_of_birth");

  // Previously false-positive: "pan" substring in ordinary words
  assert.equal(isSensitiveField({ name: "company_name", inputType: "text" }), false, "company_name (pan FP)");
  assert.equal(isSensitiveField({ name: "expansion", inputType: "text" }), false, "expansion (pan FP)");
  assert.equal(isSensitiveField({ name: "japan", inputType: "text" }), false, "japan (pan FP)");
  assert.equal(isSensitiveField({ name: "panel", inputType: "text" }), false, "panel (pan FP)");
  assert.equal(isSensitiveField({ name: "pandemic_status", inputType: "select" }), false, "pandemic_status (pan FP)");
  assert.equal(isSensitiveField({ name: "companion_name", inputType: "text" }), false, "companion_name (pan FP)");

  // Previously false-positive: "token" substring
  assert.equal(isSensitiveField({ name: "tokenize", inputType: "text" }), false, "tokenize (token FP)");
  assert.equal(isSensitiveField({ name: "tokenization", inputType: "text" }), false, "tokenization (token FP)");
  assert.equal(isSensitiveField({ name: "tokenizer_type", inputType: "select" }), false, "tokenizer_type (token FP)");

  // Previously false-positive: "secret" substring
  assert.equal(isSensitiveField({ name: "secretary", inputType: "text" }), false, "secretary (secret FP)");
  assert.equal(isSensitiveField({ name: "secretariat", inputType: "text" }), false, "secretariat (secret FP)");
  assert.equal(isSensitiveField({ name: "secretarial_course", inputType: "select" }), false, "secretarial_course (secret FP)");

  // Previously false-positive: "otp" substring
  assert.equal(isSensitiveField({ name: "footprint", inputType: "text" }), false, "footprint (otp FP)");
  assert.equal(isSensitiveField({ name: "optional", inputType: "text" }), false, "optional (otp FP)");

  // Previously false-positive: "ssn" substring
  assert.equal(isSensitiveField({ name: "discussion", inputType: "text" }), false, "discussion (ssn FP)");
  assert.equal(isSensitiveField({ name: "professional_skills", inputType: "text" }), false, "professional_skills (ssn FP)");

  // Postal PIN code — MUST remain fillable
  assert.equal(isSensitiveField({ name: "pin_code", inputType: "text" }), false, "pin_code (postal)");
  assert.equal(isSensitiveField({ name: "pincode", inputType: "text" }), false, "pincode (postal)");
  assert.equal(isSensitiveField({ name: "zip_code", inputType: "text" }), false, "zip_code");
  assert.equal(isSensitiveField({ name: "postal_code", inputType: "text" }), false, "postal_code");
});

// ═══════════════════════════════════════════════════════════════════════
// 3. validateFieldValue blocks sensitive fields
// ═══════════════════════════════════════════════════════════════════════
test("Sensitive-Field: validateFieldValue blocks sensitive fields", () => {
  const pwValidation = validateFieldValue({ inputType: "password", options: [], required: true }, "Secret12345");
  assert.equal(pwValidation.valid, false);
  assert.match(pwValidation.reason, /sensitive/i);

  const cvvValidation = validateFieldValue({ name: "cvv", inputType: "text", options: [], required: true }, "123");
  assert.equal(cvvValidation.valid, false);
  assert.match(cvvValidation.reason, /sensitive/i);

  // Normal field validates successfully
  const nameValidation = validateFieldValue({ inputType: "text", options: [], required: true }, "Rajesh Sharma");
  assert.equal(nameValidation.valid, true);
  assert.equal(nameValidation.value, "Rajesh Sharma");

  // Fields that used to false-positive MUST validate successfully
  const companyValidation = validateFieldValue({ name: "company_name", inputType: "text", options: [], required: true }, "TechCorp");
  assert.equal(companyValidation.valid, true, "company_name must not be blocked");

  const expansionValidation = validateFieldValue({ name: "expansion", inputType: "text", options: [], required: true }, "Phase 2");
  assert.equal(expansionValidation.valid, true, "expansion must not be blocked");
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Router refuses sensitive field updates conversationally
// ═══════════════════════════════════════════════════════════════════════
test("Sensitive-Field: form-action-router refuses sensitive field updates conversationally", () => {
  const detectedFields = [
    { id: "f-pw", fieldIdentifier: "password", label: "Password", inputType: "password", required: true },
    { id: "f-cvv", fieldIdentifier: "card_cvv", label: "CVV", inputType: "text", required: true },
    { id: "f-name", fieldIdentifier: "applicant_name", label: "Full Name", inputType: "text", required: true },
  ];

  const pwRoute = routeFormAction({
    userMessage: "set my password to Secret123",
    detectedFields,
    approvedMemories: [],
    detectedLang: "en",
  });
  assert.equal(pwRoute.type, "FORM_UPDATE");
  assert.equal(pwRoute.status, "OPTION_NOT_FOUND");
  assert.match(pwRoute.clarificationMessage, /sensitive fields/i);

  const cvvRoute = routeFormAction({
    userMessage: "set cvv to 999",
    detectedFields,
    approvedMemories: [],
    detectedLang: "en",
  });
  assert.equal(cvvRoute.type, "FORM_UPDATE");
  assert.equal(cvvRoute.status, "OPTION_NOT_FOUND");
  assert.match(cvvRoute.clarificationMessage, /sensitive fields/i);
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Cancellation: action cancelled before DOM execution
// ═══════════════════════════════════════════════════════════════════════
test("Cancellation Boundary Race: action cancelled before DOM execution does not mutate DOM", async () => {
  const doc = createMockDocument();
  const inputEl = doc.makeElement("input", { id: "cust_email", value: "original@test.com" });

  async function executeMockAction(action) {
    if (action.cancelled || action.status === "CANCELLED") {
      return {
        fieldId: action.fieldId,
        status: "CANCELLED",
        errorCode: "EXECUTION_CANCELLED",
        message: "Action was cancelled before DOM mutation",
      };
    }
    const el = doc.getElementById(action.fieldId);
    if (!el) return { status: "FAILED", errorCode: "FIELD_NOT_FOUND" };
    el.value = action.value;
    return { status: "SUCCESS", value: el.value };
  }

  const result = await executeMockAction({
    fieldId: "cust_email",
    action: "SET_VALUE",
    value: "new_overwritten@test.com",
    cancelled: true,
  });

  assert.equal(result.status, "CANCELLED");
  assert.equal(result.errorCode, "EXECUTION_CANCELLED");
  assert.equal(inputEl.value, "original@test.com");
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Direct Autofill & Readback
// ═══════════════════════════════════════════════════════════════════════
test("Direct Autofill & Readback: verifies text overwrite and readback accuracy", async () => {
  const doc = createMockDocument();
  const inputEl = doc.makeElement("input", { id: "phone_field", value: "9876543210" });

  async function executeAndVerify(action) {
    const el = doc.getElementById(action.fieldId);
    if (!el) return { status: "FAILED", errorCode: "FIELD_NOT_FOUND" };
    el.value = String(action.value);
    if (el.value !== String(action.value)) {
      return { status: "FAILED", errorCode: "VERIFICATION_FAILED" };
    }
    return { status: "SUCCESS", value: el.value };
  }

  const overwriteResult = await executeAndVerify({
    fieldId: "phone_field",
    action: "SET_VALUE",
    value: "9123456780",
  });

  assert.equal(overwriteResult.status, "SUCCESS");
  assert.equal(inputEl.value, "9123456780");
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Generation-ID Cancellation: stale turn rejected, fresh turn accepted
// ═══════════════════════════════════════════════════════════════════════
test("Generation-ID Cancellation: stale generation rejected, new turn executes", async () => {
  // Simulate content script generationId logic
  let latestGenerationId = 0;

  function processMessage(message) {
    if (message.type === "CANCEL_FILL_EXECUTION") {
      latestGenerationId++;
      return { accepted: false, cancelled: true, generationId: latestGenerationId };
    }
    if (message.type === "EXECUTE_FILL_INSTRUCTIONS") {
      if (message.payload?.cancelled) {
        return { accepted: false, cancelled: true };
      }
      const msgGenId = typeof message.payload?.generationId === "number" ? message.payload.generationId : -1;
      if (msgGenId >= 0 && msgGenId < latestGenerationId) {
        return { accepted: false, cancelled: true, reason: "stale generationId" };
      }
      return { accepted: true, actions: message.payload?.actions };
    }
    return { accepted: false };
  }

  // Turn 1: dispatch at generation 0 — accepted
  const turn1 = processMessage({
    type: "EXECUTE_FILL_INSTRUCTIONS",
    payload: { actions: [{ fieldId: "name" }], generationId: 0 },
  });
  assert.equal(turn1.accepted, true, "Turn 1 should be accepted");

  // User cancels → generation advances to 1
  processMessage({ type: "CANCEL_FILL_EXECUTION" });
  assert.equal(latestGenerationId, 1, "Generation should advance to 1 after cancel");

  // Turn 1 arrives late (generationId 0) → rejected
  const staleTurn = processMessage({
    type: "EXECUTE_FILL_INSTRUCTIONS",
    payload: { actions: [{ fieldId: "email" }], generationId: 0 },
  });
  assert.equal(staleTurn.accepted, false, "Stale turn should be rejected");
  assert.equal(staleTurn.cancelled, true, "Stale turn should be marked cancelled");

  // Turn 2: fresh dispatch at generation 1 — accepted
  const turn2 = processMessage({
    type: "EXECUTE_FILL_INSTRUCTIONS",
    payload: { actions: [{ fieldId: "city" }], generationId: 1 },
  });
  assert.equal(turn2.accepted, true, "Fresh turn at current generation should be accepted");
});

// ═══════════════════════════════════════════════════════════════════════
// 8. Generation-ID: messages without generationId bypass the check (backward compat)
// ═══════════════════════════════════════════════════════════════════════
test("Generation-ID: messages without generationId are accepted (backward compatibility)", () => {
  let latestGenerationId = 5; // Simulate advanced state

  function processMessage(message) {
    if (message.type === "EXECUTE_FILL_INSTRUCTIONS") {
      if (message.payload?.cancelled) {
        return { accepted: false, cancelled: true };
      }
      const msgGenId = typeof message.payload?.generationId === "number" ? message.payload.generationId : -1;
      if (msgGenId >= 0 && msgGenId < latestGenerationId) {
        return { accepted: false, cancelled: true, reason: "stale generationId" };
      }
      return { accepted: true };
    }
    return { accepted: false };
  }

  // No generationId at all → -1, which skips the check
  const result = processMessage({
    type: "EXECUTE_FILL_INSTRUCTIONS",
    payload: { actions: [{ fieldId: "addr" }] },
  });
  assert.equal(result.accepted, true, "Messages without generationId should pass through");

  // Explicit undefined generationId → also passes
  const result2 = processMessage({
    type: "EXECUTE_FILL_INSTRUCTIONS",
    payload: { actions: [{ fieldId: "addr" }], generationId: undefined },
  });
  assert.equal(result2.accepted, true, "Explicit undefined generationId should pass");
});

// ═══════════════════════════════════════════════════════════════════════
// 9. Concurrent cancellation: double cancel doesn't break state
// ═══════════════════════════════════════════════════════════════════════
test("Generation-ID: double cancel advances generation twice, intermediate turns rejected", () => {
  let latestGenerationId = 0;

  function cancel() { latestGenerationId++; }
  function dispatch(genId) {
    const msgGenId = typeof genId === "number" ? genId : -1;
    if (msgGenId >= 0 && msgGenId < latestGenerationId) {
      return { accepted: false };
    }
    return { accepted: true };
  }

  cancel(); // gen 1
  cancel(); // gen 2
  assert.equal(latestGenerationId, 2);

  assert.equal(dispatch(0).accepted, false, "gen 0 rejected after double cancel");
  assert.equal(dispatch(1).accepted, false, "gen 1 rejected after double cancel");
  assert.equal(dispatch(2).accepted, true, "gen 2 accepted");
});
