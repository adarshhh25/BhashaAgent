/**
 * Voice Protocol Events and Validation Schemas (FE-8)
 *
 * Matches Backend Phase 10:
 * - server/src/modules/voice/voice.protocol.ts
 * - server/src/modules/voice/voice.gateway.ts
 */

import { z } from 'zod';
import { VOICE_PROTOCOL_VERSION } from './voice.types';

/* ---------------------------------------------------------------------------
 * Client -> Server Messages
 * ---------------------------------------------------------------------------*/

export const voiceStartMessageSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('START'),
  conversationId: z.string().uuid(),
  correlationId: z.string().uuid().optional(),
  formTaskId: z.string().uuid().optional(),
});

export const voiceStopMessageSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('STOP'),
  correlationId: z.string().uuid().optional(),
});

export const voiceCancelMessageSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('CANCEL'),
  correlationId: z.string().uuid().optional(),
});

export const voiceUpdateFormTaskMessageSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('UPDATE_FORM_TASK'),
  formTaskId: z.string().uuid().nullable().optional(),
});

export const clientVoiceMessageSchema = z.discriminatedUnion('messageType', [
  voiceStartMessageSchema,
  voiceStopMessageSchema,
  voiceCancelMessageSchema,
  voiceUpdateFormTaskMessageSchema,
]);

export type VoiceStartMessage = z.infer<typeof voiceStartMessageSchema>;
export type VoiceStopMessage = z.infer<typeof voiceStopMessageSchema>;
export type VoiceCancelMessage = z.infer<typeof voiceCancelMessageSchema>;
export type VoiceUpdateFormTaskMessage = z.infer<typeof voiceUpdateFormTaskMessageSchema>;
export type ClientVoiceMessage = z.infer<typeof clientVoiceMessageSchema>;

/* ---------------------------------------------------------------------------
 * Server -> Client Messages
 * ---------------------------------------------------------------------------*/

export const serverSessionStateEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('SESSION_STATE'),
  sessionState: z.enum(['CONNECTING', 'READY', 'LISTENING', 'PROCESSING', 'CLOSED']),
});

export const serverSessionReadyEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('SESSION_READY'),
  sessionState: z.literal('READY'),
});

export const serverSpeechStartEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('SPEECH_START'),
  sessionState: z.literal('LISTENING'),
});

export const serverProcessingEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('PROCESSING'),
  sessionState: z.literal('PROCESSING'),
});

export const serverTranscriptPayloadSchema = z.object({
  text: z.string(),
  timestamp: z.string(),
  audioDurationMs: z.number().int().nonnegative(),
  segmentId: z.string(),
  segmentIndex: z.number().int().positive(),
  latencyMs: z.number().int().nonnegative(),
  detectedLanguageCode: z.string().optional(),
  utteranceId: z.string(),
  isFinal: z.boolean(),
});

export const serverTranscriptEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('TRANSCRIPT'),
  sessionState: z.literal('READY'),
  transcript: serverTranscriptPayloadSchema,
});

export const formBrowserActionSchema = z.object({
  actionType: z.enum(['SET_VALUE', 'SELECT_OPTION', 'CHECK', 'UNCHECK']),
  fieldIdentifier: z.string(),
  fieldId: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number(), z.boolean()]))]),
  label: z.string().optional(),
});

export type FormBrowserAction = z.infer<typeof formBrowserActionSchema>;

export const serverAssistantResponseEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('ASSISTANT_RESPONSE'),
  conversationId: z.string().uuid(),
  assistantMessageId: z.string(),
  response: z.string(),
  reused: z.boolean().optional(),
  formActions: z.array(formBrowserActionSchema).optional(),
});

export const serverAudioStartEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('AUDIO_START'),
  requestId: z.string().optional(),
});

export const serverAudioChunkEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('AUDIO_CHUNK'),
  chunkIndex: z.number().int().nonnegative(),
  audio: z.string(), // base64 linear PCM
});

export const serverAudioCompleteEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('AUDIO_COMPLETE'),
  chunkIndex: z.number().int().nonnegative(),
});

export const serverSessionClosedEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('SESSION_CLOSED'),
  sessionState: z.literal('CLOSED'),
});

export const serverErrorEventSchema = z.object({
  protocolVersion: z.literal(VOICE_PROTOCOL_VERSION),
  messageType: z.literal('ERROR'),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const serverVoiceEventSchema = z.discriminatedUnion('messageType', [
  serverSessionStateEventSchema,
  serverSessionReadyEventSchema,
  serverSpeechStartEventSchema,
  serverProcessingEventSchema,
  serverTranscriptEventSchema,
  serverAssistantResponseEventSchema,
  serverAudioStartEventSchema,
  serverAudioChunkEventSchema,
  serverAudioCompleteEventSchema,
  serverSessionClosedEventSchema,
  serverErrorEventSchema,
]);

export type ServerVoiceEvent = z.infer<typeof serverVoiceEventSchema>;
export type ServerTranscriptPayload = z.infer<typeof serverTranscriptPayloadSchema>;

