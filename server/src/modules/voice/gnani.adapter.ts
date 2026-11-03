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

  async connect(): Promise<void> {
    if (!config.gnani.apiKey) throw new Error("Gnani STT provider is not configured");

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
        console.log(`[GnaniPrisma] Provider connection success: WebSocket open (HTTP 101 Switching Protocols)`);
        if (!settled) { settled = true; resolve(); }
      });

      socket.on("message", (data) => this.handleMessage(data.toString()));

      socket.on("error", (err) => {
        console.error(`[GnaniPrisma] Provider connection failure: WebSocket error=${err.message || 'unknown'}`);
        if (!settled) { settled = true; reject(new Error("Gnani STT connection failed")); }
        this.eventListener({ type: "error", code: "PROVIDER_CONNECTION_FAILED", message: "Speech provider connection failed" });
      });

      socket.on("close", (code, reason) => {
        console.log(`[GnaniPrisma] Provider WebSocket closed: code=${code}, reason=${reason ? reason.toString() : 'none'}`);
        this.closeListener();
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
      if (rawObj?.type === "error") {
        const code = providerErrorCode(String(rawObj.error_code ?? rawObj.code ?? ""));
        const message = sanitizeProviderMessage(String(rawObj.message ?? ""));
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
      console.log(`[GnaniPrisma] Final transcript received: segmentId=${event.segment_id}, durationMs=${event.audio_duration_ms}, latencyMs=${event.latency}, language=${event.detected_language_code ?? 'auto'}`);
      this.eventListener({
        type: "transcript",
        text: event.text,
        timestamp: event.timestamp,
        audioDurationMs: event.audio_duration_ms,
        segmentId: event.segment_id,
        segmentIndex: event.segment_index,
        latencyMs: event.latency,
        detectedLanguageCode: event.detected_language_code,
        utteranceId: event.utterance_id,
      });
    } else if (event.type === "error") {
      const code = providerErrorCode(event.error_code ?? event.code);
      const message = sanitizeProviderMessage(event.message);
      console.error(`[GnaniPrisma] Provider error: code=${code}, message=${message}`);
      this.eventListener({ type: "error", code, message });
    }
  }

  sendFrame(frame: Buffer): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Speech provider is not ready");
    }
    this.socket.send(frame);
  }

  close(): void {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close();
    }
    this.socket = undefined;
  }

  onEvent(listener: (event: GnaniAdapterEvent) => void): void { this.eventListener = listener; }
  onClose(listener: () => void): void { this.closeListener = listener; }
}
