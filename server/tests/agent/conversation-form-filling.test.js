const assert = require("node:assert/strict");
const test = require("node:test");
const { orchestrate, sanitizeFalseExecutionClaims } = require("../../dist/modules/agent/agent.orchestrator");
const { systemPrompt, projectContextForAgent } = require("../../dist/modules/agent/agent.prompt");
const { findTool } = require("../../dist/modules/agent/agent.tools");
const { setLLMProviderForTests, getLLMProvider } = require("../../dist/modules/llm/llm.factory");
const { prisma } = require("../../dist/config/database");

let fixture = null;

async function getOrCreateFixture() {
  if (fixture) return fixture;

  const suffix = Date.now().toString(16) + Math.random().toString(16).slice(2, 6);
  const user = await prisma.user.create({
    data: {
      email: `pizza-${suffix}@test.local`,
      passwordHash: "hash-not-used",
      fullName: "Pizza Test User",
    },
  });

  const conversation = await prisma.conversation.create({
    data: { userId: user.id, title: "Pizza Form Test Conversation" },
  });

  const task = await prisma.formTask.create({
    data: {
      userId: user.id,
      conversationId: conversation.id,
      webpageUrl: "https://example.com/pizza",
      webpageTitle: "Pizza Order Form",
      domain: "example.com",
      status: "FIELDS_DETECTED",
      version: 1,
    },
  });

  const fieldDefs = [
    { fieldIdentifier: "customer_name", label: "Customer name", elementType: "INPUT", inputType: "text", isRequired: true },
    { fieldIdentifier: "telephone", label: "Telephone", elementType: "INPUT", inputType: "tel", isRequired: true },
    { fieldIdentifier: "email", label: "E-mail address", elementType: "INPUT", inputType: "email", isRequired: true },
    { fieldIdentifier: "pizza_size", label: "Pizza Size", elementType: "SELECT", inputType: "radio", isRequired: true, options: [{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }] },
    { fieldIdentifier: "toppings", label: "Pizza Toppings", elementType: "INPUT", inputType: "checkbox", isRequired: false, options: [{ value: "bacon", label: "Bacon" }, { value: "extra_cheese", label: "Extra Cheese" }, { value: "onion", label: "Onion" }, { value: "mushroom", label: "Mushroom" }] },
    { fieldIdentifier: "delivery_time", label: "Preferred delivery time", elementType: "INPUT", inputType: "text", isRequired: false },
    { fieldIdentifier: "delivery_instructions", label: "Delivery instructions", elementType: "TEXTAREA", inputType: "textarea", isRequired: false },
  ];

  const createdFields = [];
  for (const def of fieldDefs) {
    const f = await prisma.detectedField.create({
      data: {
        formTaskId: task.id,
        fieldIdentifier: def.fieldIdentifier,
        label: def.label,
        elementType: def.elementType,
        inputType: def.inputType,
        isRequired: def.isRequired,
        options: def.options ? def.options : undefined,
      },
    });
    createdFields.push({ ...def, id: f.id, required: def.isRequired, isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" });
  }

  fixture = { user, conversation, task, fields: createdFields };
  return fixture;
}

function createPizzaFormContext(options = {}, dbFix) {
  const detectedFields = (dbFix && dbFix.fields) || [
    { id: "f-name", fieldIdentifier: "customer_name", label: "Customer name", inputType: "text", isRequired: true, required: true, isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" },
    { id: "f-phone", fieldIdentifier: "telephone", label: "Telephone", inputType: "tel", isRequired: true, required: true, isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" },
    { id: "f-email", fieldIdentifier: "email", label: "E-mail address", inputType: "email", isRequired: true, required: true, isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" },
    { id: "f-size", fieldIdentifier: "pizza_size", label: "Pizza Size", inputType: "radio", isRequired: true, required: true, options: [{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }], isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" },
    { id: "f-toppings", fieldIdentifier: "toppings", label: "Pizza Toppings", inputType: "checkbox", isRequired: false, required: false, options: [{ value: "bacon", label: "Bacon" }, { value: "extra_cheese", label: "Extra Cheese" }, { value: "onion", label: "Onion" }, { value: "mushroom", label: "Mushroom" }], isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" },
    { id: "f-time", fieldIdentifier: "delivery_time", label: "Preferred delivery time", inputType: "text", isRequired: false, required: false, isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" },
    { id: "f-instr", fieldIdentifier: "delivery_instructions", label: "Delivery instructions", inputType: "textarea", isRequired: false, required: false, isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" },
  ];

  const userId = (dbFix && dbFix.user.id) || "00000000-0000-0000-0000-000000000001";
  const convId = (dbFix && dbFix.conversation.id) || "00000000-0000-0000-0000-000000000002";
  const taskId = (dbFix && dbFix.task.id) || "c46ed5f6-db06-4cec-bd84-be54a7e2b3a6";

  return {
    schemaVersion: "1.0",
    request: {
      requestId: options.requestId || "req-pizza-01",
      createdAt: new Date().toISOString(),
      currentUserMessage: {
        id: "msg-user-1",
        content: options.userMessage || "Help me to fill out this form.",
        language: options.language || "en",
        source: "text",
      },
    },
    user: {
      id: userId,
      preferredLanguage: options.preferredLanguage || "en",
    },
    conversation: {
      id: convId,
      status: "ACTIVE",
      recentMessages: options.recentMessages || [],
      relevantOlderContext: [],
      corrections: [],
    },
    profileMemory: {
      approvedFacts: options.profileFacts || [
        { id: "mem-1", category: "identity", key: "name", value: "Adarsh Jha", approvalStatus: "APPROVED" },
        { id: "mem-2", category: "contact", key: "phone", value: "9876543210", approvalStatus: "APPROVED" },
      ],
    },
    formTask: {
      id: taskId,
      status: "FIELDS_DETECTED",
      version: 1,
      webpage: { title: "Pizza Order Form", url: "https://example.com/pizza" },
      detectedFields: options.detectedFields || detectedFields,
      proposedValues: options.proposedValues || [],
      missingInformation: [
        { fieldId: detectedFields[0].id, label: "Customer name", required: true, reason: "Required field is empty", clarificationRequired: true },
        { fieldId: detectedFields[1].id, label: "Telephone", required: true, reason: "Required field is empty", clarificationRequired: true },
        { fieldId: detectedFields[2].id, label: "E-mail address", required: true, reason: "Required field is empty", clarificationRequired: true },
        { fieldId: detectedFields[3].id, label: "Pizza Size", required: true, reason: "Required field is empty", clarificationRequired: true },
      ],
    },
    contextMetadata: {
      builtAt: new Date().toISOString(),
      sourceCounts: { recentMessages: 0, olderMessages: 0, approvedMemories: 2, detectedFields: 7, proposedValues: 0 },
      truncated: false,
      omittedItems: [],
      warnings: [],
      sourceReferences: [],
    },
  };
}

// ============================================================================
// Test A: Prevent fabricated customer details
// ============================================================================
test("Test A: Prevent fabricated customer details when Customer Name is empty and user has not provided a name", async () => {
  const ctx = createPizzaFormContext({
    userMessage: "Help me to fill out this form.",
    profileFacts: [{ id: "mem-1", category: "identity", key: "name", value: "Adarsh Jha" }],
  });

  const projected = projectContextForAgent(ctx, "en");
  const nameField = projected.formTask.fields.find((f) => f.identifier === "customer_name");
  assert.equal(nameField.isEmpty, true, "Customer Name must be marked empty");
  assert.equal(nameField.isCollected, false, "Customer Name must not be marked collected");
  assert.equal(nameField.isApplied, false, "Customer Name must not be marked applied");

  // Profile memory must have explicit consent note
  assert.ok(projected.profileMemory[0].note.includes("Must ask user permission"));

  // Check propose_field_value tool rejects ungrounded proposal of "Adarsh Jha"
  const tool = findTool("propose_field_value");
  assert(tool);
  const result = await tool.execute(ctx.user.id, ctx, {
    taskId: ctx.formTask.id,
    fieldId: nameField.id,
    value: "Adarsh Jha",
    source: "USER_PROVIDED",
  });
  assert.equal(result.status, "REJECTED_UNGROUNDED", "Proposing ungrounded name must be rejected");
});

// ============================================================================
// Test B: Exact reported bug
// ============================================================================
test("Test B: Exact reported bug — switching to Hindi without providing a name must NOT claim 'Adarsh Jha' was filled", async () => {
  const ctx = createPizzaFormContext({
    userMessage: "और राज्य?",
    language: "hi",
    recentMessages: [
      { role: "user", content: "Help me to fill out this form.", language: "en" },
      { role: "assistant", content: "Yes! I can see the form. How would you like to start?", language: "en" },
    ],
  });

  // Mock LLM attempting to fabricate the claim seen in the production bug
  setLLMProviderForTests({
    async generateResponse() {
      return {
        content: JSON.stringify({
          intent: { primary: "FORM_STATUS", secondary: [], confidence: 0.9 },
          language: { detected: "hi", responseLanguage: "hi" },
          decision: { type: "respond" },
          toolCalls: [],
          responseDraft: "मैंने कस्टमर के नाम में 'आदर्श झा' भर दिया है। आगे आप कौन सी जानकारी भरना चाहते हैं?",
        }),
        toolCalls: [],
      };
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });

  const turn = await orchestrate(ctx.user.id, ctx, getLLMProvider());
  assert.ok(!turn.response.includes("आदर्श झा"), "Must not contain fabricated name 'Adarsh Jha'");
  assert.ok(!turn.response.includes("भर दिया है"), "Must not claim field was filled");
  assert.ok(turn.response.includes("कस्टमर का नाम") || turn.response.includes("राज्य"), "Must ask for required customer detail or clarify in Hindi");
});

// ============================================================================
// Test C: Collect details progressively
// ============================================================================
test("Test C: Collect details progressively — User provides name, assistant stores it and asks for telephone", async () => {
  const fix = await getOrCreateFixture();
  const ctx = createPizzaFormContext({
    userMessage: "My name is Rahul Sharma",
    language: "en",
  }, fix);

  const tool = findTool("propose_field_value");
  const field = ctx.formTask.detectedFields.find((f) => f.fieldIdentifier === "customer_name");
  const result = await tool.execute(ctx.user.id, ctx, {
    taskId: ctx.formTask.id,
    fieldId: field.id,
    value: "Rahul Sharma",
    source: "USER_PROVIDED",
  });

  assert.ok(result.status === "APPROVED" || result.status === "PENDING_APPROVAL", "Newly collected value must be APPROVED (direct autofill) or PENDING_APPROVAL");
  assert.ok(result.executionStatus === "READY" || result.executionStatus === "NOT_STARTED", "Execution must be READY or NOT_STARTED");
  assert.equal(result.value, "Rahul Sharma");
});

// ============================================================================
// Test D: Multiple details in one message
// ============================================================================
test("Test D: Multiple details in one message — extracts name, phone, size and extra cheese together", async () => {
  const fix = await getOrCreateFixture();
  const ctx = createPizzaFormContext({
    userMessage: "My name is Rahul Sharma, my number is 9876543210, and I want a large pizza with extra cheese.",
    language: "en",
  }, fix);

  const tool = findTool("propose_field_value");
  const result = await tool.execute(ctx.user.id, ctx, {
    taskId: ctx.formTask.id,
    proposals: [
      { fieldId: "customer_name", value: "Rahul Sharma", source: "USER_PROVIDED" },
      { fieldId: "telephone", value: "9876543210", source: "USER_PROVIDED" },
      { fieldId: "pizza_size", value: "large", source: "USER_PROVIDED" },
      { fieldId: "toppings", value: "extra_cheese", source: "USER_PROVIDED" },
    ],
  });

  assert.equal(result.updatedCount, 4, "All 4 fields must be proposed and collected");
  assert.equal(result.results[0].value, "Rahul Sharma");
  assert.equal(result.results[1].value, "9876543210");
  assert.equal(result.results[2].value, "large");
  assert.equal(result.results[3].value, "extra_cheese");
});

// ============================================================================
// Test E: Profile memory isolation
// ============================================================================
test("Test E: Profile memory isolation — saved name is not silently inserted into the form without explicit authorization", async () => {
  const fix = await getOrCreateFixture();
  const ctx = createPizzaFormContext({
    userMessage: "Please fill out this form for me.",
    profileFacts: [{ id: "mem-name", category: "identity", key: "name", value: "Adarsh Jha" }],
  }, fix);

  // Attempting to propose the profile value without user asking to use profile must be rejected
  const tool = findTool("propose_field_value");
  const field = ctx.formTask.detectedFields.find((f) => f.fieldIdentifier === "customer_name");
  const result = await tool.execute(ctx.user.id, ctx, {
    taskId: ctx.formTask.id,
    fieldId: field.id,
    value: "Adarsh Jha",
    source: "USER_PROVIDED",
  });

  assert.equal(result.status, "REJECTED_UNGROUNDED", "Profile fact without explicit authorization must be rejected");

  // When user explicitly authorizes:
  const authCtx = createPizzaFormContext({
    userMessage: "Use my saved profile details to fill the form.",
    profileFacts: [{ id: "mem-name", category: "identity", key: "name", value: "Adarsh Jha" }],
  }, fix);
  const authResult = await tool.execute(authCtx.user.id, authCtx, {
    taskId: authCtx.formTask.id,
    fieldId: field.id,
    value: "Adarsh Jha",
    source: "USER_PROVIDED",
  });
  assert.ok(authResult.status === "APPROVED" || authResult.status === "PENDING_APPROVAL", "Authorized profile fact is accepted as approved/pending proposal");
});

// ============================================================================
// Test F: Language switching preserves form state
// ============================================================================
test("Test F: Language switching preserves form state across English -> Hindi -> Marathi -> Hinglish", () => {
  const initialFields = [
    { id: "f-name", fieldIdentifier: "customer_name", label: "Customer name", inputType: "text", isRequired: true, required: true, isEmpty: false, isCollected: true, collectedValue: "Rahul Sharma", provenance: "USER_EXPLICIT", isApplied: false, isVerified: false, lifecycleStatus: "COLLECTED" },
    { id: "f-phone", fieldIdentifier: "telephone", label: "Telephone", inputType: "tel", isRequired: true, required: true, isEmpty: false, isCollected: true, collectedValue: "9876543210", provenance: "USER_EXPLICIT", isApplied: false, isVerified: false, lifecycleStatus: "COLLECTED" },
    { id: "f-email", fieldIdentifier: "email", label: "E-mail address", inputType: "email", isRequired: true, required: true, isEmpty: true, isCollected: false, isApplied: false, isVerified: false, lifecycleStatus: "EMPTY" },
  ];

  // 1. In English turn
  const enCtx = createPizzaFormContext({ userMessage: "What is next?", language: "en", detectedFields: initialFields });
  const enProjected = projectContextForAgent(enCtx, "en");
  assert.equal(enProjected.formTask.fields[0].collectedValue, "Rahul Sharma");
  assert.equal(enProjected.formTask.fields[1].collectedValue, "9876543210");
  assert.equal(enProjected.formTask.fields[2].isEmpty, true);

  // 2. Switch to Hindi turn
  const hiCtx = createPizzaFormContext({ userMessage: "आगे क्या भरना है?", language: "hi", detectedFields: initialFields });
  const hiProjected = projectContextForAgent(hiCtx, "hi");
  assert.equal(hiProjected.formTask.fields[0].collectedValue, "Rahul Sharma");
  assert.equal(hiProjected.formTask.fields[1].collectedValue, "9876543210");
  assert.equal(hiProjected.formTask.fields[2].isEmpty, true);

  // 3. Switch to Marathi turn
  const mrCtx = createPizzaFormContext({ userMessage: "पुढे काय भरायचे आहे?", language: "mr", detectedFields: initialFields });
  const mrProjected = projectContextForAgent(mrCtx, "mr");
  assert.equal(mrProjected.formTask.fields[0].collectedValue, "Rahul Sharma");
  assert.equal(mrProjected.formTask.fields[1].collectedValue, "9876543210");
  assert.equal(mrProjected.formTask.fields[2].isEmpty, true);

  // 4. Switch to Hinglish turn
  const hinglishCtx = createPizzaFormContext({ userMessage: "Next kya bharna hai?", language: "hinglish", detectedFields: initialFields });
  const hinglishProjected = projectContextForAgent(hinglishCtx, "hinglish");
  assert.equal(hinglishProjected.formTask.fields[0].collectedValue, "Rahul Sharma");
  assert.equal(hinglishProjected.formTask.fields[1].collectedValue, "9876543210");
  assert.equal(hinglishProjected.formTask.fields[2].isEmpty, true);
});

// ============================================================================
// Test G: Support natural corrections and updates
// ============================================================================
test("Test G: Support natural corrections — New phone number replaces previous value with revision tracking", async () => {
  const fix = await getOrCreateFixture();
  const ctx = createPizzaFormContext({
    userMessage: "Actually, change my phone number to 9876501234",
    language: "en",
  }, fix);

  const tool = findTool("propose_field_value");
  const field = ctx.formTask.detectedFields.find((f) => f.fieldIdentifier === "telephone");

  // First value
  const initial = await tool.execute(ctx.user.id, ctx, {
    taskId: ctx.formTask.id,
    fieldId: field.id,
    value: "9876501234",
    source: "USER_PROVIDED",
  });
  assert.equal(initial.value, "9876501234");
  assert.ok(initial.status === "APPROVED" || initial.status === "PENDING_APPROVAL");

  // Correction
  const correctedCtx = createPizzaFormContext({
    userMessage: "Change phone number to 9876599999",
    language: "en",
  }, fix);
  const corrected = await tool.execute(correctedCtx.user.id, correctedCtx, {
    taskId: correctedCtx.formTask.id,
    fieldId: field.id,
    value: "9876599999",
    source: "USER_PROVIDED",
  });
  assert.equal(corrected.value, "9876599999", "New value must replace previous value");
  assert.notEqual(corrected.id, initial.id, "A new revision value record is created");
});

// ============================================================================
// Test H: False execution claim prevention
// ============================================================================
test("Test H: False execution claim prevention — unapplied value cannot be claimed as filled on webpage", () => {
  const ctx = createPizzaFormContext({
    userMessage: "My name is Rahul Sharma",
    language: "en",
  });

  // Assistant claims it filled the field when it is only collected in conversation
  const sanitized = sanitizeFalseExecutionClaims(
    "I have filled Rahul Sharma for the customer name. What telephone number should I enter?",
    ctx,
    "en",
    [{ success: true, name: "propose_field_value" }],
  );

  assert.ok(!sanitized.includes("I have filled"), "Must not claim field was filled");
  assert.ok(sanitized.includes("I've noted"), "Must accurately confirm detail was noted");
});

// ============================================================================
// Test I: Failed frontend execution is accurately reported
// ============================================================================
test("Test I: Failed frontend execution — field with FAILED status is not claimed as filled", () => {
  const failedFields = [
    { id: "f-name", fieldIdentifier: "customer_name", label: "Customer name", inputType: "text", isRequired: true, required: true, isEmpty: false, isCollected: true, collectedValue: "Rahul", isApplied: false, isVerified: false, lifecycleStatus: "FAILED" },
  ];
  const ctx = createPizzaFormContext({
    userMessage: "What happened to my form?",
    language: "en",
    detectedFields: failedFields,
  });

  const projected = projectContextForAgent(ctx, "en");
  assert.equal(projected.formTask.fields[0].status, "FAILED");
  assert.equal(projected.formTask.fields[0].isVerified, false);
});

// ============================================================================
// Test J: Verified execution allows confirmation
// ============================================================================
test("Test J: Verified execution — only after verified execution may the assistant claim a field is filled", () => {
  const verifiedFields = [
    { id: "f-name", fieldIdentifier: "customer_name", label: "Customer name", inputType: "text", isRequired: true, required: true, isEmpty: false, isCollected: true, collectedValue: "Rahul", isApplied: true, isVerified: true, lifecycleStatus: "VERIFIED" },
  ];
  const ctx = createPizzaFormContext({
    userMessage: "Did it fill?",
    language: "en",
    detectedFields: verifiedFields,
  });

  // Since isVerified is true, sanitizeFalseExecutionClaims permits confirmed filled statements
  const rawText = "I have filled Rahul for the customer name.";
  const verifiedText = sanitizeFalseExecutionClaims(rawText, ctx, "en", []);
  assert.equal(verifiedText, rawText, "Verified execution claim is permitted");
});
