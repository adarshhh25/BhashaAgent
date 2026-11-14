/**
 * Authoritative Voice Session Manager (FE-8)
 *
 * Coordinates:
 * - Single-use ticket acquisition
 * - Real-time WebSocket connection to /api/v1/voice?ticket=...
 * - Resampled 16 kHz PCM microphone capture & 1024-byte frame streaming
 * - Gnani Prisma STT event processing & original script preservation
 * - Gnani Timbre TTS 24 kHz progressive audio playback
 * - Real barge-in / speech interruption (stops playback & clears queued chunks)
 * - Exactly-once message safeguards & canonical reconciliation
 * - Non-retriable error detection (410, 409, 401, 404) & bounded exponential backoff
 * - Deterministic, idempotent resource cleanup
 */

import { VoiceWebSocketClient } from './voice-websocket.service';
import { MicrophoneCapture } from '../audio/microphone-capture';
import { AudioPlaybackManager } from '../audio/audio-playback';
import { ApiError } from '../../../services/api/api-errors';
import type {
  VoicePresentationState,
  AudioPlaybackState,
  VoiceTranscript,
} from '../types/voice.types';
import type { ServerTranscriptPayload } from '../types/voice.events';

export interface VoiceSessionCallbacks {
  onPresentationStateChange?: (state: VoicePresentationState) => void;
  onPlaybackStateChange?: (state: AudioPlaybackState) => void;
  onTranscriptUpdate?: (transcript: VoiceTranscript) => void;
  onAssistantResponse?: (data: {
    assistantMessageId: string;
    response: string;
    reused?: boolean;
    formActions?: Array<{
      actionType: 'SET_VALUE' | 'SELECT_OPTION' | 'CHECK' | 'UNCHECK';
      fieldIdentifier: string;
      fieldId?: string;
      value: string | number | boolean | Array<string | number | boolean>;
      label?: string;
    }>;
  }) => void;
  onReconnectSuccess?: () => void;
  onError?: (code: string, message: string) => void;
  onSessionEnded?: () => void;
}

export class VoiceSessionManager {
  private wsClient: VoiceWebSocketClient | null = null;
  private micCapture: MicrophoneCapture | null = null;
  private playbackManager: AudioPlaybackManager | null = null;

  private conversationId: string | null = null;
  private formTaskId?: string;
  private language?: string;
  private presentationState: VoicePresentationState = 'IDLE';
  private playbackState: AudioPlaybackState = 'IDLE';
  private callbacks: VoiceSessionCallbacks = {};

  private isStarting = false;
  private isDestroyed = false;
  private isFatalError = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Deduplication trackers
  private processedSegments = new Set<string>();
  private seenAssistantMessageIds = new Set<string>();

  constructor(callbacks: VoiceSessionCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Start end-to-end voice session for the given conversation.
   */
  async start(conversationId: string, formTaskId?: string, language?: string): Promise<boolean> {
    if (this.isStarting || this.presentationState === 'LISTENING') {
      return true;
    }

    this.isStarting = true;
    this.cleanup();
    this.isDestroyed = false;
    this.isFatalError = false;
    this.conversationId = conversationId;
    this.formTaskId = formTaskId;
    this.language = language;
    this.reconnectAttempts = 0;

    this.setPresentationState('CONNECTING');

    try {
      // 1. Initialize audio playback manager
      this.playbackManager = new AudioPlaybackManager({
        onPlaybackStarted: () => {
          this.setPlaybackState('PLAYING');
          this.setPresentationState('SPEAKING');
        },
        onPlaybackComplete: () => {
          this.setPlaybackState('STOPPED');
          // Resume listening after assistant finishes speaking
          if (!this.isDestroyed && this.presentationState !== 'CANCELLING') {
            this.setPresentationState('LISTENING');
          }
        },
        onError: (err) => {
          this.callbacks.onError?.('PLAYBACK_ERROR', err.message);
        },
      });

      // 2. Initialize microphone capture
      this.micCapture = new MicrophoneCapture({
        onFrame: (frame) => {
          if (this.wsClient?.ready && this.presentationState === 'LISTENING') {
            this.wsClient.sendBinaryFrame(frame);
          }
        },
        onError: (err) => {
          this.setPresentationState('ERROR');
          this.callbacks.onError?.('MIC_ERROR', err.message);
        },
        onPermissionDenied: () => {
          this.setPresentationState('ERROR');
          this.callbacks.onError?.(
            'PERMISSION_DENIED',
            'Microphone access denied. Please grant permission in Chrome settings.',
          );
        },
      });

      // 3. Connect WebSocket gateway
      this.wsClient = new VoiceWebSocketClient({
        onSessionState: (state) => {
          if (state === 'CONNECTING') {
            this.setPresentationState('CONNECTING');
          }
        },
        onSessionReady: () => {
          this.setPresentationState('LISTENING');
          // If this was a reconnection, trigger reconciliation callback
          if (this.reconnectAttempts > 0) {
            this.callbacks.onReconnectSuccess?.();
          }
          // Start capturing audio once server is ready
          void this.micCapture?.start();
        },
        onSpeechStart: () => {
          // If assistant is currently speaking, user speech triggers barge-in
          if (this.presentationState === 'SPEAKING' || this.playbackState === 'PLAYING') {
            this.bargeIn();
          }
          this.setPresentationState('LISTENING');
        },
        onProcessing: () => {
          this.setPresentationState('PROCESSING');
        },
        onTranscript: (serverTranscript) => {
          this.handleServerTranscript(serverTranscript);
        },
        onAssistantResponse: (data) => {
          // Reject if session has already ended or cancelled
          if (this.isDestroyed || this.presentationState === 'CANCELLING') {
            return;
          }
          // Exactly-once check: deduplicate by assistantMessageId
          if (this.seenAssistantMessageIds.has(data.assistantMessageId)) {
            return;
          }
          this.seenAssistantMessageIds.add(data.assistantMessageId);
          this.callbacks.onAssistantResponse?.(data);
        },
        onAudioStart: (requestId) => {
          if (this.isDestroyed || this.presentationState === 'CANCELLING') return;
          this.playbackManager?.startNewStream(requestId);
        },
        onAudioChunk: (chunkIndex, base64Audio) => {
          if (this.isDestroyed || this.presentationState === 'CANCELLING') return;
          this.playbackManager?.enqueueBase64Chunk(chunkIndex, base64Audio);
        },
        onAudioComplete: () => {
          if (this.isDestroyed || this.presentationState === 'CANCELLING') return;
          this.playbackManager?.markComplete();
        },
        onSessionClosed: () => {
          this.cleanup();
          this.setPresentationState('IDLE');
          this.callbacks.onSessionEnded?.();
        },
        onError: (code, message) => {
          if (
            code === 'CONVERSATION_DELETED' ||
            code === 'CONVERSATION_NOT_ACTIVE' ||
            code === 'AUTHENTICATION_REQUIRED' ||
            code === 'CONVERSATION_NOT_FOUND'
          ) {
            this.isFatalError = true;
          }
          this.setPresentationState('ERROR');
          this.callbacks.onError?.(code, message);
        },
        onClose: (code) => {
          // Handle unexpected disconnect with bounded retry (only if not a fatal error)
          if (
            !this.isDestroyed &&
            !this.isFatalError &&
            code !== 1000 &&
            this.reconnectAttempts < this.maxReconnectAttempts
          ) {
            this.scheduleReconnect();
          } else {
            this.cleanup();
            this.setPresentationState('IDLE');
          }
        },
      });

      await this.wsClient.connect(conversationId, formTaskId, language);
      this.isStarting = false;
      return true;
    } catch (err) {
      this.isStarting = false;
      this.cleanup();
      this.setPresentationState('ERROR');

      let errorMsg = 'Failed to establish voice session';
      let errorCode = 'CONNECTION_FAILED';

      if (err instanceof ApiError) {
        errorCode = err.errorCode ?? `HTTP_${err.status}`;
        if (err.status === 410 || err.errorCode === 'CONVERSATION_DELETED') {
          this.isFatalError = true;
          errorMsg = 'This conversation has been deleted. Please select an active conversation.';
        } else if (err.status === 409 || err.errorCode === 'CONVERSATION_NOT_ACTIVE') {
          this.isFatalError = true;
          errorMsg = 'Only active conversations can use voice sessions.';
        } else if (err.status === 401 || err.errorCode === 'AUTHENTICATION_REQUIRED') {
          this.isFatalError = true;
          errorMsg = 'Authentication required. Please sign in again.';
        } else if (err.status === 404 || err.errorCode === 'CONVERSATION_NOT_FOUND') {
          this.isFatalError = true;
          errorMsg = 'Conversation not found. Please select an active conversation.';
        } else {
          errorMsg = err.message;
        }
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      this.callbacks.onError?.(errorCode, errorMsg);
      return false;
    }
  }

  /**
   * Handle server transcript event with deduplication and script preservation.
   */
  private handleServerTranscript(payload: ServerTranscriptPayload): void {
    if (this.isDestroyed || this.presentationState === 'CANCELLING') {
      return;
    }

    if (this.processedSegments.has(payload.segmentId)) {
      return;
    }
    this.processedSegments.add(payload.segmentId);

    const transcript: VoiceTranscript = {
      text: payload.text,
      isFinal: payload.isFinal,
      detectedLanguageCode: payload.detectedLanguageCode,
      timestamp: payload.timestamp,
      audioDurationMs: payload.audioDurationMs,
    };

    this.callbacks.onTranscriptUpdate?.(transcript);

    if (payload.isFinal) {
      this.setPresentationState('PROCESSING');
    }
  }

  /**
   * Real barge-in: cancel assistant audio playback and immediately return to listening.
   */
  bargeIn(): void {
    if (this.playbackManager) {
      this.playbackManager.interrupt();
    }
    this.setPlaybackState('INTERRUPTED');
    this.setPresentationState('LISTENING');
  }

  /**
   * Dynamically update active form task ID.
   */
  updateFormTaskId(formTaskId: string | null | undefined): void {
    this.formTaskId = formTaskId || undefined;
    if (this.wsClient) {
      this.wsClient.updateFormTask(formTaskId);
    }
  }

  /**
   * Stop active session gracefully.
   */
  stop(): void {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.wsClient) {
      this.wsClient.stop();
    }
    this.cleanup();
    this.setPresentationState('IDLE');
  }

  /**
   * Cancel active session immediately.
   */
  cancel(): void {
    this.isDestroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.wsClient) {
      this.wsClient.cancel();
    }
    this.cleanup();
    this.setPresentationState('IDLE');
  }

  /**
   * Schedule reconnect with exponential backoff and ticket renewal.
   */
  private scheduleReconnect(): void {
    if (this.isDestroyed || !this.conversationId || this.isFatalError) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectAttempts++;
    this.setPresentationState('RECONNECTING');

    const backoffMs = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 8000);
    this.reconnectTimer = setTimeout(() => {
      if (this.isDestroyed || !this.conversationId || this.isFatalError) return;

      void this.wsClient
        ?.connect(this.conversationId, this.formTaskId, this.language)
        .catch((err) => {
          if (
            err instanceof ApiError &&
            (err.status === 410 ||
              err.status === 409 ||
              err.status === 401 ||
              err.status === 404 ||
              err.errorCode === 'CONVERSATION_DELETED' ||
              err.errorCode === 'CONVERSATION_NOT_ACTIVE')
          ) {
            this.isFatalError = true;
            this.cleanup();
            this.setPresentationState('ERROR');
            const msg =
              err.status === 410 || err.errorCode === 'CONVERSATION_DELETED'
                ? 'This conversation has been deleted. Please select an active conversation.'
                : err.message;
            this.callbacks.onError?.(err.errorCode ?? `HTTP_${err.status}`, msg);
            return;
          }

          this.callbacks.onError?.(
            'RECONNECT_FAILED',
            err instanceof Error ? err.message : 'Reconnect attempt failed',
          );
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.cleanup();
            this.setPresentationState('ERROR');
          }
        });
    }, backoffMs);
  }

  /**
   * Playback control methods
   */
  async pausePlayback(): Promise<void> {
    if (this.playbackManager) {
      await this.playbackManager.pause();
      this.setPlaybackState('PAUSED');
    }
  }

  async resumePlayback(): Promise<void> {
    if (this.playbackManager) {
      await this.playbackManager.resume();
      this.setPlaybackState('PLAYING');
    }
  }

  stopPlayback(): void {
    if (this.playbackManager) {
      this.playbackManager.reset();
      this.setPlaybackState('STOPPED');
      if (this.presentationState === 'SPEAKING') {
        this.setPresentationState('LISTENING');
      }
    }
  }

  /**
   * State mutators emitting callbacks
   */
  private setPresentationState(state: VoicePresentationState): void {
    this.presentationState = state;
    this.callbacks.onPresentationStateChange?.(state);
  }

  private setPlaybackState(state: AudioPlaybackState): void {
    this.playbackState = state;
    this.callbacks.onPlaybackStateChange?.(state);
  }

  /**
   * Cleanup hardware and network resources
   */
  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.micCapture) {
      this.micCapture.stop();
      this.micCapture = null;
    }

    if (this.playbackManager) {
      this.playbackManager.destroy();
      this.playbackManager = null;
    }

    if (this.wsClient) {
      this.wsClient.close();
      this.wsClient = null;
    }
  }

  /**
   * Stop audio capture without closing session or aborting turn
   */
  stopAudioCapture(): void {
    if (this.micCapture) {
      this.micCapture.stop();
    }
  }

  /**
   * Destroy session manager completely
   */
  destroy(): void {
    this.isDestroyed = true;
    this.stop();
  }

  // Getters for inspection/testing
  get state(): VoicePresentationState {
    return this.presentationState;
  }

  get currentPresentationState(): VoicePresentationState {
    return this.presentationState;
  }

  get currentPlaybackState(): AudioPlaybackState {
    return this.playbackState;
  }

  get isSessionDestroyed(): boolean {
    return this.isDestroyed;
  }

  get attempts(): number {
    return this.reconnectAttempts;
  }
}
