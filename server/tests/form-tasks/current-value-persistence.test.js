import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../../dist/config/database.js";
import {
  extractDetectedFieldScalars,
  addFields,
  getLiveBrowserFieldValue,
} from "../../dist/modules/form-tasks/form-task.service.js";

test("CurrentValue Persistence & Retrieval Test Suite", async (t) => {
  // Test User and Conversation setup
  const testUserId = randomUUID();
  const otherUserId = randomUUID();
  const testConversationId = randomUUID();
  const otherConversationId = randomUUID();

  // Create test users
  await prisma.user.createMany({
    data: [
      { id: testUserId, email: `test-${testUserId}@example.com`, passwordHash: "hash", fullName: "Test User" },
      { id: otherUserId, email: `test-${otherUserId}@example.com`, passwordHash: "hash", fullName: "Other User" },
    ],
  });

  // Create test conversations
  await prisma.conversation.createMany({
    data: [
      { id: testConversationId, userId: testUserId, title: "Test Conversation" },
      { id: otherConversationId, userId: otherUserId, title: "Other Conversation" },
    ],
  });

  // Helper to create test form task
  async function createTestTask(userId = testUserId, conversationId = testConversationId) {
    return prisma.formTask.create({
      data: {
        id: randomUUID(),
        userId,
        conversationId,
        title: "Test Order Form",
        webpageUrl: "https://httpbin.org/forms/post",
        status: "CREATED",
      },
    });
  }

  t.after(async () => {
    // Cleanup
    await prisma.fieldValueRevision.deleteMany({ where: { fieldValue: { detectedField: { formTask: { userId: { in: [testUserId, otherUserId] } } } } } });
    await prisma.fieldValue.deleteMany({ where: { detectedField: { formTask: { userId: { in: [testUserId, otherUserId] } } } } });
    await prisma.detectedField.deleteMany({ where: { formTask: { userId: { in: [testUserId, otherUserId] } } } });
    await prisma.formTask.deleteMany({ where: { userId: { in: [testUserId, otherUserId] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [testUserId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [testUserId, otherUserId] } } });
  });

  await t.test("1. extractDetectedFieldScalars cleanly separates scalars from currentValue and browser metadata", () => {
    const raw = {
      fieldIdentifier: "custname",
      label: "Customer name:",
      name: "custname",
      elementType: "input",
      inputType: "text",
      isRequired: true,
      currentValue: "मैं आदर्श",
      unwantedBrowserDomNode: { tagName: "INPUT" },
      randomScraperProp: 12345,
    };

    const { scalars, currentValue } = extractDetectedFieldScalars(raw);
    assert.equal(currentValue, "मैं आदर्श");
    assert.equal(scalars.fieldIdentifier, "custname");
    assert.equal(scalars.label, "Customer name:");
    assert.equal(scalars.isRequired, true);
    assert.equal(scalars.currentValue, undefined);
    assert.equal(scalars.unwantedBrowserDomNode, undefined);
    assert.equal(scalars.randomScraperProp, undefined);
  });

  await t.test("2. addFields succeeds with currentValue and does NOT throw Prisma unknown argument error", async () => {
    const task = await createTestTask();

    const fieldsInput = [
      {
        fieldIdentifier: "custname",
        label: "Customer name:",
        name: "custname",
        elementType: "input",
        inputType: "text",
        isRequired: true,
        currentValue: "मैं आदर्श",
      },
      {
        fieldIdentifier: "custtel",
        label: "Telephone:",
        name: "custtel",
        elementType: "input",
        inputType: "tel",
        isRequired: true,
        currentValue: "09004234499",
      },
    ];

    const result = await addFields(testUserId, task.id, fieldsInput);
    assert.equal(result.length, 2);

    // Verify fields persisted in database
    const dbFields = await prisma.detectedField.findMany({
      where: { formTaskId: task.id },
      include: { fieldValues: true },
    });
    assert.equal(dbFields.length, 2);

    const nameField = dbFields.find((f) => f.fieldIdentifier === "custname");
    assert.ok(nameField);
    assert.equal(nameField.fieldValues.length, 1);
    assert.equal(nameField.fieldValues[0].value, "मैं आदर्श");

    const telField = dbFields.find((f) => f.fieldIdentifier === "custtel");
    assert.ok(telField);
    assert.equal(telField.fieldValues.length, 1);
    assert.equal(telField.fieldValues[0].value, "09004234499");
    assert.equal(typeof telField.fieldValues[0].value, "string", "Must preserve telephone leading zeros as string");
  });

  await t.test("3. Exact preservation of Devanagari names 'मैं आदर्श' and 'आदर्श झा'", async () => {
    const task = await createTestTask();

    await addFields(testUserId, task.id, [
      {
        fieldIdentifier: "custname",
        label: "Customer name:",
        elementType: "input",
        inputType: "text",
        currentValue: "आदर्श झा",
      },
    ]);

    const live = await getLiveBrowserFieldValue({
      userId: testUserId,
      conversationId: testConversationId,
      taskId: task.id,
      fieldIdOrIdentifier: "custname",
    });

    assert.equal(live.status, "AVAILABLE");
    if (live.status === "AVAILABLE") {
      assert.equal(live.value, "आदर्श झा");
      assert.equal(live.stringValue, "आदर्श झा");
    }
  });

  await t.test("4. Duplicate addFields call with identical currentValue does NOT create duplicate FieldValue", async () => {
    const task = await createTestTask();

    const input = [
      {
        fieldIdentifier: "custname",
        label: "Customer name:",
        elementType: "input",
        inputType: "text",
        currentValue: "आदर्श झा",
      },
    ];

    // First call
    await addFields(testUserId, task.id, input);
    // Second call with same value
    await addFields(testUserId, task.id, input);

    const field = await prisma.detectedField.findFirstOrThrow({
      where: { formTaskId: task.id, fieldIdentifier: "custname" },
      include: { fieldValues: true },
    });

    assert.equal(field.fieldValues.length, 1, "Must not duplicate identical field value");
  });

  await t.test("5. Changed currentValue records a FieldValueRevision and updates the FieldValue", async () => {
    const task = await createTestTask();

    // Initial value
    await addFields(testUserId, task.id, [
      {
        fieldIdentifier: "custname",
        label: "Customer name:",
        elementType: "input",
        inputType: "text",
        currentValue: "मैं आदर्श",
      },
    ]);

    // Updated value on rescanning page
    await addFields(testUserId, task.id, [
      {
        fieldIdentifier: "custname",
        label: "Customer name:",
        elementType: "input",
        inputType: "text",
        currentValue: "Adarsh Jha",
      },
    ]);

    const field = await prisma.detectedField.findFirstOrThrow({
      where: { formTaskId: task.id, fieldIdentifier: "custname" },
      include: { fieldValues: { include: { revisions: true } } },
    });

    assert.equal(field.fieldValues.length, 1);
    assert.equal(field.fieldValues[0].value, "Adarsh Jha");
    assert.equal(field.fieldValues[0].revisions.length, 1);
    assert.equal(field.fieldValues[0].revisions[0].previousValue, "मैं आदर्श");
  });

  await t.test("6. Sensitive fields (password, card, cvv, pin, tokens) and file inputs never persist currentValue", async () => {
    const task = await createTestTask();

    await addFields(testUserId, task.id, [
      {
        fieldIdentifier: "pwd",
        label: "Password:",
        elementType: "input",
        inputType: "password",
        currentValue: "secretPassword123",
      },
      {
        fieldIdentifier: "card_cvv",
        label: "CVV Code:",
        elementType: "input",
        inputType: "text",
        currentValue: "999",
      },
      {
        fieldIdentifier: "avatar_file",
        label: "Profile Picture:",
        elementType: "input",
        inputType: "file",
        currentValue: "C:\\fakepath\\photo.jpg",
      },
    ]);

    const fields = await prisma.detectedField.findMany({
      where: { formTaskId: task.id },
      include: { fieldValues: true },
    });

    for (const f of fields) {
      assert.equal(f.fieldValues.length, 0, `Field "${f.fieldIdentifier}" must not have any stored FieldValues`);
    }
  });

  await t.test("7. getLiveBrowserFieldValue enforces strict User -> Conversation -> Task ownership", async () => {
    const task = await createTestTask(testUserId, testConversationId);

    await addFields(testUserId, task.id, [
      {
        fieldIdentifier: "custname",
        label: "Customer name:",
        elementType: "input",
        inputType: "text",
        currentValue: "Adarsh",
      },
    ]);

    // Authorized call
    const authRes = await getLiveBrowserFieldValue({
      userId: testUserId,
      conversationId: testConversationId,
      taskId: task.id,
      fieldIdOrIdentifier: "custname",
    });
    assert.equal(authRes.status, "AVAILABLE");

    // Cross-user access rejected
    const crossUserRes = await getLiveBrowserFieldValue({
      userId: otherUserId,
      conversationId: testConversationId,
      taskId: task.id,
      fieldIdOrIdentifier: "custname",
    });
    assert.equal(crossUserRes.status, "UNAVAILABLE");

    // Cross-conversation access rejected
    const crossConvRes = await getLiveBrowserFieldValue({
      userId: testUserId,
      conversationId: otherConversationId,
      taskId: task.id,
      fieldIdOrIdentifier: "custname",
    });
    assert.equal(crossConvRes.status, "UNAVAILABLE");
  });

  await t.test("8. getLiveBrowserFieldValue returns EMPTY for blank or unpopulated fields", async () => {
    const task = await createTestTask();

    await addFields(testUserId, task.id, [
      {
        fieldIdentifier: "comments",
        label: "Delivery instructions:",
        elementType: "textarea",
        inputType: "textarea",
        currentValue: "",
      },
    ]);

    const emptyRes = await getLiveBrowserFieldValue({
      userId: testUserId,
      conversationId: testConversationId,
      taskId: task.id,
      fieldIdOrIdentifier: "comments",
    });
    assert.equal(emptyRes.status, "EMPTY");
    if (emptyRes.status === "EMPTY") {
      assert.equal(emptyRes.value, "");
      assert.equal(emptyRes.stringValue, "");
    }
  });
});

