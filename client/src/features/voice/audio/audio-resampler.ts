/**
 * Audio Resampler & Channel Mixer with Anti-Aliasing (FE-8)
 *
 * Implements:
 * - 4th-order cascaded Butterworth low-pass anti-aliasing filter before decimation
 * - Resampling to 16,000 Hz from arbitrary rates (48 kHz, 44.1 kHz, 96 kHz)
 * - Multi-channel (stereo) to mono conversion
 * - Amplitude clamping to [-1.0, 1.0] to prevent audio distortion
 */

/**
 * Apply a 4th-order cascaded Butterworth low-pass filter to prevent aliasing.
 * When downsampling to 16 kHz, the Nyquist limit is 8 kHz. Frequencies above
 * 7.2 kHz are aggressively attenuated (24 dB/octave) to eliminate aliasing foldover.
 */
export function applyAntiAliasingFilter(
  samples: Float32Array,
  sourceSampleRate: number,
  cutoffFrequency: number,
): Float32Array {
  if (samples.length === 0 || cutoffFrequency >= sourceSampleRate / 2) {
    return samples;
  }

  // Compute 2nd-order Butterworth low-pass coefficients
  const K = Math.tan((Math.PI * cutoffFrequency) / sourceSampleRate);
  const K2 = K * K;
  const sqrt2 = Math.SQRT2;
  const norm = 1 / (1 + sqrt2 * K + K2);

  const b0 = K2 * norm;
  const b1 = 2 * b0;
  const b2 = b0;
  const a1 = 2 * (K2 - 1) * norm;
  const a2 = (1 - sqrt2 * K + K2) * norm;

  const filtered = new Float32Array(samples.length);

  // Stage 1 (2nd-order)
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i] ?? 0;
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    filtered[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }

  // Stage 2 (Cascade another 2nd-order section for 4th-order 24 dB/oct rolloff)
  let x1_2 = 0;
  let x2_2 = 0;
  let y1_2 = 0;
  let y2_2 = 0;
  for (let i = 0; i < filtered.length; i++) {
    const x0 = filtered[i] ?? 0;
    const y0 = b0 * x0 + b1 * x1_2 + b2 * x2_2 - a1 * y1_2 - a2 * y2_2;
    filtered[i] = y0;
    x2_2 = x1_2;
    x1_2 = x0;
    y2_2 = y1_2;
    y1_2 = y0;
  }

  return filtered;
}

/**
 * Resample a Float32Array of audio samples from sourceSampleRate to targetSampleRate
 * with anti-aliasing filtering when downsampling.
 */
export function resampleAudio(
  samples: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number,
): Float32Array {
  if (sourceSampleRate === targetSampleRate || samples.length === 0) {
    return samples;
  }

  // When downsampling, apply anti-aliasing low-pass filter at 45% of target rate (e.g. 7.2 kHz for 16 kHz)
  let inputSamples = samples;
  if (sourceSampleRate > targetSampleRate) {
    const cutoff = targetSampleRate * 0.45;
    inputSamples = applyAntiAliasingFilter(samples, sourceSampleRate, cutoff);
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const targetLength = Math.round(samples.length / ratio);
  const result = new Float32Array(targetLength);

  for (let i = 0; i < targetLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    const sample1 = inputSamples[index] ?? 0;
    const sample2 = inputSamples[index + 1] ?? sample1;

    // Interpolation
    const interpolated = sample1 + fraction * (sample2 - sample1);

    // Clamp to valid audio bounds [-1.0, 1.0]
    result[i] = Math.max(-1.0, Math.min(1.0, interpolated));
  }

  return result;
}

/**
 * Convert multi-channel (e.g. stereo) planar channel data to mono Float32Array.
 */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }

  if (channels.length === 1) {
    const single = channels[0];
    return single ? clampBuffer(single) : new Float32Array(0);
  }

  const length = channels[0]?.length ?? 0;
  const mono = new Float32Array(length);
  const numChannels = channels.length;

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      sum += channels[c]?.[i] ?? 0;
    }
    const mixed = sum / numChannels;
    mono[i] = Math.max(-1.0, Math.min(1.0, mixed));
  }

  return mono;
}

/**
 * Ensure all values in a Float32Array are clamped within [-1.0, 1.0].
 */
export function clampBuffer(buffer: Float32Array): Float32Array {
  const clamped = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const val = buffer[i] ?? 0;
    clamped[i] = Math.max(-1.0, Math.min(1.0, val));
  }
  return clamped;
}
