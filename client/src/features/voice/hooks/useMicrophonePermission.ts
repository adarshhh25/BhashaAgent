/**
 * Hook for Browser Microphone Permission Management (FE-8 & Phase 10D)
 *
 * Implements:
 * - Checks Permissions API status if supported
 * - Real in-context getUserMedia acquisition test without hanging streams
 * - Chrome Side Panel permission flow: opens dedicated setup tab when prompt is suppressed
 * - Message listener for MIC_PERMISSION_GRANTED and window focus refresh
 * - Safe error classification (denied, prompt, unavailable, not found)
 * - Clean state transitions
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { MicrophonePermissionStatus } from '../types/voice.types';

export function openMicrophonePermissionTab(): void {
  const url =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('permission.html')
      : '/permission.html';

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
  } else if (typeof window !== 'undefined') {
    window.open(url, '_blank');
  }
}

interface UseMicrophonePermissionOptions {
  onPermissionGranted?: () => void;
}

interface UseMicrophonePermissionResult {
  status: MicrophonePermissionStatus;
  isChecking: boolean;
  error: string | null;
  requestPermission: () => Promise<boolean>;
  checkPermission: () => Promise<MicrophonePermissionStatus>;
  openSetupTab: () => void;
}

export function useMicrophonePermission(
  options: UseMicrophonePermissionOptions = {},
): UseMicrophonePermissionResult {
  const [status, setStatus] = useState<MicrophonePermissionStatus>('PROMPT');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const checkPermission = useCallback(async (): Promise<MicrophonePermissionStatus> => {
    if (typeof navigator === 'undefined') {
      setStatus('UNAVAILABLE');
      return 'UNAVAILABLE';
    }

    if (navigator.permissions?.query) {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (result.state === 'granted') {
          setStatus('GRANTED');
          setError(null);
          return 'GRANTED';
        }
        if (result.state === 'denied') {
          setStatus('DENIED');
          return 'DENIED';
        }
        setStatus('PROMPT');
        return 'PROMPT';
      } catch {
        // Permissions API query not supported for microphone on some environments
      }
    }

    return 'PROMPT';
  }, []);

  // Monitor permissions query, window focus, and extension runtime messages
  useEffect(() => {
    let isMounted = true;
    if (typeof navigator === 'undefined') {
      return;
    }

    // Permissions API status change listener
    let permStatusObj: PermissionStatus | null = null;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((result) => {
          if (!isMounted) return;
          permStatusObj = result;
          if (result.state === 'granted') {
            setStatus('GRANTED');
            setError(null);
            optionsRef.current.onPermissionGranted?.();
          } else if (result.state === 'denied') {
            setStatus('DENIED');
          } else {
            setStatus('PROMPT');
          }

          result.onchange = () => {
            if (!isMounted) return;
            if (result.state === 'granted') {
              setStatus('GRANTED');
              setError(null);
              optionsRef.current.onPermissionGranted?.();
            } else if (result.state === 'denied') {
              setStatus('DENIED');
            } else {
              setStatus('PROMPT');
            }
          };
        })
        .catch(() => {});
    }

    // Extension runtime message listener (from permission.html)
    const handleRuntimeMessage = (msg: unknown) => {
      if (
        isMounted &&
        typeof msg === 'object' &&
        msg !== null &&
        (msg as { type?: string }).type === 'MIC_PERMISSION_GRANTED'
      ) {
        setStatus('GRANTED');
        setError(null);
        optionsRef.current.onPermissionGranted?.();
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    }

    // Refresh when user focuses back on side panel
    const handleWindowFocus = () => {
      if (!isMounted) return;
      if (navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'microphone' as PermissionName })
          .then((result) => {
            if (!isMounted) return;
            if (result.state === 'granted') {
              setStatus('GRANTED');
              setError(null);
              optionsRef.current.onPermissionGranted?.();
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      isMounted = false;
      if (permStatusObj) {
        permStatusObj.onchange = null;
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      }
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('UNAVAILABLE');
      setError('Microphone API is not supported in this browser environment');
      return false;
    }

    setIsChecking(true);
    setError(null);

    try {
      // 1. Check Permissions API first
      if (navigator.permissions?.query) {
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          if (result.state === 'granted') {
            setStatus('GRANTED');
            return true;
          }
        } catch {
          // Fall through to real getUserMedia call
        }
      }

      // 2. Perform real in-context getUserMedia acquisition test
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop all tracks to release hardware
      stream.getTracks().forEach((track) => track.stop());
      setStatus('GRANTED');
      return true;
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setStatus('DENIED');
        setError('Microphone access denied. Please allow microphone access in the Chrome permission prompt.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setStatus('UNAVAILABLE');
        setError('No microphone found on this device.');
      } else {
        setStatus('DENIED');
        setError(err instanceof Error ? err.message : 'Failed to obtain microphone permission.');
      }
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  return {
    status,
    isChecking,
    error,
    requestPermission,
    checkPermission,
    openSetupTab: openMicrophonePermissionTab,
  };
}
