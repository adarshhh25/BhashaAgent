require("dotenv/config");

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { app } = require("../../dist/server");
const { prisma } = require("../../dist/config/database");
const { createAssistantMessage } = require("../../dist/modules/conversations/message.service");
const { getConversationContext } = require("../../dist/modules/conversations/context.service");

let server;
let baseUrl;
let userId;
let accessToken;

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
  const registration = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Conversation Test", email: `conversation-${suffix}@example.test`, password: "Conversation Test Password" },
  });
  const registered = await registration.json();
  userId = registered.data.user.id;
  const login = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: registered.data.user.email, password: "Conversation Test Password" },
  });
  accessToken = (await login.json()).data.accessToken;
});

test.after(async () => {
  if (userId) {
    const conversations = await prisma.conversation.findMany({ where: { userId }, select: { id: true } });
    for (const conversation of conversations) {
      await prisma.message.deleteMany({ where: { conversationId: conversation.id } });
    }
    await prisma.conversation.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("conversation persistence, context, correction, pagination, and isolation", async () => {
  const auth = { authorization: `Bearer ${accessToken}` };
  const created = await request("/api/v1/conversations", {
    method: "POST",
    headers: auth,
    body: { title: "Internship application" },
  });
  assert.equal(created.status, 201);
  const conversation = (await created.json()).data.conversation;
  assert.equal(conversation.status, "ACTIVE");

  const firstMessage = await request(`/api/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: auth,
    body: { content: "Mujhe internship ke liye apply karna hai.", language: "hi" },
  });
  assert.equal(firstMessage.status, 201);
  const first = (await firstMessage.json()).data.message;
  assert.equal(first.role, "USER");

  const assistant = await createAssistantMessage({
    conversationId: conversation.id,
    content: "Which company are you applying to?",
    language: "en",
  });
  await request(`/api/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: auth,
    body: { content: "Google.", language: "en" },
  });
  await createAssistantMessage({ conversationId: conversation.id, content: "What position?" });
  const historyResponse = await request(`/api/v1/conversations/${conversation.id}/messages?page=1&limit=2`, { headers: auth });
  assert.equal(historyResponse.status, 200);
  const history = (await historyResponse.json()).data;
  assert.equal(history.messages.length, 2);
  assert.equal(history.messages[0].role, "USER");

  const context = await getConversationContext({ conversationId: conversation.id, userId, limit: 10 });
  assert.deepEqual(context.map((message) => message.content), [
    "Mujhe internship ke liye apply karna hai.",
    "Which company are you applying to?",
    "Google.",
    "What position?",
  ]);
  assert.equal(assistant.role, "ASSISTANT");

  const correction = await request(`/api/v1/conversations/${conversation.id}/messages/${first.id}`, {
    method: "PATCH",
    headers: auth,
    body: { content: "Mujhe backend internship ke liye apply karna hai." },
  });
  assert.equal(correction.status, 200);
  assert.equal((await correction.json()).data.message.revisions.length, 1);

  const assistantCorrection = await request(`/api/v1/conversations/${conversation.id}/messages/${assistant.id}`, {
    method: "PATCH",
    headers: auth,
    body: { content: "not allowed" },
  });
  assert.equal(assistantCorrection.status, 400);

  const renamed = await request(`/api/v1/conversations/${conversation.id}`, {
    method: "PATCH",
    headers: auth,
    body: { title: "Google application", status: "ARCHIVED" },
  });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).data.conversation.status, "ARCHIVED");

  const archivedMessage = await request(`/api/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: auth,
    body: { content: "Can continue after archive." },
  });
  assert.equal(archivedMessage.status, 201);

  const deleted = await request(`/api/v1/conversations/${conversation.id}`, {
    method: "DELETE",
    headers: auth,
  });
  assert.equal(deleted.status, 200);
  const listing = await request("/api/v1/conversations", { headers: auth });
  assert.equal((await listing.json()).data.conversations.some((item) => item.id === conversation.id), false);
  const afterDelete = await request(`/api/v1/conversations/${conversation.id}/messages`, { headers: auth });
  assert.equal(afterDelete.status, 410);
});
