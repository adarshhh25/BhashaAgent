import WebSocket from "ws";
import { config } from "../../config/environment";
import { ttsServerMessageSchema } from "./timbre.protocol";

const V25_VOICES = new Set([
  "Asmita", "Trisha", "Brinda", "Vedika", "Noopur", "Suhana", "Lehara", "Lavanya", "Yukti",
  "Saanvi", "Kavin", "Reshma", "Riyaan", "Kirra", "Dhruva", "Falak", "Veera", "Mehuli",
  "Zayan", "Kaveri", "Trupti", "Devika", "Pranav", "Shlok", "Girish", "Nalini", "Bhavna",
  "Yashvi", "Urmila", "Jwala", "Chitra", "Ambuja", "Deepak", "Roopesh", "Vikrant", "Hemraj",
  "Jalaj", "Omkar", "Poorvi", "Zahira", "Ishaan",
]);
const V30_VOICES = new Set([
  "Avinash", "Chetana", "Devansh", "Kalpana", "Lakshmi", "Prakash", "Riyaa", "Shivani",
  "Shubham", "Tarika", "Vasudha", "Yashraj", "Harshad",
]);
const V25_LANGUAGE_VOICES: Record<string, Set<string>> = {
  "en-IN": new Set(["Kaveri", "Trupti", "Devika", "Pranav", "Shlok", "Girish"]),
  "hi-IN": new Set(["Nalini", "Bhavna", "Yashvi", "Urmila", "Jwala", "Chitra", "Ambuja", "Deepak", "Roopesh", "Vikrant", "Hemraj", "Jalaj", "Omkar"]),
  "hi-en": new Set(["Poorvi"]),
  "mr-IN": new Set(["Zahira", "Ishaan"]),
};

export class TtsConfigurationError extends Error {
  readonly code = "TTS_CONFIGURATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "TtsConfigurationError";
  }
}

export function validateTtsConfiguration(input = config.gnaniTts): void {
  const voices = input.model === "timbre-v2.5" ? V25_VOICES : input.model === "timbre-v3.0" ? V30_VOICES : undefined;
  if (!voices) throw new TtsConfigurationError(`Unsupported Timbre model: ${input.model}`);
  if (!voices.has(input.voice)) {
    throw new TtsConfigurationError(`Voice ${input.voice} is not available for ${input.model}; model and voice catalogues must match`);
  }
  if (input.model === "timbre-v2.5" && input.language !== "auto" && V25_LANGUAGE_VOICES[input.language]
    && !V25_LANGUAGE_VOICES[input.language].has(input.voice)) {
    throw new TtsConfigurationError(`Voice ${input.voice} is not documented for ${input.language} with timbre-v2.5; use a matching v2.5 voice or timbre-v3.0`);
  }
  if (!Number.isFinite(input.speed) || input.speed < 0.85 || input.speed > 1.15) {
    throw new TtsConfigurationError("GNANI_TTS_SPEED must be between 0.85 and 1.15");
  }
  if (![8000, 16000, 22050, 24000, 44100, 48000].includes(input.sampleRate)) {
    throw new TtsConfigurationError("GNANI_TTS_SAMPLE_RATE is not supported by Timbre");
  }
  if (!["raw", "wav", "mp3", "ogg", "mulaw", "alaw"].includes(input.container)) {
    throw new TtsConfigurationError("GNANI_TTS_CONTAINER is not supported by Timbre");
  }
  if (!["linear_pcm", "pcm_s16le", "pcm_mulaw", "pcm_alaw", "oggopus"].includes(input.encoding)) {
    throw new TtsConfigurationError("GNANI_TTS_ENCODING is not supported by Timbre");
  }
}

export type TtsAdapterEvent =
  | { type: "start"; requestId?: string }
  | { type: "audio"; chunkIndex: number; audio: Buffer }
  | { type: "complete"; chunkIndex: number }
  | { type: "error"; code: string; message: string };

export interface TtsProvider {
  synthesize(text: string, language?: string): Promise<void>;
  close(): void;
  onEvent(listener: (event: TtsAdapterEvent) => void): void;
  onClose(listener: () => void): void;
}

function resolveTimbreLanguage(language?: string): string {
  if (!language) return config.gnaniTts.language;
  const l = language.toLowerCase();
  if (l.startsWith("hi") || l === "hinglish") return "hi-IN";
  if (l.startsWith("mr")) return "mr-IN";
  if (l.startsWith("en")) return "en-IN";
  return config.gnaniTts.language;
}

export class GnaniTimbreAdapter implements TtsProvider {
  private socket?: WebSocket;
  private eventListener: (event: TtsAdapterEvent) => void = () => undefined;
  private closeListener: () => void = () => undefined;

  async synthesize(text: string, language?: string): Promise<void> {
    validateTtsConfiguration();
    if (!config.gnaniTts.apiKey) throw new TtsConfigurationError("Gnani TTS provider is not configured");
    if (!text.trim()) throw new TtsConfigurationError("TTS text cannot be empty");
    const targetLanguage = resolveTimbreLanguage(language);
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(config.gnaniTts.endpoint, {
        headers: { "X-API-Key-ID": config.gnaniTts.apiKey },
      });
      this.socket = socket;
      let settled = false;
      const fail = (error: Error) => {
        if (!settled) { settled = true; reject(error); }
      };
      socket.on("open", () => {
        socket.send(JSON.stringify({
          text,
          voice: config.gnaniTts.voice,
          model: config.gnaniTts.model,
          language: targetLanguage,
          speed: config.gnaniTts.speed,
          audio_config: {
            sample_rate: config.gnaniTts.sampleRate,
            num_channels: 1,
            sample_width: 2,
            encoding: config.gnaniTts.encoding,
            container: config.gnaniTts.container,
          },
        }));
      });
      socket.on("message", (data) => {
        let value: unknown;
        try { value = JSON.parse(data.toString()); } catch { fail(new Error("Timbre returned malformed data")); return; }
        const parsed = ttsServerMessageSchema.safeParse(value);
        if (!parsed.success) { fail(new Error("Timbre returned an invalid event")); return; }
        const event = parsed.data;
        if (event.type === "start") this.eventListener({ type: "start", requestId: event.request_id });
        else if (event.type === "audio") this.eventListener({ type: "audio", chunkIndex: event.data.chunk_index, audio: Buffer.from(event.data.audio, "base64") });
        else if (event.type === "complete") {
          this.eventListener({ type: "complete", chunkIndex: event.data.chunk_index });
          if (!settled) { settled = true; resolve(); }
          socket.close();
        } else {
          this.eventListener({ type: "error", code: "TTS_PROVIDER_ERROR", message: event.message });
          fail(new Error(event.message));
        }
      });
      socket.on("error", () => fail(new Error("Gnani TTS connection failed")));
      socket.on("close", () => this.closeListener());
    });
  }

  close(): void {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) this.socket.close();
    this.socket = undefined;
  }
  onEvent(listener: (event: TtsAdapterEvent) => void): void { this.eventListener = listener; }
  onClose(listener: () => void): void { this.closeListener = listener; }
}
