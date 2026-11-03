require("../support/environment");
require("dotenv/config");

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const { randomUUID } = require("node:crypto");
const WebSocket = require("ws");
const { app } = require("../../dist/server");
const { prisma } = require("../../dist/config/database");
const { createAccessToken } = require("../../dist/modules/auth/token.service");
const { attachVoiceGateway, clearActiveVoiceSessions } = require("../../dist/modules/voice/voice.gateway");
const { processVoiceTranscript } = require("../../dist/modules/agent/agent.service");
const { setLLMProviderForTests } = require("../../dist/modules/llm/llm.factory");
const { config } = require("../../dist/config/environment");
const { isPcm16LeFrame, VOICE_PROTOCOL_VERSION } = require("../../dist/modules/voice/voice.protocol");

class FakeProvider {
  constructor() {
    this.events = () => undefined;
    this.closed = false;
    this.frames = [];
  }
  async connect() {
    this.events({ type: "connected" });
  }
  sendFrame(frame) {
    this.frames.push(Buffer.from(frame));
  }
  close() {
    this.closed = true;
  }
  onEvent(listener) {
    this.events = listener;
  }
  onClose(listener) {
    this.closedEvent = listener;
  }
}

class FakeTtsProvider {
  constructor() {
    this.events = () => undefined;
    this.closed = false;
  }
  async synthesize() {
    this.events({ type: "start", requestId: "tts-request-1" });
    this.events({ type: "audio", chunkIndex: 0, audio: Buffer.from([1, 2, 3]) });
    this.events({ type: "complete", chunkIndex: 1 });
  }
  close() { this.closed = true; }
  onEvent(listener) { this.events = listener; }
  onClose() {}
}

let server;
let baseUrl;
let user;
let conversation;
let token;
let providers;
let ttsProviders;

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

function testRawUpgrade(path) {
  return new Promise((resolve) => {
    const port = server.address().port;
    const req = http.request({
      port,
      host: "127.0.0.1",
      path,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      },
    });
    req.on("response", (res) => {
      resolve({ statusCode: res.statusCode });
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve({ statusCode: res.statusCode });
    });
    req.on("error", () => {
      resolve({ statusCode: 0 });
    });
    req.end();
  });
}

const messageQueues = new WeakMap();
function nextMessage(socket, label = "message") {
  let state = messageQueues.get(socket);
  if (!state) {
    state = { queue: [], waiters: [] };
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      const waiter = state.waiters.shift();
      if (waiter) waiter(message); else state.queue.push(message);
    });
    messageQueues.set(socket, state);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 5000);
    if (state.queue.length) {
      clearTimeout(timer);
      resolve(state.queue.shift());
      return;
    }
    state.waiters.push((message) => { clearTimeout(timer); resolve(message); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function ticket() {
  const response = await request("/api/v1/voice/tickets", { method: "POST", headers: auth(), body: { conversationId: conversation.id } });
  assert.equal(response.status, 201);
  return (await response.json()).data.voice.ticket;
}

test.before(async () => {
  providers = [];
  ttsProviders = [];
  setLLMProviderForTests({
    async generateResponse() {
      return {
        content: JSON.stringify({
          intent: { primary: "GREETING", secondary: [], confidence: 0.99 },
          language: { detected: "hi", responseLanguage: "hi" },
          decision: { type: "respond" },
          toolCalls: [],
          responseDraft: "नमस्ते! मैं कैसे मदद कर सकता हूँ?",
        }),
        toolCalls: [],
      };
    },
    async healthCheck() { return { available: true, provider: "test" }; },
  });
  server = http.createServer(app);
  attachVoiceGateway(server, () => {
    const provider = new FakeProvider();
    providers.push(provider);
    return provider;
  }, processVoiceTranscript, () => {
    const provider = new FakeTtsProvider();
    ttsProviders.push(provider);
    return provider;
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registered = await request("/api/v1/auth/register", {
    method: "POST",
    body: { fullName: "Voice Test User", email: `voice-${suffix}@example.test`, password: "Voice Test Password" },
  });
  user = (await registered.json()).data.user;
  token = createAccessToken(user.id);
  conversation = await prisma.conversation.create({ data: { userId: user.id, title: "Voice test conversation" } });
});

test.after(async () => {
  await prisma.conversation.deleteMany({ where: { userId: user.id } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.auditLog.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("validates the Phase 10A audio contract and provider configuration", () => {
  assert.equal(config.gnani.endpoint, "wss://api.vachana.ai/stt/v3/stream");
  assert.equal(config.gnani.model, "prisma-v3.0");
  assert.equal(config.gnani.languageCode, "indic-auto");
  assert.equal(config.gnani.format, "verbatim");
  assert.equal(config.gnani.sampleRate, 16000);
  assert.equal(config.gnani.frameBytes, 1024);
  assert.equal(isPcm16LeFrame(Buffer.alloc(1024)), true);
  assert.equal(isPcm16LeFrame(Buffer.alloc(1023)), false);
  assert.equal(isPcm16LeFrame(Buffer.from(`RIFF${"0".repeat(1020)}`)), false);
  assert.equal(isPcm16LeFrame(Buffer.from(`ID3${"0".repeat(1021)}`)), false);
});

test("requires ownership and a single-use ticket before opening a voice session", async () => {
  const missing = await request("/api/v1/voice/tickets", { method: "POST", headers: auth(), body: { conversationId: randomUUID() } });
  assert.equal(missing.status, 404);
  const ticketValue = await ticket();
  const first = new WebSocket(`${baseUrl.replace("http", "ws")}/api/v1/voice?ticket=${encodeURIComponent(ticketValue)}`);
  await new Promise((resolve, reject) => { first.once("open", resolve); first.once("error", reject); });
  first.close();
  const reused = new WebSocket(`${baseUrl.replace("http", "ws")}/api/v1/voice?ticket=${encodeURIComponent(ticketValue)}`);
  await new Promise((resolve) => { reused.once("close", resolve); reused.once("error", resolve); });
});

test("streams exact PCM frames and normalizes deduplicated provider transcripts", async () => {
  const ticketValue = await ticket();
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/api/v1/voice?ticket=${encodeURIComponent(ticketValue)}`);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.send(JSON.stringify({ protocolVersion: VOICE_PROTOCOL_VERSION, messageType: "START", conversationId: conversation.id }));
  const connecting = await nextMessage(socket, "connecting");
  assert.equal(connecting.messageType, "SESSION_STATE");
  const ready = await nextMessage(socket, "ready");
  assert.equal(ready.messageType, "SESSION_READY");
  const provider = providers.at(-1);
  const frame = Buffer.alloc(1024);
  socket.send(frame);
  for (let attempt = 0; attempt < 20 && provider.frames.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(provider.frames.length, 1);
  assert.equal(provider.frames[0].equals(frame), true);
  provider.events({ type: "processing" });
  assert.equal((await nextMessage(socket, "processing")).messageType, "PROCESSING");
  const transcript = { type: "transcript", timestamp: new Date().toISOString(), text: "नमस्ते hello", audioDurationMs: 512, segmentId: "segment-1", segmentIndex: 1, latencyMs: 42, detectedLanguageCode: "hi-IN", utteranceId: "utterance-1" };
  provider.events(transcript);
  const message = await nextMessage(socket, "transcript");
  assert.equal(message.messageType, "TRANSCRIPT");
  assert.equal(message.transcript.text, transcript.text);
  assert.equal(message.transcript.detectedLanguageCode, "hi-IN");
  const assistant = await nextMessage(socket, "assistant response");
  assert.equal(assistant.messageType, "ASSISTANT_RESPONSE", JSON.stringify(assistant));
  assert.equal(assistant.response, "नमस्ते! मैं कैसे मदद कर सकता हूँ?");
  assert.equal((await nextMessage(socket, "audio start")).messageType, "AUDIO_START");
  const audio = await nextMessage(socket, "audio chunk");
  assert.equal(audio.messageType, "AUDIO_CHUNK");
  assert.equal(audio.audio, Buffer.from([1, 2, 3]).toString("base64"));
  assert.equal((await nextMessage(socket, "audio complete")).messageType, "AUDIO_COMPLETE");
  const persisted = await prisma.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" } });
  assert.equal(persisted.filter((item) => item.role === "USER" && item.content === transcript.text).length, 1);
  assert.equal(persisted.filter((item) => item.role === "ASSISTANT" && item.metadata?.voice?.idempotencyKey).length, 1);
  assert.equal(persisted[0].content, transcript.text);
  assert.equal(persisted[0].inputMode, "VOICE");
  assert.equal(persisted[0].language, "hi-IN");
  provider.events(transcript);
  socket.send(JSON.stringify({ protocolVersion: VOICE_PROTOCOL_VERSION, messageType: "STOP" }));
  assert.equal((await nextMessage(socket, "closed")).messageType, "SESSION_CLOSED");
  assert.equal(provider.closed, true);
  socket.close();
});

test("durably deduplicates concurrent and completed voice segment processing", async () => {
  const input = {
    userId: user.id,
    conversationId: conversation.id,
    voiceSessionId: randomUUID(),
    providerSegmentId: "direct-segment-1",
    content: "same segment",
    language: "en",
  };
  const idempotencyKey = `${input.userId}:${input.conversationId}:${input.voiceSessionId}:${input.providerSegmentId}`;
  const results = await Promise.allSettled([processVoiceTranscript(input), processVoiceTranscript(input)]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.ok(fulfilled.length === 1 || fulfilled.length === 2, JSON.stringify(results));
  if (fulfilled.length === 2) {
    assert.equal(fulfilled[0].value.assistantMessageId, fulfilled[1].value.assistantMessageId);
  } else {
    assert.equal(rejected[0].reason.code, "VOICE_TURN_IN_PROGRESS");
  }
  const retry = await processVoiceTranscript(input);
  assert.equal(retry.reused, true);
  const persisted = await prisma.message.findMany({ where: { conversationId: conversation.id } });
  assert.equal(persisted.filter((item) => item.role === "USER" && item.content === input.content).length, 1);
  assert.equal(persisted.filter((item) => item.role === "ASSISTANT" && item.metadata?.voice?.idempotencyKey === idempotencyKey).length, 1);
});

test("rejects audio before provider readiness and malformed frames", async () => {
  const ticketValue = await ticket();
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/api/v1/voice?ticket=${encodeURIComponent(ticketValue)}`);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.send(Buffer.alloc(1024));
  const error = await nextMessage(socket, "error");
  assert.equal(error.messageType, "ERROR");
  assert.equal(error.error.code, "SESSION_NOT_READY");
  socket.close();
});

test("rejects ticket generation for deleted conversation with HTTP 410", async () => {
  const deletedConv = await prisma.conversation.create({
    data: { userId: user.id, title: "Deleted Conv", status: "DELETED", deletedAt: new Date() },
  });
  const res = await request("/api/v1/voice/tickets", {
    method: "POST",
    headers: auth(),
    body: { conversationId: deletedConv.id },
  });
  assert.equal(res.status, 410);
  const json = await res.json();
  assert.equal(json.error.code, "CONVERSATION_DELETED");
});

test("rejects ticket generation for conversation owned by another user with HTTP 404", async () => {
  const otherUser = await prisma.user.create({
    data: {
      email: `other-${Date.now()}@test.local`,
      passwordHash: "hash",
      fullName: "Other User",
    },
  });
  const otherConv = await prisma.conversation.create({
    data: { userId: otherUser.id, title: "Other Conv" },
  });
  const res = await request("/api/v1/voice/tickets", {
    method: "POST",
    headers: auth(),
    body: { conversationId: otherConv.id },
  });
  assert.equal(res.status, 404);
  await prisma.conversation.delete({ where: { id: otherConv.id } });
  await prisma.user.delete({ where: { id: otherUser.id } });
});

test("handles WebSocket upgrade rejection with HTTP 401 on missing or invalid ticket", async () => {
  const noTicket = await testRawUpgrade("/api/v1/voice");
  assert.equal(noTicket.statusCode, 401);

  const invalidTicket = await testRawUpgrade("/api/v1/voice?ticket=completely-invalid-ticket");
  assert.equal(invalidTicket.statusCode, 401);
});

test("handles WebSocket upgrade rejection with HTTP 404 on bad path", async () => {
  const ticketValue = await ticket();
  const badPath = await testRawUpgrade(`/api/v1/wrong-voice-endpoint?ticket=${encodeURIComponent(ticketValue)}`);
  assert.equal(badPath.statusCode, 404);
});

test("returns HTTP 101 Switching Protocols on valid WebSocket upgrade", async () => {
  const ticketValue = await ticket();
  const valid = await testRawUpgrade(`/api/v1/voice?ticket=${encodeURIComponent(ticketValue)}`);
  assert.equal(valid.statusCode, 101);
});

test("enforces MAX_ACTIVE_PER_USER with HTTP 429", async () => {
  clearActiveVoiceSessions();

  const t1 = await ticket();
  const s1 = new WebSocket(`${baseUrl.replace("http", "ws")}/api/v1/voice?ticket=${encodeURIComponent(t1)}`);
  await new Promise((res, rej) => { s1.once("open", res); s1.once("error", rej); });

  const t2 = await ticket();
  const s2 = new WebSocket(`${baseUrl.replace("http", "ws")}/api/v1/voice?ticket=${encodeURIComponent(t2)}`);
  await new Promise((res, rej) => { s2.once("open", res); s2.once("error", rej); });

  const t3 = await ticket();
  const thirdUpgrade = await testRawUpgrade(`/api/v1/voice?ticket=${encodeURIComponent(t3)}`);
  assert.equal(thirdUpgrade.statusCode, 429);

  s1.close();
  s2.close();
  await new Promise((r) => setTimeout(r, 100));
  clearActiveVoiceSessions();
});

test("handles provider error events with sanitized codes and messages", async () => {
  const ticketValue = await ticket();
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/api/v1/voice?ticket=${encodeURIComponent(ticketValue)}`);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.send(JSON.stringify({ protocolVersion: VOICE_PROTOCOL_VERSION, messageType: "START", conversationId: conversation.id }));
  await nextMessage(socket, "connecting");
  await nextMessage(socket, "ready");

  const provider = providers.at(-1);
  provider.events({ type: "error", code: "PROVIDER_RATE_LIMITED", message: "Speech rate limit exceeded" });

  const errorMsg = await nextMessage(socket, "error");
  assert.equal(errorMsg.messageType, "ERROR");
  assert.equal(errorMsg.error.code, "PROVIDER_RATE_LIMITED");
  assert.equal(errorMsg.error.message, "Speech rate limit exceeded");
  socket.close();
});

test("parses provider transcript events with floating duration and latency", async () => {
  const ticketValue = await ticket();
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/api/v1/voice?ticket=${encodeURIComponent(ticketValue)}`);
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  socket.send(JSON.stringify({ protocolVersion: VOICE_PROTOCOL_VERSION, messageType: "START", conversationId: conversation.id }));
  await nextMessage(socket, "connecting");
  await nextMessage(socket, "ready");

  const provider = providers.at(-1);
  const transcript = {
    type: "transcript",
    timestamp: new Date().toISOString(),
    text: "परीक्षण सफल",
    audioDurationMs: 2720.5,
    segmentId: "float-segment-1",
    segmentIndex: 1,
    latencyMs: 445.2,
    detectedLanguageCode: "hi-IN",
    utteranceId: "float-utterance-1",
  };
  provider.events(transcript);

  const message = await nextMessage(socket, "transcript");
  assert.equal(message.messageType, "TRANSCRIPT");
  assert.equal(message.transcript.audioDurationMs, 2720.5);
  assert.equal(message.transcript.latencyMs, 445.2);
  socket.close();
});
