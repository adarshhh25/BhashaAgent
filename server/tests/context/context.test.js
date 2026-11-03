require("dotenv/config");

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { app } = require("../../dist/server");
const { prisma } = require("../../dist/config/database");

let server;
let baseUrl;
let user;
let token;

function request(path, options = {}) {
  const { body, headers, ...rest } = options;
  return fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registered = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Context User", email: `context-${suffix}@example.test`, password: "Context Password" },
  });
  user = (await registered.json()).data.user;
  const login = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: user.email, password: "Context Password" },
  });
  token = (await login.json()).data.accessToken;
});

test.after(async () => {
  await prisma.memoryChangeRequest.deleteMany({ where: { userId: user.id } });
  await prisma.profileMemory.deleteMany({ where: { userId: user.id } });
  const tasks = await prisma.formTask.findMany({ where: { userId: user.id }, select: { id: true } });
  for (const task of tasks) {
    await prisma.approval.deleteMany({ where: { formTaskId: task.id } });
    await prisma.taskEvent.deleteMany({ where: { formTaskId: task.id } });
    const fields = await prisma.detectedField.findMany({ where: { formTaskId: task.id }, select: { id: true } });
    for (const field of fields) {
      await prisma.fieldValueRevision.deleteMany({ where: { fieldValue: { detectedFieldId: field.id } } });
      await prisma.fieldValue.deleteMany({ where: { detectedFieldId: field.id } });
    }
    await prisma.detectedField.deleteMany({ where: { formTaskId: task.id } });
  }
  await prisma.formTask.deleteMany({ where: { userId: user.id } });
  await prisma.conversation.deleteMany({ where: { userId: user.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("builds isolated context with corrections, approved memories, and task ambiguity", async () => {
  const auth = { authorization: `Bearer ${token}` };
  const conversation = await prisma.conversation.create({ data: { userId: user.id, title: "Context conversation" } });
  const created = await request(`/api/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: auth,
    body: { content: "My graduation year is 2026", inputMode: "TEXT", language: "en" },
  });
  const message = (await created.json()).data.message;
  await request(`/api/v1/conversations/${conversation.id}/messages/${message.id}`, {
    method: "PATCH",
    headers: auth,
    body: { content: "Correction: my graduation year is 2027" },
  });
  await prisma.profileMemory.create({
    data: {
      userId: user.id,
      category: "EDUCATION",
      key: "graduationYear",
      value: 2027,
      dataType: "NUMBER",
      isApproved: true,
      status: "APPROVED",
      approvedAt: new Date(),
    },
  });
  await prisma.memoryChangeRequest.create({
    data: {
      userId: user.id,
      operation: "CREATE",
      category: "EDUCATION",
      proposedKey: "pendingYear",
      proposedValue: 2028,
      status: "PENDING",
    },
  });
  for (const title of ["Application A", "Application B"]) {
    await request("/api/v1/form-tasks", {
      method: "POST",
      headers: auth,
      body: { conversationId: conversation.id, title, webpageUrl: `https://example.test/${title.replace(" ", "-")}` },
    });
  }
  const response = await request(`/api/v1/conversations/${conversation.id}/context`, {
    method: "POST",
    headers: auth,
    body: { currentMessage: { messageId: message.id } },
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.success, true);
  assert.equal(result.taskResolution.status, "ambiguous");
  assert.equal(result.context.request.currentUserMessage.content, "Correction: my graduation year is 2027");
  assert.equal(result.context.conversation.recentMessages.length, 0);
  assert.equal(result.context.conversation.corrections[0].messageId, message.id);
  assert.deepEqual(result.context.profileMemory.approvedFacts.map((fact) => fact.key), ["graduationYear"]);
  assert.equal(result.context.formTask.id, undefined);
});
