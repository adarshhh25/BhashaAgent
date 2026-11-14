import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Duplex } from "node:stream";
import { URL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { config } from "../../config/environment";
import { getOwnedConversation } from "../conversations/conversation.service";
import { consumeVoiceTicket } from "./voice.tickets";
import { isPcm16LeFrame, voiceProtocolMessageSchema, VOICE_PROTOCOL_VERSION } from "./voice.protocol";
import { GnaniPrismaAdapter, type SttProvider } from "./gnani.adapter";
import { HttpError } from "../../common/errors";
import { GnaniTimbreAdapter, type TtsProvider } from "./timbre.adapter";
import { defaultVoiceSessionRegistry, VoiceSessionRegistry, type VoiceSession } from "./voice.registry";
import { detectConversationLanguage, deduplicateConsecutiveWords } from "../agent/language-detector";
import { resolveVoiceTurnLanguage, logVoiceTurnLanguage } from "./voice-language";
import { sanitizeResponseText } from "../agent/agent.validator";

export type VoiceTranscriptHandler = (input: {
  userId: string;
  conversationId: string;
  voiceSessionId: string;
  providerSegmentId: string;
  content: string;
  language?: string;
  formTaskId?: string;
  signal?: AbortSignal;
}) => Promise<{ response: string; assistantMessageId: string; reused: boolean; language?: string; formActions?: unknown }>;

export function clearActiveVoiceSessions(): void {
  defaultVoiceSessionRegistry.clear();
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
  providerFactory: (language?: string) => SttProvider = (lang) => new GnaniPrismaAdapter(lang),
  transcriptHandler?: VoiceTranscriptHandler,
  ttsFactory: () => TtsProvider = () => new GnaniTimbreAdapter(),
  registry: VoiceSessionRegistry = defaultVoiceSessionRegistry,
): WebSocketServer {
  const gateway = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  registry.startHeartbeat();

  server.on("close", () => {
    registry.stopHeartbeat();
    for (const client of gateway.clients) client.close();
    gateway.close();
    registry.clear();
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

    // Allocate concurrency capacity atomically via VoiceSessionRegistry
    const allocation = registry.acquireSessionSlot(identity.userId, identity.conversationId, identity.formTaskId, identity.language);
    if (!allocation.allowed) {
      console.warn(`[VoiceGateway] Upgrade rejected: max concurrent voice sessions reached for user ${identity.userId}`);
      rejectUpgrade(socket, 429, "Too Many Requests", "Max active voice sessions reached");
      return;
    }

    const session = allocation.session;

    try {
      const provider = providerFactory(session.language);
      gateway.handleUpgrade(request, socket, head, (client) => {
        gateway.emit("connection", client, request, session, provider);
      });
    } catch {
      registry.releaseSession(session.sessionId, "UPGRADE_FAILED", "FAILED");
      rejectUpgrade(socket, 500, "Internal Server Error", "Speech provider initialization failed");
    }
  });

  gateway.on("connection", (socket: WebSocket, _request: IncomingMessage, session: VoiceSession, provider: SttProvider) => {
    let started = false;
    let providerReady = false;
    let closed = false;
    let audioFrameCount = 0;
    let firstFrameReceived = false;
    let activeFormTaskId = session.formTaskId;
    const voiceSessionId = session.sessionId;
    const tts = ttsFactory();
    let ttsBusy = false;
    const seenSegments = new Set<string>();
    const activeTurnControllers = new Map<string, AbortController>();

    registry.attachResources(voiceSessionId, socket, provider, tts);

    console.log(`[VoiceGateway][${voiceSessionId}] Client connected to voice gateway for conversation=${session.conversationId}, formTask=${activeFormTaskId ?? 'none'}`);

    const cleanup = (reason: string = "CONNECTION_CLEANUP") => {
      if (closed) return;
      closed = true;
      for (const [segId, controller] of activeTurnControllers) {
        console.log(`[VoiceGateway][${voiceSessionId}] Aborting turn segmentId=${segId} due to ${reason}`);
        controller.abort();
      }
      activeTurnControllers.clear();
      registry.releaseSession(voiceSessionId, reason);
      console.log(`[VoiceGateway][${voiceSessionId}] Voice session cleaned up, totalAudioFrames=${audioFrameCount}`);
    };

    const fail = (code: string, message: string) => {
      console.error(`[VoiceGateway][${voiceSessionId}] Voice session failure: code=${code}, message=${message}`);
      send(socket, "ERROR", { error: errorMessage(code, message) });
      registry.transitionState(voiceSessionId, "FAILED", code);
      cleanup(`FAILED_${code}`);
      socket.close(1011);
    };

    provider.onClose(() => {
      if (!closed) {
        console.warn(`[VoiceGateway][${voiceSessionId}] Provider disconnected unexpectedly`);
        send(socket, "ERROR", { error: errorMessage("PROVIDER_DISCONNECTED", "Speech provider disconnected") });
        cleanup("PROVIDER_DISCONNECTED");
        socket.close();
      }
    });

    provider.onEvent((event) => {
      if (closed) return;
      if (event.type === "connected") {
        providerReady = true;
        registry.transitionState(voiceSessionId, "ACTIVE", "PROVIDER_READY");
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
        const cleanTranscriptText = deduplicateConsecutiveWords(event.text);
        console.log(`[VoiceGateway][${voiceSessionId}] Final transcript received: segmentId=${event.segmentId}, durationMs=${event.audioDurationMs}, language=${event.detectedLanguageCode || 'auto'}, text="${cleanTranscriptText}"`);
        send(socket, "TRANSCRIPT", { sessionState: "READY", transcript: { text: cleanTranscriptText, timestamp: event.timestamp, audioDurationMs: event.audioDurationMs, segmentId: event.segmentId, segmentIndex: event.segmentIndex, latencyMs: event.latencyMs, detectedLanguageCode: event.detectedLanguageCode, utteranceId: event.utteranceId, isFinal: true } });
        if (transcriptHandler) {
          const turnLangCtx = resolveVoiceTurnLanguage(cleanTranscriptText, session.language, event.detectedLanguageCode);
          logVoiceTurnLanguage(turnLangCtx);
          console.log(`[VoiceGateway][${voiceSessionId}] Turn language resolved: text="${cleanTranscriptText.slice(0, 40)}", preferredLang=${session.language || 'none'}, providerLang=${event.detectedLanguageCode || 'auto'}, detectedTurnLang=${turnLangCtx.detectedLanguage}, effectiveLang=${turnLangCtx.effectiveLanguage}, formTaskId=${activeFormTaskId ?? 'none'}`);

          const turnAbortController = new AbortController();
          activeTurnControllers.set(event.segmentId, turnAbortController);

          void transcriptHandler({
            userId: session.userId,
            conversationId: session.conversationId,
            voiceSessionId,
            providerSegmentId: event.segmentId,
            content: cleanTranscriptText,
            language: turnLangCtx.effectiveLanguage,
            formTaskId: activeFormTaskId,
            signal: turnAbortController.signal,
          }).then((result) => {
            if (!closed && !turnAbortController.signal.aborted) {
              const actionsCount = Array.isArray((result as any).formActions) ? (result as any).formActions.length : 0;
              const responseLang = turnLangCtx.responseLanguage;
              const cleanResponse = sanitizeResponseText(result.response, responseLang);
              console.log(`[VoiceGateway][${voiceSessionId}] Dispatched assistant response for segmentId=${event.segmentId}, responseLang=${responseLang}, formActionsCount=${actionsCount}`);
              send(socket, "ASSISTANT_RESPONSE", {
                conversationId: session.conversationId,
                assistantMessageId: result.assistantMessageId,
                response: cleanResponse,
                reused: result.reused,
                language: responseLang,
                formActions: (result as { formActions?: unknown }).formActions,
              });
              if (!ttsBusy) {
                ttsBusy = true;
                void tts.synthesize(cleanResponse, turnLangCtx.ttsLanguageCode).catch((error: unknown) => {
                  ttsBusy = false;
                  if (!closed && !turnAbortController.signal.aborted) send(socket, "ERROR", { error: { code: error instanceof HttpError ? error.code : "TTS_FAILED", message: error instanceof HttpError ? error.message : "Text-to-speech failed" } });
                });
              } else {
                send(socket, "ERROR", { error: { code: "TTS_BUSY", message: "Audio synthesis is already in progress" } });
              }
            }
          }).catch((error: unknown) => {
            if (turnAbortController.signal.aborted || (error instanceof HttpError && error.code === "REQUEST_CANCELLED")) {
              console.log(`[VoiceGateway][${voiceSessionId}] Turn cancelled cleanly for segmentId=${event.segmentId}`);
              return;
            }
            console.error(`[VoiceGateway][${voiceSessionId}] Voice turn failed:`, error);
            if (!closed) {
              const code = error instanceof HttpError ? error.code : "VOICE_TURN_FAILED";
              const message = error instanceof HttpError ? error.message : "Voice turn failed";
              send(socket, "ERROR", { error: { code, message } });
            }
          }).finally(() => {
            activeTurnControllers.delete(event.segmentId);
          });
        }
      } else if (event.type === "error") {
        const msg = (event.message || "").toLowerCase();
        if (msg.includes("no speech segment") || msg.includes("60 second") || msg.includes("idle") || msg.includes("inactivity")) {
          console.log(`[VoiceGateway][${voiceSessionId}] Suppressing provider idle silence notification: ${event.message}`);
          return;
        }
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
        if (started || message.data.conversationId !== session.conversationId) return fail("INVALID_SESSION", "Voice session is already started or conversation is invalid");
        if (message.data.formTaskId) {
          activeFormTaskId = message.data.formTaskId;
          console.log(`[VoiceGateway][${voiceSessionId}] Active form task updated from START message: ${activeFormTaskId}`);
        }
        try {
          const conversation = await getOwnedConversation(session.userId, session.conversationId);
          if (conversation.status !== "ACTIVE") return fail("CONVERSATION_NOT_ACTIVE", "Only active conversations can use voice sessions");

          console.log(`[VoiceGateway][${voiceSessionId}] STT connection attempt: connecting to speech provider`);
          send(socket, "SESSION_STATE", { sessionState: "CONNECTING" });
          registry.transitionState(voiceSessionId, "CONNECTING", "START_REQUEST");
          await provider.connect();
          console.log(`[VoiceGateway][${voiceSessionId}] Provider transport connected, awaiting configuration validation`);
          started = true;
        } catch (err: unknown) {
          console.error(`[VoiceGateway][${voiceSessionId}] Provider connection failure: ${err instanceof Error ? err.message : 'Speech provider is unavailable'}`);
          fail("PROVIDER_UNAVAILABLE", "Speech provider is unavailable");
        }
      } else if (message.data.messageType === "STOP" || message.data.messageType === "CANCEL") {
        console.log(`[VoiceGateway][${voiceSessionId}] Client requested session stop/cancel`);
        registry.transitionState(voiceSessionId, "CLOSING", "CLIENT_STOP");
        send(socket, "SESSION_CLOSED", { sessionState: "CLOSED" });
        clearTimeout(maxSessionTimer);
        cleanup("CLIENT_STOP");
        try {
          if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
            socket.close();
          }
        } catch {}
      } else if (message.data.messageType === "UPDATE_FORM_TASK") {
        activeFormTaskId = message.data.formTaskId ?? undefined;
        console.log(`[VoiceGateway][${voiceSessionId}] Active form task updated dynamically: ${activeFormTaskId ?? 'none'}`);
      }
    });

    socket.on("close", (code, reason) => {
      clearTimeout(maxSessionTimer);
      cleanup(`SOCKET_CLOSED_${code}_${reason ? reason.toString() : 'none'}`);
    });

    socket.on("error", (err) => {
      cleanup(`SOCKET_ERROR_${err.message}`);
    });
  });

  return gateway;
}
