require("../support/environment");
require("dotenv/config");

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const { app } = require("../../dist/server");
const { prisma } = require("../../dist/config/database");
const browserService = require("../../dist/modules/browser/browser.service");
const { registrationSchema, approvalSnapshotSchema, BROWSER_PROTOCOL_VERSION } = require("../../dist/modules/browser/browser.protocol");

let server;
let baseUrl;
let token;
let otherToken;
let otherUserId;
let userId;
let task;
let otherTask;
let otherConversation;
let otherPageSession;
let field;
let pageSession;
let execution;

function request(path, options = {}) {
  const { body, headers, ...rest } = options;
  return fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function auth() {
  return { authorization: `Bearer ${token}` };
}
function otherAuth() {
  return { authorization: `Bearer ${otherToken}` };
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registered = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Browser Protocol User", email: `browser-${suffix}@example.test`, password: "Browser Protocol Password" },
  });
  const user = (await registered.json()).data.user;
  userId = user.id;
  const login = await request("/api/v1/auth/login", {
    method: "POST",
    body: { email: user.email, password: "Browser Protocol Password" },
  });
  token = (await login.json()).data.accessToken;
  const otherRegistered = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Other Browser User", email: `other-browser-${suffix}@example.test`, password: "Other Browser Password" },
  });
  const otherUser = (await otherRegistered.json()).data.user;
  otherUserId = otherUser.id;
  const otherLogin = await request("/api/v1/auth/login", { method: "POST", body: { email: otherUser.email, password: "Other Browser Password" } });
  otherToken = (await otherLogin.json()).data.accessToken;
  const conversation = await prisma.conversation.create({ data: { userId, title: "Browser protocol conversation" } });
  task = await prisma.formTask.create({
    data: {
      userId, conversationId: conversation.id, title: "Browser task", taskType: "APPLICATION",
      webpageUrl: "https://example.test/application", domain: "example.test", status: "REVIEW", version: 2,
    },
  });
  otherConversation = await prisma.conversation.create({ data: { userId: otherUserId, title: "Other browser conversation" } });
  otherTask = await prisma.formTask.create({
    data: { userId: otherUserId, conversationId: otherConversation.id, title: "Other browser task", taskType: "APPLICATION", webpageUrl: "https://example.test/other", domain: "example.test", status: "REVIEW" },
  });
  otherPageSession = await prisma.browserPageSession.create({
    data: { userId: otherUserId, formTaskId: otherTask.id, protocolVersion: "bhasha.browser.v1", pageUrl: "https://example.test/other", origin: "https://example.test", hostname: "example.test", detectedAt: new Date(), idempotencyKey: "other-page-session" },
  });
  field = await prisma.detectedField.create({
    data: { formTaskId: task.id, fieldIdentifier: "full-name", label: "Full Name", elementType: "input", inputType: "text", fieldMetadata: { fingerprint: "field-fp" } },
  });
  await prisma.fieldValue.create({
    data: { detectedFieldId: field.id, value: "Approved User", source: "USER_PROVIDED", status: "APPROVED", confidence: 1, approvedAt: new Date() },
  });
});

test.after(async () => {
  await prisma.browserActionResult.deleteMany({ where: { execution: { userId } } });
  await prisma.browserExecution.deleteMany({ where: { userId } });
  await prisma.browserPageSession.deleteMany({ where: { userId } });
  await prisma.approval.deleteMany({ where: { userId } });
  await prisma.fieldValue.deleteMany({ where: { detectedField: { formTaskId: task.id } } });
  await prisma.detectedField.deleteMany({ where: { formTaskId: task.id } });
  await prisma.formTask.deleteMany({ where: { userId } });
  await prisma.conversation.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.auditLog.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  await prisma.refreshToken.deleteMany({ where: { userId: otherUserId } });
  await prisma.browserPageSession.deleteMany({ where: { userId: otherUserId } });
  await prisma.formTask.deleteMany({ where: { userId: otherUserId } });
  await prisma.conversation.deleteMany({ where: { userId: otherUserId } });
  await prisma.user.delete({ where: { id: otherUserId } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("protocol schemas reject invalid versions, URLs, and actions", () => {
  const valid = {
    protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER",
    taskId: randomUUID(), timestamp: new Date().toISOString(), idempotencyKey: "schema-key-1",
    payload: { pageContext: { url: "https://example.test", detectedAt: new Date().toISOString() }, fields: [] },
  };
  assert.equal(registrationSchema.safeParse(valid).success, false);
  assert.equal(registrationSchema.safeParse({ ...valid, protocolVersion: "bhasha.browser.v2" }).success, false);
  assert.equal(registrationSchema.safeParse({ ...valid, payload: { ...valid.payload, pageContext: { url: "javascript:alert(1)", detectedAt: valid.timestamp }, fields: [{}] } }).success, false);
});

test("registers page fields idempotently and rejects unsupported schemes", async () => {
  const body = {
    protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER", taskId: task.id,
    timestamp: new Date().toISOString(), idempotencyKey: "registration-key-1",
    payload: {
      pageContext: { url: "https://example.test/application", title: "Application", detectedAt: new Date().toISOString(), fingerprint: "page-fp" },
      fields: [{ fieldIdentifier: "full-name", label: "Full Name", elementType: "input", inputType: "text", fingerprint: "field-fp" }],
    },
  };
  const first = await request("/api/v1/browser/register", { method: "POST", headers: auth(), body });
  assert.equal(first.status, 201);
  pageSession = (await first.json()).data.pageSession;
  const repeated = await request("/api/v1/browser/register", { method: "POST", headers: auth(), body: { ...body, messageId: randomUUID() } });
  assert.equal(repeated.status, 201);
  assert.equal((await repeated.json()).data.pageSession.id, pageSession.id);
  const changedTimestamp = await request("/api/v1/browser/register", { method: "POST", headers: auth(), body: { ...body, messageId: randomUUID(), payload: { ...body.payload, pageContext: { ...body.payload.pageContext, detectedAt: new Date(Date.parse(body.payload.pageContext.detectedAt) + 1000).toISOString() } } } });
  assert.equal(changedTimestamp.status, 409);
  const concurrentRegistration = await Promise.all([
    request("/api/v1/browser/register", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "registration-concurrent", messageId: randomUUID() } }),
    request("/api/v1/browser/register", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "registration-concurrent", messageId: randomUUID() } }),
  ]);
  assert.deepEqual((await concurrentRegistration[0].json()).data.pageSession.id, (await concurrentRegistration[1].json()).data.pageSession.id);
  const beforeFailedRegistration = await prisma.browserPageSession.count({ where: { userId } });
  await assert.rejects(() => browserService.registerPage(userId, task.id, { url: "https://example.test/application", detectedAt: new Date() }, [{ fieldIdentifier: "rollback-field", label: "x".repeat(501), elementType: "input", inputType: "text" }], "registration-rollback"));
  assert.equal(await prisma.browserPageSession.count({ where: { userId } }), beforeFailedRegistration);
  const mappings = await request(`/api/v1/browser/tasks/${task.id}/mappings`, { headers: auth() });
  assert.equal(mappings.status, 200);
  task = await prisma.formTask.update({ where: { id: task.id }, data: { status: "APPROVED_FOR_FILLING" } });
  const approvedField = await prisma.detectedField.findUnique({ where: { id: field.id }, include: { fieldValues: { orderBy: { createdAt: "desc" }, take: 1 } } });
  await prisma.approval.create({
    data: { userId, formTaskId: task.id, approvalType: "FORM_FILL", status: "APPROVED", taskVersion: task.version - 1, approvedAt: new Date(), approvedSnapshot: { taskId: task.id, version: task.version - 1, webpageUrl: task.webpageUrl, webpageTitle: task.webpageTitle, fields: [approvedField] } },
  });
  const bad = await request("/api/v1/browser/register", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "registration-key-2", payload: { ...body.payload, pageContext: { ...body.payload.pageContext, url: "file:///tmp/form" } } } });
  assert.equal(bad.status, 400);
});

test("approval snapshot schema rejects malformed and ambiguous persisted snapshots", async () => {
  const approval = await prisma.approval.findFirst({ where: { userId, formTaskId: task.id, approvalType: "FORM_FILL" }, orderBy: { createdAt: "desc" } });
  assert.ok(approval);
  const validSnapshot = approvalSnapshotSchema.parse(approval.approvedSnapshot);
  const approvedField = validSnapshot.fields[0];
  const cases = [
    ["removed field", { ...validSnapshot, fields: [] }],
    ["changed field type", { ...validSnapshot, fields: [{ ...approvedField, inputType: "email" }] }],
    ["changed options", { ...validSnapshot, fields: [{ ...approvedField, options: [{ value: "a", label: "A" }] }] }],
    ["changed value", { ...validSnapshot, fields: [{ ...approvedField, fieldValues: [{ ...approvedField.fieldValues[0], value: "changed" }] }] }],
    ["changed provenance", { ...validSnapshot, fields: [{ ...approvedField, fieldValues: [{ ...approvedField.fieldValues[0], source: "CONVERSATION" }] }] }],
    ["pending value", { ...validSnapshot, fields: [{ ...approvedField, fieldValues: [{ ...approvedField.fieldValues[0], status: "PENDING_APPROVAL" }] }] }],
    ["rejected value", { ...validSnapshot, fields: [{ ...approvedField, fieldValues: [{ ...approvedField.fieldValues[0], status: "REJECTED" }] }] }],
    ["foreign field", { ...validSnapshot, fields: [{ ...approvedField, id: randomUUID() }] }],
    ["duplicate option id", { ...validSnapshot, fields: [{ ...approvedField, options: [{ value: "a", label: "A" }, { value: "a", label: "Again" }] }] }],
    ["missing property", { ...validSnapshot, fields: [{ ...approvedField, label: undefined }] }],
    ["null property", { ...validSnapshot, fields: [{ ...approvedField, label: null }] }],
    ["number/string value", { ...validSnapshot, fields: [{ ...approvedField, fieldValues: [{ ...approvedField.fieldValues[0], value: 42 }] }] }],
    ["boolean/string value", { ...validSnapshot, fields: [{ ...approvedField, fieldValues: [{ ...approvedField.fieldValues[0], value: true }] }] }],
    ["unicode whitespace", { ...validSnapshot, fields: [{ ...approvedField, label: `${approvedField.label}\u00a0` }] }],
    ["malformed snapshot", { ...validSnapshot, fields: "not-an-array" }],
    ["unexpected property", { ...validSnapshot, unexpected: true }],
  ];
  for (const [name, candidate] of cases) {
    const parsed = approvalSnapshotSchema.safeParse(candidate);
    if (name === "duplicate option id" || name === "missing property" || name === "null property" || name === "malformed snapshot" || name === "unexpected property") {
      assert.equal(parsed.success, false, name);
    } else {
      assert.equal(parsed.success, true, name);
    }
  }
  const before = await prisma.browserExecution.count({ where: { userId, formTaskId: task.id } });
  for (const [name, candidate] of cases) {
    await prisma.approval.update({ where: { id: approval.id }, data: { approvedSnapshot: candidate } });
    const response = await request("/api/v1/browser/instructions", {
      method: "POST",
      headers: auth(),
      body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `invalid-snapshot-${name.replaceAll(" ", "-")}`, pageSessionId: pageSession.id },
    });
    assert.equal(response.status, 409, name);
    assert.equal(await prisma.browserExecution.count({ where: { userId, formTaskId: task.id } }), before, name);
  }
  await prisma.approval.update({ where: { id: approval.id }, data: { approvedSnapshot: validSnapshot } });
});

test("issues approved instructions idempotently and validates acknowledgements", async () => {
  const body = { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: "execution-key-1", pageSessionId: pageSession.id };
  const wrongPage = await request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "wrong-page", pageSessionId: otherPageSession.id } });
  assert.equal(wrongPage.status, 404);
  const first = await request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body });
  assert.equal(first.status, 201);
  execution = (await first.json()).data.execution;
  const repeated = await request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, messageId: randomUUID() } });
  assert.equal((await repeated.json()).data.execution.id, execution.id);
  const reusedForOtherPage = await request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, pageSessionId: otherPageSession.id, idempotencyKey: body.idempotencyKey, messageId: randomUUID() } });
  assert.equal(reusedForOtherPage.status, 404);
  const concurrentExecution = await Promise.all([
    request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "execution-concurrent", messageId: randomUUID() } }),
    request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "execution-concurrent", messageId: randomUUID() } }),
  ]);
  assert.deepEqual((await concurrentExecution[0].json()).data.execution.id, (await concurrentExecution[1].json()).data.execution.id);
  const crossUser = await request(`/api/v1/browser/executions/${execution.id}`, { headers: { authorization: `Bearer ${otherToken}` } });
  assert.equal(crossUser.status, 404);
  const crossTaskAck = await request(`/api/v1/browser/executions/${execution.id}/acknowledge`, { method: "POST", headers: auth(), body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: otherTask.id, timestamp: new Date().toISOString(), idempotencyKey: "cross-task-ack", executionId: execution.id, actionId: execution.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [] } });
  assert.equal(crossTaskAck.status, 400);
  const approval = await prisma.approval.findFirst({ where: { formTaskId: task.id, approvalType: "FORM_FILL" } });
  const approvedField = await prisma.detectedField.findUnique({ where: { id: field.id }, include: { fieldValues: true } });
  await prisma.approval.update({ where: { id: approval.id }, data: { status: "REVOKED", invalidatedAt: new Date(), revokedAt: new Date() } });
  const revoked = await request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "execution-revoked", messageId: randomUUID() } });
  assert.equal(revoked.status, 409);
  await prisma.approval.update({ where: { id: approval.id }, data: { status: "APPROVED", invalidatedAt: null, revokedAt: null } });
  const value = await prisma.fieldValue.findFirst({ where: { detectedFieldId: field.id }, orderBy: { createdAt: "desc" } });
  await prisma.fieldValue.update({ where: { id: value.id }, data: { value: "Tampered after approval" } });
  const tampered = await request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "execution-tampered", messageId: randomUUID() } });
  assert.equal(tampered.status, 409);
  await prisma.fieldValue.update({ where: { id: value.id }, data: { value: "Approved User" } });
  await prisma.approval.update({ where: { id: approval.id }, data: { approvedSnapshot: { taskId: task.id, version: task.version - 1, webpageUrl: task.webpageUrl, webpageTitle: task.webpageTitle, fields: [approvedField, { ...approvedField, id: randomUUID() }] } } });
  const extraSnapshotField = await request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: "execution-extra-snapshot-field", messageId: randomUUID() } });
  assert.equal(extraSnapshotField.status, 409);
  await prisma.approval.update({ where: { id: approval.id }, data: { approvedSnapshot: { taskId: task.id, version: task.version - 1, webpageUrl: task.webpageUrl, webpageTitle: task.webpageTitle, fields: [approvedField] } } });
  const concurrentBodies = [
    { ...body, idempotencyKey: "execution-key-concurrent", messageId: randomUUID() },
    { ...body, idempotencyKey: "execution-key-concurrent", messageId: randomUUID() },
  ];
  const concurrent = await Promise.all(concurrentBodies.map((requestBody) => request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: requestBody })));
  assert.deepEqual((await concurrent[0].json()).data.execution.id, (await concurrent[1].json()).data.execution.id);
  const action = execution.instruction.actions[0];
  const forged = await request(`/api/v1/browser/executions/${execution.id}/acknowledge`, {
    method: "POST", headers: auth(),
    body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: "ack-key-1", executionId: execution.id, actionId: execution.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [{ fieldId: field.id, actionId: randomUUID(), actionType: "SET_VALUE", status: "SUCCESS" }] },
  });
  assert.equal(forged.status, 400);
  const ackBody = { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: "ack-key-2", executionId: execution.id, actionId: execution.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [{ fieldId: field.id, actionId: action.actionId, actionType: action.action, status: "SUCCESS" }] };
  const acknowledged = await request(`/api/v1/browser/executions/${execution.id}/acknowledge`, { method: "POST", headers: auth(), body: ackBody });
  assert.equal(acknowledged.status, 200);
  const duplicate = await request(`/api/v1/browser/executions/${execution.id}/acknowledge`, { method: "POST", headers: auth(), body: { ...ackBody, messageId: randomUUID(), idempotencyKey: "ack-key-3" } });
  assert.equal(duplicate.status, 409);
});

test("retries failed actions only and prevents cancellation races", async () => {
  const instructionResponse = await request("/api/v1/browser/instructions", {
    method: "POST", headers: auth(),
    body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: "execution-key-retry", pageSessionId: pageSession.id },
  });
  assert.equal(instructionResponse.status, 201);
  const issued = (await instructionResponse.json()).data.execution;
  const action = issued.instruction.actions[0];
  const failed = await request(`/api/v1/browser/executions/${issued.id}/acknowledge`, {
    method: "POST", headers: auth(),
    body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: "ack-retry-1", executionId: issued.id, actionId: issued.instruction.actionId, pageSessionId: pageSession.id, status: "FAILED", results: [{ fieldId: field.id, actionId: action.actionId, actionType: action.action, status: "FAILED", errorCode: "FIELD_NOT_FOUND" }] },
  });
  assert.equal(failed.status, 200);
  const retryResponse = await request(`/api/v1/browser/executions/${issued.id}/retry`, { method: "POST", headers: auth(), body: { taskId: task.id, idempotencyKey: "retry-key-1", pageSessionId: pageSession.id } });
  assert.equal(retryResponse.status, 200);
  const retried = (await retryResponse.json()).data.execution;
  const repeatedRetry = await request(`/api/v1/browser/executions/${issued.id}/retry`, { method: "POST", headers: auth(), body: { taskId: task.id, idempotencyKey: "retry-key-1", pageSessionId: pageSession.id } });
  assert.equal(repeatedRetry.status, 200);
  assert.equal((await repeatedRetry.json()).data.execution.id, retried.id);
  const conflictingRetry = await request(`/api/v1/browser/executions/${issued.id}/retry`, { method: "POST", headers: auth(), body: { taskId: task.id, idempotencyKey: "retry-key-1", pageSessionId: pageSession.id, actionIds: [randomUUID()] } });
  assert.equal(conflictingRetry.status, 409);
  assert.equal(retried.instruction.actions.length, 1);
  assert.notEqual(retried.instruction.actionId, issued.instruction.actionId);
  const wrongRetry = await request(`/api/v1/browser/executions/${issued.id}/retry`, { method: "POST", headers: auth(), body: { taskId: otherTask.id, idempotencyKey: "wrong-task-retry", pageSessionId: pageSession.id } });
  assert.equal(wrongRetry.status, 404);
  const wrongCancel = await request(`/api/v1/browser/executions/${issued.id}/cancel`, { method: "POST", headers: auth(), body: { taskId: otherTask.id, idempotencyKey: "wrong-task-cancel" } });
  assert.equal(wrongCancel.status, 404);
  const concurrentAckBody = {
    protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id,
    timestamp: new Date().toISOString(), idempotencyKey: "ack-concurrent", executionId: retried.id,
    actionId: retried.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED",
    results: [{ fieldId: field.id, actionId: retried.instruction.actions[0].actionId, actionType: retried.instruction.actions[0].action, status: "SUCCESS" }],
  };
  const concurrentAcks = await Promise.all([
    request(`/api/v1/browser/executions/${retried.id}/acknowledge`, { method: "POST", headers: auth(), body: concurrentAckBody }),
    request(`/api/v1/browser/executions/${retried.id}/acknowledge`, { method: "POST", headers: auth(), body: { ...concurrentAckBody, messageId: randomUUID() } }),
  ]);
  assert.deepEqual(concurrentAcks.map((response) => response.status).sort(), [200, 409]);
  await prisma.browserActionResult.deleteMany({ where: { executionId: retried.id } });
  await prisma.browserExecution.update({ where: { id: retried.id }, data: { status: "ISSUED", expiresAt: new Date(Date.now() + 300000) } });
  let ready = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const startTogether = (call) => {
    ready += 1;
    if (ready === 2) release();
    return gate.then(call);
  };
  const racedAck = startTogether(() => request(`/api/v1/browser/executions/${retried.id}/acknowledge`, { method: "POST", headers: auth(), body: { ...concurrentAckBody, messageId: randomUUID(), idempotencyKey: "ack-race" } }));
  const racedCancel = startTogether(() => request(`/api/v1/browser/executions/${retried.id}/cancel`, { method: "POST", headers: auth(), body: { taskId: task.id, idempotencyKey: "cancel-race" } }));
  const raced = await Promise.all([racedAck, racedCancel]);
  assert.ok(raced.some((response) => response.status === 200));
  const racedState = await prisma.browserExecution.findUnique({ where: { id: retried.id } });
  if (racedState.status === "CANCELLED") assert.equal(await prisma.browserActionResult.count({ where: { executionId: retried.id, status: "SUCCESS" } }), 0);
  await prisma.browserExecution.update({ where: { id: retried.id }, data: { status: "ISSUED", expiresAt: new Date(Date.now() - 1000) } });
  const expiredAck = await request(`/api/v1/browser/executions/${retried.id}/acknowledge`, { method: "POST", headers: auth(), body: concurrentAckBody });
  assert.equal(expiredAck.status, 409);
  await prisma.browserExecution.update({ where: { id: retried.id }, data: { status: "ISSUED", expiresAt: new Date(Date.now() + 300000) } });
  const cancelled = retried;
  const cancel = await request(`/api/v1/browser/executions/${cancelled.id}/cancel`, { method: "POST", headers: auth(), body: { taskId: task.id, idempotencyKey: "cancel-key-1" } });
  assert.equal(cancel.status, 200);
  const status = await request(`/api/v1/browser/executions/${cancelled.id}`, { headers: auth() });
  assert.equal((await status.json()).data.execution.status, "CANCELLED");
  const lateAck = await request(`/api/v1/browser/executions/${cancelled.id}/acknowledge`, { method: "POST", headers: auth(), body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: "ack-late-1", executionId: cancelled.id, actionId: cancelled.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [] } });
  assert.equal(lateAck.status, 400);
  const retryAttempt = await request(`/api/v1/browser/executions/${cancelled.id}/retry`, { method: "POST", headers: auth(), body: { taskId: task.id, idempotencyKey: "retry-cancelled", pageSessionId: pageSession.id } });
  assert.equal(retryAttempt.status, 409);
});

test("serializes acknowledgement and cancellation at a PostgreSQL row-lock barrier", async () => {
 const instructionResponse = await request("/api/v1/browser/instructions", {
   method: "POST", headers: auth(),
   body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: "execution-db-barrier", pageSessionId: pageSession.id },
 });
 assert.equal(instructionResponse.status, 201);
 const lockedExecution = (await instructionResponse.json()).data.execution;
 const lockedAction = lockedExecution.instruction.actions[0];
 const acknowledgement = {
   taskId: task.id, executionId: lockedExecution.id, pageSessionId: pageSession.id,
   actionId: lockedExecution.instruction.actionId, status: "COMPLETED",
   results: [{ fieldId: field.id, actionId: lockedAction.actionId, actionType: lockedAction.action, status: "SUCCESS" }],
 };
 let observedWaiter = false;
 let acknowledgementPromise;
 let cancellationPromise;
 await prisma.$transaction(async (transaction) => {
   await transaction.$queryRaw`SELECT id FROM "browser_executions" WHERE id = ${lockedExecution.id}::uuid FOR UPDATE`;
   acknowledgementPromise = browserService.acknowledge(userId, acknowledgement);
   cancellationPromise = browserService.cancel(userId, task.id, lockedExecution.id);
   for (let attempt = 0; attempt < 100; attempt += 1) {
     const waiters = await prisma.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
     if (Number(waiters[0].count) > 0) {
       observedWaiter = true;
       break;
     }
     await new Promise((resolve) => setTimeout(resolve, 10));
   }
 });
 await Promise.allSettled([acknowledgementPromise, cancellationPromise]);
 assert.equal(observedWaiter, true);
 const persisted = await prisma.browserExecution.findUnique({ where: { id: lockedExecution.id }, include: { results: true } });
 assert.ok(["COMPLETED", "CANCELLED"].includes(persisted.status));
 if (persisted.status === "CANCELLED") assert.equal(persisted.results.length, 0);
 if (persisted.status === "COMPLETED") assert.equal(persisted.results.filter((result) => result.status === "SUCCESS").length, 1);
});

 test("serializes concurrent PostgreSQL retries and preserves persisted identity", async () => {
   const issue = await request("/api/v1/browser/instructions", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `retry-barrier-${randomUUID()}`, pageSessionId: pageSession.id },
   });
   assert.equal(issue.status, 201);
   const issued = (await issue.json()).data.execution;
   const failedAction = issued.instruction.actions[0];
   const failedAck = await request(`/api/v1/browser/executions/${issued.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `retry-barrier-ack-${randomUUID()}`, executionId: issued.id, actionId: issued.instruction.actionId, pageSessionId: pageSession.id, status: "FAILED", results: [{ fieldId: failedAction.fieldId, actionId: failedAction.actionId, actionType: failedAction.action, status: "FAILED", errorCode: "FIELD_NOT_FOUND" }] },
   });
   assert.equal(failedAck.status, 200);
   let observedWaiter = false;
   let firstRetry;
   let secondRetry;
   await prisma.$transaction(async (transaction) => {
     await transaction.$queryRaw`SELECT id FROM "browser_executions" WHERE id = ${issued.id}::uuid FOR UPDATE`;
     firstRetry = browserService.retry(userId, task.id, issued.id, "retry-barrier-same-key", pageSession.id);
     secondRetry = browserService.retry(userId, task.id, issued.id, "retry-barrier-same-key", pageSession.id);
     for (let attempt = 0; attempt < 100; attempt += 1) {
       const waiters = await prisma.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
       if (Number(waiters[0].count) > 0) {
         observedWaiter = true;
         break;
       }
       await new Promise((resolve) => setTimeout(resolve, 10));
     }
   });
   const sameKeyResults = await Promise.allSettled([firstRetry, secondRetry]);
   assert.equal(observedWaiter, true);
   assert.equal(sameKeyResults.filter((result) => result.status === "fulfilled").length, 2);
   assert.equal(sameKeyResults[0].value.id, sameKeyResults[1].value.id);
   const persisted = await prisma.browserExecution.findUnique({ where: { id: issued.id }, include: { results: true } });
   assert.equal(persisted.retryActionIds.length, 1);
   assert.equal(persisted.results.length, 0);
   assert.equal(persisted.idempotencyKey, "retry-barrier-same-key");

   await prisma.browserActionResult.deleteMany({ where: { executionId: issued.id } });
   await prisma.browserExecution.update({ where: { id: issued.id }, data: { status: "FAILED", retryCount: 0, idempotencyKey: `retry-conflict-base-${randomUUID()}`, idempotencyHash: null, retryActionIds: [], expiresAt: new Date(Date.now() + 300000) } });
   const currentInstruction = await prisma.browserExecution.findUnique({ where: { id: issued.id } });
   const currentAction = currentInstruction.instruction.actions[0];
   await prisma.browserActionResult.create({ data: { executionId: issued.id, fieldId: currentAction.fieldId, actionId: currentAction.actionId, status: "FAILED", errorCode: "FIELD_NOT_FOUND" } });
   const conflicting = await Promise.allSettled([
     browserService.retry(userId, task.id, issued.id, "retry-barrier-conflict", pageSession.id),
     browserService.retry(userId, task.id, issued.id, "retry-barrier-conflict", pageSession.id, BROWSER_PROTOCOL_VERSION, [randomUUID()]),
   ]);
   assert.equal(conflicting.filter((result) => result.status === "fulfilled").length, 1);
   assert.equal(conflicting.filter((result) => result.status === "rejected").length, 1);
   const finalExecution = await prisma.browserExecution.findUnique({ where: { id: issued.id } });
   assert.equal(finalExecution.retryCount, 1);
 });

 test("enforces cross-user and cross-task isolation without state mutation", async () => {
   const beforeExecutions = await prisma.browserExecution.count({ where: { userId } });
   const beforeAudits = await prisma.auditLog.count({ where: { userId, action: { in: ["BROWSER_PAGE_REGISTERED", "BROWSER_INSTRUCTIONS_ISSUED", "BROWSER_EXECUTION_ACKNOWLEDGED", "BROWSER_EXECUTION_RETRIED", "BROWSER_EXECUTION_CANCELLED"] } } });
   const registration = await request("/api/v1/browser/register", {
     method: "POST",
     headers: auth(),
     body: {
       protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER",
       taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `foreign-page-${randomUUID()}`,
       payload: { pageContext: { url: "https://example.test/application", title: "Application", detectedAt: new Date().toISOString() }, fields: [{ fieldIdentifier: "full-name", label: "Full Name", elementType: "input", inputType: "text", fingerprint: "field-fp" }] },
     },
   });
   assert.equal(registration.status, 201);
   const foreignSessionId = (await registration.json()).data.pageSession.id;
   const instruction = await request("/api/v1/browser/instructions", {
     method: "POST",
     headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `isolation-execution-${randomUUID()}`, pageSessionId: pageSession.id },
   });
   assert.equal(instruction.status, 201);
   const ownedExecution = (await instruction.json()).data.execution;
   const action = ownedExecution.instruction.actions[0];
   const foreignRequests = [
     request(`/api/v1/browser/executions/${ownedExecution.id}`, { headers: otherAuth() }),
     request(`/api/v1/browser/executions/${ownedExecution.id}/retry`, { method: "POST", headers: otherAuth(), body: { taskId: task.id, idempotencyKey: `foreign-retry-${randomUUID()}`, pageSessionId: pageSession.id } }),
     request(`/api/v1/browser/executions/${ownedExecution.id}/cancel`, { method: "POST", headers: otherAuth(), body: { taskId: task.id, idempotencyKey: `foreign-cancel-${randomUUID()}` } }),
     request(`/api/v1/browser/executions/${ownedExecution.id}/acknowledge`, { method: "POST", headers: otherAuth(), body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `foreign-ack-${randomUUID()}`, executionId: ownedExecution.id, actionId: ownedExecution.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [{ fieldId: field.id, actionId: action.actionId, actionType: action.action, status: "SUCCESS" }] } }),
   ];
   const foreignResponses = await Promise.all(foreignRequests);
   assert.deepEqual(foreignResponses.map((response) => response.status).sort(), [404, 404, 404, 404]);
   const wrongPage = await request("/api/v1/browser/instructions", {
     method: "POST",
     headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `wrong-session-${randomUUID()}`, pageSessionId: otherPageSession.id },
   });
   assert.equal(wrongPage.status, 404);
   const foreignFieldAck = await request(`/api/v1/browser/executions/${ownedExecution.id}/acknowledge`, {
     method: "POST",
     headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `foreign-field-${randomUUID()}`, executionId: ownedExecution.id, actionId: ownedExecution.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [{ fieldId: randomUUID(), actionId: action.actionId, actionType: action.action, status: "SUCCESS" }] },
   });
   assert.equal(foreignFieldAck.status, 400);
   const persisted = await prisma.browserExecution.findUnique({ where: { id: ownedExecution.id }, include: { results: true } });
   assert.equal(persisted.status, "ISSUED");
   assert.equal(persisted.results.length, 0);
   assert.equal(await prisma.browserExecution.count({ where: { userId } }), beforeExecutions + 1);
   assert.equal(await prisma.auditLog.count({ where: { userId, action: { in: ["BROWSER_PAGE_REGISTERED", "BROWSER_INSTRUCTIONS_ISSUED", "BROWSER_EXECUTION_ACKNOWLEDGED", "BROWSER_EXECUTION_RETRIED", "BROWSER_EXECUTION_CANCELLED"] } } }), beforeAudits + 2);
   await prisma.browserPageSession.delete({ where: { id: foreignSessionId } });
 });

 test("simulates the authenticated extension lifecycle through HTTP", async () => {
   const suffix = randomUUID();
   const created = await request("/api/v1/form-tasks", {
     method: "POST",
     headers: auth(),
     body: { conversationId: (await prisma.conversation.findFirst({ where: { userId } })).id, title: "Simulated extension task", taskType: "APPLICATION", webpageUrl: "https://example.test/simulated" },
   });
   assert.equal(created.status, 201);
   const simulatedTask = (await created.json()).data.task;
   const registration = await request("/api/v1/browser/register", {
     method: "POST",
     headers: auth(),
     body: {
       protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER",
       taskId: simulatedTask.id, timestamp: new Date().toISOString(), idempotencyKey: `sim-register-${suffix}`,
       payload: {
         pageContext: { url: "https://example.test/simulated", title: "Simulated", detectedAt: new Date().toISOString(), fingerprint: `sim-page-${suffix}` },
         fields: [
           { fieldIdentifier: `sim-name-${suffix}`, label: "Name", elementType: "input", inputType: "text", fingerprint: `sim-name-fp-${suffix}` },
           { fieldIdentifier: `sim-email-${suffix}`, label: "Email", elementType: "input", inputType: "email", fingerprint: `sim-email-fp-${suffix}` },
         ],
       },
     },
   });
   assert.equal(registration.status, 201);
   const simulatedSession = (await registration.json()).data.pageSession;
   const mappings = await request(`/api/v1/browser/tasks/${simulatedTask.id}/mappings`, { headers: auth() });
   assert.equal(mappings.status, 200);
   const fieldsResponse = await request(`/api/v1/form-tasks/${simulatedTask.id}/fields`, { headers: auth() });
   const simulatedFields = (await fieldsResponse.json()).data.fields;
   for (const [index, simulatedField] of simulatedFields.entries()) {
     const value = await request(`/api/v1/form-tasks/${simulatedTask.id}/fields/${simulatedField.id}/value`, {
       method: "PUT",
       headers: auth(),
       body: { value: index === 0 ? "Simulated User" : "simulated@example.test", source: "USER_PROVIDED" },
     });
     assert.equal(value.status, 201);
     const approval = await request(`/api/v1/form-tasks/${simulatedTask.id}/fields/${simulatedField.id}/approve`, { method: "POST", headers: auth(), body: {} });
     assert.equal(approval.status, 200);
   }
   const review = await request(`/api/v1/form-tasks/${simulatedTask.id}/review`, { headers: auth() });
   assert.equal(review.status, 200);
   const version = (await prisma.formTask.findUnique({ where: { id: simulatedTask.id }, select: { version: true } })).version;
   const finalApproval = await request(`/api/v1/form-tasks/${simulatedTask.id}/final-approval`, { method: "POST", headers: auth(), body: { expectedVersion: version } });
   assert.equal(finalApproval.status, 200);
   const instructions = await request("/api/v1/browser/instructions", {
     method: "POST",
     headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: simulatedTask.id, timestamp: new Date().toISOString(), idempotencyKey: `sim-instructions-${suffix}`, pageSessionId: simulatedSession.id },
   });
   assert.equal(instructions.status, 201);
   const issued = (await instructions.json()).data.execution;
   assert.equal(issued.instruction.protocolVersion, BROWSER_PROTOCOL_VERSION);
   assert.ok(issued.instruction.actions.every((action) => ["SET_VALUE", "SELECT_OPTION", "CHECK", "UNCHECK"].includes(action.action)));
   assert.equal(issued.instruction.actions.length, 2);
   const [firstAction, secondAction] = issued.instruction.actions;
   const partial = await request(`/api/v1/browser/executions/${issued.id}/acknowledge`, {
     method: "POST",
     headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: simulatedTask.id, timestamp: new Date().toISOString(), idempotencyKey: `sim-partial-${suffix}`, executionId: issued.id, actionId: issued.instruction.actionId, pageSessionId: simulatedSession.id, status: "PARTIAL", results: [
       { fieldId: firstAction.fieldId, actionId: firstAction.actionId, actionType: firstAction.action, status: "SUCCESS" },
       { fieldId: secondAction.fieldId, actionId: secondAction.actionId, actionType: secondAction.action, status: "FAILED", errorCode: "FIELD_NOT_FOUND" },
     ] },
   });
   assert.equal(partial.status, 200);
   const duplicate = await request(`/api/v1/browser/executions/${issued.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: simulatedTask.id, timestamp: new Date().toISOString(), idempotencyKey: `sim-duplicate-${suffix}`, executionId: issued.id, actionId: issued.instruction.actionId, pageSessionId: simulatedSession.id, status: "PARTIAL", results: [{ fieldId: firstAction.fieldId, actionId: firstAction.actionId, actionType: firstAction.action, status: "SUCCESS" }] },
   });
   assert.equal(duplicate.status, 409);
   const retryResponse = await request(`/api/v1/browser/executions/${issued.id}/retry`, { method: "POST", headers: auth(), body: { taskId: simulatedTask.id, idempotencyKey: `sim-retry-${suffix}`, pageSessionId: simulatedSession.id } });
   assert.equal(retryResponse.status, 200);
   const retryExecution = (await retryResponse.json()).data.execution;
   assert.equal(retryExecution.instruction.actions.length, 1);
   assert.equal(retryExecution.instruction.actions[0].fieldId, secondAction.fieldId);
   const retryAction = retryExecution.instruction.actions[0];
   const retryAck = await request(`/api/v1/browser/executions/${issued.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: simulatedTask.id, timestamp: new Date().toISOString(), idempotencyKey: `sim-retry-ack-${suffix}`, executionId: issued.id, actionId: retryExecution.instruction.actionId, pageSessionId: simulatedSession.id, status: "COMPLETED", results: [{ fieldId: retryAction.fieldId, actionId: retryAction.actionId, actionType: retryAction.action, status: "SUCCESS" }] },
   });
   assert.equal(retryAck.status, 200);
   const cancellationInstructions = await request("/api/v1/browser/instructions", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: simulatedTask.id, timestamp: new Date().toISOString(), idempotencyKey: `sim-cancel-instructions-${suffix}`, pageSessionId: simulatedSession.id },
   });
   const cancellationExecution = (await cancellationInstructions.json()).data.execution;
   const cancellationAction = cancellationExecution.instruction.actions[0];
   const cancellation = await request(`/api/v1/browser/executions/${cancellationExecution.id}/cancel`, { method: "POST", headers: auth(), body: { taskId: simulatedTask.id, idempotencyKey: `sim-cancel-${suffix}` } });
   assert.equal(cancellation.status, 200);
   const lateAck = await request(`/api/v1/browser/executions/${cancellationExecution.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: simulatedTask.id, timestamp: new Date().toISOString(), idempotencyKey: `sim-late-${suffix}`, executionId: cancellationExecution.id, actionId: cancellationExecution.instruction.actionId, pageSessionId: simulatedSession.id, status: "COMPLETED", results: [{ fieldId: cancellationAction.fieldId, actionId: cancellationAction.actionId, actionType: cancellationAction.action, status: "SUCCESS" }] },
   });
   assert.equal(lateAck.status, 409);
   const persisted = await prisma.browserExecution.findUnique({ where: { id: cancellationExecution.id }, include: { results: true } });
   assert.equal(persisted.status, "CANCELLED");
   assert.equal(persisted.results.length, 0);
 });

 test("serializes concurrent instruction issuance and rejects conflicting identities", async () => {
   const identicalKey = `instruction-race-${randomUUID()}`;
   const body = {
     protocolVersion: BROWSER_PROTOCOL_VERSION,
     messageId: randomUUID(),
     messageType: "FILL_INSTRUCTIONS_REQUEST",
     taskId: task.id,
     timestamp: new Date().toISOString(),
     idempotencyKey: identicalKey,
     pageSessionId: pageSession.id,
   };
   const identical = await Promise.all([
     request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body }),
     request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, messageId: randomUUID() } }),
   ]);
   assert.deepEqual(identical.map((response) => response.status).sort(), [201, 201]);
   const identicalExecutions = await Promise.all(identical.map(async (response) => (await response.json()).data.execution));
   assert.equal(identicalExecutions[0].id, identicalExecutions[1].id);
   assert.equal(await prisma.browserExecution.count({ where: { userId, idempotencyKey: identicalKey } }), 1);

   const conflictKey = `instruction-conflict-${randomUUID()}`;
   const conflicting = await Promise.all([
     request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: conflictKey, messageId: randomUUID() } }),
     request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { ...body, idempotencyKey: conflictKey, pageSessionId: otherPageSession.id, messageId: randomUUID() } }),
   ]);
   assert.ok(conflicting.some((response) => response.status === 201));
   assert.ok(conflicting.some((response) => response.status === 404 || response.status === 409));
   assert.equal(await prisma.browserExecution.count({ where: { userId, idempotencyKey: conflictKey } }), 1);
 });

 test("proves overlapping instruction transactions at the PostgreSQL task lock", async () => {
   const key = `instruction-lock-${randomUUID()}`;
   let first;
   let second;
   let observedWaiter = false;
   await prisma.$transaction(async (transaction) => {
     await transaction.$queryRaw`SELECT id FROM "form_tasks" WHERE id = ${task.id}::uuid FOR UPDATE`;
     const body = { taskId: task.id, pageSessionId: pageSession.id, idempotencyKey: key };
     first = browserService.issueInstructions(userId, body.taskId, body.pageSessionId, body.idempotencyKey);
     second = browserService.issueInstructions(userId, body.taskId, body.pageSessionId, body.idempotencyKey);
     for (let attempt = 0; attempt < 100; attempt += 1) {
       const waiters = await prisma.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
       if (Number(waiters[0].count) > 0) {
         observedWaiter = true;
         break;
       }
       await new Promise((resolve) => setTimeout(resolve, 10));
     }
   });
   const results = await Promise.allSettled([first, second]);
   assert.equal(observedWaiter, true);
   assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
   assert.equal(results[0].value.id, results[1].value.id);
   assert.equal(await prisma.browserExecution.count({ where: { userId, idempotencyKey: key } }), 1);
   assert.equal(await prisma.browserActionResult.count({ where: { executionId: results[0].value.id } }), 0);
 });

 test("enforces task ownership for registration and mapping retrieval", async () => {
   const foreignRegistration = await request("/api/v1/browser/register", {
     method: "POST",
     headers: auth(),
     body: {
       protocolVersion: BROWSER_PROTOCOL_VERSION,
       messageId: randomUUID(),
       messageType: "TASK_REGISTER",
       taskId: otherTask.id,
       timestamp: new Date().toISOString(),
       idempotencyKey: `foreign-registration-${randomUUID()}`,
       payload: {
         pageContext: { url: "https://example.test/other", detectedAt: new Date().toISOString() },
         fields: [{ fieldIdentifier: "foreign", label: "Foreign", elementType: "input", inputType: "text" }],
       },
     },
   });
   assert.equal(foreignRegistration.status, 404);
   const foreignMappings = await request(`/api/v1/browser/tasks/${otherTask.id}/mappings`, { headers: auth() });
   assert.equal(foreignMappings.status, 404);
   assert.equal(await prisma.browserPageSession.count({ where: { formTaskId: otherTask.id, userId } }), 0);
 });

 test("rejects mixed task, session, execution, action, and field identifiers without mutation", async () => {
   const before = async (taskId, executionId) => ({
     task: await prisma.formTask.findUnique({ where: { id: taskId }, select: { version: true, status: true } }),
     execution: executionId ? await prisma.browserExecution.findUnique({ where: { id: executionId }, select: { status: true, retryCount: true } }) : null,
     results: executionId ? await prisma.browserActionResult.count({ where: { executionId } }) : 0,
     events: await prisma.taskEvent.count({ where: { formTaskId: taskId } }),
     audits: await prisma.auditLog.count({ where: { userId } }),
   });
   const freshInstruction = await request("/api/v1/browser/instructions", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-${randomUUID()}`, pageSessionId: pageSession.id },
   });
   assert.equal(freshInstruction.status, 201);
   const ownExecution = (await freshInstruction.json()).data.execution;
   const ownAction = ownExecution.instruction.actions[0];
   const secondInstruction = await request("/api/v1/browser/instructions", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-second-${randomUUID()}`, pageSessionId: pageSession.id },
   });
   assert.equal(secondInstruction.status, 201);
   const secondExecution = (await secondInstruction.json()).data.execution;
   const foreignField = await prisma.detectedField.create({
     data: { formTaskId: otherTask.id, fieldIdentifier: `matrix-foreign-${randomUUID()}`, label: "Foreign field", elementType: "input", inputType: "text" },
   });

   const foreignRegistration = await request("/api/v1/browser/register", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER", taskId: otherTask.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-register-${randomUUID()}`, payload: { pageContext: { url: "https://example.test/other", detectedAt: new Date().toISOString() }, fields: [{ fieldIdentifier: "foreign", label: "Foreign", elementType: "input", inputType: "text" }] } },
   });
   assert.equal(foreignRegistration.status, 404);
   const foreignTaskOwnSession = await request("/api/v1/browser/instructions", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: otherTask.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-foreign-task-${randomUUID()}`, pageSessionId: pageSession.id },
   });
   assert.ok([400, 404].includes(foreignTaskOwnSession.status));
   const ownTaskForeignSession = await request("/api/v1/browser/instructions", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-foreign-session-${randomUUID()}`, pageSessionId: otherPageSession.id },
   });
   assert.ok([400, 404].includes(ownTaskForeignSession.status));

   const beforeAck = await before(task.id, ownExecution.id);
   const foreignTaskAck = await request(`/api/v1/browser/executions/${ownExecution.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: otherTask.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-ack-task-${randomUUID()}`, executionId: ownExecution.id, actionId: ownExecution.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [{ fieldId: ownAction.fieldId, actionId: ownAction.actionId, actionType: ownAction.action, status: "SUCCESS" }] },
   });
   assert.equal(foreignTaskAck.status, 400);
   const foreignSessionAck = await request(`/api/v1/browser/executions/${ownExecution.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-ack-session-${randomUUID()}`, executionId: ownExecution.id, actionId: ownExecution.instruction.actionId, pageSessionId: otherPageSession.id, status: "COMPLETED", results: [{ fieldId: ownAction.fieldId, actionId: ownAction.actionId, actionType: ownAction.action, status: "SUCCESS" }] },
   });
   assert.equal(foreignSessionAck.status, 404);
   const foreignFieldAck = await request(`/api/v1/browser/executions/${ownExecution.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-ack-field-${randomUUID()}`, executionId: ownExecution.id, actionId: ownExecution.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [{ fieldId: foreignField.id, actionId: ownAction.actionId, actionType: ownAction.action, status: "SUCCESS" }] },
   });
   assert.equal(foreignFieldAck.status, 400);
   const foreignActionAck = await request(`/api/v1/browser/executions/${ownExecution.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: task.id, timestamp: new Date().toISOString(), idempotencyKey: `matrix-ack-action-${randomUUID()}`, executionId: ownExecution.id, actionId: ownExecution.instruction.actionId, pageSessionId: pageSession.id, status: "COMPLETED", results: [{ fieldId: ownAction.fieldId, actionId: secondExecution.instruction.actions[0].actionId, actionType: ownAction.action, status: "SUCCESS" }] },
   });
   assert.equal(foreignActionAck.status, 400);

   const foreignExecution = await request(`/api/v1/browser/executions/${randomUUID()}/cancel`, {
     method: "POST", headers: auth(), body: { taskId: task.id, idempotencyKey: `matrix-unknown-execution-${randomUUID()}` },
   });
   assert.equal(foreignExecution.status, 404);
   const mixedRetry = await request(`/api/v1/browser/executions/${ownExecution.id}/retry`, {
     method: "POST", headers: auth(), body: { taskId: otherTask.id, idempotencyKey: `matrix-retry-${randomUUID()}`, pageSessionId: pageSession.id },
   });
   assert.equal(mixedRetry.status, 404);
   const mixedCancel = await request(`/api/v1/browser/executions/${ownExecution.id}/cancel`, {
     method: "POST", headers: auth(), body: { taskId: otherTask.id, idempotencyKey: `matrix-cancel-${randomUUID()}` },
   });
   assert.equal(mixedCancel.status, 404);
   const crossUserExecution = await request(`/api/v1/browser/executions/${ownExecution.id}/cancel`, {
     method: "POST", headers: otherAuth(), body: { taskId: task.id, idempotencyKey: `matrix-cross-user-${randomUUID()}` },
   });
   assert.equal(crossUserExecution.status, 404);
   const after = await before(task.id, ownExecution.id);
   assert.deepEqual(after, beforeAck);
 });

 test("preserves unchanged approval and invalidates material registration changes", async () => {
   const conversation = await prisma.conversation.findFirst({ where: { userId } });
   const created = await request("/api/v1/form-tasks", {
     method: "POST",
     headers: auth(),
     body: { conversationId: conversation.id, title: "Lifecycle task", taskType: "APPLICATION", webpageUrl: "https://example.test/lifecycle" },
   });
   assert.equal(created.status, 201);
   const lifecycleTask = (await created.json()).data.task;
   const registerBody = (key, fieldLabel = "Lifecycle field") => ({
     protocolVersion: BROWSER_PROTOCOL_VERSION,
     messageId: randomUUID(),
     messageType: "TASK_REGISTER",
     taskId: lifecycleTask.id,
     timestamp: new Date().toISOString(),
     idempotencyKey: key,
     payload: {
       pageContext: { url: "https://example.test/lifecycle", title: "Lifecycle", detectedAt: new Date().toISOString(), fingerprint: `lifecycle-${key}` },
       fields: [{ fieldIdentifier: "lifecycle-field", label: fieldLabel, elementType: "input", inputType: "text", fingerprint: `field-${key}` }],
     },
   });
   const firstRegistration = await request("/api/v1/browser/register", { method: "POST", headers: auth(), body: registerBody(`lifecycle-first-${randomUUID()}`) });
   assert.equal(firstRegistration.status, 201);
   const lifecycleFields = (await request(`/api/v1/form-tasks/${lifecycleTask.id}/fields`, { headers: auth() })).json();
   const lifecycleField = (await lifecycleFields).data.fields[0];
   const value = await request(`/api/v1/form-tasks/${lifecycleTask.id}/fields/${lifecycleField.id}/value`, {
     method: "PUT", headers: auth(), body: { value: "Approved lifecycle value", source: "USER_PROVIDED" },
   });
   assert.equal(value.status, 201);
   assert.equal((await request(`/api/v1/form-tasks/${lifecycleTask.id}/fields/${lifecycleField.id}/approve`, { method: "POST", headers: auth(), body: {} })).status, 200);
   const versionBeforeFinal = (await prisma.formTask.findUnique({ where: { id: lifecycleTask.id }, select: { version: true } })).version;
   assert.equal((await request(`/api/v1/form-tasks/${lifecycleTask.id}/final-approval`, { method: "POST", headers: auth(), body: { expectedVersion: versionBeforeFinal } })).status, 200);
   const approvedBefore = await prisma.approval.findFirst({ where: { formTaskId: lifecycleTask.id, approvalType: "FORM_FILL", status: "APPROVED" } });
   const unchanged = await request("/api/v1/browser/register", { method: "POST", headers: auth(), body: registerBody(`lifecycle-unchanged-${randomUUID()}`) });
   assert.equal(unchanged.status, 201);
   const unchangedApproval = await prisma.approval.findUnique({ where: { id: approvedBefore.id } });
   assert.equal(unchangedApproval.status, "APPROVED");
   const changed = await request("/api/v1/browser/register", { method: "POST", headers: auth(), body: registerBody(`lifecycle-changed-${randomUUID()}`, "Changed lifecycle field") });
   assert.equal(changed.status, 201);
   const invalidated = await prisma.approval.findUnique({ where: { id: approvedBefore.id } });
   const finalTask = await prisma.formTask.findUnique({ where: { id: lifecycleTask.id } });
   assert.equal(invalidated.status, "REVOKED");
   assert.ok(invalidated.invalidatedAt);
   assert.equal(finalTask.status, "REVIEW");
   assert.ok(finalTask.version > versionBeforeFinal + 1);
   assert.ok(await prisma.taskEvent.findFirst({ where: { formTaskId: lifecycleTask.id, eventType: "FINAL_APPROVAL_INVALIDATED" } }));
 });

 test("keeps pre-approval lifecycle changes unapproved across field and URL variants", async () => {
   const conversation = await prisma.conversation.findFirst({ where: { userId } });
   const cases = [
     { name: "field-removal", initial: [{ fieldIdentifier: "keep", label: "Keep", elementType: "input", inputType: "text" }, { fieldIdentifier: "remove", label: "Remove", elementType: "input", inputType: "text" }], changed: [{ fieldIdentifier: "keep", label: "Keep", elementType: "input", inputType: "text" }], url: "https://example.test/pre-removal" },
     { name: "input-type", initial: [{ fieldIdentifier: "control", label: "Control", elementType: "input", inputType: "text" }], changed: [{ fieldIdentifier: "control", label: "Control", elementType: "select", inputType: "select", options: [{ value: "A", label: "Alpha" }] }], url: "https://example.test/pre-type" },
     { name: "options", initial: [{ fieldIdentifier: "choice", label: "Choice", elementType: "select", inputType: "select", options: [{ value: "A", label: "Alpha" }, { value: "B", label: "Beta" }] }], changed: [{ fieldIdentifier: "choice", label: "Choice", elementType: "select", inputType: "select", options: [{ value: "A", label: "Changed Alpha" }] }], url: "https://example.test/pre-options?step=2" },
     { name: "url", initial: [{ fieldIdentifier: "url", label: "URL", elementType: "input", inputType: "text" }], changed: [{ fieldIdentifier: "url", label: "URL", elementType: "input", inputType: "text" }], url: "http://changed.example/pre-url/path?step=2" },
   ];
   for (const lifecycleCase of cases) {
     const created = await request("/api/v1/form-tasks", {
       method: "POST", headers: auth(),
       body: { conversationId: conversation.id, title: `Pre approval ${lifecycleCase.name}`, taskType: "APPLICATION", webpageUrl: lifecycleCase.url },
     });
     assert.equal(created.status, 201);
     const preTask = (await created.json()).data.task;
     const register = (key, url, fields) => request("/api/v1/browser/register", {
       method: "POST", headers: auth(),
       body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER", taskId: preTask.id, timestamp: new Date().toISOString(), idempotencyKey: key, payload: { pageContext: { url, title: lifecycleCase.name, detectedAt: new Date().toISOString() }, fields } },
     });
     assert.equal((await register(`pre-initial-${randomUUID()}`, lifecycleCase.url, lifecycleCase.initial)).status, 201);
     const before = await prisma.formTask.findUnique({ where: { id: preTask.id }, select: { version: true, status: true } });
     assert.equal((await register(`pre-changed-${randomUUID()}`, lifecycleCase.url, lifecycleCase.changed)).status, 201);
     const after = await prisma.formTask.findUnique({ where: { id: preTask.id }, select: { version: true, status: true } });
     assert.equal(after.status, "FIELDS_DETECTED");
     assert.ok(after.version > before.version);
     assert.equal(await prisma.approval.count({ where: { formTaskId: preTask.id, approvalType: "FORM_FILL" } }), 0);
     if (lifecycleCase.name === "field-removal") {
       assert.equal((await prisma.detectedField.findFirst({ where: { formTaskId: preTask.id, fieldIdentifier: "remove" }, select: { status: true } })).status, "REMOVED");
     }
   }
 });

 test("marks removed fields inactive and blocks stale page execution", async () => {
   const conversation = await prisma.conversation.findFirst({ where: { userId } });
   const created = await request("/api/v1/form-tasks", {
     method: "POST", headers: auth(),
     body: { conversationId: conversation.id, title: "Removal lifecycle task", taskType: "APPLICATION", webpageUrl: "https://example.test/removal" },
   });
   assert.equal(created.status, 201);
   const removalTask = (await created.json()).data.task;
   const register = async (idempotencyKey, url, fields) => request("/api/v1/browser/register", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER", taskId: removalTask.id, timestamp: new Date().toISOString(), idempotencyKey, payload: { pageContext: { url, title: "Removal", detectedAt: new Date().toISOString() }, fields } },
   });
   const first = await register(`removal-first-${randomUUID()}`, "https://example.test/removal", [
     { fieldIdentifier: "keep", label: "Keep", elementType: "input", inputType: "text" },
     { fieldIdentifier: "remove", label: "Remove", elementType: "input", inputType: "text" },
   ]);
   assert.equal(first.status, 201);
   const second = await register(`removal-second-${randomUUID()}`, "https://example.test/removal", [
     { fieldIdentifier: "keep", label: "Keep", elementType: "input", inputType: "text" },
   ]);
   assert.equal(second.status, 201);
   const removed = await prisma.detectedField.findFirst({ where: { formTaskId: removalTask.id, fieldIdentifier: "remove" } });
   assert.equal(removed.status, "REMOVED");
   const removalTaskState = await prisma.formTask.findUnique({ where: { id: removalTask.id } });
   assert.equal(removalTaskState.status, "FIELDS_DETECTED");
   const changedPage = await request(`/api/v1/form-tasks/${removalTask.id}/webpage`, { method: "PUT", headers: auth(), body: { url: "https://other.example/removal" } });
   assert.equal(changedPage.status, 200);
   const pageSession = (await second.json()).data.pageSession;
   const staleInstruction = await request("/api/v1/browser/instructions", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: removalTask.id, timestamp: new Date().toISOString(), idempotencyKey: `removal-stale-${randomUUID()}`, pageSessionId: pageSession.id },
   });
   assert.equal(staleInstruction.status, 409);
 });

 test("rejects stale remaining actions after partial acknowledgement and lifecycle change", async () => {
   const conversation = await prisma.conversation.findFirst({ where: { userId } });
   const created = await request("/api/v1/form-tasks", {
     method: "POST", headers: auth(),
     body: { conversationId: conversation.id, title: "Partial lifecycle timing", taskType: "APPLICATION", webpageUrl: "https://example.test/partial-lifecycle" },
   });
   assert.equal(created.status, 201);
   const timingTask = (await created.json()).data.task;
   const register = (key, url, fields) => request("/api/v1/browser/register", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER", taskId: timingTask.id, timestamp: new Date().toISOString(), idempotencyKey: key, payload: { pageContext: { url, title: "Partial lifecycle", detectedAt: new Date().toISOString() }, fields } },
   });
   const fields = [
     { fieldIdentifier: "first", label: "First", elementType: "input", inputType: "text" },
     { fieldIdentifier: "second", label: "Second", elementType: "input", inputType: "text" },
   ];
   assert.equal((await register(`timing-initial-${randomUUID()}`, "https://example.test/partial-lifecycle", fields)).status, 201);
   const detected = (await (await request(`/api/v1/form-tasks/${timingTask.id}/fields`, { headers: auth() })).json()).data.fields;
   for (const detectedField of detected) {
     assert.equal((await request(`/api/v1/form-tasks/${timingTask.id}/fields/${detectedField.id}/value`, { method: "PUT", headers: auth(), body: { value: detectedField.fieldIdentifier, source: "USER_PROVIDED" } })).status, 201);
     assert.equal((await request(`/api/v1/form-tasks/${timingTask.id}/fields/${detectedField.id}/approve`, { method: "POST", headers: auth(), body: {} })).status, 200);
   }
   const version = (await prisma.formTask.findUnique({ where: { id: timingTask.id }, select: { version: true } })).version;
   assert.equal((await request(`/api/v1/form-tasks/${timingTask.id}/final-approval`, { method: "POST", headers: auth(), body: { expectedVersion: version } })).status, 200);
   const sessionResponse = await register(`timing-approved-${randomUUID()}`, "https://example.test/partial-lifecycle", fields);
   assert.equal(sessionResponse.status, 201);
   const timingSession = (await sessionResponse.json()).data.pageSession;
   const instructions = await request("/api/v1/browser/instructions", {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: timingTask.id, timestamp: new Date().toISOString(), idempotencyKey: `timing-instructions-${randomUUID()}`, pageSessionId: timingSession.id },
   });
   assert.equal(instructions.status, 201);
   const issued = (await instructions.json()).data.execution;
   const [firstAction, secondAction] = issued.instruction.actions;
   const partial = await request(`/api/v1/browser/executions/${issued.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: timingTask.id, timestamp: new Date().toISOString(), idempotencyKey: `timing-partial-${randomUUID()}`, executionId: issued.id, actionId: issued.instruction.actionId, pageSessionId: timingSession.id, status: "PARTIAL", results: [{ fieldId: firstAction.fieldId, actionId: firstAction.actionId, actionType: firstAction.action, status: "SUCCESS" }, { fieldId: secondAction.fieldId, actionId: secondAction.actionId, actionType: secondAction.action, status: "FAILED", errorCode: "FIELD_NOT_FOUND" }] },
   });
   assert.equal(partial.status, 200);
   const changed = await register(`timing-changed-${randomUUID()}`, "https://example.test/partial-lifecycle?step=2", [{ ...fields[0] }, { ...fields[1], label: "Changed Second" }]);
   assert.equal(changed.status, 201);
   const approval = await prisma.approval.findFirst({ where: { formTaskId: timingTask.id, approvalType: "FORM_FILL" }, orderBy: { createdAt: "desc" } });
   const taskState = await prisma.formTask.findUnique({ where: { id: timingTask.id }, select: { status: true, version: true } });
   assert.equal(approval.status, "REVOKED");
   assert.equal(taskState.status, "REVIEW");
   const retry = await request(`/api/v1/browser/executions/${issued.id}/retry`, { method: "POST", headers: auth(), body: { taskId: timingTask.id, idempotencyKey: `timing-retry-${randomUUID()}`, pageSessionId: timingSession.id } });
   assert.equal(retry.status, 409);
   const staleAck = await request(`/api/v1/browser/executions/${issued.id}/acknowledge`, {
     method: "POST", headers: auth(),
     body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: timingTask.id, timestamp: new Date().toISOString(), idempotencyKey: `timing-late-${randomUUID()}`, executionId: issued.id, actionId: issued.instruction.actionId, pageSessionId: timingSession.id, status: "COMPLETED", results: [{ fieldId: secondAction.fieldId, actionId: secondAction.actionId, actionType: secondAction.action, status: "SUCCESS" }] },
   });
   assert.equal(staleAck.status, 409);
   const persisted = await prisma.browserExecution.findUnique({ where: { id: issued.id }, include: { results: true } });
   assert.equal(persisted.status, "PARTIAL");
   assert.equal(persisted.results.length, 2);
   assert.equal(persisted.results.filter((result) => result.status === "SUCCESS").length, 1);
 });

 test("invalidates approval for option, input-type, and URL lifecycle changes", async () => {
   const conversation = await prisma.conversation.findFirst({ where: { userId } });
   const cases = [
     { name: "options", initialType: "select", initialOptions: [{ value: "A", label: "Alpha" }, { value: "B", label: "Beta" }], changedType: "select", changedOptions: [{ value: "A", label: "Changed Alpha" }] },
     { name: "input-type", initialType: "text", initialOptions: undefined, changedType: "select", changedOptions: [{ value: "A", label: "Alpha" }] },
     { name: "url", initialType: "text", initialOptions: undefined, changedType: "text", changedOptions: undefined, changedUrl: "https://changed.example/lifecycle" },
   ];
   for (const lifecycleCase of cases) {
     const created = await request("/api/v1/form-tasks", {
       method: "POST", headers: auth(),
       body: { conversationId: conversation.id, title: `${lifecycleCase.name} lifecycle`, taskType: "APPLICATION", webpageUrl: `https://example.test/${lifecycleCase.name}` },
     });
     assert.equal(created.status, 201);
     const lifecycleTask = (await created.json()).data.task;
     const fieldBody = (type, options) => ({ fieldIdentifier: "lifecycle", label: "Lifecycle", elementType: type === "select" ? "select" : "input", inputType: type, options });
     const initialUrl = `https://example.test/${lifecycleCase.name}`;
     const register = (key, url, type, options) => request("/api/v1/browser/register", {
       method: "POST", headers: auth(),
       body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "TASK_REGISTER", taskId: lifecycleTask.id, timestamp: new Date().toISOString(), idempotencyKey: key, payload: { pageContext: { url, title: lifecycleCase.name, detectedAt: new Date().toISOString() }, fields: [fieldBody(type, options)] } },
     });
     assert.equal((await register(`initial-${randomUUID()}`, initialUrl, lifecycleCase.initialType, lifecycleCase.initialOptions)).status, 201);
     const lifecycleField = (await (await request(`/api/v1/form-tasks/${lifecycleTask.id}/fields`, { headers: auth() })).json()).data.fields[0];
     assert.equal((await request(`/api/v1/form-tasks/${lifecycleTask.id}/fields/${lifecycleField.id}/value`, { method: "PUT", headers: auth(), body: { value: lifecycleCase.initialType === "select" ? "A" : "Lifecycle", source: "USER_PROVIDED" } })).status, 201);
     assert.equal((await request(`/api/v1/form-tasks/${lifecycleTask.id}/fields/${lifecycleField.id}/approve`, { method: "POST", headers: auth(), body: {} })).status, 200);
     const version = (await prisma.formTask.findUnique({ where: { id: lifecycleTask.id }, select: { version: true } })).version;
     assert.equal((await request(`/api/v1/form-tasks/${lifecycleTask.id}/final-approval`, { method: "POST", headers: auth(), body: { expectedVersion: version } })).status, 200);
     const session = await register(`approved-${randomUUID()}`, initialUrl, lifecycleCase.initialType, lifecycleCase.initialOptions);
     assert.equal(session.status, 201);
     const sessionData = (await session.json()).data.pageSession;
     const instructions = await request("/api/v1/browser/instructions", { method: "POST", headers: auth(), body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FILL_INSTRUCTIONS_REQUEST", taskId: lifecycleTask.id, timestamp: new Date().toISOString(), idempotencyKey: `before-change-${randomUUID()}`, pageSessionId: sessionData.id } });
     assert.equal(instructions.status, 201);
     const execution = (await instructions.json()).data.execution;
     const action = execution.instruction.actions[0];
     const changed = await register(`changed-${randomUUID()}`, lifecycleCase.changedUrl ?? initialUrl, lifecycleCase.changedType, lifecycleCase.changedOptions);
     assert.equal(changed.status, 201);
     const approval = await prisma.approval.findFirst({ where: { formTaskId: lifecycleTask.id, approvalType: "FORM_FILL" }, orderBy: { createdAt: "desc" } });
     const state = await prisma.formTask.findUnique({ where: { id: lifecycleTask.id } });
     assert.equal(approval.status, "REVOKED");
     assert.ok(approval.invalidatedAt);
     assert.equal(state.status, "REVIEW");
     const staleAck = await request(`/api/v1/browser/executions/${execution.id}/acknowledge`, { method: "POST", headers: auth(), body: { protocolVersion: BROWSER_PROTOCOL_VERSION, messageId: randomUUID(), messageType: "FORM_FILL_ACK", taskId: lifecycleTask.id, timestamp: new Date().toISOString(), idempotencyKey: `stale-ack-${randomUUID()}`, executionId: execution.id, actionId: execution.instruction.actionId, pageSessionId: sessionData.id, status: "COMPLETED", results: [{ fieldId: action.fieldId, actionId: action.actionId, actionType: action.action, status: "SUCCESS" }] } });
     assert.equal(staleAck.status, 409);
   }
 });
