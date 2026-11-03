/**
 * Centralized Voice Lifecycle & Presentation State Hook (FE-8)
 *
 * Coordinates:
 * - Real-time VoiceSessionManager (WebSocket + STT + TTS + Web Audio)
 * - Presentation state transitions (IDLE -> CONNECTING -> LISTENING -> PROCESSING -> SPEAKING)
 * - Microphone permission integration
 * - Real-time transcript previews vs finalized user message turns
 * - Pre-flight conversation status checks (DELETED / ARCHIVED prevention)
 * - Assistant response playback & barge-in interruption
 * - Deterministic teardown and message reconciliation
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  VoicePresentationState,
  VoiceOrbState,
  VoiceTranscript,
  AudioPlaybackState,
} from '../types/voice.types';
import { mapToVoiceOrbState } from '../utils/voice-translations';
import { useMicrophonePermission } from './useMicrophonePermission';
import { VoiceSessionManager } from '../services/voice-session.service';

interface UseVoiceStateOptions {
  conversationId?: string | null;
  conversationStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  onFinalizedTurn?: (transcript: string) => Promise<void>;
}

export function useVoiceState({
  conversationId,
  conversationStatus,
  onFinalizedTurn,
}: UseVoiceStateOptions = {}) {
  const [presentationState, setPresentationState] = useState<VoicePresentationState>('IDLE');
  const [transcript, setTranscript] = useState<VoiceTranscript | null>(null);
  const [playbackState, setPlaybackState] = useState<AudioPlaybackState>('IDLE');
  const [assistantResponseText, setAssistantResponseText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePermissionGranted = useCallback(() => {
    setErrorMessage((prev) => (prev?.toLowerCase().includes('permission') ? null : prev));
    setPresentationState((prev) => (prev === 'ERROR' ? 'IDLE' : prev));
  }, []);

  const {
    status: micStatus,
    error: micError,
    requestPermission: requestMicPermission,
  } = useMicrophonePermission({
    onPermissionGranted: handlePermissionGranted,
  });

  const isTransitioningRef = useRef(false);
  const sessionManagerRef = useRef<VoiceSessionManager | null>(null);

  // Initialize or get persistent session manager
  if (sessionManagerRef.current == null) {
    sessionManagerRef.current = new VoiceSessionManager({
      onPresentationStateChange: (state) => {
        setPresentationState(state);
      },
      onPlaybackStateChange: (state) => {
        setPlaybackState(state);
      },
      onTranscriptUpdate: (t) => {
        setTranscript(t);
      },
      onAssistantResponse: (data) => {
        setAssistantResponseText(data.response);
        // Safely reconcile messages in conversation history
        if (onFinalizedTurn) {
          void onFinalizedTurn(transcript?.text ?? data.response).catch(() => {
            // Reconcile silently handled
          });
        }
      },
      onReconnectSuccess: () => {
        // Reconcile canonical conversation history after reconnection
        if (onFinalizedTurn) {
          void onFinalizedTurn('').catch(() => {
            // Reconcile silently handled
          });
        }
      },
      onError: (_code, message) => {
        setErrorMessage(message);
      },
      onSessionEnded: () => {
        setPresentationState('IDLE');
        setPlaybackState('STOPPED');
      },
    });
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionManagerRef.current?.destroy();
      sessionManagerRef.current = null;
    };
  }, []);

  // Derived orb state
  const orbState: VoiceOrbState = mapToVoiceOrbState(presentationState);

  /**
   * Start listening: verifies permission and conversation validity, then initiates session.
   */
  const startListening = useCallback(async () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setErrorMessage(null);

    // If currently speaking, this is a barge-in event
    if (presentationState === 'SPEAKING' || playbackState === 'PLAYING') {
      sessionManagerRef.current?.bargeIn();
      isTransitioningRef.current = false;
      return;
    }

    // Pre-flight validation: conversation status checks
    if (!conversationId) {
      setPresentationState('ERROR');
      setErrorMessage('Please select an active conversation to start voice interaction.');
      isTransitioningRef.current = false;
      return;
    }

    if (conversationStatus === 'DELETED') {
      setPresentationState('ERROR');
      setErrorMessage('This conversation has been deleted. Please select an active conversation.');
      isTransitioningRef.current = false;
      return;
    }

    if (conversationStatus === 'ARCHIVED') {
      setPresentationState('ERROR');
      setErrorMessage('Archived conversations cannot be used for voice. Please unarchive or select an active conversation.');
      isTransitioningRef.current = false;
      return;
    }

    try {
      if (micStatus !== 'GRANTED') {
        setPresentationState('REQUESTING_PERMISSION');
        const granted = await requestMicPermission();
        if (!granted) {
          setPresentationState('ERROR');
          setErrorMessage(
            micError ||
              'Microphone access is needed for voice conversations. Please grant permission in the setup tab.',
          );
          return;
        }
      }

      setPresentationState('CONNECTING');
      const success = await sessionManagerRef.current?.start(conversationId);
      if (!success) {
        setPresentationState('ERROR');
        return;
      }

      setTranscript(null);
    } catch (err) {
      setPresentationState('ERROR');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start listening');
    } finally {
      isTransitioningRef.current = false;
    }
  }, [
    conversationId,
    conversationStatus,
    micError,
    micStatus,
    playbackState,
    presentationState,
    requestMicPermission,
  ]);

  /**
   * Stop listening: moves to IDLE.
   */
  const stopListening = useCallback(() => {
    sessionManagerRef.current?.stop();
    setPresentationState('IDLE');
  }, []);

  /**
   * Cancel active voice turn or playback.
   */
  const cancelVoice = useCallback(() => {
    sessionManagerRef.current?.cancel();
    setPresentationState('CANCELLING');
    setPlaybackState('STOPPED');
    setTranscript(null);

    setTimeout(() => {
      setPresentationState('IDLE');
    }, 400);
  }, []);

  /**
   * Playback controls
   */
  const pausePlayback = useCallback(async () => {
    await sessionManagerRef.current?.pausePlayback();
    setPlaybackState('PAUSED');
  }, []);

  const resumePlayback = useCallback(async () => {
    await sessionManagerRef.current?.resumePlayback();
    setPlaybackState('PLAYING');
  }, []);

  const stopPlayback = useCallback(() => {
    sessionManagerRef.current?.stopPlayback();
    setPlaybackState('STOPPED');
  }, []);

  return {
    presentationState,
    orbState,
    transcript,
    playbackState,
    assistantResponseText,
    errorMessage,
    micStatus,
    startListening,
    stopListening,
    cancelVoice,
    pausePlayback,
    resumePlayback,
    stopPlayback,
  };
}
