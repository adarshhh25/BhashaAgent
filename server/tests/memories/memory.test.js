require("dotenv/config");

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { app } = require("../../dist/server");
const { prisma } = require("../../dist/config/database");

let server;
let baseUrl;
let userId;
let accessToken;
let email;
let otherUserId;

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
  email = `memory-${suffix}@example.test`;
  const registration = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Memory Test", email, password: "Memory Test Password" },
  });
  const registered = await registration.json();
  userId = registered.data.user.id;
  const login = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password: "Memory Test Password" },
  });
  accessToken = (await login.json()).data.accessToken;
});

test.after(async () => {
  if (userId) {
    await prisma.approval.deleteMany({ where: { userId } });
    await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.memoryChangeRequest.deleteMany({ where: { userId } });
    await prisma.profileMemory.deleteMany({ where: { userId } });
    await prisma.conversation.deleteMany({ where: { userId } });
    await prisma.refreshToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  if (otherUserId) {
    await prisma.refreshToken.deleteMany({ where: { userId: otherUserId } });
    await prisma.user.delete({ where: { id: otherUserId } });
  }
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("memory proposals require approval and preserve lifecycle history", async () => {
  const auth = { authorization: `Bearer ${accessToken}` };
  const conversationResponse = await request("/api/v1/conversations", {
    method: "POST",
    headers: auth,
    body: { title: "Memory source" },
  });
  const conversation = (await conversationResponse.json()).data.conversation;
  const messageResponse = await request(`/api/v1/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: auth,
    body: { content: "My highest qualification is B.E. Computer Engineering.", language: "en" },
  });
  const message = (await messageResponse.json()).data.message;

  const extracted = await request("/api/v1/memories/extract", {
    method: "POST",
    headers: auth,
    body: { conversationId: conversation.id, messageId: message.id },
  });
  assert.equal(extracted.status, 200);
  assert.equal((await extracted.json()).data.candidates[0].key, "highest_qualification");

  const proposalResponse = await request("/api/v1/memories/proposals", {
    method: "POST",
    headers: auth,
    body: {
      operation: "CREATE",
      category: "EDUCATION",
      key: "highest_qualification",
      proposedValue: "B.E. Computer Engineering",
      sourceConversationId: conversation.id,
      sourceMessageId: message.id,
    },
  });
  assert.equal(proposalResponse.status, 201);
  const proposal = (await proposalResponse.json()).data.proposal;
  assert.equal(proposal.status, "PENDING");
  assert.equal((await request("/api/v1/memories", { headers: auth })).status, 200);
  assert.equal((await prisma.profileMemory.count({ where: { userId } })), 0);

  const otherSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const otherRegistration = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Other User", email: `other-memory-${otherSuffix}@example.test`, password: "Other Memory Password" },
  });
  otherUserId = (await otherRegistration.json()).data.user.id;
  const otherLogin = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: `other-memory-${otherSuffix}@example.test`, password: "Other Memory Password" },
  });
  const otherAuth = { authorization: `Bearer ${(await otherLogin.json()).data.accessToken}` };
  assert.equal((await (await request("/api/v1/memories", { headers: otherAuth })).json()).data.memories.length, 0);
  assert.equal((await request(`/api/v1/memories/proposals/${proposal.id}/approve`, { method: "POST", headers: otherAuth })).status, 409);
  const crossUserSource = await request("/api/v1/memories/proposals", {
    method: "POST",
    headers: otherAuth,
    body: {
      operation: "CREATE",
      category: "EDUCATION",
      key: "other_key",
      proposedValue: "Private",
      sourceConversationId: conversation.id,
      sourceMessageId: message.id,
    },
  });
  assert.equal(crossUserSource.status, 404);

  const approved = await request(`/api/v1/memories/proposals/${proposal.id}/approve`, {
    method: "POST",
    headers: auth,
  });
  assert.equal(approved.status, 200);
  const memories = (await (await request("/api/v1/memories", { headers: auth })).json()).data.memories;
  assert.equal(memories[0].value, "B.E. Computer Engineering");

  const duplicate = await request("/api/v1/memories/proposals", {
    method: "POST",
    headers: auth,
    body: {
      operation: "CREATE",
      category: "EDUCATION",
      key: "highest_qualification",
      proposedValue: "B.E. Computer Engineering",
    },
  });
  assert.equal(duplicate.status, 409);

  const memoryId = memories[0].id;
  const update = await request(`/api/v1/memories/${memoryId}`, {
    method: "PATCH",
    headers: auth,
    body: { proposedValue: "M.E. Computer Engineering" },
  });
  assert.equal(update.status, 201);
  const updateProposal = (await update.json()).data.proposal;
  assert.equal((await (await request("/api/v1/memories", { headers: auth })).json()).data.memories[0].value, "B.E. Computer Engineering");

  const rejected = await request(`/api/v1/memories/proposals/${updateProposal.id}/reject`, {
    method: "POST",
    headers: auth,
    body: { reason: "Not yet completed" },
  });
  assert.equal(rejected.status, 200);

  const updateAgain = await request(`/api/v1/memories/${memoryId}`, {
    method: "PATCH",
    headers: auth,
    body: { proposedValue: "M.E. Computer Engineering" },
  });
  const approvedUpdate = (await updateAgain.json()).data.proposal;
  await request(`/api/v1/memories/proposals/${approvedUpdate.id}/approve`, { method: "POST", headers: auth });
  assert.equal((await (await request("/api/v1/memories", { headers: auth })).json()).data.memories[0].value, "M.E. Computer Engineering");

  const deleteProposalResponse = await request(`/api/v1/memories/${memoryId}`, {
    method: "DELETE",
    headers: auth,
  });
  const deleteProposal = (await deleteProposalResponse.json()).data.proposal;
  assert.equal((await (await request("/api/v1/memories", { headers: auth })).json()).data.memories.length, 1);
  await request(`/api/v1/memories/proposals/${deleteProposal.id}/approve`, { method: "POST", headers: auth });
  assert.equal((await (await request("/api/v1/memories", { headers: auth })).json()).data.memories.length, 0);
  assert.ok(await prisma.approval.count({ where: { userId, approvalType: "PROFILE_MEMORY" } }));
});
