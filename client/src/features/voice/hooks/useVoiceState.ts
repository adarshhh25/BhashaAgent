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
  formTaskId?: string | null;
  conversationStatus?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  language?: string;
  onFinalizedTurn?: (transcript: string) => Promise<void>;
}

export function useVoiceState({
  conversationId,
  formTaskId,
  conversationStatus,
  language,
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

        // Execute browser actions in active Chrome tab if provided
        if (data.formActions && data.formActions.length > 0) {
          if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
            chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
              if (tab?.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
                const actions = data.formActions!.map((fa, index) => ({
                  actionId: `voice-fill-${Date.now()}-${index}`,
                  fieldId: fa.fieldId || fa.fieldIdentifier,
                  fieldIdentifier: fa.fieldIdentifier,
                  actionType: fa.actionType,
                  value: fa.value,
                }));
                chrome.tabs.sendMessage(tab.id, {
                  type: 'EXECUTE_FILL_INSTRUCTIONS',
                  payload: { actions },
                }).catch((err) => {
                  console.warn('[useVoiceState] Action execution relay error:', err);
                });
              }
            }).catch(() => {});
          }
        }

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

  // Cleanup on unmount, tab unload, and tab switch guard
  useEffect(() => {
    const handleBeforeUnload = () => {
      sessionManagerRef.current?.destroy();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Tab was hidden or switched: stop active listening to prevent background audio leakage
        sessionManagerRef.current?.stop();
        setPresentationState((prev) => (prev === 'LISTENING' || prev === 'CONNECTING' ? 'IDLE' : prev));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sessionManagerRef.current?.destroy();
      sessionManagerRef.current = null;
    };
  }, []);

  // Update active form task on session manager dynamically
  useEffect(() => {
    if (sessionManagerRef.current && formTaskId !== undefined) {
      sessionManagerRef.current.updateFormTaskId(formTaskId);
    }
  }, [formTaskId]);

  // Teardown session when conversationId changes
  const prevConvIdRef = useRef(conversationId);
  useEffect(() => {
    if (conversationId !== prevConvIdRef.current) {
      prevConvIdRef.current = conversationId;
      sessionManagerRef.current?.destroy();
      setPresentationState('IDLE');
      setTranscript(null);
    }
  }, [conversationId]);

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
      const success = await sessionManagerRef.current?.start(conversationId, formTaskId || undefined, language);
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
    formTaskId,
    conversationStatus,
    micError,
    micStatus,
    playbackState,
    presentationState,
    requestMicPermission,
    language,
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
