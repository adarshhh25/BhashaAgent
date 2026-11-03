/**
 * Real-Time Progressive TTS Audio Playback Manager (FE-8)
 *
 * Implements:
 * - Robust decoding of 24,000 Hz linear PCM base64 chunks from Gnani Timbre TTS
 * - Turn generation tracking (stale chunk rejection after interruption/cancel)
 * - Duplicate chunk rejection and sequence ordering
 * - Gapless playback scheduling with Web Audio API
 * - Instant barge-in cutoff
 * - Safe base64 error recovery
 */

export interface AudioPlaybackCallbacks {
  onPlaybackStarted?: () => void;
  onPlaybackComplete?: () => void;
  onError?: (err: Error) => void;
}

export class AudioPlaybackManager {
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private isPaused = false;
  private nextStartTime = 0;
  private scheduledNodes: AudioBufferSourceNode[] = [];
  private isCompleteReceived = false;
  private callbacks: AudioPlaybackCallbacks = {};

  // Generation counter to immediately reject stale chunks from previous turns
  private currentGeneration = 0;
  // Deduplicate chunks per generation
  private processedChunks = new Set<number>();
  private activeRequestId: string | null = null;

  constructor(callbacks: AudioPlaybackCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Ensure AudioContext is initialized and in running state.
   */
  private getOrCreateContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * Start a new audio stream session on AUDIO_START.
   */
  startNewStream(requestId?: string): void {
    this.currentGeneration++;
    this.activeRequestId = requestId ?? null;
    this.processedChunks.clear();
    this.stopScheduledNodes();
    this.isPlaying = false;
    this.isPaused = false;
    this.nextStartTime = 0;
    this.isCompleteReceived = false;
  }

  /**
   * Reset playback queue and cancel any ongoing speech.
   */
  reset(): void {
    this.currentGeneration++;
    this.processedChunks.clear();
    this.stopScheduledNodes();
    this.isPlaying = false;
    this.isPaused = false;
    this.nextStartTime = 0;
    this.isCompleteReceived = false;
  }

  /**
   * Stop and disconnect all actively scheduled audio sources.
   */
  private stopScheduledNodes(): void {
    for (const node of this.scheduledNodes) {
      try {
        node.stop();
        node.disconnect();
      } catch {
        // Node may have already ended
      }
    }
    this.scheduledNodes = [];
  }

  /**
   * Push a base64-encoded 24 kHz linear PCM chunk.
   * Handles deduplication, stale chunk rejection, and gapless Web Audio scheduling.
   */
  enqueueBase64Chunk(chunkIndex: number, base64Audio: string, generation = this.currentGeneration): void {
    // 1. Reject stale chunks from previous or interrupted turns
    if (generation !== this.currentGeneration) {
      return;
    }

    // 2. Reject duplicate chunks
    if (this.processedChunks.has(chunkIndex)) {
      return;
    }
    this.processedChunks.add(chunkIndex);

    try {
      // 3. Decode base64 to PCM bytes
      const pcmBytes = this.base64ToUint8Array(base64Audio);
      if (pcmBytes.length === 0) return;

      // 4. Convert 16-bit linear PCM to Float32
      const floatSamples = this.pcm16ToFloat32(pcmBytes);
      if (floatSamples.length === 0) return;

      const ctx = this.getOrCreateContext();

      // 5. Create audio buffer at 24000 Hz, mono
      const audioBuffer = ctx.createBuffer(1, floatSamples.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      channelData.set(floatSamples);

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(ctx.destination);

      // 6. Gapless scheduling
      const currentTime = ctx.currentTime;
      const startTime = Math.max(currentTime, this.nextStartTime);
      sourceNode.start(startTime);

      this.nextStartTime = startTime + audioBuffer.duration;
      this.scheduledNodes.push(sourceNode);

      if (!this.isPlaying) {
        this.isPlaying = true;
        this.callbacks.onPlaybackStarted?.();
      }

      const currentGenAtSchedule = this.currentGeneration;
      sourceNode.onended = () => {
        // Only process if generation has not changed
        if (currentGenAtSchedule !== this.currentGeneration) return;

        const index = this.scheduledNodes.indexOf(sourceNode);
        if (index !== -1) {
          this.scheduledNodes.splice(index, 1);
        }

        // Check if playback has finished all received chunks
        if (this.scheduledNodes.length === 0 && this.isCompleteReceived) {
          this.isPlaying = false;
          this.callbacks.onPlaybackComplete?.();
        }
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Audio decoding failed');
      this.callbacks.onError?.(error);
    }
  }

  /**
   * Notify that all TTS audio chunks have been sent by the backend.
   */
  markComplete(): void {
    this.isCompleteReceived = true;
    if (this.scheduledNodes.length === 0) {
      this.isPlaying = false;
      this.callbacks.onPlaybackComplete?.();
    }
  }

  /**
   * Instant barge-in: cancel all active audio playback, increment generation
   * to reject in-flight stale chunks, and clear scheduled buffers.
   */
  interrupt(): void {
    this.reset();
  }

  /**
   * Pause playback.
   */
  async pause(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'running') {
      await this.audioContext.suspend();
      this.isPaused = true;
    }
  }

  /**
   * Resume playback.
   */
  async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      this.isPaused = false;
    }
  }

  /**
   * Close AudioContext and free all hardware resources.
   */
  async close(): Promise<void> {
    this.reset();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    this.audioContext = null;
  }

  /**
   * Alias for close() for uniform lifecycle cleanup.
   */
  destroy(): void {
    void this.close();
  }

  /**
   * Convert base64 string to Uint8Array with error handling.
   */
  base64ToUint8Array(base64: string): Uint8Array {
    if (!base64 || typeof base64 !== 'string') {
      return new Uint8Array(0);
    }
    try {
      const binary = atob(base64.trim());
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch {
      throw new Error('Malformed base64 audio chunk');
    }
  }

  /**
   * Convert raw 16-bit signed little-endian PCM bytes to Float32Array.
   */
  pcm16ToFloat32(bytes: Uint8Array): Float32Array {
    const sampleCount = Math.floor(bytes.length / 2);
    const floatArray = new Float32Array(sampleCount);
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let i = 0; i < sampleCount; i++) {
      const int16 = dataView.getInt16(i * 2, true);
      // Map -32768..32767 to -1.0..1.0
      floatArray[i] = int16 < 0 ? int16 / 32768.0 : int16 / 32767.0;
    }

    return floatArray;
  }

  get active(): boolean {
    return this.isPlaying;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get generation(): number {
    return this.currentGeneration;
  }

  get requestId(): string | null {
    return this.activeRequestId;
  }
}
