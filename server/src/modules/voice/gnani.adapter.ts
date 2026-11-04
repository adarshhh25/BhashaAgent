import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { config } from "../../config/environment";
import { providerEventSchema, type ProviderEvent } from "./voice.protocol";

export type GnaniAdapterEvent =
  | { type: "connected" }
  | { type: "speech_start" }
  | { type: "processing" }
  | { type: "partial"; text?: string }
  | { type: "transcript"; text: string; timestamp: string; audioDurationMs: number; segmentId: string; segmentIndex: number; latencyMs: number; detectedLanguageCode?: string; utteranceId: string }
  | { type: "error"; code: string; message: string };

export interface SttProvider {
  connect(): Promise<void>;
  sendFrame(frame: Buffer): void;
  close(): void;
  onEvent(listener: (event: GnaniAdapterEvent) => void): void;
  onClose(listener: () => void): void;
}

function providerErrorCode(value: string | undefined): string {
  const normalized = (value ?? "").toUpperCase();
  if (normalized.includes("AUTH") || normalized.includes("KEY")) return "PROVIDER_AUTHENTICATION_FAILED";
  if (normalized.includes("CONFIG") || normalized.includes("MODEL") || normalized.includes("LANGUAGE")) return "PROVIDER_CONFIGURATION_ERROR";
  if (normalized.includes("AUDIO") || normalized.includes("SAMPLE")) return "PROVIDER_INVALID_AUDIO";
  if (normalized.includes("RATE")) return "PROVIDER_RATE_LIMITED";
  if (normalized.includes("CREDIT") || normalized.includes("QUOTA")) return "PROVIDER_QUOTA_EXCEEDED";
  if (normalized.includes("TIMEOUT")) return "PROVIDER_TIMEOUT";
  return value ? `PROVIDER_${normalized.replace(/[^A-Z0-9_]/g, "_")}` : "PROVIDER_ERROR";
}

function sanitizeProviderMessage(msg: string | undefined): string {
  if (!msg) return "Speech provider returned an error";
  return msg.replace(/[\r\n\t]/g, " ").trim().slice(0, 200);
}

export class GnaniPrismaAdapter implements SttProvider {
  private socket?: WebSocket;
  private eventListener: (event: GnaniAdapterEvent) => void = () => undefined;
  private closeListener: () => void = () => undefined;
  private isExplicitlyClosed = false;
  private isConnecting = false;
  private frameBuffer: Buffer[] = [];

  async connect(): Promise<void> {
    if (this.isExplicitlyClosed) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.isConnecting) return;

    if (!config.gnani.apiKey) throw new Error("Gnani STT provider is not configured");

    this.isConnecting = true;
    const requestId = randomUUID();
    console.log(`[GnaniPrisma] STT connection attempt: endpoint=${config.gnani.endpoint}, model=${config.gnani.model}, languageCode=${config.gnani.languageCode}, sampleRate=${config.gnani.sampleRate}, requestId=${requestId}`);

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(config.gnani.endpoint, {
        headers: {
          "x-api-key-id": config.gnani.apiKey,
          model: config.gnani.model,
          language_code: config.gnani.languageCode,
          format: config.gnani.format,
          "x-sample-rate": String(config.gnani.sampleRate),
          "x-idle-timeout-sec": String(config.gnani.idleTimeoutSeconds),
          "x-api-request-id": requestId,
        },
      });
      this.socket = socket;
      let settled = false;

      socket.on("open", () => {
        this.isConnecting = false;
        console.log(`[GnaniPrisma] Provider connection success: WebSocket open (HTTP 101 Switching Protocols)`);
        if (!settled) { settled = true; resolve(); }
        // Flush any queued frames
        while (this.frameBuffer.length > 0 && this.socket?.readyState === WebSocket.OPEN) {
          const f = this.frameBuffer.shift();
          if (f) {
            try { this.socket.send(f); } catch {}
          }
        }
      });

      socket.on("message", (data) => this.handleMessage(data.toString()));

      socket.on("error", (err) => {
        this.isConnecting = false;
        console.error(`[GnaniPrisma] Provider connection failure: WebSocket error=${err.message || 'unknown'}`);
        if (!settled) { settled = true; reject(new Error("Gnani STT connection failed")); }
        this.eventListener({ type: "error", code: "PROVIDER_CONNECTION_FAILED", message: "Speech provider connection failed" });
      });

      socket.on("close", (code, reason) => {
        this.isConnecting = false;
        console.log(`[GnaniPrisma] Provider WebSocket closed: code=${code}, reason=${reason ? reason.toString() : 'none'}`);
        this.socket = undefined;
        if (this.isExplicitlyClosed) {
          this.closeListener();
        }
      });
    });
  }

  private handleMessage(raw: string): void {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      console.error(`[GnaniPrisma] Malformed JSON event received from provider`);
      this.eventListener({ type: "error", code: "PROVIDER_MALFORMED_EVENT", message: "Speech provider returned an invalid event" });
      return;
    }

    const parsed = providerEventSchema.safeParse(value);
    if (!parsed.success) {
      const rawObj = value as Record<string, unknown>;
      if (rawObj?.type === "transcript" && typeof rawObj.text === "string" && rawObj.text.trim()) {
        const text = rawObj.text.trim();
        const segId = String(rawObj.segment_id || `seg-${Date.now()}`);
        console.log(`[GnaniPrisma] Final transcript received (fallback parser): segmentId=${segId}, text="${text}"`);
        this.eventListener({
          type: "transcript",
          text,
          timestamp: String(rawObj.timestamp || new Date().toISOString()),
          audioDurationMs: Number(rawObj.audio_duration_ms || 0),
          segmentId: segId,
          segmentIndex: Number(rawObj.segment_index || 1),
          latencyMs: Number(rawObj.latency || 0),
          detectedLanguageCode: rawObj.detected_language_code ? String(rawObj.detected_language_code) : undefined,
          utteranceId: String(rawObj.utterance_id || `utt-${Date.now()}`),
        });
        return;
      }

      if (rawObj?.type === "error") {
        const rawMsg = String(rawObj.message ?? "");
        const lowerMsg = rawMsg.toLowerCase();
        if (lowerMsg.includes("no speech segment") || lowerMsg.includes("idle") || lowerMsg.includes("60 second") || lowerMsg.includes("inactivity")) {
          console.log(`[GnaniPrisma] Provider STT stream idle timeout (silence). Closing stream cleanly, will reconnect on next speech.`);
          if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
            try { this.socket.close(); } catch {}
          }
          this.socket = undefined;
          return;
        }

        const code = providerErrorCode(String(rawObj.error_code ?? rawObj.code ?? ""));
        const message = sanitizeProviderMessage(rawMsg);
        console.error(`[GnaniPrisma] Provider error: code=${code}, message=${message}`);
        this.eventListener({ type: "error", code, message });
        return;
      }
      console.warn(`[GnaniPrisma] Non-standard provider event received: type=${rawObj?.type ?? 'unknown'}`);
      return;
    }

    const event: ProviderEvent = parsed.data;

    if (event.type === "connected") {
      const active = event.config;
      console.log(`[GnaniPrisma] Provider session ready: sampleRate=${active?.sample_rate ?? config.gnani.sampleRate}, chunkSize=${active?.chunk_size ?? config.gnani.frameBytes / 2}, languageCode=${active?.language_code ?? config.gnani.languageCode}, format=${active?.format ?? config.gnani.format}`);

      if (active && (
        active.sample_rate !== undefined && active.sample_rate !== config.gnani.sampleRate
        || active.chunk_size !== undefined && active.chunk_size !== config.gnani.frameBytes / 2
        || active.language_code !== undefined && active.language_code !== config.gnani.languageCode
        || active.format !== undefined && active.format !== config.gnani.format
      )) {
        console.error(`[GnaniPrisma] Provider configuration mismatch`);
        this.eventListener({ type: "error", code: "PROVIDER_CONFIGURATION_ERROR", message: "Speech provider configuration was not accepted" });
        return;
      }
      this.eventListener({ type: "connected" });
    } else if (event.type === "speech_start") {
      console.log(`[GnaniPrisma] Speech detected by provider VAD`);
      this.eventListener({ type: "speech_start" });
    } else if (event.type === "processing") {
      console.log(`[GnaniPrisma] Provider processing utterance`);
      this.eventListener({ type: "processing" });
    } else if (event.type === "partial") {
      console.log(`[GnaniPrisma] Partial transcript received from provider`);
      this.eventListener({ type: "partial", text: event.text ?? event.transcript });
    } else if (event.type === "transcript") {
      const segId = event.segment_id || `seg-${Date.now()}`;
      const durationMs = typeof event.audio_duration_ms === "number" ? event.audio_duration_ms : 0;
      const latencyMs = typeof event.latency === "number" ? event.latency : 0;
      const timestamp = event.timestamp || new Date().toISOString();
      const segmentIndex = typeof event.segment_index === "number" ? event.segment_index : 1;
      const utteranceId = event.utterance_id || `utt-${Date.now()}`;
      console.log(`[GnaniPrisma] Final transcript received: segmentId=${segId}, durationMs=${durationMs}, latencyMs=${latencyMs}, language=${event.detected_language_code ?? 'auto'}`);
      this.eventListener({
        type: "transcript",
        text: event.text,
        timestamp,
        audioDurationMs: durationMs,
        segmentId: segId,
        segmentIndex,
        latencyMs,
        detectedLanguageCode: event.detected_language_code,
        utteranceId,
      });
    } else if (event.type === "error") {
      const rawMsg = String(event.message ?? "");
      const lowerMsg = rawMsg.toLowerCase();
      if (lowerMsg.includes("no speech segment") || lowerMsg.includes("idle") || lowerMsg.includes("60 second") || lowerMsg.includes("inactivity")) {
        console.log(`[GnaniPrisma] Provider STT stream idle timeout (silence). Closing stream cleanly, will reconnect on next speech.`);
        if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
          try { this.socket.close(); } catch {}
        }
        this.socket = undefined;
        return;
      }

      const code = providerErrorCode(event.error_code ?? event.code);
      const message = sanitizeProviderMessage(event.message);
      console.error(`[GnaniPrisma] Provider error: code=${code}, message=${message}`);
      this.eventListener({ type: "error", code, message });
    }
  }

  sendFrame(frame: Buffer): void {
    if (this.isExplicitlyClosed) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(frame);
      return;
    }
    // Buffer frame while reconnecting (up to 30 frames ~ 1 sec of audio)
    if (this.frameBuffer.length < 30) {
      this.frameBuffer.push(frame);
    }
    if (!this.isConnecting && (!this.socket || this.socket.readyState !== WebSocket.OPEN)) {
      void this.connect().catch((err: Error) => {
        console.warn(`[GnaniPrisma] Reconnection attempt failed: ${err.message}`);
      });
    }
  }

  close(): void {
    this.isExplicitlyClosed = true;
    this.frameBuffer = [];
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close();
    }
    this.socket = undefined;
    this.closeListener();
  }

  onEvent(listener: (event: GnaniAdapterEvent) => void): void { this.eventListener = listener; }
  onClose(listener: () => void): void { this.closeListener = listener; }
}
