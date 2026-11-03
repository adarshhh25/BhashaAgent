# BhashaAgent — Complete Frontend Master Development Plan

**Project:** BhashaAgent  
**Application:** Multilingual AI Browser Assistant  
**Platform:** Google Chrome Extension  
**Extension Standard:** Manifest V3  
**Development Approach:** Incremental, phase-based implementation  
**Frontend Architecture:** React + TypeScript + Vite  
**Backend:** Existing Node.js + Express + TypeScript backend  
**Database:** Existing PostgreSQL + Prisma backend

---

# 1. Project Objective

Develop the complete BhashaAgent frontend from the existing React, TypeScript, Vite and Tailwind CSS project.

BhashaAgent is a multilingual conversational browser assistant that understands webpage forms, retrieves relevant user information, assists users in completing forms, and supports natural text and voice conversations.

The frontend must integrate with the already implemented backend rather than reimplementing backend functionality.

The frontend is responsible for:

1. Chrome extension lifecycle and application entry points.
2. User authentication and session management.
3. Conversation management and messaging.
4. Displaying and managing approved profile memories.
5. Displaying detected webpage forms and their fields.
6. Presenting mapped values, missing information and conflicts.
7. Collecting explicit user approval before browser actions.
8. Communicating with the backend browser-action protocol.
9. Microphone capture and audio playback.
10. Multilingual text and voice interaction.
11. Synchronizing extension state across supported extension contexts.

The backend remains the authority for authentication, persistent data, memory approval, agent execution, form-task state, authorization and browser-action decisions.

The frontend must never independently make decisions that belong to the backend.

# 2. Existing Project and Backend Context

The frontend project already contains:

- React
- TypeScript
- Vite
- Tailwind CSS
- Existing npm project configuration

Inspect and preserve the existing setup before modifying it.

The backend has already completed these milestones:

| Backend phase | Completed responsibility |
|---|---|
| Phase 1 | PostgreSQL database foundation |
| Phase 2 | Authentication and user management |
| Phase 3 | Conversation management |
| Phase 4 | Profile Memory Manager |
| Phase 5 | Form Task Manager |
| Phase 6 | Context Builder |
| Phase 7 | Agent Orchestrator |
| Phase 8 | Form Intelligence and Field Mapping |
| Phase 9 | Browser Communication and Action Protocol |
| Phase 10A | Gnani Prisma streaming STT |
| Phase 10B | Voice-to-conversation integration |
| Phase 10C | Gnani Timbre real-time TTS |

Phase 10D, which covers complete voice lifecycle and interruption reliability, is still pending.

Do not recreate these backend capabilities in the frontend.

# 3. Technology Architecture

## 3.1 Core technologies

| Component | Technology |
|---|---|
| UI framework | React 18 |
| Programming language | TypeScript |
| Build system | Vite |
| Styling | Tailwind CSS |
| Extension architecture | Chrome Manifest V3 |
| Icons | Lucide React |
| Form validation | Zod where appropriate |
| State management | Zustand where shared state requires it |
| API communication | Typed Fetch-based API client |
| Real-time communication | WebSocket |
| Audio processing | AudioWorklet and Web Audio API |
| Browser integration | Chrome Extension APIs |
| Testing | Vitest, React Testing Library and suitable browser E2E tooling |
| Code quality | ESLint and Prettier |

Use compatible package versions. Inspect existing dependencies before installing or upgrading anything.

Do not add libraries merely because they are commonly used.

## 3.2 Application architecture

The application must maintain separate responsibilities for:

**Side Panel**
- Main application entry point.
- Conversations.
- Profile memory management.
- Form intelligence.
- Voice interaction.
- Application-level navigation and state.

**Popup**
- Lightweight extension entry point.
- Extension status and launch-related operations.
- Must not duplicate the complete side-panel application.

**Background Service Worker**
- Extension lifecycle.
- Tab and window coordination.
- Extension messaging.
- Registration and management of extension-level events.
- Communication with privileged extension contexts where necessary.

**Content Script**
- Webpage DOM inspection.
- Detection of supported form controls.
- Communication of detected webpage information.
- Execution of explicitly approved and authorized browser actions.
- Reporting execution acknowledgements.

**Shared Frontend Services**
- Authentication client.
- API client.
- WebSocket client.
- Browser messaging contracts.
- State management.
- Error handling.
- Internationalization.
- Logging and diagnostics.

These contexts must communicate through well-defined, typed message contracts.

Do not assume that React state, module variables or ordinary browser storage are shared between the side panel, popup, service worker and content script.

# 4. Target Folder Architecture

Establish the following logical architecture incrementally.

frontend/
|
├── public/
│   └── icons/
|
├── src/
│   |
│   ├── app/
│   │   ├── App.tsx
│   │   ├── providers/
│   │   ├── routes/
│   │   └── initialization/
│   |
│   ├── sidepanel/
│   │   ├── SidePanel.tsx
│   │   ├── components/
│   │   └── index.tsx
│   |
│   ├── popup/
│   │   ├── Popup.tsx
│   │   └── index.tsx
│   |
│   ├── background/
│   │   ├── service-worker.ts
│   │   ├── lifecycle/
│   │   └── messaging/
│   |
│   ├── content/
│   │   ├── content.ts
│   │   ├── detector/
│   │   ├── executor/
│   │   └── messaging/
│   |
│   ├── components/
│   │   ├── ui/
│   │   ├── shared/
│   │   └── feedback/
│   |
│   ├── features/
│   │   ├── authentication/
│   │   ├── conversations/
│   │   ├── memories/
│   │   ├── forms/
│   │   ├── browser-actions/
│   │   └── voice/
│   |
│   ├── services/
│   │   ├── api/
│   │   ├── auth/
│   │   ├── websocket/
│   │   ├── browser/
│   │   └── storage/
│   |
│   ├── stores/
│   ├── hooks/
│   ├── types/
│   ├── schemas/
│   ├── utils/
│   ├── constants/
│   ├── i18n/
│   ├── styles/
│   └── main.tsx
|
├── manifest.json
├── index.html
├── popup.html
├── package.json
├── vite.config.ts
└── tsconfig.json

This is the target logical structure. Create folders when their corresponding milestones are implemented. Avoid empty placeholder modules and unnecessary abstractions.

# 5. Global Engineering Rules

All frontend milestones must follow these rules.

## 5.1 Backend contract preservation

- Inspect existing backend routes and schemas before integration.
- Use actual backend request and response contracts.
- Do not invent endpoint names.
- Do not invent WebSocket event names.
- Do not silently change backend payload structures.
- Do not duplicate business logic in React components.
- Keep API communication inside dedicated service modules.
- Use shared TypeScript types where contracts are available.
- Validate untrusted incoming data at appropriate boundaries.

## 5.2 Authentication and security

- Never store plaintext passwords.
- Never embed Groq or Gnani API credentials in frontend code.
- Never expose backend secret configuration.
- Do not place long-lived access or refresh credentials in URLs.
- Apply the backend's authentication and session-rotation contracts.
- Use short-lived voice session tickets when required by the existing voice protocol.
- Enforce authorization on the backend, not merely through frontend route restrictions.
- Avoid logging tokens, passwords, personal form values or raw audio.
- Use minimum Chrome permissions.

## 5.3 State management

Separate:

- Authentication state.
- Conversation state.
- Profile memory state.
- Form-task state.
- Browser execution state.
- Voice-session state.
- UI-level transient state.

Do not create one enormous global store.

Use local React state for isolated component behavior and shared stores only when state genuinely crosses components or extension contexts.

Persist only state that has a clear persistence requirement.

## 5.4 Error handling

Create a consistent error-handling strategy for:

- Network failures.
- Authentication expiration.
- Unauthorized access.
- Validation failures.
- Backend errors.
- WebSocket disconnections.
- Browser tab changes.
- Content script unavailability.
- Stale form tasks.
- Approval invalidation.
- Audio-device errors.
- Microphone permission denial.
- STT and TTS failures.

Errors must not silently turn into successful operations.

## 5.5 Internationalization

Support the four established languages:

- English
- Hindi
- Marathi
- Hinglish

Preserve the original user message and transcript.

Do not automatically translate user text when the user's intent is only transliteration or script conversion.

Language selection and detected language are separate concepts.

---

# 6. Frontend Development Milestones

# FE-0 — Chrome Extension Foundation

**Objective:** Convert the existing React/Vite project into a functional Chrome Manifest V3 extension.

## Responsibilities

### A. Existing project inspection

Inspect:

- package.json
- vite.config.ts
- TypeScript configuration
- Tailwind version and configuration
- App.tsx
- main.tsx
- Existing CSS
- Existing dependencies

Preserve working configuration wherever possible.

### B. Manifest V3 foundation

Implement:

- manifest.json
- Extension name and description.
- Extension icons.
- Side panel configuration.
- Popup entry point.
- Background service worker registration.
- Content script configuration.
- Required permissions.
- Extension action configuration.

Only request permissions required by implemented functionality.

Do not request broad host permissions without a documented reason.

### C. Vite build configuration

Configure production builds for:

- Side panel.
- Popup.
- Background service worker.
- Content script.
- Static assets.
- Manifest.
- Extension icons.

Ensure the production build generates a valid Chrome-loadable extension.

Do not assume a normal Vite web build automatically produces a valid extension.

Verify asset paths and service-worker output.

### D. Application initialization

Establish:

- Typed application entry points.
- Environment configuration.
- Shared constants.
- Error boundaries where appropriate.
- Application initialization sequence.
- Extension context identification.

### E. Development and production environments

Establish:

- Local development configuration.
- Backend base URL configuration.
- Production build configuration.
- Environment-variable validation.
- Separation of development-only and production-only behavior.

Do not embed secrets in Vite environment variables.

## Testing

- Production build.
- TypeScript checks.
- ESLint.
- Manifest validation.
- Chrome extension loading.
- Side panel opening.
- Popup opening.
- Service worker initialization.
- Content script registration.
- Asset loading.

## Acceptance criteria

FE-0 is complete only when:

1. Chrome accepts the generated extension.
2. Side panel and popup entry points load.
3. Background service worker registers successfully.
4. Content script is available on explicitly supported test pages.
5. No missing production assets exist.
6. Build and static checks pass.

No backend business functionality is implemented in this milestone.

---

# FE-1 — Frontend Application Foundation and Design System

**Objective:** Establish the reusable frontend architecture and visual design system before implementing business features.

## Responsibilities

### A. Shared component architecture

Establish reusable components and clear boundaries for:

- Common controls.
- Application-level components.
- Feature-level components.
- Reusable interaction patterns.
- Loading and error states.
- Confirmation and approval interactions.

Do not build feature-specific logic into generic shared components.

### B. Design tokens

Create centralized design tokens for:

- Dark theme.
- Forest-green primary identity.
- Neutral surfaces.
- Text hierarchy.
- Borders.
- Status indicators.
- Spacing.
- Typography.
- Elevation.
- Focus and interaction states.

The dark theme must use charcoal, forest green and restrained neutral colors.

No blue, indigo, purple or slate branding.

Support theme tokens centrally instead of scattering arbitrary colors throughout components.

### C. Component standards

Establish:

- Consistent component interfaces.
- Reusable variants.
- Accessibility requirements.
- Keyboard navigation.
- Focus handling.
- Responsive constraints.
- Predictable component state.

### D. Application-level architecture

Establish:

- Application providers.
- Feature module boundaries.
- Shared hooks.
- Error-handling utilities.
- Common loading states.
- Notifications and feedback infrastructure.
- Typed event definitions.

### E. Routing and navigation architecture

Define the navigation structure for the side panel and any required popup navigation.

Do not introduce routing complexity without a real requirement.

### F. State infrastructure

Establish the principles and initial infrastructure for:

- Local state.
- Shared application state.
- Cross-context synchronization.
- Persisted preferences.
- Transient feature state.

## Testing

- Shared component tests.
- Theme token validation.
- Accessibility checks.
- TypeScript checks.
- Production build.
- Extension loading.

## Acceptance criteria

FE-1 is complete when the application has a consistent component architecture, reusable design tokens, defined feature boundaries and verified extension compatibility.

No authentication or business API integration is required yet.

---

# FE-2 — Authentication and User Account Integration

**Backend dependency:** Phase 2.

**Objective:** Integrate the frontend with the existing authentication and user-management system.

## Responsibilities

### A. Authentication API integration

Integrate the existing endpoints:

- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- POST /api/v1/auth/logout-all
- GET /api/v1/users/me
- PATCH /api/v1/users/me
- PATCH /api/v1/users/me/password
- DELETE /api/v1/users/me

Inspect the actual backend contracts before implementation.

### B. Authentication state management

Implement:

- Initial authentication restoration.
- Login state.
- Registration state.
- Authenticated user state.
- Session expiration handling.
- Logout.
- Session revocation.
- Account deletion flow.

### C. Token management

Follow the existing backend access-token and refresh-token rotation design.

Requirements:

- Keep token handling inside a dedicated authentication service.
- Prevent duplicate simultaneous refresh requests.
- Handle expired access tokens.
- Handle refresh-token reuse and revocation errors.
- Avoid refresh loops.
- Handle browser and extension lifecycle correctly.
- Never store plaintext credentials.

Choose storage based on the extension threat model and the backend's token semantics. Do not automatically persist long-lived credentials in local storage.

### D. Protected application state

Prevent authenticated features from executing without a valid session.

The backend remains responsible for final authorization.

### E. Account management

Integrate user profile retrieval and update functionality.

Include password change and account deletion operations using the actual backend contracts.

## Testing

- Registration.
- Login.
- Invalid credentials.
- Session restoration.
- Access-token expiration.
- Refresh-token rotation.
- Logout.
- Logout-all.
- Account update.
- Account deletion.
- Unauthorized API handling.
- Multiple extension contexts.
- Refresh concurrency.

## Acceptance criteria

FE-2 is complete when the extension can reliably authenticate, restore and terminate sessions using the existing backend.

No mock authentication or frontend-only authentication is permitted.

---

# FE-3 — Conversation Management and Conversational Interface

**Backend dependencies:** Phases 3, 6 and 7.

**Objective:** Integrate the existing conversation system and Agent Orchestrator.

## Responsibilities

### A. Conversation management

Integrate:

- Conversation creation.
- Conversation listing.
- Conversation retrieval.
- Conversation updates.
- Conversation archiving.
- Soft deletion.
- Conversation history.
- Pagination where supported.

Use the actual Phase 3 backend contracts.

### B. Message management

Implement:

- User messages.
- Assistant messages.
- Message persistence.
- Message loading.
- Message correction.
- Message revision history.
- Multilingual message handling.

Preserve the original user message.

Do not silently modify user-authored text.

### C. Agent Orchestrator integration

Integrate the existing authenticated conversation-turn endpoint:

POST /api/v1/conversations/:id/turns

Follow the real request and response contracts.

Implement:

- Turn submission.
- Assistant response handling.
- Request loading state.
- Error handling.
- Duplicate submission prevention.
- Appropriate request correlation.
- Conversation refresh after successful operations.

Do not recreate Groq orchestration in the frontend.

### D. Context awareness

The backend Context Builder is authoritative.

The frontend should display relevant conversation and task information returned by the backend.

Do not construct a replacement AgentContext in React.

### E. Message reliability

Ensure:

- A submitted message is not accidentally submitted twice.
- Network retries do not create duplicate turns.
- Persisted assistant messages are not confused with temporary UI messages.
- Conversation switching does not display messages from the wrong conversation.
- Corrections follow backend revision rules.

### F. Language support

Support English, Hindi, Marathi and Hinglish.

Preserve original script and text.

Do not convert Hinglish into Hindi or English unless explicitly requested or authorized by the language-processing behavior.

## Testing

- Conversation creation.
- Conversation listing.
- Conversation retrieval.
- Message submission.
- Assistant response persistence.
- Multilingual messages.
- Conversation switching.
- Message correction.
- Duplicate request handling.
- Expired session handling.
- Cross-user isolation through backend integration tests.

## Acceptance criteria

FE-3 is complete when users can manage conversations and exchange messages with the existing Agent Orchestrator reliably.

---

# FE-4 — Profile Memory Interface

**Backend dependency:** Phase 4.

**Objective:** Expose the existing Profile Memory Manager functionality through the frontend.

## Responsibilities

### A. Approved memory retrieval

Integrate:

GET /api/v1/memories

Display only the approved memories returned by the backend.

### B. Memory extraction and proposals

Integrate:

- POST /api/v1/memories/extract
- POST /api/v1/memories/proposals
- GET /api/v1/memories/proposals

Follow the actual request schemas.

### C. Memory approval workflow

Integrate:

- POST /api/v1/memories/proposals/:id/approve
- POST /api/v1/memories/proposals/:id/reject

The frontend must clearly distinguish:

- Approved memories.
- Pending proposals.
- Rejected proposals where history is available.
- Inactive or deleted memories.

Pending proposals must never be presented as approved facts.

### D. Memory management

Integrate:

- PATCH /api/v1/memories/:id
- DELETE /api/v1/memories/:id

Implement appropriate confirmation and result handling.

### E. Memory synchronization

After approval, rejection, modification or deletion:

- Refresh the relevant memory state.
- Avoid stale memory displays.
- Handle concurrent updates.
- Respect backend ownership checks.

### F. Data provenance

Display available memory metadata and sources when provided by the backend.

Do not fabricate memory sources or confidence values.

## Testing

- Memory retrieval.
- Proposal creation.
- Approval.
- Rejection.
- Memory update.
- Memory deletion.
- Duplicate proposal handling.
- Stale state handling.
- Cross-user access rejection.

## Acceptance criteria

FE-4 is complete when the frontend supports the complete approved-memory and proposal lifecycle without bypassing backend approval rules.

---

# FE-5 — Form Intelligence and Form Task Interface

**Backend dependencies:** Phases 5, 6 and 8.

**Objective:** Integrate form tasks, detected fields, field mappings, missing information and conflict resolution.

## Responsibilities

### A. Form task management

Integrate existing Form Task Manager capabilities.

Support the actual backend lifecycle:

- Task creation.
- Task listing.
- Task retrieval.
- Task update.
- Pause.
- Resume.
- Cancel.
- Retry.
- Failure handling.

Support multiple independent form tasks within the same conversation.

### B. Detected-field management

Receive and display detected fields associated with the active form task.

Support field metadata such as:

- Field identifier.
- Field label.
- Field type.
- Required status.
- Available options.
- Current value.
- Mapping status.
- Source information.
- Confidence information.
- Approval status.

Use actual backend types and contracts.

### C. Form intelligence integration

Integrate Phase 8 mapping functionality.

Display:

- Successfully mapped fields.
- Unmapped fields.
- Missing information.
- Conflicting values.
- Validation errors.
- Mapping confidence.
- Value provenance.
- Existing task values.

Do not calculate an alternative mapping independently in the UI.

### D. User corrections

Allow users to correct proposed values.

Requirements:

- Preserve correction history.
- Send corrections through authorized backend operations.
- Respect correction precedence.
- Handle stale task versions.
- Refresh affected task state.
- Do not overwrite unrelated existing values.

### E. Approval workflow

Integrate the existing field-level and final task approval workflow.

Requirements:

- Distinguish field approval from final task approval.
- Display current approval status.
- Handle invalidated approval.
- Require renewed approval after material changes.
- Display the approved snapshot or relevant version information when provided.

A high-confidence mapping is not equivalent to user approval.

### F. Multiple task handling

Handle:

- One active task.
- Multiple tasks.
- Ambiguous task selection.
- Cancelled tasks.
- Completed tasks.
- Stale tasks.
- Tasks associated with different webpages.

Never silently select an ambiguous task.

## Testing

- Task creation.
- Task listing.
- Multiple task switching.
- Field rendering.
- Missing-value handling.
- Conflicting-value handling.
- User correction.
- Field approval.
- Final approval.
- Approval invalidation.
- Stale version handling.
- Cancellation.
- Cross-user isolation.

## Acceptance criteria

FE-5 is complete when users can review and manage form tasks, understand mapping decisions, correct values and explicitly approve the appropriate task state.

No browser action execution is implemented in this milestone.

---

# FE-6 — Browser Communication and Action Protocol

**Backend dependency:** Phase 9.

**Objective:** Connect the frontend Chrome extension to the existing backend browser communication protocol.

This milestone establishes the actual interaction between the backend and the webpage.

## Responsibilities

### A. Extension communication architecture

Implement typed communication between:

- Side panel.
- Background service worker.
- Content script.
- Backend.

Use explicit message contracts.

Do not assume extension contexts share memory.

### B. Webpage inspection

Implement the existing detector architecture or adapt the existing detector contracts to the extension implementation.

Responsibilities include:

- DOM inspection.
- Visible-field detection.
- Label resolution.
- Input-type identification.
- Radio and custom dropdown grouping.
- Required-field detection.
- Relevant webpage metadata.
- Dynamic DOM changes.

Preserve non-destructive inspection.

Do not read unrelated page data.

Do not collect sensitive fields without applying the established privacy and sensitivity rules.

### C. Browser session registration

Integrate the Phase 9 browser session lifecycle.

Implement:

- Page/session registration.
- Task association.
- Page metadata transfer.
- Session state tracking.
- Session expiration.
- Tab navigation handling.
- Ownership and association validation.

### D. Mapping retrieval

Integrate the existing mapping retrieval endpoint:

GET /api/v1/browser/tasks/:taskId/mappings

Use actual backend contracts.

Do not create a separate frontend mapping engine.

### E. Approved execution instructions

Receive authorized execution instructions from the backend.

Support only the existing allowlisted actions:

- SET_VALUE
- SELECT_OPTION
- CHECK
- UNCHECK

Do not invent additional action types.

### F. Approval enforcement

Before executing any action:

- Verify that the action is authorized.
- Verify that the action belongs to the active task and page.
- Verify that final approval is valid.
- Verify the relevant task and action versions.
- Reject expired or stale instructions.
- Prevent duplicate execution.

The frontend must not treat a displayed approval indicator as a replacement for backend authorization.

### G. Browser execution

Execute only explicitly authorized actions.

Use appropriate DOM interaction methods and dispatch relevant events.

Handle:

- Missing elements.
- Detached elements.
- Changed field types.
- Changed available options.
- Navigation during execution.
- Partial completion.
- Execution failures.

Do not automatically submit forms.

Do not execute arbitrary JavaScript supplied by the LLM or backend.

### H. Execution acknowledgements

Report actual outcomes to the backend.

Support:

- Successful execution.
- Failed execution.
- Partial execution.
- Duplicate acknowledgement rejection.
- Retry of eligible failed actions.
- Cancellation.
- Stale action rejection.

Use the existing Phase 9 acknowledgement and retry contracts.

### I. Safety

The backend is authoritative for authorization.

The content script must not bypass the approved-action protocol.

No automatic form submission is permitted.

## Testing

- Real webpage inspection.
- Static form fields.
- Dynamic form fields.
- Radio groups.
- Select controls.
- Custom dropdowns where supported.
- Hidden and invisible elements.
- Cross-tab isolation.
- Navigation during execution.
- Stale instructions.
- Approval invalidation.
- Duplicate action prevention.
- Partial execution.
- Acknowledgements.
- Retry.
- Cancellation.
- No form submission.

## Acceptance criteria

FE-6 is complete when the extension can inspect a real webpage, associate it with the correct backend task, receive approved actions, execute authorized operations and report verified outcomes.

---

# FE-7 — Voice Interface Preparation

**Backend dependencies:** Phases 10A, 10B and 10C.

**Objective:** Prepare the frontend architecture and application state for voice integration without implementing the complete real-time voice lifecycle.

## Responsibilities

### A. Voice module architecture

Create a dedicated voice feature module.

Separate:

- Voice session management.
- Microphone permissions.
- Audio capture.
- Audio processing.
- STT events.
- TTS events.
- Audio playback.
- Voice state.
- Error handling.

Do not place voice logic directly inside the main conversation component.

### B. Voice state model

Define typed states for:

- Idle.
- Permission request.
- Listening.
- Processing.
- Transcript received.
- Thinking.
- Speaking.
- Interrupted.
- Reconnecting.
- Error.
- Stopped.

Define valid state transitions.

Prevent impossible state combinations.

### C. Conversation correlation

Voice and text must use the same existing conversation system.

The frontend must support:

- Existing conversation identification.
- Voice session identification.
- Transcript correlation.
- Assistant message correlation.
- Audio playback correlation.

Do not create a separate voice conversation history.

### D. Transcript handling

Prepare support for:

- Original transcript.
- Finalized transcript.
- Detected language.
- Segment identity.
- Utterance identity.
- Assistant response identity.

Do not treat interim transcripts as persisted user messages.

### E. TTS playback preparation

Prepare an isolated playback module.

Define contracts for:

- Audio format.
- Sample rate.
- Bit depth.
- Channel count.
- Audio chunk ordering.
- Playback completion.
- Playback interruption.
- Resource cleanup.

Use the existing Phase 10C backend output contract.

### F. Security and lifecycle preparation

Establish:

- Authenticated session preparation.
- Permission handling.
- Session cleanup boundaries.
- Error propagation.
- No raw audio persistence.
- No frontend access to Gnani credentials.

### G. Integration readiness

Inspect existing backend voice contracts before implementing the frontend module.

Do not invent event names or payload formats.

Do not claim that voice streaming is functional at the end of FE-7.

## Testing

- Voice state transitions.
- Permission state.
- Transcript data contracts.
- Conversation correlation.
- TTS message correlation.
- Error-state handling.
- Audio resource cleanup.
- TypeScript and build checks.

## Acceptance criteria

FE-7 is complete when the voice feature architecture and application state are ready for Phase 10D integration, without claiming complete real-time voice functionality.

---

# FE-8 — Phase 10D Voice Lifecycle Integration

**Backend dependencies:** Phases 10A, 10B, 10C and the completed Phase 9 extension communication architecture.

**Objective:** Complete the real-time voice lifecycle inside the actual Chrome extension.

This is the final major frontend integration milestone.

## A. Authenticated voice session

Integrate the existing backend voice-session mechanism.

Requirements:

- Authenticated voice session bootstrap.
- Single-use session ticket where required.
- Ticket expiration handling.
- Correct conversation association.
- Ownership enforcement.
- Secure WebSocket connection.
- No JWT in WebSocket URLs.
- No Gnani API key in frontend code.

The backend remains responsible for connecting to Gnani AI.

## B. Microphone capture

Implement real microphone capture using getUserMedia.

Requirements:

- Explicit user permission.
- Permission denial handling.
- Device unavailable handling.
- Microphone track lifecycle.
- Correct start and stop behavior.
- Cleanup when the session ends.
- No unintended background microphone capture.

## C. AudioWorklet processing

Implement the appropriate audio processing architecture.

Requirements:

- AudioWorklet-based capture processing.
- Mono conversion.
- Resampling to 16kHz.
- Signed 16-bit little-endian PCM.
- 512 samples per frame.
- 1024 bytes per frame.
- 32ms audio frames.
- Correct frame ordering.
- Bounded audio buffering.
- Backpressure handling.

Do not assume the browser input sample rate is already 16kHz.

Implement and test actual resampling.

## D. Prisma streaming STT

Connect to the existing authenticated backend voice WebSocket.

Use the actual Phase 10A protocol.

Requirements:

- Send audio frames in order.
- Handle connection readiness.
- Handle speech-start events.
- Handle processing events.
- Receive interim and finalized transcripts.
- Preserve original transcript text.
- Preserve detected language metadata.
- Process finalized transcripts through the existing conversation pipeline.
- Prevent duplicate transcript processing.

Do not send raw audio directly from the extension to Gnani.

## E. Conversation and agent integration

Reuse Phase 10B.

Requirements:

- Voice transcripts become messages in the existing conversation.
- Voice and typed messages share the same conversation.
- Existing Context Builder is reused.
- Existing Agent Orchestrator is reused.
- Assistant responses are persisted.
- Voice response events are correlated with the correct assistant message.
- No duplicate assistant turns.
- Durable idempotency must be verified across reconnections and server restarts.

Do not build a second agent or voice-only conversation engine.

## F. Timbre streaming TTS playback

Use the existing Phase 10C backend integration.

Requirements:

- Receive audio chunks progressively.
- Preserve chunk order.
- Handle raw PCM output correctly.
- Respect the configured sample rate and audio encoding.
- Handle 24kHz output according to the existing backend contract.
- Buffer audio appropriately.
- Avoid playback gaps where possible.
- Handle audio completion.
- Release audio resources.

Do not assume that browser playback automatically supports the incoming PCM sample rate.

Implement any required playback-rate conversion correctly.

## G. Barge-in and interruption

Implement interruption as a first-class lifecycle operation.

Requirements:

- Support user interruption while assistant audio is playing.
- Detect new speech using an appropriate voice-activity strategy.
- Stop the current playback promptly.
- Cancel the relevant TTS operation where supported.
- Prevent late audio chunks from the previous response from playing.
- Preserve the already persisted assistant message.
- Do not delete previous assistant text when playback is interrupted.
- Process the new user utterance through the existing conversation.
- Keep session and message correlation correct.

Do not confuse stopping playback with deleting a conversation message.

## H. Cancellation

Implement distinct cancellation behavior for:

- Microphone capture.
- Current audio frame transmission.
- Pending STT processing.
- Pending transcript processing.
- Agent response where cancellation is supported.
- TTS generation.
- Audio playback.
- Complete voice session.

Use actual backend cancellation contracts.

Do not report a server-side operation as cancelled unless cancellation is confirmed or its state is otherwise verified.

## I. Reconnection and reliability

Implement bounded reconnection.

Requirements:

- Detect unexpected disconnection.
- Use bounded retry attempts.
- Use exponential backoff with jitter.
- Prevent duplicate session creation.
- Prevent duplicate transcript processing.
- Prevent duplicate assistant turns.
- Preserve valid conversation context.
- Reject expired session tickets.
- Re-establish a session only when supported by the backend protocol.
- Never claim that a previous audio stream can resume unless the protocol explicitly supports it.

## J. Chrome extension lifecycle cleanup

Handle:

- Side panel closure.
- Popup closure.
- Tab changes.
- Tab navigation.
- Service worker lifecycle changes.
- WebSocket closure.
- Microphone track termination.
- AudioContext closure.
- AudioWorklet cleanup.
- Playback buffer cleanup.
- Event listener cleanup.

A side-panel closure must not leave an unintended active microphone session.

Define explicitly which operations stop immediately and which operations may continue safely in the backend.

## K. Real-browser verification

Perform actual Chrome extension testing.

Verify:

- Microphone permission.
- Audio capture.
- PCM conversion.
- Live STT.
- Final transcript delivery.
- Existing conversation persistence.
- Agent response.
- Progressive TTS playback.
- Barge-in.
- Cancellation.
- Reconnection.
- Side panel closure.
- Resource cleanup.
- Duplicate prevention.

Mock tests alone are insufficient for Phase 10D acceptance.

## Acceptance criteria

FE-8 is complete only when:

1. Real microphone capture works inside the Chrome extension.
2. Audio is transmitted in the exact required format.
3. Prisma streaming STT works through the backend.
4. Finalized transcripts enter the existing conversation pipeline.
5. Assistant responses are persisted correctly.
6. Timbre TTS audio plays correctly.
7. Barge-in works.
8. Cancellation works according to backend capabilities.
9. Reconnection does not duplicate conversations or turns.
10. Closing the side panel cleans up resources correctly.
11. The existing backend authorization and approval rules remain intact.
12. Real Chrome tests and automated tests pass.

---

# 7. Cross-Phase Architecture Requirements

These requirements apply to every frontend milestone.

## 7.1 One conversation engine

Typed and voice interaction must use the same conversation and Agent Orchestrator architecture.

No independent voice chatbot.

## 7.2 Three separate data layers

Respect the backend's separation of:

1. Persistent profile memory.
2. Conversation memory.
3. Form task state.

The frontend must not combine these into one unstructured memory store.

## 7.3 Explicit approval

No automatic form submission.

No automatic execution of unapproved actions.

No assumption that a mapped value is approved merely because it has high confidence.

No voice instruction can bypass the existing approval workflow.

## 7.4 No fabricated information

The frontend must not:

- Invent profile data.
- Fabricate field mappings.
- Fabricate confidence values.
- Present pending memories as approved.
- Mark browser actions successful before acknowledgement.
- Present interim transcripts as finalized messages.

## 7.5 Extension-context safety

Keep communication between the popup, side panel, background service worker and content script explicit and typed.

Handle missing, restarted or disconnected contexts.

Do not depend on service-worker memory surviving suspension.

## 7.6 Observability

Establish safe development diagnostics.

Log:

- Operation identifiers.
- Request lifecycle.
- Error categories.
- Extension lifecycle events.
- WebSocket connection state.
- Browser execution status.

Do not log:

- Passwords.
- Access or refresh tokens.
- API keys.
- Raw audio.
- Sensitive form values.
- Unnecessary personal data.

---

# 8. Testing and Quality Strategy

Testing must be performed throughout development, not postponed until the final milestone.

## Unit tests

Test:

- Utilities.
- Validation.
- State transitions.
- API client behavior.
- Authentication logic.
- Message correlation.
- Audio processing utilities.
- PCM conversion.
- Resampling.
- Retry logic.

## Component tests

Test:

- Shared components.
- Feature components.
- Loading states.
- Error states.
- Approval interactions.
- Multilingual content.
- Keyboard accessibility.

## Integration tests

Test:

- Authentication against backend.
- Conversation APIs.
- Memory APIs.
- Form-task APIs.
- Mapping APIs.
- Browser-action APIs.
- Voice WebSocket contracts.

## Chrome extension tests

Test:

- Manifest validity.
- Side panel.
- Popup.
- Background service worker.
- Content script.
- Runtime messaging.
- Tab lifecycle.
- Real DOM inspection.
- Browser execution.
- Microphone access.
- Audio playback.

## Regression tests

After every milestone:

- Run TypeScript checks.
- Run ESLint.
- Run relevant tests.
- Run production build.
- Verify previously completed milestones.
- Confirm no accepted backend behavior was broken.

Use mocks for deterministic automated tests, but do not substitute mocks for required real-browser or provider integration tests.

---

# 9. Development Rules for the Coding Agent

Follow these rules for every milestone.

1. Inspect the current code before changing it.
2. Read the relevant backend routes, services, schemas and protocol contracts.
3. Produce a short implementation plan before coding.
4. Implement only the requested milestone.
5. Preserve completed milestones.
6. Avoid unnecessary refactoring.
7. Avoid adding unnecessary dependencies.
8. Do not create duplicate services or state systems.
9. Do not invent backend contracts.
10. Do not change database schemas.
11. Do not modify backend code unless a specific integration defect is demonstrated and the user authorizes that change.
12. Do not mark mocked functionality as production-ready.
13. Test all changed functionality.
14. Run regression checks.
15. Report changed files and test results.
16. Stop at the milestone boundary.

Do not move to the next milestone automatically.

Wait for milestone review and approval.

---

# 10. Final Frontend Delivery Criteria

The complete frontend project is considered ready only when all milestones have been accepted.

The final deliverable must include:

- Functional Manifest V3 extension.
- Working side panel and popup.
- Reliable authentication.
- Conversation integration.
- Profile memory management.
- Form task and mapping integration.
- Browser action protocol.
- Explicit approval enforcement.
- Multilingual text interaction.
- Real-time voice capture.
- Streaming STT.
- Streaming TTS.
- Barge-in.
- Cancellation.
- Reconnection.
- Extension lifecycle cleanup.
- Automated test coverage.
- Verified production build.
- Updated developer documentation.

# 11. Required Final Project Documentation

Maintain:

- Frontend README.
- Project architecture documentation.
- Folder structure documentation.
- Environment variable documentation.
- Chrome extension setup instructions.
- Development and production build instructions.
- Backend integration contract documentation.
- Extension permissions documentation.
- Testing instructions.
- Known limitations.
- Troubleshooting documentation.

Document the actual implementation, not planned or nonexistent functionality.

---

# 12. Final Execution Sequence

| Milestone | Name | Backend dependency |
|---|---|---|
| FE-0 | Chrome Extension Foundation | None |
| FE-1 | Application Foundation and Design System | FE-0 |
| FE-2 | Authentication Integration | Phase 2 |
| FE-3 | Conversation Interface | Phases 3, 6, 7 |
| FE-4 | Profile Memory Interface | Phase 4 |
| FE-5 | Form Intelligence Interface | Phases 5, 6, 8 |
| FE-6 | Browser Action Protocol Integration | Phase 9 |
| FE-7 | Voice Interface Preparation | Phases 10A–10C |
| FE-8 | Voice Lifecycle Integration | Phase 10D |

**Execution rule:** Complete one milestone, run its tests, review the implementation and accept it before proceeding to the next.

**Final architectural principle:** BhashaAgent must remain one coherent Chrome extension connected to one authoritative backend. Frontend modules should be independently maintainable, but authentication, conversations, memory, form tasks, agent execution and voice must operate through the existing backend architecture.