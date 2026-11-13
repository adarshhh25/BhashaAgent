require("dotenv/config");

const test = require("node:test");
const assert = require("node:assert/strict");
const { agentTools, toolDefinitions, findTool } = require("../../dist/modules/agent/agent.tools");
const { prisma } = require("../../dist/config/database");

test("all 7 agent tools pass validation", async () => {
  console.log("=== VERIFYING ALL 7 AGENT TOOLS ===");
  assert.equal(agentTools.length, 7, "Must have exactly 7 agent tools");
  assert.equal(toolDefinitions.length, 7, "Must have exactly 7 tool definitions");

  // Setup test user and conversation in DB
  const suffix = Date.now().toString(16);
  const user = await prisma.user.create({
    data: {
      email: `tools-${suffix}@test.local`,
      passwordHash: "hash-not-used-in-direct-tool-test",
      fullName: "Tool Test User",
    },
  });

  const conversation = await prisma.conversation.create({
    data: { userId: user.id, title: "Tool test conversation" },
  });

  const msg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "USER",
      content: "Update my email",
      inputMode: "TEXT",
      language: "en",
    },
  });

  const mockContext = {
    schemaVersion: "1.0",
    request: {
      requestId: "test-req",
      createdAt: new Date().toISOString(),
      currentUserMessage: { id: msg.id, content: "Update my email", language: "en", source: "text" },
    },
    user: { id: user.id },
    conversation: { id: conversation.id, status: "ACTIVE", recentMessages: [], relevantOlderContext: [], corrections: [] },
    profileMemory: { approvedFacts: [] },
    formTask: { detectedFields: [], proposedValues: [], missingInformation: [] },
    contextMetadata: { builtAt: new Date().toISOString(), sourceCounts: { recentMessages: 0, olderMessages: 0, approvedMemories: 0, detectedFields: 0, proposedValues: 0 }, truncated: false, omittedItems: [], warnings: [], sourceReferences: [] },
  };

  try {
    // 1. retrieve_context
    console.log("Testing Tool 1: retrieve_context");
    const tool1 = findTool("retrieve_context");
    assert(tool1, "retrieve_context tool must exist");
    const res1 = await tool1.execute(user.id, mockContext, {});
    assert.equal(res1, mockContext, "retrieve_context must return the active context");
    console.log("  ✓ retrieve_context passed");

    // 2. retrieve_approved_memories
    console.log("Testing Tool 2: retrieve_approved_memories");
    const tool2 = findTool("retrieve_approved_memories");
    assert(tool2, "retrieve_approved_memories tool must exist");
    await prisma.profileMemory.create({
      data: {
        userId: user.id,
        category: "IDENTITY",
        key: "legalName",
        value: "Tool Test User",
        isApproved: true,
        status: "APPROVED",
      },
    });
    const res2 = await tool2.execute(user.id, mockContext, {});
    assert(Array.isArray(res2), "retrieve_approved_memories must return array");
    assert.equal(res2.length, 1);
    assert.equal(res2[0].key, "legalName");
    console.log("  ✓ retrieve_approved_memories passed");

    // 3. list_form_tasks
    console.log("Testing Tool 3: list_form_tasks");
    const tool3 = findTool("list_form_tasks");
    assert(tool3, "list_form_tasks tool must exist");
    const formTask = await prisma.formTask.create({
      data: {
        userId: user.id,
        conversationId: conversation.id,
        webpageUrl: "https://example.com/form",
        title: "Test Form",
        status: "CREATED",
        version: 1,
      },
    });
    const res3 = await tool3.execute(user.id, mockContext, {});
    assert(res3.tasks && Array.isArray(res3.tasks), "list_form_tasks must return tasks array");
    assert.equal(res3.tasks.length, 1);
    assert.equal(res3.tasks[0].id, formTask.id);
    console.log("  ✓ list_form_tasks passed");

    // 4. retrieve_form_task
    console.log("Testing Tool 4: retrieve_form_task");
    const tool4 = findTool("retrieve_form_task");
    assert(tool4, "retrieve_form_task tool must exist");
    const res4 = await tool4.execute(user.id, mockContext, { taskId: formTask.id });
    assert.equal(res4.id, formTask.id, "retrieve_form_task must retrieve matching task");
    // Ownership check: must reject foreign task
    await assert.rejects(
      () => tool4.execute(user.id, mockContext, { taskId: "00000000-0000-0000-0000-000000000000" }),
      /not found/i,
      "retrieve_form_task must enforce task existence/ownership",
    );
    console.log("  ✓ retrieve_form_task passed");

    // 5. propose_profile_memory
    console.log("Testing Tool 5: propose_profile_memory");
    const tool5 = findTool("propose_profile_memory");
    assert(tool5, "propose_profile_memory tool must exist");
    const res5 = await tool5.execute(user.id, mockContext, {
      operation: "CREATE",
      category: "CONTACT",
      key: "email",
      proposedValue: "test@example.com",
    });
    assert.equal(res5.status, "PENDING", "propose_profile_memory must produce PENDING status");
    assert.equal(res5.operation, "CREATE");
    assert.equal(res5.category, "CONTACT");
    console.log("  ✓ propose_profile_memory passed");

    // 6. propose_field_value
    console.log("Testing Tool 6: propose_field_value");
    const tool6 = findTool("propose_field_value");
    assert(tool6, "propose_field_value tool must exist");
    const field = await prisma.detectedField.create({
      data: {
        formTaskId: formTask.id,
        fieldIdentifier: "f_name",
        label: "Your Name",
        elementType: "INPUT",
        inputType: "text",
        isRequired: true,
      },
    });
    const contextWithField = {
      ...mockContext,
      request: {
        ...mockContext.request,
        currentUserMessage: {
          ...mockContext.request.currentUserMessage,
          content: "My name is John Doe",
        },
      },
      formTask: {
        id: formTask.id,
        status: "CREATED",
        version: 1,
        detectedFields: [{ id: field.id, label: "Your Name", inputType: "text", required: true }],
        proposedValues: [],
        missingInformation: [],
      },
    };
    const res6 = await tool6.execute(user.id, contextWithField, {
      taskId: formTask.id,
      fieldId: field.id,
      value: "John Doe",
      source: "USER_PROVIDED",
      confidence: 1.0,
    });
    assert.equal(res6.status, "PENDING_APPROVAL", "propose_field_value must produce PENDING_APPROVAL status");
    console.log("  ✓ propose_field_value passed");

    // 7. run_intelligent_mapping
    console.log("Testing Tool 7: run_intelligent_mapping");
    const tool7 = findTool("run_intelligent_mapping");
    assert(tool7, "run_intelligent_mapping tool must exist");
    const updatedTask = await prisma.formTask.findUnique({ where: { id: formTask.id } });
    const contextWithUpdatedVersion = {
      ...contextWithField,
      formTask: {
        ...contextWithField.formTask,
        version: updatedTask.version,
      },
    };
    const res7 = await tool7.execute(user.id, contextWithUpdatedVersion, {
      taskId: formTask.id,
      expectedVersion: updatedTask.version,
    });
    assert(res7.taskId === formTask.id, "run_intelligent_mapping must return matching taskId");
    assert(Array.isArray(res7.results), "run_intelligent_mapping must return results array");
    console.log("  ✓ run_intelligent_mapping passed");

    console.log("\nALL 7 AGENT TOOLS VERIFIED AND PASSING WITH STRICT VALIDATION!");
  } finally {
    // Cleanup test data
    await prisma.memoryChangeRequest.deleteMany({ where: { userId: user.id } });
    await prisma.profileMemory.deleteMany({ where: { userId: user.id } });
    await prisma.fieldValueRevision.deleteMany({ where: { fieldValue: { detectedField: { formTaskId: { in: (await prisma.formTask.findMany({ where: { userId: user.id }, select: { id: true } })).map((t) => t.id) } } } } });
    await prisma.fieldValue.deleteMany({ where: { detectedField: { formTaskId: { in: (await prisma.formTask.findMany({ where: { userId: user.id }, select: { id: true } })).map((t) => t.id) } } } });
    await prisma.detectedField.deleteMany({ where: { formTaskId: { in: (await prisma.formTask.findMany({ where: { userId: user.id }, select: { id: true } })).map((t) => t.id) } } });
    await prisma.formTask.deleteMany({ where: { userId: user.id } });
    await prisma.conversation.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
