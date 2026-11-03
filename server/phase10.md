# BhashaAgent Phase 10 — Gnani AI Voice Integration

I recommend implementing Phase 10 as four independently testable backend milestones, followed by Chrome-extension integration. The goal is to add voice as another input/output channel to your existing BhashaAgent conversation engine—not to build a separate voice assistant.

Your existing Phases 3–9 should remain the foundation:

- Phase 3: Conversation Manager
- Phase 4: Profile Memory Manager
- Phase 5: Form Task Manager
- Phase 6: Context Builder
- Phase 7: Agent Orchestrator
- Phase 8: Form Intelligence
- Phase 9: Browser Communication Protocol

Your `.env` variable name is `GNANI`. Keep its value private and make sure the backend reads it; the Chrome extension must never receive the key.

## 1. What the official Gnani documentation confirms

I checked the documentation under the Gnani documentation site you specified, including its STT, Prisma v3.0, TTS, voice catalogue, limits and error-reference pages.

The key architectural decision is supported by the official docs:

- Prisma v3.0 is the STT model to evaluate first because it supports automatic language detection and mixed-language speech. You explicitly select it using `prisma-v3.0`; it is not automatically selected by default.&#x20;

  [image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

  Gnani AI Documentation+1

- Prisma Realtime uses a persistent WebSocket and streams raw PCM audio frames. The server uses voice activity detection (VAD) to identify speech segments and return transcripts.&#x20;

  [image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

  Gnani AI Documentation

- Timbre Realtime uses a WebSocket to generate audio progressively. The docs list Timbre v2.5 and v3.0, with different voice catalogues.&#x20;

  [image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

  Gnani AI Documentation+1

- Gnani requires the `X-API-Key-ID` header. The key should be kept in environment variables or a secrets manager, never committed to source control.&#x20;

  [image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

  Gnani AI Documentation



One correction to the earlier plan: the official documentation describes Prisma's server returning transcript segments at speech boundaries, not simply a generic interim/final event pair. We should implement against the actual documented event contract rather than assume event names.

## 2. Recommended Phase 10 architecture

Chrome Extension — BhashaAgent

Microphone capture · typed input · audio playback

Authenticated application connection

BhashaAgent Backend

Voice Gateway

Authentication · session state · audio routing

Gnani Prisma

Streaming STT

Gnani Timbre

Streaming TTS

Existing Conversation Engine

Phase 3 → Phase 6 Context Builder → Phase 7 Agent Orchestrator

Existing memory, form-task, mapping and browser-authorization services remain authoritative.

The extension communicates only with your backend. The backend communicates with Gnani. This keeps your API key private and ensures that voice and typed messages use the same conversation, memory and form-task rules.

## 3. Phase 10A — Gnani Prisma streaming STT

First milestone to implement

Objective: Connect your backend to Gnani Prisma so BhashaAgent can receive live microphone audio and convert it into finalized text.

### How it should work

1. An authenticated extension client opens a voice connection to BhashaAgent.
2. The backend validates the user's JWT and conversation ownership.
3. The backend opens its own WebSocket connection to Gnani Prisma.
4. The extension sends audio to your backend.
5. The backend forwards audio to Gnani in the documented format.
6. Gnani detects speech boundaries using VAD.
7. Gnani returns a transcript event for each completed speech segment.
8. BhashaAgent forwards the transcript and detected language to the extension.

### Exact Gnani STT configuration

Prisma v3.0 Realtime

Official streaming endpoint

`wss://api.vachana.ai/stt/v3/stream`

| Configuration     | Value                           |
| ----------------- | ------------------------------- |
| Model             | `prisma-v3.0`                   |
| Language          | `indic-auto`                    |
| Audio encoding    | PCM signed 16-bit little-endian |
| Channels          | Mono                            |
| Sample rate       | 16,000 Hz                       |
| Samples per frame | 512                             |
| Frame size        | 1,024 bytes                     |
| Frame duration    | 32 ms                           |
| Transport         | WebSocket                       |
| Authentication    | `x-api-key-id` header           |

These are the documented streaming settings. The provider expects exactly 1,024 bytes per binary frame, sent at real-time cadence rather than in large bursts. WAV and MP3 containers are not accepted as streaming frames.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation+1



### Understand the STT events

This is important because we should implement the real protocol, not invent our own interpretation of it.

| Gnani event    | Meaning                                     | BhashaAgent action             |
| -------------- | ------------------------------------------- | ------------------------------ |
| `connected`    | STT connection established                  | Mark provider ready            |
| `speech_start` | Speech detected                             | Show listening state           |
| `processing`   | Speech segment ended; transcription started | Show processing state          |
| `transcript`   | Completed transcription                     | Display final transcript       |
| `error`        | Provider error                              | Handle recoverable/fatal error |

The `transcript` event contains `text`, `segment_id`, `segment_index`, `utterance_id`, `is_final`, and, with Prisma v3.0, `detected_language_code`. The documentation explicitly says `is_final` is always `true` on this event. Therefore, treat the transcript event as a completed segment—not as an interim transcript.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation+1



### Important language and transcription decision

Prisma v3.0 supports multilingual and code-mixed speech. It can detect the language per utterance. It also supports different output formats:

- `verbatim`: preserve the spoken wording and script.
- `codemix`: handle mixed-language output with English words in Latin script.
- `transliterate`: render the entire transcript using Latin letters.

For BhashaAgent, I recommend starting with `verbatim`, then testing `codemix` and `transliterate` separately. Do not automatically convert Hindi or Marathi speech into English or Roman letters. Preserve the original transcript.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation+1



### What to implement in your backend

- A provider-neutral STT interface.
- A `GnaniPrismaSTTProvider` adapter.
- A backend voice WebSocket gateway.
- Authentication and conversation ownership checks.
- Audio frame validation and forwarding.
- Prisma connection and event handling.
- Transcript event validation.
- Segment deduplication using `segment_id`.
- Language metadata extraction.
- Connection cleanup and safe error handling.

Do not implement the Chrome microphone UI yet. First test with prerecorded PCM audio and a simulated authenticated extension client.

### Acceptance criteria

- Connect successfully to Prisma v3.0.
- Stream valid PCM frames.
- Receive `connected`, `speech_start`, `processing`, and `transcript` events where applicable.
- Correctly handle Hindi, English, Marathi and Hinglish samples.
- Preserve the transcript and detected language.
- Reject duplicate transcript segments.
- Never send incomplete audio or provider errors to the Agent Orchestrator as user messages.
- Keep the Gnani key exclusively on the backend.

One more important limit: Gnani documents a maximum 15-minute streaming session, a default 60-second idle timeout, and account-dependent concurrent-session limits. Your implementation should handle session expiry and verify your account's actual quota.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation



## 4. Phase 10B — Integrate voice with the existing conversation engine

Second milestone

Objective: Make a spoken message behave exactly like a typed message inside BhashaAgent.

This is the most important architectural milestone. STT alone only produces text. Phase 10B makes that text part of your actual AI assistant.

### Expected flow

User speaks in Hindi

Microphone → Prisma STT

Finalized transcript

Transcript + detected language + segment ID

Existing Conversation Manager

Persist as a user message in the existing conversation

Phase 6 — Context Builder

Messages · Approved memories · Active form tasks

Phase 7 — Agent Orchestrator

Existing LLM · Existing tools · Existing policies

Persisted assistant response

Same message history, available to text and voice

### What to implement

1. Take only completed Prisma transcript events.
2. Validate the user, conversation and active voice session.
3. Store the transcript as a user message using the existing Phase 3 message service.
4. Preserve the original transcript.
5. Record its source as voice and the detected language, if the current schema supports it.
6. Invoke the same application-level conversation-turn workflow used by Phase 7.
7. Reuse Phase 6 Context Builder.
8. Reuse approved profile memories and active form-task services.
9. Persist the assistant response using the existing trusted persistence mechanism.
10. Return the assistant text to the extension.

### Important: don't duplicate `/turns`

Do not create a separate voice-specific agent controller that implements its own context building, memory retrieval, tool execution and message persistence.

Instead, inspect the existing `/api/v1/conversations/:id/turns` implementation. If its business logic is currently embedded in the HTTP controller, extract a reusable application service without changing existing behavior.

Both typed and spoken messages should call the same service.

### Database decisions

Do not create a new voice conversation table or separate message history.

First inspect the existing Prisma schema. If messages cannot represent the input channel or language, propose the smallest necessary migration. Do not introduce one automatically.

I recommend storing:

- Original transcript.
- Input channel (`text` or `voice`), if supported.
- Detected language, if supported.
- Provider segment identifier or idempotency reference, if needed.

Do not persist raw microphone audio by default.

### Acceptance criteria

- Voice message appears in the existing conversation.
- Assistant response appears in that same conversation.
- Typed and voice messages share history.
- Voice can continue an existing typed conversation.
- Typed input can continue a conversation that previously used voice.
- Each finalized transcript is processed exactly once.
- Duplicate provider events cannot produce duplicate assistant turns.
- Existing Phase 4–9 authorization and form approval safeguards remain intact.

## 5. Phase 10C — Gnani Timbre real-time TTS

Third milestone

Objective: Convert the assistant's existing text response into speech and stream the audio back to the extension.

You do not need a second AI model to generate the answer. Phase 7 already generates the assistant response. Timbre only converts that response into audio.

### Exact official TTS configuration

Timbre Realtime WebSocket

Official endpoint

`wss://api.vachana.ai/api/v1/tts`

| Setting        | Recommendation                                            |
| -------------- | --------------------------------------------------------- |
| Initial model  | `timbre-v3.0`, if enabled for your account                |
| Voice          | Select from the v3.0 catalogue                            |
| Language       | `auto` for mixed content                                  |
| Sample rate    | 24,000 or 48,000 Hz                                       |
| Channels       | 1 (mono)                                                  |
| Sample width   | 2 bytes                                                   |
| Encoding       | `linear_pcm`                                              |
| Container      | Start with `wav`; evaluate `raw` for progressive playback |
| Authentication | `X-API-Key-ID`                                            |

The official documentation supports both Timbre v2.5 and v3.0. The model and voice must match: a voice from the wrong model's catalogue is rejected.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation+1



### How the TTS connection works

1. Backend receives the final assistant response.
2. Backend selects a supported model, voice and language.
3. Backend connects to the Timbre WebSocket.
4. Backend sends a JSON synthesis request.
5. Gnani returns `start`, `audio`, `complete` or `error` messages.
6. The backend decodes the base64 audio chunks.
7. It forwards audio to the authenticated extension connection.
8. The extension plays chunks in order.
9. Playback state is updated when audio completes or is cancelled.

The official request includes `text`, `voice`, `model`, `language`, `speed` and `audio_config`. It supports `auto`, `hi-IN`, `en-IN`, `mr-IN` and `hi-en`, among other language values.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation+1



### Voice selection

The documentation lists different voice catalogues for the two models:

| Model       | Voice examples            |
| ----------- | ------------------------- |
| Timbre v2.5 | Nalini, Kaveri, Deepak    |
| Timbre v3.0 | Shivani, Avinash, Lakshmi |

Timbre v3.0 lists 13 voices, each supporting all 10 languages. Timbre v2.5 has 42 voices with preferred languages. Test voice quality before making a permanent selection.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation



### Important streaming consideration

The TTS documentation says to send one synthesis request at a time and consume audio chunks as they arrive. The `wav` container includes a WAV header, whereas `raw` has no header. Your extension's playback implementation must understand the selected format; do not concatenate independent WAV headers and assume the result is one valid WAV file.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation+1



I recommend testing both formats with short audio before choosing the final streaming playback format.

### Acceptance criteria

- Assistant response is synthesized correctly.
- Audio chunks are forwarded in order.
- The extension plays the audio without corruption.
- Hindi, English and Marathi speech work.
- Mixed-language response behavior is tested.
- Text remains visible while audio is playing.
- TTS errors do not delete or alter the persisted assistant response.
- Cancellation stops further delivery of the cancelled audio.

## 6. Phase 10D — Voice lifecycle, interruption and reliability

Final milestone

Objective: Make the complete voice experience reliable enough for real users.

This is where you integrate the voice backend with the actual Chrome extension and handle real microphone and playback behavior.

### What to implement

| Feature              | Expected behavior                                               |
| -------------------- | --------------------------------------------------------------- |
| Start recording      | Establish an authenticated voice session                        |
| Stop recording       | Stop microphone capture and finish the current utterance safely |
| Listening state      | Show when microphone audio is being captured                    |
| Processing state     | Show when Gnani is transcribing                                 |
| Transcript state     | Display completed transcript                                    |
| Thinking state       | Show when the agent is processing                               |
| Speaking state       | Show when assistant audio is playing                            |
| Cancellation         | Stop the relevant operation                                     |
| Barge-in             | User can interrupt assistant speech                             |
| Reconnection         | Recover from temporary connection loss safely                   |
| Cleanup              | Close provider and application connections                      |
| Duplicate prevention | Prevent duplicate transcripts and assistant turns               |

### Barge-in is especially important

Consider this scenario:

1. BhashaAgent gives a long spoken explanation in English.
2. The user starts speaking while the assistant is still talking.
3. BhashaAgent stops the current audio playback.
4. The previous TTS stream is cancelled where possible.
5. The new user utterance is sent through Prisma.
6. The finalized transcript enters the existing Conversation Manager.
7. The Agent Orchestrator processes the new request.
8. Timbre generates the updated answer in the requested language.

Do not delete the previous assistant message merely because its audio playback was interrupted. The persisted text response and its audio-delivery status are separate concerns.

### Chrome extension responsibilities

For the frontend integration, use:

- `getUserMedia()` for microphone permission and capture.
- `AudioWorklet` for audio processing.
- PCM conversion and resampling to the required STT input format.
- Authenticated WebSocket communication with BhashaAgent.
- Ordered audio buffering and playback.
- Explicit microphone start/stop controls.
- Connection and playback cleanup when the side panel closes.

The browser's native WebSocket API cannot set arbitrary authentication headers. Your extension should authenticate to your own backend using the established application protocol, while the backend attaches Gnani's required headers to provider connections.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation+1



### Acceptance criteria

- No duplicate messages during reconnects.
- No duplicate assistant responses.
- User can interrupt assistant speech.
- Audio stops when cancellation is requested.
- Provider connections are cleaned up.
- A failed TTS request does not destroy the conversation.
- Existing Phase 5 approval rules are still enforced.
- No automatic form submission.
- No unapproved form filling based on interim audio.
- Text and voice remain synchronized.

## 7. Final recommended implementation order

Do not implement all four milestones in a single coding-agent task. Each milestone should have its own scope, test report and acceptance gate.

1. 10A — Prisma STT integration

   Start here

   Backend provider adapter, WebSocket, PCM streaming and transcript events.
2. 10B — Shared conversation integration

   Persist finalized voice transcripts and invoke the existing Conversation Engine.
3. 10C — Timbre TTS integration

   Generate and stream audio for existing assistant responses.
4. 10D — Lifecycle and extension integration

   Microphone, playback, cancellation, barge-in, reconnection and UI synchronization.

### Suggested repository structure

This is a proposed structure, not an instruction to reorganize your existing backend. The coding agent should inspect the current structure first and adapt to its conventions.

```
server/src/
├── modules/
│   └── voice/
│       ├── voice.gateway.ts
│       ├── voice.session.service.ts
│       ├── voice.types.ts
│       ├── voice.schemas.ts
│       ├── providers/
│       │   └── gnani/
│       │       ├── gnani.config.ts
│       │       ├── prisma-stt.provider.ts
│       │       ├── timbre-tts.provider.ts
│       │       └── gnani.events.ts
│       ├── services/
│       │   ├── stt.service.ts
│       │   ├── tts.service.ts
│       │   └── audio-session.service.ts
│       └── __tests__/
```

Keep provider-specific code isolated. Your Conversation Manager and Agent Orchestrator should not depend directly on Gnani's event formats.

## 8. Environment configuration

You have already added `GNANI` to `.env`. That is fine as the secret variable name, provided the application reads it consistently.

For example:

```
GNANI=your_actual_gnani_api_key
```

The backend configuration should read it through your existing environment-validation system:

```
const gnaniApiKey = process.env.GNANI;
```

Do not add the actual key to source code, frontend environment variables, extension configuration, logs, test fixtures, Git commits or API responses.

Also verify that the key has both STT and TTS permissions. Gnani's official error documentation identifies missing or invalid keys, insufficient service scope, and rate-limit errors as distinct failure cases.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://docs.gnani.ai\&sz=32)

Gnani AI Documentation



Security reminder

The screenshot appears to show part of the key. If the complete key was exposed in a public location, rotate it in the Gnani dashboard and update your `.env`. Do not paste the actual key into a coding-agent prompt.

## 9. Official Gnani documentation to use when creating each implementation prompt

These are the official pages I used. All are on the documentation domain you specified.

| Area                        | Official documentation                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| General API, authentication | [Introduction](https://docs.gnani.ai/api/introduction/introduction?utm_source=chatgpt.com) |
| STT streaming protocol      | [Realtime streaming](https://docs.gnani.ai/api/STT/stt-websocket?utm_source=chatgpt.com)   |
| Prisma v3.0                 | [Prisma v3.0](https://docs.gnani.ai/api/STT/models/prisma-v3?utm_source=chatgpt.com)       |
| STT limits                  | [STT limits](https://docs.gnani.ai/api/STT/limits?utm_source=chatgpt.com)                  |
| TTS streaming protocol      | [TTS Realtime](https://docs.gnani.ai/api/TTS/tts-websocket?utm_source=chatgpt.com)         |
| TTS voice catalogue         | [Available voices](https://docs.gnani.ai/api/TTS/available-voices?utm_source=chatgpt.com)  |
| Provider errors             | [Error reference](https://docs.gnani.ai/api/introduction/errors?utm_source=chatgpt.com)    |

My recommendation: Start by creating the Phase 10A master prompt only. It should instruct your coding agent to inspect your current backend, read the official Prisma documentation above, implement the backend STT integration, and test it using prerecorded audio. Do not let it start 10B, 10C or the frontend until 10A passes.

That way, every next prompt can use the actual interfaces and test results from the preceding milestone rather than making assumptions about your codebase.