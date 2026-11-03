require("dotenv/config");

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { app } = require("../../dist/server");
const { prisma } = require("../../dist/config/database");

let server;
let baseUrl;
let userId;
let token;
let taskId;
let fieldId;
let otherUserId;
let otherToken;
let otherTaskId;

function request(path, options = {}) {
  const { body, headers, ...rest } = options;
  return fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registered = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Mapping Integration User", email: `mapping-${suffix}@example.test`, password: "Mapping Integration Password" },
  });
  userId = (await registered.json()).data.user.id;
  const loggedIn = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: `mapping-${suffix}@example.test`, password: "Mapping Integration Password" },
  });
  token = (await loggedIn.json()).data.accessToken;
  const otherSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const otherRegistered = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Other Mapping User", email: `other-mapping-${otherSuffix}@example.test`, password: "Other Mapping Password" },
  });
  otherUserId = (await otherRegistered.json()).data.user.id;
  const otherLoggedIn = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: `other-mapping-${otherSuffix}@example.test`, password: "Other Mapping Password" },
  });
  otherToken = (await otherLoggedIn.json()).data.accessToken;
  const conversation = await prisma.conversation.create({ data: { userId, title: "Mapping integration" } });
  const taskResponse = await request("/api/v1/form-tasks", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: { conversationId: conversation.id, webpageUrl: "https://example.test/form" },
  });
  const task = (await taskResponse.json()).data.task;
  taskId = task.id;
  const fieldsResponse = await request(`/api/v1/form-tasks/${taskId}/fields`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: { fields: [{ fieldIdentifier: "email", label: "Email", elementType: "input", inputType: "email", isRequired: true }] },
  });
  fieldId = (await fieldsResponse.json()).data.fields[0].id;
  const otherConversation = await prisma.conversation.create({ data: { userId: otherUserId, title: "Other mapping" } });
  const otherTask = await prisma.formTask.create({
    data: {
      userId: otherUserId, conversationId: otherConversation.id, title: "Other task",
      taskType: "APPLICATION", webpageUrl: "https://example.test/other", status: "FIELDS_DETECTED",
    },
  });
  otherTaskId = otherTask.id;
  await prisma.profileMemory.create({
    data: {
      userId, category: "CONTACT", key: "email", value: "mapping@example.test",
      dataType: "STRING", status: "APPROVED", isApproved: true, approvedAt: new Date(),
    },
  });
});

test.after(async () => {
  const tasks = await prisma.formTask.findMany({ where: { userId: { in: [userId, otherUserId] } }, select: { id: true } });
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
  for (const id of [userId, otherUserId]) {
    await prisma.approval.deleteMany({ where: { userId: id } });
    await prisma.formTask.deleteMany({ where: { userId: id } });
    await prisma.profileMemory.deleteMany({ where: { userId: id } });
    await prisma.conversation.deleteMany({ where: { userId: id } });
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
  }
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("intelligent mapping endpoint enforces auth and persists trusted values", async () => {
  assert.equal((await request(`/api/v1/form-tasks/${taskId}/intelligent-mapping`, { method: "POST", body: {} })).status, 401);
  assert.equal((await request(`/api/v1/form-tasks/${taskId}/intelligent-mapping`, { method: "POST", headers: { authorization: "Bearer invalid" }, body: {} })).status, 401);

  const first = await request(`/api/v1/form-tasks/${taskId}/intelligent-mapping`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: {},
  });
  assert.equal(first.status, 200);
  const firstData = (await first.json()).data;
  assert.equal(firstData.results[0].status, "proposed");
  assert.equal(firstData.results[0].source, "approved_profile");

  const values = await prisma.fieldValue.findMany({ where: { detectedFieldId: fieldId } });
  assert.equal(values.length, 1);
  assert.equal(values[0].status, "PENDING_APPROVAL");

  const repeated = await request(`/api/v1/form-tasks/${taskId}/intelligent-mapping`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: {},
  });
  assert.equal(repeated.status, 200);
  assert.equal((await prisma.fieldValue.count({ where: { detectedFieldId: fieldId } })), 1);

  const approval = await request(`/api/v1/form-tasks/${taskId}/fields/${fieldId}/approve`, {
    method: "POST", headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(approval.status, 200);
  const reviewTask = await prisma.formTask.findUnique({ where: { id: taskId }, select: { version: true } });
  const finalApproval = await request(`/api/v1/form-tasks/${taskId}/final-approval`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: { expectedVersion: reviewTask.version },
  });
  assert.equal(finalApproval.status, 200);
  const stableApproval = await prisma.approval.findFirst({ where: { formTaskId: taskId, approvalType: "FORM_FILL" }, orderBy: { createdAt: "desc" } });
  const approvedMapping = await request(`/api/v1/form-tasks/${taskId}/intelligent-mapping`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: {},
  });
  assert.equal(approvedMapping.status, 200);
  const unchangedApproval = await prisma.approval.findUnique({ where: { id: stableApproval.id } });
  assert.equal(unchangedApproval.status, "APPROVED");
  assert.equal(unchangedApproval.invalidatedAt, null);
});

test("stale mapping versions fail without additional persistence", async () => {
  const task = await prisma.formTask.findUnique({ where: { id: taskId }, select: { version: true } });
  const response = await request(`/api/v1/form-tasks/${taskId}/intelligent-mapping`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: { expectedVersion: task.version - 1 },
  });
  assert.equal(response.status, 409);
  assert.equal((await prisma.fieldValue.count({ where: { detectedFieldId: fieldId } })), 1);
});

test("concurrent mapping requests have one winner and no duplicate values", async () => {
  const conversation = await prisma.conversation.create({ data: { userId, title: "Concurrent mapping" } });
  const task = await prisma.formTask.create({
    data: { userId, conversationId: conversation.id, title: "Concurrent task", taskType: "APPLICATION", webpageUrl: "https://example.test/concurrent", status: "FIELDS_DETECTED" },
  });
  const field = await prisma.detectedField.create({
    data: { formTaskId: task.id, fieldIdentifier: "email", label: "Email", elementType: "input", inputType: "email", isRequired: true },
  });
  const headers = { authorization: `Bearer ${token}` };
  const [left, right] = await Promise.all([
    request(`/api/v1/form-tasks/${task.id}/intelligent-mapping`, { method: "POST", headers, body: { expectedVersion: task.version } }),
    request(`/api/v1/form-tasks/${task.id}/intelligent-mapping`, { method: "POST", headers, body: { expectedVersion: task.version } }),
  ]);
  const statuses = [left.status, right.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(await prisma.fieldValue.count({ where: { detectedFieldId: field.id } }), 1);
  assert.equal(await prisma.fieldMapping.count({ where: { formTaskId: task.id } }), 1);
  assert.equal((await prisma.formTask.findUnique({ where: { id: task.id }, select: { version: true } })).version, task.version + 1);
});

test("mapping and cancellation race preserves an atomic final state", async () => {
  const conversation = await prisma.conversation.create({ data: { userId, title: "Cancellation race" } });
  const task = await prisma.formTask.create({
    data: { userId, conversationId: conversation.id, title: "Cancellation task", taskType: "APPLICATION", webpageUrl: "https://example.test/cancel", status: "FIELDS_DETECTED" },
  });
  const field = await prisma.detectedField.create({
    data: { formTaskId: task.id, fieldIdentifier: "email", label: "Email", elementType: "input", inputType: "email", isRequired: true },
  });
  const headers = { authorization: `Bearer ${token}` };
  const [mapping, cancellation] = await Promise.all([
    request(`/api/v1/form-tasks/${task.id}/intelligent-mapping`, { method: "POST", headers, body: {} }),
    request(`/api/v1/form-tasks/${task.id}/cancel`, { method: "POST", headers, body: { expectedVersion: task.version } }),
  ]);
  assert.ok([200, 409].includes(mapping.status));
  assert.ok([200, 409].includes(cancellation.status));
  const finalTask = await prisma.formTask.findUnique({ where: { id: task.id }, select: { status: true, version: true } });
  assert.ok(["MAPPING_IN_PROGRESS", "CANCELLED"].includes(finalTask.status));
  if (finalTask.status === "CANCELLED") {
    assert.ok(await prisma.fieldValue.count({ where: { detectedFieldId: field.id } }) <= 1);
  }
});

test("cross-user task access is rejected through the authenticated endpoint", async () => {
  const response = await request(`/api/v1/form-tasks/${otherTaskId}/intelligent-mapping`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: {},
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "FORM_TASK_NOT_FOUND");
  const otherResponse = await request(`/api/v1/form-tasks/${taskId}/intelligent-mapping`, {
    method: "POST",
    headers: { authorization: `Bearer ${otherToken}` },
    body: {},
  });
  assert.equal(otherResponse.status, 404);
});

test("message corrections preserve revisions and current provenance", async () => {
  const conversation = await prisma.conversation.create({ data: { userId, title: "Correction mapping" } });
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, role: "USER", content: "my name is Old Name", inputMode: "TEXT" },
  });
  const firstCorrection = await request(`/api/v1/conversations/${conversation.id}/messages/${message.id}`, {
    method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: { content: "my name is New Name" },
  });
  assert.equal(firstCorrection.status, 200);
  const secondCorrection = await request(`/api/v1/conversations/${conversation.id}/messages/${message.id}`, {
    method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: { content: "my name is Final Name" },
  });
  assert.equal(secondCorrection.status, 200);
  assert.equal(await prisma.messageRevision.count({ where: { messageId: message.id } }), 2);
  const revisions = await prisma.messageRevision.findMany({ where: { messageId: message.id }, orderBy: { revisionNumber: "asc" } });
  assert.deepEqual(revisions.map((revision) => revision.previousContent), ["my name is Old Name", "my name is New Name"]);
});

test("corrected conversational answer maps the active message provenance", async () => {
  const conversation = await prisma.conversation.create({ data: { userId, title: "Qualification correction" } });
  const message = await prisma.message.create({
    data: { conversationId: conversation.id, role: "USER", content: "qualification is Bachelor's degree", inputMode: "TEXT" },
  });
  await request(`/api/v1/conversations/${conversation.id}/messages/${message.id}`, {
    method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: { content: "qualification is Master's degree" },
  });
  await request(`/api/v1/conversations/${conversation.id}/messages/${message.id}`, {
    method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: { content: "qualification is Ph.D." },
  });
  const task = await prisma.formTask.create({
    data: { userId, conversationId: conversation.id, title: "Qualification task", taskType: "APPLICATION", webpageUrl: "https://example.test/qualification", status: "FIELDS_DETECTED" },
  });
  const field = await prisma.detectedField.create({
    data: { formTaskId: task.id, fieldIdentifier: "qualification", label: "Highest Qualification", elementType: "input", inputType: "text", isRequired: true },
  });
  const response = await request(`/api/v1/form-tasks/${task.id}/intelligent-mapping`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: {},
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).data.results[0];
  assert.equal(result.status, "proposed");
  assert.ok(result.proposedValue.toLowerCase().startsWith("ph"));
  assert.equal(result.sourceReference.messageId, message.id);
  const value = await prisma.fieldValue.findFirst({ where: { detectedFieldId: field.id } });
  assert.equal(value.sourceReferenceId, message.id);
  assert.equal(value.status, "PENDING_APPROVAL");
  assert.equal(await prisma.messageRevision.count({ where: { messageId: message.id } }), 2);
});

test("independent qualification answers remain an explicit conflict", async () => {
  const conversation = await prisma.conversation.create({ data: { userId, title: "Qualification conflict" } });
  await prisma.message.createMany({
    data: [
      { conversationId: conversation.id, role: "USER", content: "qualification is Bachelor's degree", inputMode: "TEXT" },
      { conversationId: conversation.id, role: "USER", content: "qualification is Master's degree", inputMode: "TEXT" },
      { conversationId: conversation.id, role: "USER", content: "Thanks for your help", inputMode: "TEXT" },
    ],
  });
  const task = await prisma.formTask.create({
    data: { userId, conversationId: conversation.id, title: "Conflict task", taskType: "APPLICATION", webpageUrl: "https://example.test/conflict", status: "FIELDS_DETECTED" },
  });
  const field = await prisma.detectedField.create({
    data: { formTaskId: task.id, fieldIdentifier: "qualification", label: "Highest Qualification", elementType: "input", inputType: "text", isRequired: true },
  });
  const response = await request(`/api/v1/form-tasks/${task.id}/intelligent-mapping`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: {},
  });
  assert.equal(response.status, 200);
  const result = (await response.json()).data.results[0];
  assert.equal(result.status, "conflict");
  assert.equal(result.confidence, 0);
  assert.equal(await prisma.fieldValue.count({ where: { detectedFieldId: field.id } }), 0);
});

test("controlled concurrent persistence rejects the stale different-value operation", async () => {
  const conversation = await prisma.conversation.create({ data: { userId, title: "Persistence race" } });
  const task = await prisma.formTask.create({
    data: { userId, conversationId: conversation.id, title: "Persistence race", taskType: "APPLICATION", webpageUrl: "https://example.test/race", status: "FIELDS_DETECTED" },
  });
  const field = await prisma.detectedField.create({
    data: { formTaskId: task.id, fieldIdentifier: "email", label: "Email", elementType: "input", inputType: "email", isRequired: true },
  });
  const { persistIntelligentMappings } = require("../../dist/modules/form-tasks/form-task.service");
  const barrier = (() => {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    return { wait: () => promise, release };
  })();
  const expectedVersion = task.version;
  const plan = (value) => ({
    detectedFieldId: field.id, value, source: "CONVERSATION",
    sourceReferenceId: null, confidence: 0.9,
  });
  const run = async (value) => {
    await barrier.wait();
    return persistIntelligentMappings(userId, task.id, expectedVersion, [plan(value)]);
  };
  const first = run("first@example.test");
  const second = run("second@example.test");
  barrier.release();
  const results = await Promise.allSettled([first, second]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const values = await prisma.fieldValue.findMany({ where: { detectedFieldId: field.id } });
  assert.equal(values.length, 1);
  assert.ok(["first@example.test", "second@example.test"].includes(values[0].value));
});

test("mapping versus user correction preserves correction provenance", async () => {
  const conversation = await prisma.conversation.create({ data: { userId, title: "Correction race" } });
  const task = await prisma.formTask.create({
    data: { userId, conversationId: conversation.id, title: "Correction race", taskType: "APPLICATION", webpageUrl: "https://example.test/correction-race", status: "FIELDS_DETECTED" },
  });
  const field = await prisma.detectedField.create({
    data: { formTaskId: task.id, fieldIdentifier: "email", label: "Email", elementType: "input", inputType: "email", isRequired: true },
  });
  const taskVersion = task.version;
  const mapping = request(`/api/v1/form-tasks/${task.id}/intelligent-mapping`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: { expectedVersion: taskVersion },
  });
  const correction = request(`/api/v1/form-tasks/${task.id}/fields/${field.id}/correct`, {
    method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: { value: "corrected@example.test", source: "USER_CORRECTED" },
  });
  const [mappingResponse, correctionResponse] = await Promise.all([mapping, correction]);
  assert.ok([200, 409].includes(mappingResponse.status));
  assert.equal(correctionResponse.status, 201);
  const value = await prisma.fieldValue.findFirst({ where: { detectedFieldId: field.id }, orderBy: { createdAt: "desc" } });
  assert.equal(value.value, "corrected@example.test");
  assert.equal(value.source, "USER_CORRECTED");
});

test("material correction invalidates final approval", async () => {
  const currentApproval = await prisma.approval.findFirst({ where: { formTaskId: taskId, approvalType: "FORM_FILL" }, orderBy: { createdAt: "desc" } });
  assert.equal(currentApproval.status, "APPROVED");
  const correction = await request(`/api/v1/form-tasks/${taskId}/fields/${fieldId}/correct`, {
    method: "PATCH", headers: { authorization: `Bearer ${token}` }, body: { value: "material-change@example.test", source: "USER_CORRECTED" },
  });
  assert.equal(correction.status, 201);
  const invalidated = await prisma.approval.findUnique({ where: { id: currentApproval.id } });
  assert.equal(invalidated.status, "REVOKED");
  assert.ok(invalidated.invalidatedAt);
});
