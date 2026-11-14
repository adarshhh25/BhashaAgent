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
  const isCancelledRef = useRef(false);
  const voiceGenerationIdRef = useRef(0);
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
        if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) {
          console.log('[useVoiceState] Response arrived after cancellation; suppressing browser execution');
          return;
        }

        setAssistantResponseText(data.response);

        // Execute browser actions in active Chrome tab if provided
        if (data.formActions && data.formActions.length > 0) {
          if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
            chrome.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
              if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) return;
              const isCandidateTab = (t: chrome.tabs.Tab) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('devtools://');
              let tab = tabs.find(isCandidateTab);
              if (!tab) {
                const lastTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
                tab = lastTabs.find(isCandidateTab);
              }
              if (!tab) {
                const allTabs = await chrome.tabs.query({ active: true });
                tab = allTabs.find(isCandidateTab);
              }
              if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) return;
              if (tab?.id && tab.url) {
                const actions = data.formActions!.map((fa, index) => ({
                  actionId: `voice-fill-${Date.now()}-${index}`,
                  fieldId: fa.fieldIdentifier || fa.fieldId || '',
                  fieldIdentifier: fa.fieldIdentifier || fa.fieldId || '',
                  action: fa.actionType,
                  actionType: fa.actionType,
                  value: fa.value,
                  expectedFieldType: '',
                  originalInstruction: (fa as any).originalInstruction,
                  requestedTarget: (fa as any).requestedTarget || fa.label || fa.fieldIdentifier,
                  generationId: voiceGenerationIdRef.current,
                }));
                console.log('[useVoiceState] Executing form actions on active tab:', tab.id, actions);
                const messagePayload = {
                  type: 'EXECUTE_FILL_INSTRUCTIONS',
                  payload: { actions, generationId: voiceGenerationIdRef.current },
                };

                let executedViaMessage = false;

                // Priority 1: Forward via background service worker
                if (chrome.runtime?.sendMessage) {
                  try {
                    if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) return;
                    const fwdResp: any = await chrome.runtime.sendMessage({
                      type: 'FORWARD_TO_CONTENT',
                      targetTabId: tab.id,
                      expectedUrl: tab.url,
                      payload: {
                        type: 'EXECUTE_FILL_INSTRUCTIONS',
                        expectedUrl: tab.url,
                        targetTabId: tab.id,
                        payload: { actions, generationId: voiceGenerationIdRef.current },
                      },
                    });
                    if (fwdResp && fwdResp.success !== false && fwdResp.data?.overallStatus !== 'FAILED') {
                      executedViaMessage = true;
                    }
                  } catch {}
                }

                if (!executedViaMessage) {
                  try {
                    if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) return;
                    const resp = await chrome.tabs.sendMessage(tab.id, messagePayload);
                    if (resp && resp.success !== false) {
                      executedViaMessage = true;
                      console.log('[useVoiceState] Form actions execution result via sendMessage:', resp);
                    }
                  } catch {
                    // If receiving end does not exist, inject content script dynamically and retry
                    try {
                      if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) return;
                      if (chrome.scripting?.executeScript) {
                        await chrome.scripting.executeScript({
                          target: { tabId: tab.id },
                          files: ['content.js'],
                        });
                        if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) return;
                        await new Promise((r) => setTimeout(r, 100));
                        if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) return;
                        const retryResp = await chrome.tabs.sendMessage(tab.id, messagePayload);
                        if (retryResp && retryResp.success !== false) {
                          executedViaMessage = true;
                          console.log('[useVoiceState] Retry after script injection result:', retryResp);
                        }
                      }
                    } catch (injectErr) {
                      console.warn('[useVoiceState] Failed relaying actions to content script:', injectErr);
                    }
                  }
                }

                // Bulletproof direct DOM execution fallback: If content script message did not succeed, execute DOM actions directly via scripting API
                if (!executedViaMessage && chrome.scripting?.executeScript) {
                  if (isCancelledRef.current || sessionManagerRef.current?.isSessionDestroyed) return;
                  try {
                    console.log('[useVoiceState] Falling back to direct DOM scripting execution for actions:', actions);
                    await chrome.scripting.executeScript({
                      target: { tabId: tab.id },
                      func: (actionList: typeof actions) => {
                        for (const act of actionList) {
                          const targetId = act.fieldIdentifier || act.fieldId || '';
                          const actType = (act.action || act.actionType || 'SET_VALUE').toUpperCase();
                          const val = act.value;

                          let el: HTMLElement | null = null;
                          if (targetId) {
                            el = document.getElementById(targetId) || document.querySelector(`[name="${targetId}"]`) || document.querySelector(`[data-field-id="${targetId}"]`);
                          }

                          if (!el && targetId) {
                            const match = targetId.match(/^([-a-zA-Z0-9_]+)[_:](.+)$/);
                            if (match && match[1] && match[2]) {
                              const group = match[1];
                              const part = match[2].toLowerCase();
                              const groupInputs = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${group}"]`));
                              for (const g of groupInputs) {
                                if (g.value.toLowerCase() === part || g.closest('label')?.textContent?.trim().toLowerCase() === part) {
                                  el = g;
                                  break;
                                }
                              }
                            }
                          }

                          if (!el && targetId) {
                            const lower = targetId.toLowerCase();
                            const all = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'));
                            for (const candidate of all) {
                              if (candidate.name && candidate.name.toLowerCase() === lower) { el = candidate; break; }
                              if (candidate.value && candidate.value.toLowerCase() === lower) { el = candidate; break; }
                              const lbl = candidate.closest('label')?.textContent?.trim().toLowerCase();
                              if (lbl && (lbl === lower || lbl.includes(lower) || lower.includes(lbl))) { el = candidate; break; }
                            }
                          }

                          if (!el) {
                            console.warn('[directDOM] Could not find element for:', targetId);
                            continue;
                          }

                          el.focus();
                          const tag = el.tagName.toLowerCase();
                          const inputType = ('type' in el && typeof el.type === 'string') ? el.type.toLowerCase() : tag;

                          if (inputType === 'checkbox') {
                            const chk = el as HTMLInputElement;
                            const targetVal = String(val ?? '').trim().toLowerCase();
                            if (chk.name && (Array.isArray(val) || (targetVal !== 'true' && targetVal !== 'false' && targetVal !== '1' && targetVal !== '0' && targetVal !== 'on' && targetVal !== ''))) {
                              const desiredValues = Array.isArray(val)
                                ? val.map((v) => String(v).trim().toLowerCase())
                                : targetVal.split(/[,\s]+/).map((v) => v.trim().toLowerCase());

                              const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${chk.name}"]`));
                              for (const box of group) {
                                const boxVal = box.value.trim().toLowerCase();
                                const boxLabel = (box.closest('label')?.textContent || '').trim().toLowerCase();
                                const shouldBeChecked = desiredValues.some((dv) => dv === boxVal || dv === boxLabel || boxLabel.includes(dv));
                                if (shouldBeChecked) {
                                  if (!box.checked) {
                                    if (typeof box.click === 'function') box.click();
                                    if (!box.checked) box.checked = true;
                                  }
                                  box.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                                  box.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                                }
                              }
                            } else {
                              const desired = actType === 'CHECK' || (actType === 'SET_VALUE' && (val === true || val === 'true' || val === 1 || String(val).toLowerCase() === 'on'));
                              if (chk.checked !== desired) {
                                chk.click();
                              }
                              if (chk.checked !== desired) {
                                chk.checked = desired;
                              }
                              chk.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                              chk.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            }
                          } else if (inputType === 'radio') {
                            const rad = el as HTMLInputElement;
                            let targetRadio = rad;
                            const targetVal = String(val ?? '').trim().toLowerCase();
                            if (rad.name && targetVal) {
                              const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${rad.name}"]`));
                              const found = group.find((r) => r.value.trim().toLowerCase() === targetVal || r.closest('label')?.textContent?.trim().toLowerCase() === targetVal);
                              if (found) targetRadio = found;
                            }
                            targetRadio.focus();
                            if (!targetRadio.checked) targetRadio.click();
                            if (!targetRadio.checked) targetRadio.checked = true;
                            targetRadio.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                            targetRadio.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                          } else if (tag === 'select') {
                            const sel = el as HTMLSelectElement;
                            const targetVal = String(val ?? '').trim().toLowerCase();
                            for (let i = 0; i < sel.options.length; i++) {
                              const opt = sel.options[i];
                              if (opt && (opt.value.toLowerCase() === targetVal || opt.text.trim().toLowerCase() === targetVal)) {
                                sel.selectedIndex = i;
                                break;
                              }
                            }
                            sel.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                          } else {
                            const inp = el as HTMLInputElement | HTMLTextAreaElement;
                            const strVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
                            try {
                              const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                              const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                              if (desc?.set) {
                                desc.set.call(inp, strVal);
                              } else {
                                inp.value = strVal;
                              }
                            } catch {
                              inp.value = strVal;
                            }
                            inp.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                            inp.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                          }
                        }
                      },
                      args: [actions],
                    });
                    console.log('[useVoiceState] Direct DOM scripting execution completed successfully');
                  } catch (directExecErr) {
                    console.error('[useVoiceState] Direct DOM execution failed:', directExecErr);
                  }
                }
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
    isCancelledRef.current = false;
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
   * Stop listening: moves to IDLE without aborting in-flight response.
   */
  const stopListening = useCallback(() => {
    if (presentationState === 'PROCESSING') {
      // Do not abort in-flight turn if user merely stops recording
      sessionManagerRef.current?.stopAudioCapture();
      return;
    }
    sessionManagerRef.current?.stop();
    setPresentationState('IDLE');
  }, [presentationState]);

  /**
   * Cancel active voice turn or playback explicitly.
   */
  const cancelVoice = useCallback(() => {
    isCancelledRef.current = true;
    voiceGenerationIdRef.current++;
    sessionManagerRef.current?.cancel();
    setPresentationState('CANCELLING');
    setPlaybackState('STOPPED');
    setTranscript(null);

    // Notify content script to reject any in-flight turns with stale generationId
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const tab = tabs[0];
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'CANCEL_FILL_EXECUTION' }).catch(() => {});
        }
      }).catch(() => {});
    }

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
