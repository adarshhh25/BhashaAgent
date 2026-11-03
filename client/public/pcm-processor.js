/**
 * PCM Audio Capture Processor (AudioWorklet)
 *
 * Runs on the Web Audio rendering thread to extract raw audio channel data
 * and post it to the main thread without blocking the UI.
 *
 * Manifest V3 CSP Compliant: Loaded as a static extension-origin script via
 * chrome.runtime.getURL('pcm-processor.js').
 */

class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channels = [];
      for (let i = 0; i < input.length; i++) {
        channels.push(new Float32Array(input[i]));
      }
      this.port.postMessage({ channels, samples: channels[0] });
    }
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
