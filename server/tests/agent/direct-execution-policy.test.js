import test from "node:test";
import assert from "node:assert/strict";
import { routeFormAction } from "../../dist/modules/form-intelligence/form-action-router.js";
import { convertFieldScript } from "../../dist/modules/form-intelligence/script-converter.service.js";
import { isSensitiveField } from "../../dist/modules/form-intelligence/field-type-validator.service.js";
import { sanitizeFalseExecutionClaims } from "../../dist/modules/agent/agent.orchestrator.js";

test("Direct Execution Policy Suite", async (t) => {
  const detectedFields = [
    {
      id: "f-name-1",
      fieldIdentifier: "custname",
      name: "custname",
      label: "Customer name:",
      inputType: "text",
      elementType: "input",
      collectedValue: "मैं आदर्श",
      currentValue: "मैं आदर्श",
      required: true,
      disabled: false,
      readOnly: false,
    },
    {
      id: "f-tel-2",
      fieldIdentifier: "custtel",
      name: "custtel",
      label: "Telephone:",
      inputType: "tel",
      elementType: "input",
      collectedValue: "9004234499",
      currentValue: "9004234499",
      required: true,
      disabled: false,
      readOnly: false,
    },
    {
      id: "f-email-3",
      fieldIdentifier: "custemail",
      name: "custemail",
      label: "E-mail address:",
      inputType: "email",
      elementType: "input",
      collectedValue: "aadarshjha@gmail.com",
      currentValue: "aadarshjha@gmail.com",
      required: true,
      disabled: false,
      readOnly: false,
    },
    {
      id: "f-size-4",
      fieldIdentifier: "size",
      name: "size",
      label: "Pizza Size",
      inputType: "radio",
      elementType: "input",
      options: [
        { label: "Small", value: "small" },
        { label: "Medium", value: "medium" },
        { label: "Large", value: "large" },
      ],
      required: true,
      disabled: false,
      readOnly: false,
    },
    {
      id: "f-comments-5",
      fieldIdentifier: "comments",
      name: "comments",
      label: "Delivery instructions:",
      inputType: "text",
      elementType: "textarea",
      required: false,
      disabled: false,
      readOnly: false,
    },
  ];

  await t.test("1. Typo in target ('cutomer name ko english mein likho') directly resolves CONVERT_FIELD_SCRIPT to Latin", () => {
    const routed = routeFormAction({
      content: "cutomer name ko english mein likho",
      detectedFields,
      detectedLang: "hinglish",
    });

    assert.equal(routed.type, "FORM_UPDATE");
    assert.equal(routed.status, "RESOLVED");
    assert.equal(routed.field.fieldIdentifier, "custname");
    assert.equal(routed.resolvedValue, "Adarsh");
    assert.equal(routed.intentReason, "CONVERT_FIELD_SCRIPT");
    assert.ok(routed.updates && routed.updates.length > 0);
    assert.equal(routed.updates[0].resolvedValue, "Adarsh");
  });

  await t.test("2. Explicit value with script conversion ('customer name को english में लिखें, आदर्श झा।') directly resolves to Adarsh Jha", () => {
    const routed = routeFormAction({
      content: "customer name को english में लिखें, आदर्श झा।",
      detectedFields,
      detectedLang: "hi",
    });

    assert.equal(routed.type, "FORM_UPDATE");
    assert.equal(routed.status, "RESOLVED");
    assert.equal(routed.field.fieldIdentifier, "custname");
    assert.equal(routed.resolvedValue, "Adarsh Jha");
    assert.equal(routed.intentReason, "CONVERT_FIELD_SCRIPT");
  });

  await t.test("3. Pronoun referral ('आदर्श झा उसे English में लिखें।') directly resolves to Adarsh Jha without needing approval", () => {
    const routed = routeFormAction({
      content: "आदर्श झा उसे English में लिखें।",
      detectedFields,
      detectedLang: "hi",
    });

    assert.equal(routed.type, "FORM_UPDATE");
    assert.equal(routed.status, "RESOLVED");
    assert.equal(routed.field.fieldIdentifier, "custname");
    assert.equal(routed.resolvedValue, "Adarsh Jha");
    assert.equal(routed.intentReason, "CONVERT_FIELD_SCRIPT");
  });

  await t.test("4. Existing on-page value conversion ('customer name को english में लिखें।') extracts from detectedFields", () => {
    const fieldsWithDevanagari = [
      {
        id: "f-1",
        fieldIdentifier: "custname",
        label: "Customer name:",
        inputType: "text",
        collectedValue: "आदर्श झा",
        currentValue: "आदर्श झा",
      },
    ];

    const routed = routeFormAction({
      content: "customer name को english में लिखें।",
      detectedFields: fieldsWithDevanagari,
      detectedLang: "hi",
    });

    assert.equal(routed.type, "FORM_UPDATE");
    assert.equal(routed.status, "RESOLVED");
    assert.equal(routed.resolvedValue, "Adarsh Jha");
    assert.equal(routed.intentReason, "CONVERT_FIELD_SCRIPT");
  });

  await t.test("5. Overwriting existing field ('change phone number to 9876543210') directly resolves UPDATE", () => {
    const routed = routeFormAction({
      content: "change phone number to 9876543210",
      detectedFields,
      detectedLang: "en",
    });

    assert.equal(routed.type, "FORM_UPDATE");
    assert.equal(routed.status, "RESOLVED");
    assert.equal(routed.field.fieldIdentifier, "custtel");
    assert.equal(routed.resolvedValue, "9876543210");
  });

  await t.test("6. Radio option selection ('make pizza size large') directly resolves option without approval", () => {
    const routed = routeFormAction({
      content: "make pizza size large",
      detectedFields,
      detectedLang: "en",
    });

    assert.equal(routed.type, "FORM_UPDATE");
    assert.equal(routed.status, "RESOLVED");
    assert.equal(routed.field.fieldIdentifier, "size");
    assert.equal(routed.resolvedValue, "large");
  });

  await t.test("7. sanitizeFalseExecutionClaims does NOT flag converted on-page names as fabricated", () => {
    const toolResults = [
      {
        toolCallId: "call-1",
        name: "propose_field_value",
        success: true,
        data: {
          fieldIdentifier: "custname",
          value: "Adarsh Jha",
          status: "APPROVED",
        },
      },
    ];

    const context = {
      formTask: {
        id: "task-1",
        detectedFields,
      },
      request: {
        currentUserMessage: {
          content: "customer name को english में लिखें।",
        },
      },
      conversation: {
        recentMessages: [],
      },
    };

    const confirmText = "ठीक है, मैंने Customer name को अंग्रेज़ी में 'Adarsh Jha' कर दिया है।";
    const sanitized = sanitizeFalseExecutionClaims(confirmText, context, "hi", toolResults);

    assert.ok(sanitized.includes("Adarsh Jha"));
    assert.ok(!sanitized.includes("कस्टमर का नाम बताइए"));
  });

  await t.test("8. sanitizeFalseExecutionClaims preserves active direct execution confirmation without downgrading to 'नोट कर लिया'", () => {
    const toolResults = [
      {
        toolCallId: "call-2",
        name: "propose_field_value",
        success: true,
        data: {
          fieldIdentifier: "custname",
          value: "Adarsh",
          status: "APPROVED",
        },
      },
    ];

    const context = {
      formTask: {
        id: "task-1",
        detectedFields,
      },
      request: {
        currentUserMessage: {
          content: "आदर्श झा को update करें!",
        },
      },
      conversation: {
        recentMessages: [],
      },
    };

    const confirmText = "मैंने नाम (Customer name) को अंग्रेज़ी में 'Aadarsh Jha' अपडेट कर दिया है।";
    const sanitized = sanitizeFalseExecutionClaims(confirmText, context, "hi", toolResults);

    assert.ok(sanitized.includes("अपडेट कर दिया है"));
    assert.ok(!sanitized.includes("नोट कर लिया"));
  });

  await t.test("9. Missing field values trigger clarification, NOT approval gates", () => {
    const emptyFields = [
      {
        id: "f-name-empty",
        fieldIdentifier: "custname",
        label: "Customer name:",
        inputType: "text",
        collectedValue: undefined,
        currentValue: undefined,
      },
    ];

    const routed = routeFormAction({
      content: "customer name ko english mein likho",
      detectedFields: emptyFields,
      detectedLang: "hinglish",
    });

    assert.equal(routed.type, "CONVERSATIONAL_RESPONSE");
    assert.equal(routed.intent, "CLARIFY_FIELD_VALUE");
    assert.ok(routed.response.includes("English mein kya likhna chahte hain"));
  });

  await t.test("10. Sensitive fields remain protected and blocked from execution", () => {
    assert.equal(isSensitiveField({ name: "password", inputType: "password", label: "Password" }), true);
    assert.equal(isSensitiveField({ name: "cvv", inputType: "text", label: "Card Security Code" }), true);
    assert.equal(isSensitiveField({ name: "card_number", inputType: "text", label: "Credit Card" }), true);
    assert.equal(isSensitiveField({ name: "upi_pin", inputType: "password", label: "UPI PIN" }), true);

    // Non-sensitive fields must pass
    assert.equal(isSensitiveField({ name: "custname", inputType: "text", label: "Customer name:" }), false);
    assert.equal(isSensitiveField({ name: "custtel", inputType: "tel", label: "Telephone:" }), false);
    assert.equal(isSensitiveField({ name: "custemail", inputType: "email", label: "E-mail address:" }), false);
  });
});
