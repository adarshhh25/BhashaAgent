/**
 * PCM16LE Audio Frame Encoder (FE-8)
 *
 * Encodes Float32 audio samples into signed 16-bit little-endian PCM bytes
 * and chunks into exact 1024-byte (512 samples) frames required by Gnani Prisma backend STT.
 */

export const FRAME_SAMPLES = 512;
export const FRAME_BYTES = 1024; // 512 * 2 bytes per sample

/**
 * Encode a Float32Array to Int16Array PCM.
 */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1.0, Math.min(1.0, input[i] ?? 0));
    // Scale float to signed 16-bit integer
    output[i] = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7fff);
  }
  return output;
}

/**
 * Convert an Int16Array into a Uint8Array containing little-endian bytes.
 */
export function pcmInt16ToLittleEndianBytes(pcm: Int16Array): Uint8Array {
  const buffer = new ArrayBuffer(pcm.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcm.length; i++) {
    const val = pcm[i] ?? 0;
    view.setInt16(i * 2, val, true); // true = little-endian
  }
  return new Uint8Array(buffer);
}

/**
 * Stateful PCM frame chunker that accumulates incoming resampled samples
 * and yields exact 1024-byte frames.
 */
export class PcmFrameChunker {
  private buffer: Float32Array = new Float32Array(0);

  /**
   * Push new Float32 audio samples and return any complete 1024-byte frames.
   */
  push(samples: Float32Array): Uint8Array[] {
    if (samples.length === 0) return [];

    // Append to existing buffer
    const merged = new Float32Array(this.buffer.length + samples.length);
    merged.set(this.buffer, 0);
    merged.set(samples, this.buffer.length);
    this.buffer = merged;

    const frames: Uint8Array[] = [];

    while (this.buffer.length >= FRAME_SAMPLES) {
      const slice = this.buffer.subarray(0, FRAME_SAMPLES);
      const int16 = floatTo16BitPCM(slice);
      const frameBytes = pcmInt16ToLittleEndianBytes(int16);
      frames.push(frameBytes);

      // Advance buffer
      this.buffer = this.buffer.subarray(FRAME_SAMPLES);
    }

    return frames;
  }

  /**
   * Alias for push()
   */
  processFloat32Samples(samples: Float32Array): Uint8Array[] {
    return this.push(samples);
  }

  /**
   * Reset internal buffer.
   */
  reset(): void {
    this.buffer = new Float32Array(0);
  }

  /**
   * Get remaining buffered sample count.
   */
  get bufferedSamples(): number {
    return this.buffer.length;
  }
}

