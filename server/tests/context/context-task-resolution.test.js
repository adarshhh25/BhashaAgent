require("dotenv/config");

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildAgentContext } = require("../../dist/modules/context/context.service");
const { prisma } = require("../../dist/config/database");

let user1;
let user2;
let conversation1;
let conversation2;
let conversationUser2;
let message1;

test.before(async () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  user1 = await prisma.user.create({
    data: {
      email: `res-user1-${suffix}@example.test`,
      passwordHash: "hash1",
      fullName: "Resolution User 1",
    },
  });
  user2 = await prisma.user.create({
    data: {
      email: `res-user2-${suffix}@example.test`,
      passwordHash: "hash2",
      fullName: "Resolution User 2",
    },
  });
  conversation1 = await prisma.conversation.create({
    data: {
      userId: user1.id,
      title: "Conversation 1",
    },
  });
  conversation2 = await prisma.conversation.create({
    data: {
      userId: user1.id,
      title: "Conversation 2",
    },
  });
  conversationUser2 = await prisma.conversation.create({
    data: {
      userId: user2.id,
      title: "User 2 Conversation",
    },
  });
  message1 = await prisma.message.create({
    data: {
      conversationId: conversation1.id,
      role: "USER",
      content: "Hello assistant",
      inputMode: "TEXT",
    },
  });
});

test.after(async () => {
  await prisma.detectedField.deleteMany({
    where: { formTask: { userId: { in: [user1.id, user2.id] } } },
  });
  await prisma.formTask.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } },
  });
  await prisma.message.deleteMany({
    where: { conversationId: { in: [conversation1.id, conversation2.id, conversationUser2.id] } },
  });
  await prisma.conversation.deleteMany({
    where: { userId: { in: [user1.id, user2.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [user1.id, user2.id] } },
  });
  await prisma.$disconnect();
});

test("Scenario 1: Existing task belonging to user and conversation resolves successfully", async () => {
  const task = await prisma.formTask.create({
    data: {
      userId: user1.id,
      conversationId: conversation1.id,
      webpageUrl: "https://httpbin.org/forms/post",
      status: "FIELDS_DETECTED",
      title: "Task 1",
    },
  });

  const res = await buildAgentContext({
    userId: user1.id,
    conversationId: conversation1.id,
    currentMessage: { messageId: message1.id },
    formTaskId: task.id,
  });

  assert.equal(res.success, true);
  assert.equal(res.taskResolution.status, "resolved");
  assert.equal(res.taskResolution.selectedTaskId, task.id);
  assert.equal(res.taskResolution.diagnostic?.category, "RESOLVED");
  assert.equal(res.context.formTask.id, task.id);
});

test("Scenario 2: Missing taskId resolves single active conversation task", async () => {
  const res = await buildAgentContext({
    userId: user1.id,
    conversationId: conversation1.id,
    currentMessage: { messageId: message1.id },
  });

  assert.equal(res.success, true);
  assert.equal(res.taskResolution.status, "resolved");
  assert.ok(res.taskResolution.selectedTaskId);
  assert.equal(res.taskResolution.diagnostic?.category, "RESOLVED");
});

test("Scenario 3: Nonexistent taskId gracefully falls back to not_requested with TASK_NOT_FOUND", async () => {
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const res = await buildAgentContext({
    userId: user1.id,
    conversationId: conversation2.id, // conversation2 has no active tasks
    currentMessage: { content: "Test without active tasks", source: "text" },
    formTaskId: fakeId,
  });

  assert.equal(res.success, true);
  assert.equal(res.taskResolution.status, "not_requested");
  assert.equal(res.taskResolution.diagnostic?.category, "TASK_NOT_FOUND");
  assert.equal(res.context.formTask.id, undefined);
});

test("Scenario 4: Task owned by another user is rejected with TASK_OWNERSHIP_MISMATCH", async () => {
  const user2Task = await prisma.formTask.create({
    data: {
      userId: user2.id,
      conversationId: conversationUser2.id,
      webpageUrl: "https://httpbin.org/forms/post",
      status: "FIELDS_DETECTED",
      title: "User 2 Task",
    },
  });

  const res = await buildAgentContext({
    userId: user1.id,
    conversationId: conversation1.id,
    currentMessage: { messageId: message1.id },
    formTaskId: user2Task.id,
  });

  assert.equal(res.success, true);
  assert.equal(res.taskResolution.status, "not_requested");
  assert.equal(res.taskResolution.diagnostic?.category, "TASK_OWNERSHIP_MISMATCH");
  assert.equal(res.context.formTask.id, undefined);
});

test("Scenario 5: Task in foreign conversation without active task gives TASK_CONVERSATION_MISMATCH", async () => {
  const foreignTask = await prisma.formTask.create({
    data: {
      userId: user1.id,
      conversationId: conversation1.id,
      webpageUrl: "https://httpbin.org/forms/post",
      status: "FIELDS_DETECTED",
      title: "Conv 1 Task",
    },
  });

  const res = await buildAgentContext({
    userId: user1.id,
    conversationId: conversation2.id, // conversation2 has no active tasks
    currentMessage: { content: "Hello", source: "text" },
    formTaskId: foreignTask.id,
  });

  assert.equal(res.success, true);
  assert.equal(res.taskResolution.status, "not_requested");
  assert.equal(res.taskResolution.diagnostic?.category, "TASK_CONVERSATION_MISMATCH");
  assert.equal(res.context.formTask.id, undefined);
});

test("Scenario 6: Terminal status COMPLETED is diagnosed as TASK_ARCHIVED_OR_DELETED", async () => {
  const completedTask = await prisma.formTask.create({
    data: {
      userId: user1.id,
      conversationId: conversation1.id,
      webpageUrl: "https://httpbin.org/forms/post",
      status: "COMPLETED",
      title: "Completed Task",
    },
  });

  const res = await buildAgentContext({
    userId: user1.id,
    conversationId: conversation1.id,
    currentMessage: { messageId: message1.id },
    formTaskId: completedTask.id,
  });

  assert.equal(res.success, true);
  assert.equal(res.taskResolution.status, "not_requested");
  assert.equal(res.taskResolution.diagnostic?.category, "TASK_ARCHIVED_OR_DELETED");
});

test("Scenario 7: Terminal status CANCELLED is diagnosed as TASK_ARCHIVED_OR_DELETED", async () => {
  const cancelledTask = await prisma.formTask.create({
    data: {
      userId: user1.id,
      conversationId: conversation1.id,
      webpageUrl: "https://httpbin.org/forms/post",
      status: "CANCELLED",
      title: "Cancelled Task",
    },
  });

  const res = await buildAgentContext({
    userId: user1.id,
    conversationId: conversation1.id,
    currentMessage: { messageId: message1.id },
    formTaskId: cancelledTask.id,
  });

  assert.equal(res.success, true);
  assert.equal(res.taskResolution.status, "not_requested");
  assert.equal(res.taskResolution.diagnostic?.category, "TASK_ARCHIVED_OR_DELETED");
});

test("Scenario 8: Stale taskId from previous conversation recovers active task for current conversation (STALE_TAB_CONTEXT)", async () => {
  const activeTaskConv2 = await prisma.formTask.create({
    data: {
      userId: user1.id,
      conversationId: conversation2.id,
      webpageUrl: "https://httpbin.org/forms/post",
      status: "FIELDS_DETECTED",
      title: "Active Task Conv 2",
    },
  });

  // User passes stale task ID from conversation 1 into conversation 2
  const staleTaskId = (await prisma.formTask.findFirst({
    where: { conversationId: conversation1.id, status: "FIELDS_DETECTED" },
  })).id;

  const res = await buildAgentContext({
    userId: user1.id,
    conversationId: conversation2.id,
    currentMessage: { content: "Speaking in conv 2", source: "voice_transcript" },
    formTaskId: staleTaskId,
  });

  assert.equal(res.success, true);
  assert.equal(res.taskResolution.status, "resolved");
  assert.equal(res.taskResolution.selectedTaskId, activeTaskConv2.id);
  assert.equal(res.taskResolution.diagnostic?.category, "STALE_TAB_CONTEXT");
  assert.equal(res.context.formTask.id, activeTaskConv2.id);
});
