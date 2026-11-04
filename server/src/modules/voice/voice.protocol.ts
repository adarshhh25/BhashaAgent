import { z } from "zod";

export const VOICE_PROTOCOL_VERSION = "bhasha.voice.v1" as const;
export const voiceProtocolMessageSchema = z.discriminatedUnion("messageType", [
  z.object({
    protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
    messageType: z.literal("START"),
    conversationId: z.string().uuid(),
    correlationId: z.string().uuid().optional(),
    formTaskId: z.string().uuid().optional(),
  }),
  z.object({
    protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
    messageType: z.literal("STOP"),
    correlationId: z.string().uuid().optional(),
  }),
  z.object({
    protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
    messageType: z.literal("CANCEL"),
    correlationId: z.string().uuid().optional(),
  }),
  z.object({
    protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
    messageType: z.literal("UPDATE_FORM_TASK"),
    formTaskId: z.string().uuid().nullable().optional(),
  }),
]);

export const providerEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("connected"),
    config: z.object({
      sample_rate: z.number().int().optional(),
      chunk_size: z.number().int().optional(),
      language_code: z.string().optional(),
      format: z.string().optional(),
    }).optional(),
  }).passthrough(),
  z.object({ type: z.literal("speech_start") }).passthrough(),
  z.object({ type: z.literal("processing") }).passthrough(),
  z.object({
    type: z.literal("transcript"),
    timestamp: z.string().optional(),
    text: z.string().trim().min(1),
    audio_duration_ms: z.number().nonnegative().optional(),
    segment_id: z.string().optional(),
    segment_index: z.number().int().optional(),
    latency: z.number().nonnegative().optional(),
    detected_language_code: z.string().optional(),
    utterance_id: z.string().optional(),
    is_final: z.boolean().optional(),
  }).passthrough(),
  z.object({
    type: z.literal("partial"),
    text: z.string().optional(),
    transcript: z.string().optional(),
    is_final: z.literal(false).optional(),
  }).passthrough(),
  z.object({
    type: z.literal("error"),
    error_code: z.string().optional(),
    code: z.string().optional(),
    message: z.string().optional(),
  }).passthrough(),
]);

export type VoiceProtocolMessage = z.infer<typeof voiceProtocolMessageSchema>;
export type ProviderEvent = z.infer<typeof providerEventSchema>;

export function isPcm16LeFrame(value: Buffer): boolean {
  if (value.length !== 1024) return false;
  const magic = value.subarray(0, 4).toString("ascii");
  return magic !== "RIFF" && magic !== "OggS" && magic !== "fLaC" && magic.slice(0, 3) !== "ID3";
}
