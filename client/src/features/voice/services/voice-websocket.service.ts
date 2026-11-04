/**
 * Real-Time Voice WebSocket Client (FE-8)
 *
 * Implements:
 * - Ticket-authenticated connection to /api/v1/voice?ticket=<ticket>
 * - Strict schema validation on all incoming server events
 * - Binary 1024-byte PCM frame transport
 * - Session state synchronization (START, STOP, CANCEL)
 * - Safe error handling, immediate handshake rejection fast-path, and bounded reconnection
 */

import { apiConfig } from '../../../services/api/api-config';
import { voiceService } from './voice.service';
import {
  serverVoiceEventSchema,
  type ServerVoiceEvent,
  type ServerTranscriptPayload,
} from '../types/voice.events';
import { VOICE_PROTOCOL_VERSION } from '../types/voice.types';

export interface VoiceWebSocketCallbacks {
  onSessionState?: (state: string) => void;
  onSessionReady?: () => void;
  onSpeechStart?: () => void;
  onProcessing?: () => void;
  onTranscript?: (transcript: ServerTranscriptPayload) => void;
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
  onAudioStart?: (requestId?: string) => void;
  onAudioChunk?: (chunkIndex: number, base64Audio: string) => void;
  onAudioComplete?: (chunkIndex: number) => void;
  onSessionClosed?: () => void;
  onError?: (code: string, message: string) => void;
  onClose?: (code: number, reason: string) => void;
}

export class VoiceWebSocketClient {
  private socket: WebSocket | null = null;
  private conversationId: string | null = null;
  private isReady = false;
  private isConnecting = false;
  private isExplicitlyClosed = false;
  private callbacks: VoiceWebSocketCallbacks = {};

  constructor(callbacks: VoiceWebSocketCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Connect to backend voice WebSocket gateway with a fresh single-use ticket.
   */
  async connect(conversationId: string, formTaskId?: string, language?: string): Promise<void> {
    if (this.isConnecting) {
      throw new Error('A voice WebSocket connection attempt is already in progress');
    }

    // Clean up any stale existing socket before opening a new one
    this.close();

    this.conversationId = conversationId;
    this.isExplicitlyClosed = false;
    this.isReady = false;
    this.isConnecting = true;

    try {
      // 1. Acquire single-use voice ticket
      const ticketData = await voiceService.createVoiceTicket(conversationId, formTaskId, language);
      if (!ticketData?.ticket) {
        throw new Error('Failed to obtain voice session ticket');
      }

      // 2. Build WebSocket URL
      const wsBase = apiConfig.baseUrl.replace(/^http/, 'ws');
      const wsUrl = `${wsBase}/api/v1/voice?ticket=${encodeURIComponent(ticketData.ticket)}`;

      // 3. Open WebSocket with fast-reject handshake handling
      await new Promise<void>((resolve, reject) => {
        let hasOpened = false;
        let isSettled = false;

        const socket = new WebSocket(wsUrl);
        this.socket = socket;

        const openTimeout = setTimeout(() => {
          if (!isSettled && socket.readyState !== WebSocket.OPEN) {
            isSettled = true;
            this.isConnecting = false;
            try {
              socket.close();
            } catch {
              // Ignore
            }
            reject(new Error('Voice WebSocket connection timed out'));
          }
        }, 10_000);

        socket.onopen = () => {
          if (isSettled) return;
          isSettled = true;
          hasOpened = true;
          this.isConnecting = false;
          clearTimeout(openTimeout);

          // Send START message immediately upon successful connection
          this.sendJson({
            protocolVersion: VOICE_PROTOCOL_VERSION,
            messageType: 'START',
            conversationId,
            ...(formTaskId ? { formTaskId } : {}),
          });
          resolve();
        };

        socket.onmessage = (event: MessageEvent) => {
          this.handleIncomingMessage(event.data);
        };

        socket.onerror = () => {
          if (!hasOpened && !isSettled) {
            // Handshake failure will be finalized in onclose
          }
          this.callbacks.onError?.('WEBSOCKET_ERROR', 'Voice WebSocket connection error');
        };

        socket.onclose = (event: CloseEvent) => {
          clearTimeout(openTimeout);
          this.isReady = false;

          if (!hasOpened && !isSettled) {
            // Handshake failed or rejected by server: reject connection promise immediately
            isSettled = true;
            this.isConnecting = false;
            const failureReason =
              event.reason ||
              `WebSocket closed before handshake response (status code: ${event.code})`;
            reject(new Error(failureReason));
            return;
          }

          this.isConnecting = false;
          // Only trigger unexpected-drop onClose callback if connection had successfully opened
          if (!this.isExplicitlyClosed && hasOpened) {
            this.callbacks.onClose?.(event.code, event.reason);
          }
        };
      });
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Validate and route incoming WebSocket JSON messages.
   */
  private handleIncomingMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      this.callbacks.onError?.('MALFORMED_MESSAGE', 'Received malformed JSON event from voice server');
      return;
    }

    const validation = serverVoiceEventSchema.safeParse(parsedJson);
    if (!validation.success) {
      // Safely ignore unknown future protocol events
      return;
    }

    const event: ServerVoiceEvent = validation.data;

    switch (event.messageType) {
      case 'SESSION_STATE':
        this.callbacks.onSessionState?.(event.sessionState);
        break;

      case 'SESSION_READY':
        this.isReady = true;
        this.callbacks.onSessionReady?.();
        break;

      case 'SPEECH_START':
        this.callbacks.onSpeechStart?.();
        break;

      case 'PROCESSING':
        this.callbacks.onProcessing?.();
        break;

      case 'TRANSCRIPT':
        this.callbacks.onTranscript?.(event.transcript);
        break;

      case 'ASSISTANT_RESPONSE':
        this.callbacks.onAssistantResponse?.({
          assistantMessageId: event.assistantMessageId,
          response: event.response,
          reused: event.reused,
          formActions: event.formActions,
        });
        break;

      case 'AUDIO_START':
        this.callbacks.onAudioStart?.(event.requestId);
        break;

      case 'AUDIO_CHUNK':
        this.callbacks.onAudioChunk?.(event.chunkIndex, event.audio);
        break;

      case 'AUDIO_COMPLETE':
        this.callbacks.onAudioComplete?.(event.chunkIndex);
        break;

      case 'SESSION_CLOSED':
        this.isReady = false;
        this.callbacks.onSessionClosed?.();
        break;

      case 'ERROR':
        this.callbacks.onError?.(event.error.code, event.error.message);
        break;
    }
  }

  /**
   * Send binary PCM frame (must be exactly 1024 bytes).
   */
  sendBinaryFrame(frame: Uint8Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.isReady) {
      return;
    }

    if (frame.byteLength !== 1024) {
      return;
    }

    this.socket.send(frame);
  }

  /**
   * Send JSON protocol message.
   */
  private sendJson(payload: Record<string, unknown>): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  /**
   * Dynamically update active form task ID.
   */
  updateFormTask(formTaskId: string | null | undefined): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.isReady) {
      this.sendJson({
        protocolVersion: VOICE_PROTOCOL_VERSION,
        messageType: 'UPDATE_FORM_TASK',
        formTaskId: formTaskId || undefined,
      });
    }
  }

  /**
   * Gracefully stop the voice session.
   */
  stop(): void {
    this.isExplicitlyClosed = true;
    this.isReady = false;
    this.sendJson({
      protocolVersion: VOICE_PROTOCOL_VERSION,
      messageType: 'STOP',
    });
    this.close();
  }

  /**
   * Cancel ongoing voice turn.
   */
  cancel(): void {
    this.isExplicitlyClosed = true;
    this.isReady = false;
    this.sendJson({
      protocolVersion: VOICE_PROTOCOL_VERSION,
      messageType: 'CANCEL',
    });
    this.close();
  }

  /**
   * Close WebSocket connection and release resources.
   */
  close(): void {
    this.isExplicitlyClosed = true;
    this.isReady = false;
    this.isConnecting = false;
    if (this.socket) {
      try {
        if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
          this.socket.close();
        }
      } catch {
        // Ignored
      }
      this.socket = null;
    }
  }

  get ready(): boolean {
    return this.isReady && this.socket?.readyState === WebSocket.OPEN;
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get connecting(): boolean {
    return this.isConnecting;
  }

  get activeConversationId(): string | null {
    return this.conversationId;
  }
}
