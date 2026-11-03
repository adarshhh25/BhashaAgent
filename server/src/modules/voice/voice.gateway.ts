import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { config } from "../../config/environment";
import { getOwnedConversation } from "../conversations/conversation.service";
import { consumeVoiceTicket } from "./voice.tickets";
import { isPcm16LeFrame, voiceProtocolMessageSchema, VOICE_PROTOCOL_VERSION } from "./voice.protocol";
import { GnaniPrismaAdapter, type SttProvider } from "./gnani.adapter";
import { randomUUID } from "node:crypto";
import { HttpError } from "../../common/errors";
import { GnaniTimbreAdapter, type TtsProvider } from "./timbre.adapter";

export type VoiceTranscriptHandler = (input: {
  userId: string;
  conversationId: string;
  voiceSessionId: string;
  providerSegmentId: string;
  content: string;
  language?: string;
}) => Promise<{ response: string; assistantMessageId: string; reused: boolean }>;

const MAX_ACTIVE_PER_USER = 2;
const activeSessions = new Map<string, number>();

export function clearActiveVoiceSessions(): void {
  activeSessions.clear();
}

function send(socket: WebSocket, messageType: string, payload: Record<string, unknown> = {}): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ protocolVersion: VOICE_PROTOCOL_VERSION, messageType, ...payload }));
}

function errorMessage(code: string, message: string): Record<string, unknown> {
  return { code, message };
}

function rejectUpgrade(socket: Duplex, statusCode: number, statusText: string, message?: string): void {
  try {
    if (socket.writable) {
      const body = message ?? statusText;
      socket.write(
        `HTTP/1.1 ${statusCode} ${statusText}\r\n` +
        `Connection: close\r\n` +
        `Content-Type: text/plain\r\n` +
        `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
        `${body}`,
      );
    }
  } catch {
    // Ignore socket write errors
  } finally {
    socket.destroy();
  }
}

export function attachVoiceGateway(
  server: HttpServer,
  providerFactory: () => SttProvider = () => new GnaniPrismaAdapter(),
  transcriptHandler?: VoiceTranscriptHandler,
  ttsFactory: () => TtsProvider = () => new GnaniTimbreAdapter(),
): WebSocketServer {
  const gateway = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on("close", () => {
    for (const client of gateway.clients) client.close();
    gateway.close();
  });
  server.on("upgrade", (request, socket, head) => {
    let url: URL;
    try {
      url = new URL(request.url ?? "", "http://localhost");
    } catch {
      rejectUpgrade(socket, 400, "Bad Request", "Invalid upgrade URL");
      return;
    }
    if (url.pathname !== "/api/v1/voice") {
      rejectUpgrade(socket, 404, "Not Found", "Path not found");
      return;
    }
    const ticket = url.searchParams.get("ticket");
    if (!ticket) {
      console.warn("[VoiceGateway] Upgrade rejected: missing ticket");
      rejectUpgrade(socket, 401, "Unauthorized", "Missing voice ticket");
      return;
    }
    const identity = consumeVoiceTicket(ticket);
    if (!identity) {
      console.warn("[VoiceGateway] Upgrade rejected: invalid or expired ticket");
      rejectUpgrade(socket, 401, "Unauthorized", "Invalid or expired voice ticket");
      return;
    }
    const current = activeSessions.get(identity.userId) ?? 0;
    if (current >= MAX_ACTIVE_PER_USER) {
      console.warn(`[VoiceGateway] Upgrade rejected: max concurrent voice sessions reached for user ${identity.userId}`);
      rejectUpgrade(socket, 429, "Too Many Requests", "Max active voice sessions reached");
      return;
    }
    activeSessions.set(identity.userId, current + 1);

    try {
      const provider = providerFactory();
      gateway.handleUpgrade(request, socket, head, (client) => {
        gateway.emit("connection", client, request, identity, provider);
      });
    } catch {
      const count = activeSessions.get(identity.userId) ?? 1;
      if (count <= 1) activeSessions.delete(identity.userId);
      else activeSessions.set(identity.userId, count - 1);
      rejectUpgrade(socket, 500, "Internal Server Error", "Speech provider initialization failed");
    }
  });

  gateway.on("connection", (socket: WebSocket, _request: IncomingMessage, identity: { userId: string; conversationId: string }, provider: SttProvider) => {
    let started = false;
    let providerReady = false;
    let closed = false;
    let audioFrameCount = 0;
    let firstFrameReceived = false;
    const voiceSessionId = randomUUID();
    const tts = ttsFactory();
    let ttsBusy = false;
    const seenSegments = new Set<string>();

    console.log(`[VoiceGateway][${voiceSessionId}] Client connected to voice gateway for conversation=${identity.conversationId}`);

    const cleanup = () => {
      if (closed) return;
      closed = true;
      try { provider.close(); } catch {}
      try { tts.close(); } catch {}
      const count = activeSessions.get(identity.userId) ?? 1;
      if (count <= 1) activeSessions.delete(identity.userId); else activeSessions.set(identity.userId, count - 1);
      console.log(`[VoiceGateway][${voiceSessionId}] Voice session cleaned up, totalAudioFrames=${audioFrameCount}`);
    };

    const fail = (code: string, message: string) => {
      console.error(`[VoiceGateway][${voiceSessionId}] Voice session failure: code=${code}, message=${message}`);
      send(socket, "ERROR", { error: errorMessage(code, message) });
      cleanup();
      socket.close(1011);
    };

    provider.onClose(() => {
      if (!closed) {
        console.warn(`[VoiceGateway][${voiceSessionId}] Provider disconnected unexpectedly`);
        send(socket, "ERROR", { error: errorMessage("PROVIDER_DISCONNECTED", "Speech provider disconnected") });
        cleanup();
        socket.close();
      }
    });

    provider.onEvent((event) => {
      if (closed) return;
      if (event.type === "connected") {
        providerReady = true;
        console.log(`[VoiceGateway][${voiceSessionId}] Provider session ready, dispatching SESSION_READY`);
        send(socket, "SESSION_READY", { sessionState: "READY" });
      }
      else if (event.type === "speech_start") {
        console.log(`[VoiceGateway][${voiceSessionId}] Provider speech start detected`);
        send(socket, "SPEECH_START", { sessionState: "LISTENING" });
      }
      else if (event.type === "processing") {
        console.log(`[VoiceGateway][${voiceSessionId}] Provider processing audio`);
        send(socket, "PROCESSING", { sessionState: "PROCESSING" });
      }
      else if (event.type === "partial") {
        console.log(`[VoiceGateway][${voiceSessionId}] First partial transcript received`);
      }
      else if (event.type === "transcript" && !seenSegments.has(event.segmentId)) {
        seenSegments.add(event.segmentId);
        console.log(`[VoiceGateway][${voiceSessionId}] Final transcript received: segmentId=${event.segmentId}, durationMs=${event.audioDurationMs}, language=${event.detectedLanguageCode || 'auto'}`);
        send(socket, "TRANSCRIPT", { sessionState: "READY", transcript: { text: event.text, timestamp: event.timestamp, audioDurationMs: event.audioDurationMs, segmentId: event.segmentId, segmentIndex: event.segmentIndex, latencyMs: event.latencyMs, detectedLanguageCode: event.detectedLanguageCode, utteranceId: event.utteranceId, isFinal: true } });
        if (transcriptHandler) {
          void transcriptHandler({
            userId: identity.userId,
            conversationId: identity.conversationId,
            voiceSessionId,
            providerSegmentId: event.segmentId,
            content: event.text,
            language: event.detectedLanguageCode,
          }).then((result) => {
            if (!closed) {
              console.log(`[VoiceGateway][${voiceSessionId}] Dispatched assistant response for segmentId=${event.segmentId}`);
              send(socket, "ASSISTANT_RESPONSE", { conversationId: identity.conversationId, assistantMessageId: result.assistantMessageId, response: result.response, reused: result.reused });
              if (!ttsBusy) {
                ttsBusy = true;
                void tts.synthesize(result.response).catch((error: unknown) => {
                  ttsBusy = false;
                  if (!closed) send(socket, "ERROR", { error: { code: error instanceof HttpError ? error.code : "TTS_FAILED", message: error instanceof HttpError ? error.message : "Text-to-speech failed" } });
                });
              } else {
                send(socket, "ERROR", { error: { code: "TTS_BUSY", message: "Audio synthesis is already in progress" } });
              }
            }
          }).catch((error: unknown) => {
            if (!closed) send(socket, "ERROR", { error: { code: error instanceof HttpError ? error.code : "VOICE_TURN_FAILED", message: error instanceof HttpError ? error.message : "Voice turn failed" } });
          });
        }
      } else if (event.type === "error") {
        console.error(`[VoiceGateway][${voiceSessionId}] Forwarding provider error to client: code=${event.code}, message=${event.message}`);
        fail(event.code, event.message);
      }
    });

    tts.onEvent((event) => {
      if (closed) return;
      if (event.type === "start") send(socket, "AUDIO_START", { requestId: event.requestId });
      else if (event.type === "audio") {
        send(socket, "AUDIO_CHUNK", { chunkIndex: event.chunkIndex, audio: event.audio.toString("base64") });
      } else if (event.type === "complete") {
        ttsBusy = false;
        send(socket, "AUDIO_COMPLETE", { chunkIndex: event.chunkIndex });
      } else {
        ttsBusy = false;
        send(socket, "ERROR", { error: { code: event.code, message: event.message } });
      }
    });

    const maxSessionTimer = setTimeout(() => fail("SESSION_EXPIRED", "Voice session expired"), config.gnani.maxSessionMs);

    socket.on("message", async (data, isBinary) => {
      if (closed) return;
      if (isBinary) {
        if (!started || !providerReady) return fail("SESSION_NOT_READY", "Speech provider is not ready");
        const frame = Buffer.from(data as Buffer);
        if (!isPcm16LeFrame(frame)) return fail("INVALID_AUDIO_FRAME", "Audio must be one 1,024-byte PCM16LE frame");

        audioFrameCount++;
        if (!firstFrameReceived) {
          firstFrameReceived = true;
          console.log(`[VoiceGateway][${voiceSessionId}] First audio frame received: byteLength=${frame.length}, sampleRate=16000`);
        } else if (audioFrameCount % 50 === 0) {
          console.log(`[VoiceGateway][${voiceSessionId}] Audio frames streamed: count=${audioFrameCount}, byteLength=${frame.length}, sampleRate=16000`);
        }

        try { provider.sendFrame(frame); } catch { fail("PROVIDER_NOT_READY", "Speech provider is not ready"); }
        return;
      }

      let parsed: unknown;
      try { parsed = JSON.parse(data.toString()); } catch { fail("INVALID_MESSAGE", "Invalid voice protocol message"); return; }
      const message = voiceProtocolMessageSchema.safeParse(parsed);
      if (!message.success) { fail("INVALID_MESSAGE", "Invalid voice protocol message"); return; }

      if (message.data.messageType === "START") {
        if (started || message.data.conversationId !== identity.conversationId) return fail("INVALID_SESSION", "Voice session is already started or conversation is invalid");
        try {
          const conversation = await getOwnedConversation(identity.userId, identity.conversationId);
          if (conversation.status !== "ACTIVE") return fail("CONVERSATION_NOT_ACTIVE", "Only active conversations can use voice sessions");

          console.log(`[VoiceGateway][${voiceSessionId}] STT connection attempt: connecting to speech provider`);
          send(socket, "SESSION_STATE", { sessionState: "CONNECTING" });
          await provider.connect();
          console.log(`[VoiceGateway][${voiceSessionId}] Provider connection success`);
          started = true;
        } catch (err: unknown) {
          console.error(`[VoiceGateway][${voiceSessionId}] Provider connection failure: ${err instanceof Error ? err.message : 'Speech provider is unavailable'}`);
          fail("PROVIDER_UNAVAILABLE", "Speech provider is unavailable");
        }
      } else if (message.data.messageType === "STOP" || message.data.messageType === "CANCEL") {
        console.log(`[VoiceGateway][${voiceSessionId}] Client requested session stop/cancel`);
        cleanup();
        clearTimeout(maxSessionTimer);
        send(socket, "SESSION_CLOSED", { sessionState: "CLOSED" });
        socket.close();
      }
    });

    socket.on("close", () => { clearTimeout(maxSessionTimer); cleanup(); });
    socket.on("error", cleanup);
  });
  return gateway;
}
