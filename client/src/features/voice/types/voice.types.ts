/**
 * Voice Interface Types (Phase 10 Integration & Phase 10D Preparation)
 *
 * Defines:
 * - Centralized voice presentation states
 * - Voice Orb animation states
 * - Audio capture and playback contracts
 * - STT/TTS transcript models
 */

export const VOICE_PROTOCOL_VERSION = 'bhasha.voice.v1' as const;
export type VoiceProtocolVersion = typeof VOICE_PROTOCOL_VERSION;

/**
 * Visual states for the Fibonacci particle Voice Orb.
 * Directly corresponds to the 4 states in voice-orb-sphere.html.
 */
export type VoiceOrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * Comprehensive frontend voice lifecycle presentation states (FE-8).
 */
export type VoicePresentationState =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'CONNECTING'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'RECONNECTING'
  | 'CANCELLING'
  | 'ERROR';

/**
 * Microphone permission status in browser.
 */
export type MicrophonePermissionStatus =
  | 'PROMPT'
  | 'GRANTED'
  | 'DENIED'
  | 'UNAVAILABLE';

/**
 * Speech recognition transcript representation.
 */
export interface VoiceTranscript {
  text: string;
  isFinal: boolean;
  detectedLanguageCode?: string;
  timestamp?: string;
  audioDurationMs?: number;
  segmentId?: string;
  utteranceId?: string;
}

/**
 * Audio playback states for assistant voice responses.
 */
export type AudioPlaybackState =
  | 'IDLE'
  | 'PLAYING'
  | 'PAUSED'
  | 'STOPPED'
  | 'INTERRUPTED'
  | 'FAILED';

/**
 * Phase 10 Voice Ticket response from POST /api/v1/voice/tickets.
 */
export interface VoiceTicket {
  ticket: string;
  expiresAt: string;
}

/**
 * Audio capture format configuration (Phase 10D contract).
 */
export const AUDIO_CAPTURE_CONFIG = {
  sampleRate: 16000,
  channelCount: 1,
  bytesPerSample: 2,
  frameSizeBytes: 1024,
  samplesPerFrame: 512,
  encoding: 'PCM16LE' as const,
};

export interface AudioCaptureConfig {
  sampleRate: 16000;
  channels: 1;
  frameSize: 512;
  frameSizeBytes: 1024;
  encoding: 'PCM16LE';
}

/**
 * TTS audio format configuration (Phase 10C/10D contract).
 */
export const AUDIO_PLAYBACK_CONFIG = {
  sampleRate: 24000,
  channelCount: 1,
  encoding: 'LINEAR_PCM' as const,
};

export interface AudioPlaybackConfig {
  sampleRate: 24000;
  channels: 1;
  encoding: 'LINEAR_PCM';
}

/**
 * Phase 10D Audio Pipeline Integration Callback Boundaries.
 * Prepares FE-7 components to hook seamlessly into FE-8 audio streaming.
 */
export interface VoiceLifecycleCallbacks {
  onStartListening?: () => Promise<void>;
  onStopListening?: () => Promise<void>;
  onCancel?: () => Promise<void>;
  onPlayResponse?: (assistantMessageId: string) => Promise<void>;
  onPausePlayback?: () => void;
  onStopPlayback?: () => void;
  onBargeIn?: () => Promise<void>;
}
