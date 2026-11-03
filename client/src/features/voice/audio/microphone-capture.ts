/**
 * Real Microphone Audio Capture with Resampling & Framing (FE-8)
 *
 * Implements:
 * - MediaDevices microphone stream acquisition at native hardware sample rate
 * - Web Audio API source node creation
 * - Float32 extraction via AudioWorklet with ScriptProcessor fallback
 * - Real-time downsampling to 16,000 Hz mono via Butterworth anti-aliased resampler
 * - Frame chunking into exact 1024-byte PCM16LE binary frames
 * - Comprehensive resource cleanup on stop/unmount
 */

import { resampleAudio, mixToMono } from './audio-resampler';
import { PcmFrameChunker } from './pcm-encoder';

export interface MicrophoneCaptureCallbacks {
  onFrame?: (frame: Uint8Array) => void;
  onError?: (err: Error) => void;
  onPermissionDenied?: () => void;
}

export class MicrophoneCapture {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: AudioNode | null = null;
  private chunker: PcmFrameChunker = new PcmFrameChunker();
  private isCapturing = false;
  private callbacks: MicrophoneCaptureCallbacks = {};

  constructor(callbacks: MicrophoneCaptureCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Request microphone access and begin streaming resampled PCM16LE frames.
   */
  async start(): Promise<boolean> {
    if (this.isCapturing) return true;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.callbacks.onError?.(new Error('Microphone API is not supported in this environment'));
      return false;
    }

    try {
      // 1. Request microphone stream at hardware native sample rate with voice processing
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 2. Initialize AudioContext
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.chunker.reset();

      // 3. Connect audio processing pipeline
      await this.attachAudioProcessor();

      this.isCapturing = true;
      return true;
    } catch (err: unknown) {
      this.stop();
      const errName = err instanceof Error ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        this.callbacks.onPermissionDenied?.();
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        this.callbacks.onError?.(new Error('No microphone device found on this system'));
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        this.callbacks.onError?.(new Error('Microphone is busy or in use by another application'));
      } else if (errName === 'OverconstrainedError') {
        this.callbacks.onError?.(new Error('Audio hardware does not meet requested constraints'));
      } else {
        const error = err instanceof Error ? err : new Error('Failed to acquire microphone');
        this.callbacks.onError?.(error);
      }
      return false;
    }
  }

  /**
   * Attach audio processing node (tries AudioWorklet, falls back to ScriptProcessor).
   */
  private async attachAudioProcessor(): Promise<void> {
    if (!this.audioContext || !this.sourceNode) return;

    const sourceRate = this.audioContext.sampleRate;
    const targetRate = 16000;

    const handleAudioData = (channelData: Float32Array[]) => {
      if (!this.isCapturing) return;

      // 1. Mix down to mono
      const monoData = mixToMono(channelData);

      // 2. Resample from native rate (e.g. 48k/44.1k) to 16 kHz with anti-aliasing
      const resampled = resampleAudio(monoData, sourceRate, targetRate);

      // 3. Chunk into exact 1024-byte PCM16LE frames
      const frames = this.chunker.processFloat32Samples(resampled);

      // 4. Dispatch frames
      for (const frame of frames) {
        this.callbacks.onFrame?.(frame);
      }
    };

    // Try AudioWorklet first using static extension-origin script
    try {
      if (this.audioContext.audioWorklet) {
        let workletUrl: string;
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
            workletUrl = chrome.runtime.getURL('pcm-processor.js');
          } else {
            workletUrl = '/pcm-processor.js';
          }
          await this.audioContext.audioWorklet.addModule(workletUrl);
        } catch {
          // If extension origin module load fails, fallback to ScriptProcessor
          throw new Error('AudioWorklet module load rejected');
        }

        const workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');
        workletNode.port.onmessage = (event) => {
          if (event.data?.channels && Array.isArray(event.data.channels)) {
            handleAudioData(event.data.channels as Float32Array[]);
          } else if (event.data?.samples) {
            handleAudioData([event.data.samples]);
          }
        };

        this.sourceNode.connect(workletNode);
        this.processorNode = workletNode;
        return;
      }
    } catch {
      // AudioWorklet unavailable or rejected by CSP, fall back to ScriptProcessorNode
    }

    // Fallback: ScriptProcessorNode
    const bufferSize = 2048;
    const scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    scriptNode.onaudioprocess = (audioProcessingEvent) => {
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const channelData: Float32Array[] = [];
      for (let ch = 0; ch < inputBuffer.numberOfChannels; ch++) {
        channelData.push(inputBuffer.getChannelData(ch));
      }
      handleAudioData(channelData);
    };

    this.sourceNode.connect(scriptNode);
    scriptNode.connect(this.audioContext.destination);
    this.processorNode = scriptNode;
  }

  /**
   * Stop audio capture and release hardware resources.
   */
  stop(): void {
    this.isCapturing = false;

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // Disconnect error safe to ignore
      }
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Disconnect error safe to ignore
      }
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Track stop safe to ignore
        }
      });
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        void this.audioContext.close();
      } catch {
        // Context close safe to ignore
      }
      this.audioContext = null;
    }

    this.chunker.reset();
  }

  get capturing(): boolean {
    return this.isCapturing;
  }
}
