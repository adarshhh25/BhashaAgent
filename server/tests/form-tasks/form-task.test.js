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
let otherUserId;

function request(path, options = {}) {
  const { body, headers, ...rest } = options;
  return fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function register(email, password) {
  const response = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Form Task User", email, password },
  });
  return (await response.json()).data.user;
}

async function login(email, password) {
  const response = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return (await response.json()).data.accessToken;
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await register(`task-${suffix}@example.test`, "Form Task Password");
  userId = user.id;
  accessToken = await login(user.email, "Form Task Password");
});

test.after(async () => {
  for (const id of [userId, otherUserId].filter(Boolean)) {
    await prisma.approval.deleteMany({ where: { userId: id } });
    const tasks = await prisma.formTask.findMany({ where: { userId: id }, select: { id: true } });
    for (const task of tasks) {
      await prisma.fieldMapping.deleteMany({ where: { formTaskId: task.id } });
      await prisma.taskEvent.deleteMany({ where: { formTaskId: task.id } });
      const fields = await prisma.detectedField.findMany({ where: { formTaskId: task.id }, select: { id: true } });
      for (const field of fields) {
        await prisma.fieldValueRevision.deleteMany({ where: { fieldValue: { detectedFieldId: field.id } } });
        await prisma.fieldValue.deleteMany({ where: { detectedFieldId: field.id } });
      }
      await prisma.detectedField.deleteMany({ where: { formTaskId: task.id } });
    }
    await prisma.formTask.deleteMany({ where: { userId: id } });
    await prisma.conversation.deleteMany({ where: { userId: id } });
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
  }
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("form tasks keep independent lifecycle, values, missing information, and approval", async () => {
  const auth = { authorization: `Bearer ${accessToken}` };
  const conversation = await prisma.conversation.create({
    data: { userId, title: "Task conversation" },
  });
  const taskResponse = await request("/api/v1/form-tasks", {
    method: "POST",
    headers: auth,
    body: {
      conversationId: conversation.id,
      title: "College application",
      webpageUrl: "https://example.test/application",
    },
  });
  assert.equal(taskResponse.status, 201);
  const task = (await taskResponse.json()).data.task;
  assert.equal(task.status, "CREATED");

  const secondResponse = await request("/api/v1/form-tasks", {
    method: "POST",
    headers: auth,
    body: {
      conversationId: conversation.id,
      title: "Scholarship application",
      webpageUrl: "https://example.test/scholarship",
    },
  });
  assert.equal(secondResponse.status, 201);
  const secondTask = (await secondResponse.json()).data.task;
  assert.notEqual(task.id, secondTask.id);

  const fieldsResponse = await request(`/api/v1/form-tasks/${task.id}/fields`, {
    method: "POST",
    headers: auth,
    body: {
      fields: [
        { fieldIdentifier: "full-name", label: "Full Name", elementType: "input", inputType: "text", isRequired: true },
        { fieldIdentifier: "email", label: "Email", elementType: "input", inputType: "email", isRequired: true },
      ],
    },
  });
  assert.equal(fieldsResponse.status, 201);
  const fields = (await fieldsResponse.json()).data.fields;
  assert.equal(fields.length, 2);

  const missing = await request(`/api/v1/form-tasks/${task.id}/missing-information`, { headers: auth });
  assert.equal((await missing.json()).data.missingRequiredFields.length, 2);

  const value = await request(`/api/v1/form-tasks/${task.id}/fields/${fields[0].id}/value`, {
    method: "PUT",
    headers: auth,
    body: { value: "Adarsh", source: "USER_PROVIDED" },
  });
  assert.equal(value.status, 201);
  const approved = await request(`/api/v1/form-tasks/${task.id}/fields/${fields[0].id}/approve`, { method: "POST", headers: auth });
  assert.equal(approved.status, 200);

  const beforeApproval = await request(`/api/v1/form-tasks/${task.id}/final-approval`, {
    method: "POST",
    headers: auth,
    body: { expectedVersion: 1 },
  });
  assert.equal(beforeApproval.status, 409);

  const taskDetails = (await (await request(`/api/v1/form-tasks/${task.id}`, { headers: auth })).json()).data;
  assert.equal(taskDetails.fields.length, 2);
  assert.equal(taskDetails.missingInformation.missingRequiredFields.length, 1);
  const emailValue = await request(`/api/v1/form-tasks/${task.id}/fields/${fields[1].id}/value`, {
    method: "PUT",
    headers: auth,
    body: { value: "user@example.com", source: "USER_PROVIDED" },
  });
  assert.equal(emailValue.status, 201);
  await request(`/api/v1/form-tasks/${task.id}/fields/${fields[1].id}/approve`, { method: "POST", headers: auth });

  const current = (await (await request(`/api/v1/form-tasks/${task.id}`, { headers: auth })).json()).data.task;
  const finalApproval = await request(`/api/v1/form-tasks/${task.id}/final-approval`, {
    method: "POST",
    headers: auth,
    body: { expectedVersion: current.version },
  });
  assert.equal(finalApproval.status, 200);
  const approvedTask = await request(`/api/v1/form-tasks/${task.id}/pause`, { method: "POST", headers: auth, body: {} });
  assert.equal(approvedTask.status, 200);
  const resumed = await request(`/api/v1/form-tasks/${task.id}/resume`, { method: "POST", headers: auth, body: {} });
  assert.equal(resumed.status, 200);

  const history = await request(`/api/v1/form-tasks/${task.id}/history`, { headers: auth });
  assert.ok((await history.json()).data.events.length >= 5);

  const otherSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const other = await register(`other-task-${otherSuffix}@example.test`, "Other Task Password");
  otherUserId = other.id;
  const otherToken = await login(other.email, "Other Task Password");
  assert.equal((await request(`/api/v1/form-tasks/${task.id}`, { headers: { authorization: `Bearer ${otherToken}` } })).status, 404);
  assert.equal((await request(`/api/v1/form-tasks/${secondTask.id}/fields`, { headers: auth })).status, 200);
});
