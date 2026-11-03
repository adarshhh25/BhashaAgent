require("dotenv/config");

const assert = require("node:assert/strict");
const test = require("node:test");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

test("database foundation supports relationships, constraints, isolation, and rollback", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let user;
  let otherUser;

  try {
    user = await prisma.user.create({
      data: {
        email: `foundation-${suffix}@example.test`,
        passwordHash: "test-hash",
        fullName: "Foundation Test User",
        conversations: {
          create: {
            title: "Test conversation",
            messages: {
              create: [
                { role: "USER", content: "Hello", inputMode: "TEXT" },
                { role: "ASSISTANT", content: "Hello!", inputMode: "VOICE" },
              ],
            },
          },
        },
      },
      include: { conversations: true },
    });
    const conversation = user.conversations[0];

    const memory = await prisma.profileMemory.create({
      data: {
        userId: user.id,
        category: "identity",
        key: "full_name",
        value: "Foundation Test User",
        isApproved: true,
        approvedAt: new Date(),
        sourceConversationId: conversation.id,
      },
    });
    const request = await prisma.memoryChangeRequest.create({
      data: {
        userId: user.id,
        conversationId: conversation.id,
        existingMemoryId: memory.id,
        operation: "UPDATE",
        proposedKey: "full_name",
        proposedValue: "Updated Test User",
        previousValue: "Foundation Test User",
      },
    });
    const task = await prisma.formTask.create({
      data: {
        userId: user.id,
        conversationId: conversation.id,
        webpageUrl: "https://example.test/application",
        domain: "example.test",
        detectedFields: {
          create: [
            {
              fieldIdentifier: "name",
              label: "Full name",
              elementType: "input",
              inputType: "text",
              fieldValues: {
                create: {
                  value: "Foundation Test User",
                  source: "PROFILE_MEMORY",
                  sourceReferenceId: memory.id,
                  confidence: 1,
                  status: "APPROVED",
                },
              },
            },
            {
              fieldIdentifier: "email",
              label: "Email",
              elementType: "input",
              inputType: "email",
            },
          ],
        },
      },
      include: { detectedFields: true },
    });
    await prisma.taskEvent.create({
      data: {
        formTaskId: task.id,
        eventType: "CREATED",
        newStatus: "PENDING",
      },
    });
    await prisma.approval.createMany({
      data: [
        {
          userId: user.id,
          conversationId: conversation.id,
          memoryChangeRequestId: request.id,
          approvalType: "PROFILE_MEMORY",
          status: "APPROVED",
          approvedAt: new Date(),
        },
        {
          userId: user.id,
          conversationId: conversation.id,
          formTaskId: task.id,
          approvalType: "FORM_FILL",
          status: "APPROVED",
          approvedAt: new Date(),
        },
        {
          userId: user.id,
          conversationId: conversation.id,
          formTaskId: task.id,
          approvalType: "FORM_SUBMISSION",
          status: "PENDING",
        },
      ],
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "TEST_CREATED",
        resourceType: "FORM_TASK",
        resourceId: task.id,
      },
    });

    const originalUpdatedAt = task.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const updatedTask = await prisma.formTask.update({
      where: { id: task.id },
      data: { status: "IN_PROGRESS" },
    });
    assert.ok(updatedTask.updatedAt >= originalUpdatedAt);

    await assert.rejects(
      prisma.fieldValue.create({
        data: {
          detectedFieldId: task.detectedFields[0].id,
          value: "invalid confidence",
          source: "AI_SUGGESTION",
          confidence: 1.1,
          status: "PROPOSED",
        },
      }),
      /constraint|range|check/i,
    );

    otherUser = await prisma.user.create({
      data: {
        email: `foundation-other-${suffix}@example.test`,
        passwordHash: "test-hash",
        fullName: "Other Test User",
      },
    });
    assert.notEqual(user.id, otherUser.id);
    assert.equal((await prisma.conversation.count({ where: { userId: otherUser.id } })), 0);
    assert.equal((await prisma.formTask.count({ where: { userId: otherUser.id } })), 0);
    await assert.rejects(
      prisma.approval.create({
        data: {
          userId: otherUser.id,
          memoryChangeRequestId: request.id,
          approvalType: "PROFILE_MEMORY",
        },
      }),
      /foreign key|belong to approval user/i,
    );

    const rollbackEmail = `rollback-${suffix}@example.test`;
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: { email: rollbackEmail, passwordHash: "test-hash", fullName: "Rollback User" },
        });
        throw new Error("intentional rollback");
      }),
      /intentional rollback/,
    );
    assert.equal(await prisma.user.count({ where: { email: rollbackEmail } }), 0);
  } finally {
    if (user) {
      await prisma.approval.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { userId: user.id } });
      const tasks = await prisma.formTask.findMany({ where: { userId: user.id }, select: { id: true } });
      for (const task of tasks) {
        await prisma.taskEvent.deleteMany({ where: { formTaskId: task.id } });
        await prisma.fieldValue.deleteMany({ where: { detectedField: { formTaskId: task.id } } });
        await prisma.detectedField.deleteMany({ where: { formTaskId: task.id } });
      }
      await prisma.formTask.deleteMany({ where: { userId: user.id } });
      await prisma.memoryChangeRequest.deleteMany({ where: { userId: user.id } });
      await prisma.profileMemory.deleteMany({ where: { userId: user.id } });
      await prisma.message.deleteMany({ where: { conversation: { userId: user.id } } });
      await prisma.conversation.deleteMany({ where: { userId: user.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    if (otherUser) {
      await prisma.user.delete({ where: { id: otherUser.id } });
    }
    await prisma.$disconnect();
  }
});
