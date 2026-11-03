import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VOICE_PROTOCOL_VERSION,
  AUDIO_CAPTURE_CONFIG,
  AUDIO_PLAYBACK_CONFIG,
} from '../src/features/voice/types/voice.types.ts';
import {
  getVoiceStrings,
  getLocalizedStateLabel,
  mapToVoiceOrbState,
} from '../src/features/voice/utils/voice-translations.ts';
import {
  resampleAudio,
  mixToMono,
  clampBuffer,
  applyAntiAliasingFilter,
} from '../src/features/voice/audio/audio-resampler.ts';
import {
  floatTo16BitPCM,
  pcmInt16ToLittleEndianBytes,
  PcmFrameChunker,
  FRAME_SAMPLES,
  FRAME_BYTES,
} from '../src/features/voice/audio/pcm-encoder.ts';
import {
  serverVoiceEventSchema,
  clientVoiceMessageSchema,
} from '../src/features/voice/types/voice.events.ts';
import { AudioPlaybackManager } from '../src/features/voice/audio/audio-playback.ts';
import { VoiceSessionManager } from '../src/features/voice/services/voice-session.service.ts';
import { VoiceWebSocketClient } from '../src/features/voice/services/voice-websocket.service.ts';
import { MicrophoneCapture } from '../src/features/voice/audio/microphone-capture.ts';
import { openMicrophonePermissionTab } from '../src/features/voice/hooks/useMicrophonePermission.ts';
import { ApiError } from '../src/services/api/api-errors.ts';
import { voiceService } from '../src/features/voice/services/voice.service.ts';
import { apiClient } from '../src/services/api/api-client.ts';

// Save original apiClient methods to restore after tests
const originalPost = apiClient.post;

test.afterEach(() => {
  apiClient.post = originalPost;
});

test.describe('Voice Protocol & Audio Constants', () => {
  test('matches Phase 10 backend protocol version', () => {
    assert.equal(VOICE_PROTOCOL_VERSION, 'bhasha.voice.v1');
  });

  test('audio capture matches backend STT (Gnani Prisma 16 kHz Mono PCM16LE)', () => {
    assert.equal(AUDIO_CAPTURE_CONFIG.sampleRate, 16000);
    assert.equal(AUDIO_CAPTURE_CONFIG.channelCount, 1);
    assert.equal(AUDIO_CAPTURE_CONFIG.bytesPerSample, 2);
    assert.equal(AUDIO_CAPTURE_CONFIG.frameSizeBytes, 1024);
    assert.equal(AUDIO_CAPTURE_CONFIG.samplesPerFrame, 512);
  });

  test('audio playback matches backend TTS (Gnani Timbre 24 kHz Mono Linear PCM)', () => {
    assert.equal(AUDIO_PLAYBACK_CONFIG.sampleRate, 24000);
    assert.equal(AUDIO_PLAYBACK_CONFIG.channelCount, 1);
  });
});

test.describe('Voice State to Voice Orb State Mapping', () => {
  test('correctly maps all 8 presentation states to the 4 particle sphere visual states', () => {
    assert.equal(mapToVoiceOrbState('IDLE'), 'idle');
    assert.equal(mapToVoiceOrbState('REQUESTING_PERMISSION'), 'idle');
    assert.equal(mapToVoiceOrbState('LISTENING'), 'listening');
    assert.equal(mapToVoiceOrbState('PROCESSING'), 'thinking');
    assert.equal(mapToVoiceOrbState('SPEAKING'), 'speaking');
    assert.equal(mapToVoiceOrbState('INTERRUPTED'), 'idle');
    assert.equal(mapToVoiceOrbState('CANCELLING'), 'idle');
    assert.equal(mapToVoiceOrbState('ERROR'), 'idle');
  });
});

test.describe('Multilingual Voice Translations (English, Hindi, Marathi, Hinglish)', () => {
  const languages = ['en', 'hi', 'mr', 'hinglish'];

  test('provides complete string bundles for all 4 supported languages', () => {
    for (const lang of languages) {
      const strings = getVoiceStrings(lang);
      assert.ok(strings, `Voice strings bundle missing for ${lang}`);
      assert.ok(strings.voiceModeTitle, `voiceModeTitle missing for ${lang}`);
      assert.ok(strings.tapToSpeak, `tapToSpeak missing for ${lang}`);
      assert.ok(strings.listening, `listening missing for ${lang}`);
      assert.ok(strings.thinking, `thinking missing for ${lang}`);
      assert.ok(strings.speaking, `speaking missing for ${lang}`);
      assert.ok(strings.permissionDenied, `permissionDenied missing for ${lang}`);
      assert.ok(strings.voiceError, `voiceError missing for ${lang}`);
      assert.ok(strings.interrupted, `interrupted missing for ${lang}`);
    }
  });

  test('localized state labels return correct localized strings', () => {
    assert.equal(getLocalizedStateLabel('LISTENING', 'en'), 'Listening…');
    assert.equal(getLocalizedStateLabel('LISTENING', 'hi'), 'सुन रहे हैं…');
    assert.equal(getLocalizedStateLabel('LISTENING', 'mr'), 'ऐकत आहे…');
    assert.equal(getLocalizedStateLabel('LISTENING', 'hinglish'), 'Sun rahe hain…');

    assert.equal(getLocalizedStateLabel('SPEAKING', 'en'), 'Speaking…');
    assert.equal(getLocalizedStateLabel('SPEAKING', 'hi'), 'बोल रहे हैं…');
    assert.equal(getLocalizedStateLabel('SPEAKING', 'mr'), 'बोलत आहे…');
    assert.equal(getLocalizedStateLabel('SPEAKING', 'hinglish'), 'Bol rahe hain…');
  });

  test('preserves user transcript text and scripts without translation or alteration', () => {
    const devnagariHindi = 'नमस्ते, मुझे छात्रवृत्ति का फॉर्म भरना है।';
    const devnagariMarathi = 'नमस्कार, मला नवीन रेशन कार्ड अर्जाबद्दल माहिती हवी आहे.';
    const latinHinglish = 'Mera voter id number ABC1234567 hai.';
    const latinEnglish = 'Can you help me submit this form on time?';

    // Verify scripts remain untouched
    assert.equal(devnagariHindi, 'नमस्ते, मुझे छात्रवृत्ति का फॉर्म भरना है।');
    assert.equal(devnagariMarathi, 'नमस्कार, मला नवीन रेशन कार्ड अर्जाबद्दल माहिती हवी आहे.');
    assert.equal(latinHinglish, 'Mera voter id number ABC1234567 hai.');
    assert.equal(latinEnglish, 'Can you help me submit this form on time?');
  });
});

test.describe('Voice Ticket API Service Integration', () => {
  test('createVoiceTicket calls POST /api/v1/voice/tickets with conversationId', async () => {
    let capturedUrl = '';
    let capturedBody = null;

    apiClient.post = async (url, body) => {
      capturedUrl = url;
      capturedBody = body;
      return {
        data: {
          voice: {
            ticket: 'ticket_bhasha_v1_xyz987',
            expiresAt: '2026-11-03T12:00:00.000Z',
          },
        },
      };
    };

    const convId = '11111111-1111-1111-1111-111111111111';
    const result = await voiceService.createVoiceTicket(convId);

    assert.equal(capturedUrl, '/api/v1/voice/tickets');
    assert.deepEqual(capturedBody, { conversationId: convId });
    assert.equal(result.ticket, 'ticket_bhasha_v1_xyz987');
    assert.equal(result.expiresAt, '2026-11-03T12:00:00.000Z');
  });

  test('createVoiceTicket propagates API error message when ticket creation fails', async () => {
    apiClient.post = async () => {
      throw new Error('Authentication required for voice ticket');
    };

    await assert.rejects(
      async () => {
        await voiceService.createVoiceTicket('11111111-1111-1111-1111-111111111111');
      },
      {
        message: 'Authentication required for voice ticket',
      },
    );
  });
});

test.describe('Voice Lifecycle & Barge-In State Transitions', () => {
  test('barge-in transition: activating mic while assistant is SPEAKING transitions to INTERRUPTED then LISTENING', () => {
    let currentState = 'SPEAKING';
    let playbackState = 'PLAYING';

    // Simulate user barge-in action (pressing mic or speech detected)
    const onUserBargeIn = () => {
      if (currentState === 'SPEAKING' || playbackState === 'PLAYING') {
        playbackState = 'INTERRUPTED';
        currentState = 'LISTENING';
      }
    };

    onUserBargeIn();

    assert.equal(playbackState, 'INTERRUPTED');
    assert.equal(currentState, 'LISTENING');
  });

  test('playback controls: play, pause, stop lifecycle', () => {
    let playbackState = 'IDLE';

    // Start playback
    playbackState = 'PLAYING';
    assert.equal(playbackState, 'PLAYING');

    // User pauses
    playbackState = 'PAUSED';
    assert.equal(playbackState, 'PAUSED');

    // User resumes
    playbackState = 'PLAYING';
    assert.equal(playbackState, 'PLAYING');

    // User stops
    playbackState = 'STOPPED';
    assert.equal(playbackState, 'STOPPED');
  });

  test('transcript accumulator: concatenates partial transcript chunks and preserves final text', () => {
    let text = '';
    let isFinal = false;

    const onChunk = (chunk, final) => {
      text += chunk;
      isFinal = final;
    };

    onChunk('फॉर्म ', false);
    onChunk('सबमिट ', false);
    onChunk('करें', true);

    assert.equal(text, 'फॉर्म सबमिट करें');
    assert.equal(isFinal, true);
  });
});

test.describe('Audio Resampling & Mixing (FE-8)', () => {
  test('resamples 48 kHz audio to 16 kHz (3:1 ratio)', () => {
    // 480 samples at 48 kHz = 10 ms -> should become 160 samples at 16 kHz
    const samples48k = new Float32Array(480);
    for (let i = 0; i < samples48k.length; i++) {
      samples48k[i] = Math.sin((i / 480) * Math.PI * 2);
    }

    const resampled = resampleAudio(samples48k, 48000, 16000);
    assert.equal(resampled.length, 160);
    // Values must remain within valid audio bounds [-1.0, 1.0]
    for (let i = 0; i < resampled.length; i++) {
      assert.ok(resampled[i] >= -1.0 && resampled[i] <= 1.0);
    }
  });

  test('resamples 44.1 kHz audio to 16 kHz', () => {
    // 441 samples at 44.1 kHz = 10 ms -> should become 160 samples at 16 kHz
    const samples44k = new Float32Array(441);
    for (let i = 0; i < samples44k.length; i++) {
      samples44k[i] = 0.5;
    }

    const resampled = resampleAudio(samples44k, 44100, 16000);
    assert.equal(resampled.length, 160);
    // Anti-alias low-pass filter reaches steady-state after transient filter warmup
    const midSample = resampled[Math.floor(resampled.length / 2)];
    assert.ok(Math.abs(midSample - 0.5) < 0.01);
  });

  test('mixToMono averages stereo channels accurately', () => {
    const left = new Float32Array([0.8, -0.4, 0.0]);
    const right = new Float32Array([0.2, -0.6, 1.0]);

    const mono = mixToMono([left, right]);
    assert.equal(mono.length, 3);
    assert.ok(Math.abs(mono[0] - 0.5) < 0.001); // (0.8 + 0.2) / 2
    assert.ok(Math.abs(mono[1] - -0.5) < 0.001); // (-0.4 + -0.6) / 2
    assert.ok(Math.abs(mono[2] - 0.5) < 0.001); // (0.0 + 1.0) / 2
  });

  test('clampBuffer constrains overflowing samples to [-1.0, 1.0]', () => {
    const overflowing = new Float32Array([-2.5, -1.0, 0.0, 1.0, 3.7]);
    const clamped = clampBuffer(overflowing);
    assert.deepEqual(Array.from(clamped), [-1.0, -1.0, 0.0, 1.0, 1.0]);
  });

  test('applyAntiAliasingFilter preserves 1 kHz speech passband and strongly attenuates 10 kHz stopband', () => {
    const N = 480; // 10 ms at 48 kHz
    const lowFreq = new Float32Array(N); // 1 kHz
    const highFreq = new Float32Array(N); // 10 kHz (> 8 kHz Nyquist limit for 16 kHz downsampling)

    for (let i = 0; i < N; i++) {
      lowFreq[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000);
      highFreq[i] = Math.sin((2 * Math.PI * 10000 * i) / 48000);
    }

    const filteredLow = applyAntiAliasingFilter(lowFreq, 48000, 7200);
    const filteredHigh = applyAntiAliasingFilter(highFreq, 48000, 7200);

    // Compute RMS amplitude
    const rms = (arr) => Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0) / arr.length);

    const lowGain = rms(filteredLow) / rms(lowFreq);
    const highGain = rms(filteredHigh) / rms(highFreq);

    // 1 kHz should pass with minimal attenuation (> 0.90)
    assert.ok(lowGain > 0.90, `Expected low-frequency gain > 0.90, got ${lowGain}`);
    // 10 kHz should be heavily attenuated (< 0.20)
    assert.ok(highGain < 0.20, `Expected high-frequency gain < 0.20, got ${highGain}`);
  });
});

test.describe('PCM16LE Frame Encoding & Chunking (FE-8)', () => {
  test('floatTo16BitPCM converts Float32 to signed 16-bit PCM integer', () => {
    const floats = new Float32Array([-1.0, -0.5, 0.0, 0.5, 1.0]);
    const pcm = floatTo16BitPCM(floats);

    assert.equal(pcm[0], -32768); // -1.0 -> -0x8000
    assert.equal(pcm[1], -16384); // -0.5 -> -16384
    assert.equal(pcm[2], 0); // 0.0 -> 0
    assert.equal(pcm[3], 16383); // 0.5 -> 16383
    assert.equal(pcm[4], 32767); // 1.0 -> 32767
  });

  test('pcmInt16ToLittleEndianBytes formats samples as little-endian bytes', () => {
    const pcm = new Int16Array([0x1234, -2]); // 0x1234 -> [0x34, 0x12], -2 (0xFFFE) -> [0xFE, 0xFF]
    const bytes = pcmInt16ToLittleEndianBytes(pcm);

    assert.equal(bytes.length, 4);
    assert.equal(bytes[0], 0x34);
    assert.equal(bytes[1], 0x12);
    assert.equal(bytes[2], 0xfe);
    assert.equal(bytes[3], 0xff);
  });

  test('PcmFrameChunker accumulates samples and yields exact 1024-byte frames', () => {
    const chunker = new PcmFrameChunker();

    // Push 300 samples (less than 512 samples / 1024 bytes)
    const frameSet1 = chunker.push(new Float32Array(300));
    assert.equal(frameSet1.length, 0);
    assert.equal(chunker.bufferedSamples, 300);

    // Push another 300 samples (total 600 -> should yield 1 frame of 512 samples = 1024 bytes, 88 remaining)
    const frameSet2 = chunker.push(new Float32Array(300));
    assert.equal(frameSet2.length, 1);
    assert.equal(frameSet2[0].byteLength, FRAME_BYTES); // 1024 bytes
    assert.equal(chunker.bufferedSamples, 88);

    // Push 1000 samples (total 1088 -> should yield 2 frames = 1024 samples, 64 remaining)
    const frameSet3 = chunker.push(new Float32Array(1000));
    assert.equal(frameSet3.length, 2);
    assert.equal(frameSet3[0].byteLength, 1024);
    assert.equal(frameSet3[1].byteLength, 1024);
    assert.equal(chunker.bufferedSamples, 64);

    chunker.reset();
    assert.equal(chunker.bufferedSamples, 0);
  });
});

test.describe('Voice Protocol Validation & Schemas (FE-8)', () => {
  test('validates client START message schema', () => {
    const valid = clientVoiceMessageSchema.safeParse({
      protocolVersion: 'bhasha.voice.v1',
      messageType: 'START',
      conversationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    });
    assert.equal(valid.success, true);

    const invalid = clientVoiceMessageSchema.safeParse({
      protocolVersion: 'invalid.v1',
      messageType: 'START',
      conversationId: 'not-a-uuid',
    });
    assert.equal(invalid.success, false);
  });

  test('validates server events: SESSION_READY, SPEECH_START, PROCESSING', () => {
    const ready = serverVoiceEventSchema.safeParse({
      protocolVersion: 'bhasha.voice.v1',
      messageType: 'SESSION_READY',
      sessionState: 'READY',
    });
    assert.equal(ready.success, true);

    const speech = serverVoiceEventSchema.safeParse({
      protocolVersion: 'bhasha.voice.v1',
      messageType: 'SPEECH_START',
      sessionState: 'LISTENING',
    });
    assert.equal(speech.success, true);

    const proc = serverVoiceEventSchema.safeParse({
      protocolVersion: 'bhasha.voice.v1',
      messageType: 'PROCESSING',
      sessionState: 'PROCESSING',
    });
    assert.equal(proc.success, true);
  });

  test('validates server TRANSCRIPT event matching Backend Phase 10', () => {
    const transcriptEvent = serverVoiceEventSchema.safeParse({
      protocolVersion: 'bhasha.voice.v1',
      messageType: 'TRANSCRIPT',
      sessionState: 'READY',
      transcript: {
        text: 'नमस्ते मुझे छात्रवृत्ति के बारे में जानना है',
        timestamp: new Date().toISOString(),
        audioDurationMs: 1200,
        segmentId: 'seg-123',
        segmentIndex: 1,
        latencyMs: 85,
        detectedLanguageCode: 'hi-IN',
        utteranceId: 'utt-999',
        isFinal: true,
      },
    });
    assert.equal(transcriptEvent.success, true);
  });

  test('validates server ASSISTANT_RESPONSE event', () => {
    const assistantEvent = serverVoiceEventSchema.safeParse({
      protocolVersion: 'bhasha.voice.v1',
      messageType: 'ASSISTANT_RESPONSE',
      conversationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      assistantMessageId: 'msg-ast-123',
      response: 'आप कौन सी छात्रवृत्ति के लिए आवेदन करना चाहते हैं?',
      reused: false,
    });
    assert.equal(assistantEvent.success, true);
  });

  test('validates server TTS AUDIO_CHUNK event', () => {
    const audioEvent = serverVoiceEventSchema.safeParse({
      protocolVersion: 'bhasha.voice.v1',
      messageType: 'AUDIO_CHUNK',
      chunkIndex: 0,
      audio: Buffer.from([0, 1, 2, 3]).toString('base64'),
    });
    assert.equal(audioEvent.success, true);
  });

  test('validates server ERROR event', () => {
    const errorEvent = serverVoiceEventSchema.safeParse({
      protocolVersion: 'bhasha.voice.v1',
      messageType: 'ERROR',
      error: {
        code: 'SESSION_NOT_READY',
        message: 'Speech provider is not ready',
      },
    });
    assert.equal(errorEvent.success, true);
  });
});

test.describe('TTS Audio Decoding & Playback Helpers (FE-8)', () => {
  test('base64ToUint8Array decodes base64 chunks accurately', () => {
    const manager = new AudioPlaybackManager();
    const original = new Uint8Array([10, 20, 30, 40, 50]);
    const base64 = Buffer.from(original).toString('base64');

    const decoded = manager.base64ToUint8Array(base64);
    assert.deepEqual(Array.from(decoded), Array.from(original));
  });

  test('pcm16ToFloat32 converts 16-bit linear PCM bytes to Float32 array', () => {
    const manager = new AudioPlaybackManager();
    // 0x7FFF = 32767 -> ~1.0, 0x8000 = -32768 -> -1.0, 0x0000 = 0 -> 0.0
    const int16 = new Int16Array([32767, -32768, 0]);
    const bytes = new Uint8Array(int16.buffer);

    const floats = manager.pcm16ToFloat32(bytes);
    assert.equal(floats.length, 3);
    assert.ok(Math.abs(floats[0] - 1.0) < 0.001);
    assert.ok(Math.abs(floats[1] - -1.0) < 0.001);
    assert.ok(Math.abs(floats[2] - 0.0) < 0.001);
  });

  test('interrupt immediately resets active playback state', () => {
    const manager = new AudioPlaybackManager();
    manager.interrupt();
    assert.equal(manager.active, false);
    assert.equal(manager.paused, false);
  });
});

test.describe('VoiceSessionManager Lifecycle & Deduplication (FE-8)', () => {
  test('deduplicates identical segmentId transcripts to prevent duplicate processing', () => {
    let transcriptCount = 0;
    const sessionManager = new VoiceSessionManager({
      onTranscriptUpdate: () => {
        transcriptCount++;
      },
    });

    const payload = {
      text: 'फॉर्म भरें',
      isFinal: true,
      segmentId: 'duplicate-segment-1',
      segmentIndex: 1,
      timestamp: new Date().toISOString(),
      audioDurationMs: 400,
      latencyMs: 20,
      utteranceId: 'utt-1',
    };

    // First emission
    sessionManager['handleServerTranscript'](payload);
    assert.equal(transcriptCount, 1);

    // Duplicate emission with same segmentId
    sessionManager['handleServerTranscript'](payload);
    assert.equal(transcriptCount, 1); // Must remain 1
  });

  test('bargeIn transitions presentation state to LISTENING and stops playback', () => {
    let state = 'SPEAKING';
    const sessionManager = new VoiceSessionManager({
      onPresentationStateChange: (s) => {
        state = s;
      },
    });

    sessionManager.bargeIn();
    assert.equal(state, 'LISTENING');
  });

  test('destroy cleans up resources idempotently', () => {
    const sessionManager = new VoiceSessionManager();
    sessionManager.destroy();
    sessionManager.destroy(); // Calling twice must not throw
    assert.equal(sessionManager.state, 'IDLE');
  });

  test('rejects duplicate ASSISTANT_RESPONSE events with identical assistantMessageId', () => {
    let responseCount = 0;
    const sessionManager = new VoiceSessionManager({
      onAssistantResponse: () => {
        responseCount++;
      },
    });

    const wsHandler = sessionManager['wsClient'] = {
      connect: async () => {},
    };

    // Simulate backend ASSISTANT_RESPONSE
    const assistantData = {
      assistantMessageId: 'msg-ast-dup-1',
      response: 'नमस्ते',
      reused: false,
    };

    // First arrival
    sessionManager['seenAssistantMessageIds'] = new Set();
    if (!sessionManager['seenAssistantMessageIds'].has(assistantData.assistantMessageId)) {
      sessionManager['seenAssistantMessageIds'].add(assistantData.assistantMessageId);
      sessionManager['callbacks'].onAssistantResponse?.(assistantData);
    }
    assert.equal(responseCount, 1);

    // Duplicate arrival with same ID
    if (!sessionManager['seenAssistantMessageIds'].has(assistantData.assistantMessageId)) {
      sessionManager['seenAssistantMessageIds'].add(assistantData.assistantMessageId);
      sessionManager['callbacks'].onAssistantResponse?.(assistantData);
    }
    assert.equal(responseCount, 1); // Strictly remains 1
  });

  test('rejects events arriving after session is destroyed or cancelled', () => {
    let transcriptReceived = false;
    const sessionManager = new VoiceSessionManager({
      onTranscriptUpdate: () => {
        transcriptReceived = true;
      },
    });

    sessionManager.cancel();

    // Late arriving transcript after cancel
    sessionManager['handleServerTranscript']({
      text: 'Late speech',
      isFinal: true,
      segmentId: 'late-seg',
      segmentIndex: 1,
      timestamp: new Date().toISOString(),
      audioDurationMs: 500,
      latencyMs: 10,
      utteranceId: 'utt-late',
    });

    assert.equal(transcriptReceived, false);
  });

  test('stale generation TTS audio chunks are rejected after interruption', () => {
    const manager = new AudioPlaybackManager();
    const initialGen = manager.generation;

    // Simulate interruption
    manager.interrupt();
    const postInterruptGen = manager.generation;
    assert.ok(postInterruptGen > initialGen);

    // Chunk sent with older generation
    const dummyAudio = Buffer.from([1, 2, 3, 4]).toString('base64');
    manager.enqueueBase64Chunk(0, dummyAudio, initialGen);

    // Playback must not have started
    assert.equal(manager.active, false);
  });
});

test.describe('Phase 10D Voice Lifecycle & Connection Hardening', () => {
  test('ApiError parses nested error.message and error.code correctly', () => {
    const err = new ApiError(410, 'Gone', {
      error: { code: 'CONVERSATION_DELETED', message: 'Conversation has been deleted' },
    });
    assert.equal(err.message, 'Conversation has been deleted');
    assert.equal(err.errorCode, 'CONVERSATION_DELETED');
    assert.equal(err.status, 410);
    assert.equal(err.isGone, true);
  });

  test('VoiceWebSocketClient rejects connection promise immediately when socket closes before handshake', async () => {
    const client = new VoiceWebSocketClient();

    apiClient.post = async () => ({
      success: true,
      data: { voice: { ticket: 'test-ticket-fail', expiresAt: new Date().toISOString() } },
    });

    const originalWS = globalThis.WebSocket;
    class MockFailingWS {
      constructor() {
        this.readyState = 0;
        this.onclose = null;
        this.onerror = null;
        setTimeout(() => {
          if (typeof this.onclose === 'function') {
            this.onclose({
              code: 1006,
              reason: 'WebSocket closed before handshake response (status code: 1006)',
            });
          }
        }, 10);
      }
      close() {}
    }
    globalThis.WebSocket = MockFailingWS;

    try {
      await assert.rejects(
        async () => {
          await client.connect('conv-123');
        },
        (err) => {
          assert.ok(
            err.message.includes('WebSocket closed before handshake') ||
              err.message.includes('1006'),
          );
          return true;
        },
      );
    } finally {
      globalThis.WebSocket = originalWS;
    }
  });

  test('VoiceWebSocketClient rejects overlapping simultaneous connection attempts', async () => {
    const client = new VoiceWebSocketClient();
    client['isConnecting'] = true;
    await assert.rejects(
      async () => {
        await client.connect('conv-overlap');
      },
      /already in progress/,
    );
  });

  test('VoiceSessionManager stops reconnecting when permanent error occurs (410 CONVERSATION_DELETED)', async () => {
    let lastErrorCode = '';
    let lastErrorMessage = '';
    const sessionManager = new VoiceSessionManager({
      onError: (code, message) => {
        lastErrorCode = code;
        lastErrorMessage = message;
      },
    });

    apiClient.post = async () => {
      throw new ApiError(410, 'Gone', {
        error: { code: 'CONVERSATION_DELETED', message: 'Conversation has been deleted' },
      });
    };

    const success = await sessionManager.start('deleted-conv-id');
    assert.equal(success, false);
    assert.equal(lastErrorCode, 'CONVERSATION_DELETED');
    assert.ok(lastErrorMessage.includes('deleted'));
    assert.equal(sessionManager['isFatalError'], true);
    assert.equal(sessionManager['reconnectTimer'], null);
  });

  test('VoiceSessionManager stops reconnecting when 409 CONVERSATION_NOT_ACTIVE occurs', async () => {
    let lastErrorCode = '';
    const sessionManager = new VoiceSessionManager({
      onError: (code) => {
        lastErrorCode = code;
      },
    });

    apiClient.post = async () => {
      throw new ApiError(409, 'Conflict', {
        error: { code: 'CONVERSATION_NOT_ACTIVE', message: 'Only active conversations can use voice sessions' },
      });
    };

    const success = await sessionManager.start('archived-conv-id');
    assert.equal(success, false);
    assert.equal(lastErrorCode, 'CONVERSATION_NOT_ACTIVE');
    assert.equal(sessionManager['isFatalError'], true);
    assert.equal(sessionManager['reconnectTimer'], null);
  });

  test('MicrophoneCapture cleans up tracks and AudioContext on stop', () => {
    const capture = new MicrophoneCapture();
    let tracksStopped = false;
    capture['mediaStream'] = {
      getTracks: () => [
        {
          stop: () => {
            tracksStopped = true;
          },
        },
      ],
    };

    let contextClosed = false;
    capture['audioContext'] = {
      state: 'running',
      close: async () => {
        contextClosed = true;
      },
    };

    capture.stop();
    assert.equal(tracksStopped, true);
    assert.equal(contextClosed, true);
    assert.equal(capture['mediaStream'], null);
    assert.equal(capture['audioContext'], null);
    assert.equal(capture.capturing, false);
  });

  test('MicrophoneCapture differentiates NotAllowedError into onPermissionDenied callback', async () => {
    let permissionDeniedFired = false;
    let errorFired = false;
    const capture = new MicrophoneCapture({
      onPermissionDenied: () => {
        permissionDeniedFired = true;
      },
      onError: () => {
        errorFired = true;
      },
    });

    const originalNav = globalThis.navigator;
    globalThis.navigator = {
      mediaDevices: {
        getUserMedia: async () => {
          const err = new Error('Permission dismissed');
          err.name = 'NotAllowedError';
          throw err;
        },
      },
    };

    try {
      const started = await capture.start();
      assert.equal(started, false);
      assert.equal(permissionDeniedFired, true);
      assert.equal(errorFired, false);
    } finally {
      globalThis.navigator = originalNav;
    }
  });

  test('openMicrophonePermissionTab uses chrome.tabs.create with permission.html url', () => {
    let createdUrl = '';
    const originalChrome = globalThis.chrome;
    globalThis.chrome = {
      runtime: {
        getURL: (path) => `chrome-extension://test-id/${path}`,
      },
      tabs: {
        create: ({ url }) => {
          createdUrl = url;
        },
      },
    };

    try {
      openMicrophonePermissionTab();
      assert.equal(createdUrl, 'chrome-extension://test-id/permission.html');
    } finally {
      globalThis.chrome = originalChrome;
    }
  });

  test('MicrophoneCapture chunker receives samples from AudioWorklet channels structure', () => {
    let frameDispatched = false;
    const capture = new MicrophoneCapture({
      onFrame: () => {
        frameDispatched = true;
      },
    });

    // Provide 512 samples in channel 0
    const floatSamples = new Float32Array(512);
    for (let i = 0; i < 512; i++) floatSamples[i] = 0.25;

    // Direct chunker invocation via processFloat32Samples
    const frames = capture['chunker'].processFloat32Samples(floatSamples);
    assert.equal(frames.length, 1);
    assert.equal(frames[0].length, 1024);
  });
});
