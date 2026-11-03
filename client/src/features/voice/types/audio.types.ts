/**
 * Audio Pipeline Types (FE-8)
 *
 * Captures format specifications:
 * - Capture: 16 kHz, Mono, PCM16LE (1024 bytes = 512 samples per frame)
 * - Playback: 24 kHz, Mono, Linear PCM (Gnani Timbre TTS)
 */

export interface AudioCaptureOptions {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface ResamplingOptions {
  sourceSampleRate: number;
  targetSampleRate: number;
}

export interface AudioPlaybackChunk {
  chunkIndex: number;
  pcmBytes: Uint8Array;
  durationSeconds: number;
}

export type AudioPipelineError =
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'WORKLET_FAILED'
  | 'RESAMPLING_ERROR'
  | 'PLAYBACK_ERROR'
  | 'WEBSOCKET_ERROR';

