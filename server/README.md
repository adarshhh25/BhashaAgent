# BhashaAgent database foundation

This directory contains the PostgreSQL, Prisma, JWT authentication, user
management, conversation, and profile-memory foundation. Agent orchestration and
AI response generation are not included.

## Setup

1. Install PostgreSQL and create an empty `bhashaagent` database.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the local PostgreSQL
   connection string. Never commit `.env`.
3. Install dependencies:

   ```sh
   npm install
   ```

4. Generate the Prisma client and validate the schema:

   ```sh
   npm run db:generate
   npm run db:validate
   ```

5. Apply migrations:

   ```sh
   npm run db:migrate
   ```

   Use `npm run db:deploy` in a deployment environment.

The migrations add PostgreSQL check constraints for field-value confidence and
approval target type consistency, plus composite foreign keys that ensure
approvals, memory proposals, and form tasks cannot reference another user's
records.

## Authentication

Authentication uses Argon2id password hashes, 15-minute HS256 access tokens, and
cryptographically random refresh tokens stored only as SHA-256 hashes. Refresh
tokens rotate atomically. Reuse of a revoked token revokes all active sessions
for that user. Access tokens remain valid until their short expiry after
logout; logout revokes refresh sessions only.

The Chrome extension should keep access and refresh tokens in its extension
storage and send them over HTTPS; browser clients should prefer Secure,
HttpOnly, SameSite cookies when that client transport is implemented. The
current API accepts the refresh token in the JSON body.

## Browser protocol (`bhasha.browser.v1`)

The authenticated browser protocol is backend-authoritative and proposal-only
until the existing Phase 5 field approvals and final form-fill approval are
present. It never submits a form and it never accepts arbitrary JavaScript,
HTML, clicks, selectors, or actions outside the allowlist
`SET_VALUE`, `SELECT_OPTION`, `CHECK`, and `UNCHECK`.

Endpoints:

- `POST /api/v1/browser/register` registers a task page and detected fields.
- `GET /api/v1/browser/tasks/:taskId/mappings` retrieves deterministic Phase 8 mapping results.
- `POST /api/v1/browser/instructions` issues approved fill instructions.
- `POST /api/v1/browser/executions/:executionId/acknowledge` records bounded field results.
- `POST /api/v1/browser/executions/:executionId/retry` retries a failed/partial execution (maximum three retries).
- `POST /api/v1/browser/executions/:executionId/cancel` cancels an active execution.
- `GET /api/v1/browser/executions/:executionId` returns backend-authoritative status.

All messages require `protocolVersion: "bhasha.browser.v1"`, UUID message IDs,
an idempotency key, and strict payload validation. Page sessions, executions,
action results, expiration, retries, cancellation, and idempotency are stored
in PostgreSQL. The extension remains responsible for DOM interaction and must
return acknowledgements that match the issued execution and page session.

Registration request:

```json
{
  "protocolVersion": "bhasha.browser.v1",
  "messageId": "uuid",
  "messageType": "TASK_REGISTER",
  "taskId": "uuid",
  "timestamp": "2026-11-02T00:00:00.000Z",
  "idempotencyKey": "registration-unique-key",
  "payload": {
    "pageContext": {
      "url": "https://example.test/application",
      "title": "Application",
      "detectedAt": "2026-11-02T00:00:00.000Z",
      "fingerprint": "page-fingerprint"
    },
    "fields": [{
      "fieldIdentifier": "full-name",
      "label": "Full Name",
      "elementType": "input",
      "inputType": "text",
      "fingerprint": "field-fingerprint"
    }]
  }
}
```

Registration response:

```json
{
  "success": true,
  "data": {
    "pageSession": {
      "id": "uuid",
      "formTaskId": "uuid",
      "protocolVersion": "bhasha.browser.v1",
      "pageUrl": "https://example.test/application",
      "origin": "https://example.test",
      "hostname": "example.test"
    }
  }
}
```

Field identifiers are extension-generated stable identifiers for the detected
page controls. They are not CSS selectors and are never executed by the
backend. Registration is authenticated, task-owned, HTTPS-only, and
idempotent per user and idempotency key. Reusing a key returns the original
page session.

Mapping retrieval uses `GET /api/v1/browser/tasks/:taskId/mappings`. It invokes
the existing deterministic Phase 8 mapping engine; it does not grant approval.
New values remain pending until the normal Phase 5 field approval and final
form-fill approval workflows complete. The response is
`{ "success": true, "data": { "mappings": { "results": [], "summary": {} } } }`;
the exact result entries contain field IDs, status, proposed values, confidence,
and source references.

The registration request is also the field synchronization request. It is
atomic: the page session, task webpage metadata, detected fields, task events,
and audit record commit together or roll back together. A repeated registration
with the same user and idempotency key returns the original page session.

After approval, request
`POST /api/v1/browser/instructions` with `taskId`, `pageSessionId`, a UUID
`messageId`, protocol version, timestamp, and an idempotency key. The response
contains a `FORM_FILL` instruction with the authoritative `approvalId`,
`taskVersion`, page context, expiry, and actions. Each action has its own
`actionId`, `fieldId`, `action`, and explicit value. Values are emitted only
from approved active field values.

Instruction response shape:

```json
{
  "success": true,
  "data": {
    "execution": {
      "id": "uuid",
      "status": "ISSUED",
      "taskVersion": 12,
      "approvalId": "uuid",
      "expiresAt": "2026-11-02T01:00:00.000Z",
      "instruction": {
        "protocolVersion": "bhasha.browser.v1",
        "type": "FORM_FILL",
        "actionId": "uuid",
        "actions": [{
          "actionId": "uuid",
          "fieldId": "uuid",
          "action": "SET_VALUE",
          "value": "Approved User"
        }]
      }
    }
  }
}
```

The backend validates that the final approval is active, unrevoked, has a
matching task version, and contains the same field IDs, field types, option
definitions, approved statuses, and exact JSON values as the current task.
Pending or rejected values cannot be issued.

The persisted approval snapshot is validated against a versioned, strict
schema before comparison. It requires the complete task, webpage, field,
option, and field-value metadata shape; rejects unexpected properties,
duplicate field or option identifiers, malformed values, and missing/null
required properties; and preserves primitive JSON types. Snapshot rejection
occurs before an execution or action result can be created.

Registration uses the same material-change boundary as the Phase 5 task
workflow. An identical approved page/field synchronization preserves the
approval and task version. A changed page, field definition, option set, or
field set atomically returns the task to review, revokes the final approval,
increments the task version, and records the invalidation event. Registration
and field synchronization are committed in one PostgreSQL transaction.

Acknowledgement example:

```json
{
  "protocolVersion": "bhasha.browser.v1",
  "messageId": "uuid",
  "messageType": "FORM_FILL_ACK",
  "taskId": "uuid",
  "timestamp": "2026-11-02T00:00:00.000Z",
  "idempotencyKey": "ack-unique-key",
  "executionId": "uuid",
  "actionId": "uuid",
  "pageSessionId": "uuid",
  "status": "PARTIAL",
  "results": [{
    "fieldId": "uuid",
    "actionId": "uuid",
    "actionType": "SET_VALUE",
    "status": "SUCCESS"
  }, {
    "fieldId": "uuid",
    "actionId": "uuid",
    "actionType": "SET_VALUE",
    "status": "FAILED",
    "errorCode": "FIELD_NOT_FOUND"
  }]
}
```

Acknowledgement response is
`{ "success": true, "data": { "execution": { "id": "uuid", "status": "PARTIAL", "results": [] } } }`.
Each result is accepted only when its execution ID, task ID, page session,
batch action ID, per-field action ID, field ID, and action type match the
issued instruction.

Execution states are `ISSUED`, `IN_PROGRESS`, `PARTIAL`, `COMPLETED`,
`FAILED`, `CANCELLED`, and `EXPIRED`. Field states are `PENDING`, `SUCCESS`,
`FAILED`, `SKIPPED`, and `CANCELLED`. Retry is available only for failed or
partial executions, is limited to three attempts, and issues only the failed
actions. Cancellation is terminal; acknowledgements and retries racing with
cancellation are rejected through conditional database updates.

Retry identities are persisted with the execution and include the authenticated
user, task, page session, execution, protocol version, idempotency key, and
exact action scope. PostgreSQL row locks serialize acknowledgement, retry, and
cancellation transitions. The protocol provides at-least-once delivery
semantics; it cannot undo a DOM operation that an extension already started.
The simulated extension tests use the authenticated HTTP API and protocol
contracts only, not a real browser or webpage DOM.

## Phase 10A voice/STT protocol

`POST /api/v1/voice/tickets` is authenticated and accepts
`{ "conversationId": "uuid" }`. It returns a single-use ticket bound to the
active conversation and user. The ticket expires after 60 seconds and is used
to open `ws://host/api/v1/voice?ticket=...`; JWTs and the Gnani credential are
never sent to the extension or placed in the WebSocket URL.

The versioned application protocol is `bhasha.voice.v1`. The client sends a
`START` message, binary audio frames, then `STOP` or `CANCEL`. Audio must be
raw mono PCM16LE at 16 kHz, exactly 1,024 bytes (512 samples) per binary
message. The backend sends `SESSION_READY`, state events, normalized
`TRANSCRIPT` events, `ERROR`, and `SESSION_CLOSED`. Final transcript events
preserve the provider text and segment/language metadata.

Final transcripts are also processed by the shared conversation-turn pipeline.
They are persisted as `VOICE` user messages and produce an
`ASSISTANT_RESPONSE` containing assistant text; no TTS or raw audio is used.
The voice session and conversation ownership checks apply before processing.
The provider segment and voice session form a durable idempotency key in message
metadata, protected by a PostgreSQL transaction advisory lock, so repeated
delivery cannot create duplicate user or assistant messages. A completed
duplicate returns the persisted assistant response; a failed turn can be
retried, while a concurrent in-flight duplicate is rejected.

The backend adapter uses Gnani Prisma v3.0 with `language_code=indic-auto`,
`format=verbatim`, and the documented `x-api-key-id` header. Sessions are
in-memory, limited to two active sessions per user, capped at 15 minutes, and
cleaned up on either socket closing. No database schema or migration is used.
Real Chrome DOM and live-provider calls are outside the automated test suite.

### Phase 10C Timbre output

Assistant responses can be synthesized through the authenticated backend
connection using Gnani Timbre realtime TTS. The backend sends `AUDIO_START`,
ordered base64 `AUDIO_CHUNK` messages, and `AUDIO_COMPLETE`; `STOP`, `CANCEL`,
socket close, and session expiry stop further audio delivery. TTS failures do
not remove or modify the persisted assistant response.

Timbre model and voice are validated as a pair before synthesis. The official
catalogue makes `Shivani` a Timbre v3.0 voice, not a Timbre v2.5 voice. The
current v2.5 configuration with `Shivani` therefore returns
`TTS_CONFIGURATION_ERROR` and is not changed automatically. For one voice
covering Hindi, English, Marathi, and mixed Hindi-English, use
`timbre-v3.0` with `Shivani` if the account has access. With v2.5, select
language-specific voices such as `Bhavna` (Hindi), `Kaveri` (English),
`Zahira` (Marathi), and `Poorvi` (Hinglish). Configuration remains in
`GNANI_TTS_*` environment variables; the API key remains server-only.

For an optional manual provider smoke test, configure `GNANI` locally, prepare
a short raw PCM16LE mono 16 kHz sample containing the intended Hindi, English,
or code-mixed speech, and connect an authenticated client through the ticket
endpoint. Send each 1,024-byte slice every 32 ms after `SESSION_READY`, then
observe the normalized `TRANSCRIPT` metadata and close the session. Do not send
WAV headers, print the key, or enable this check in the normal test suite.

Common errors include `401 AUTHENTICATION_REQUIRED`, `400 VALIDATION_ERROR` or
`INVALID_ACKNOWLEDGEMENT`, `404 FORM_TASK_NOT_FOUND`,
`BROWSER_PAGE_NOT_FOUND`, or `BROWSER_EXECUTION_NOT_FOUND`, and `409`
`APPROVAL_REQUIRED`, `STALE_APPROVAL`, `PAGE_CONTEXT_MISMATCH`,
`EXECUTION_TERMINAL`, `EXECUTION_EXPIRED`, `EXECUTION_STATE_CHANGED`, and
`RETRY_LIMIT_REACHED`, `NO_FAILED_ACTIONS`, and `DUPLICATE_ACTION_RESULT`.
Conflicting reuse of a persisted idempotency key returns
`409 IDEMPOTENCY_CONFLICT`.

Status response is
`{ "success": true, "data": { "execution": { "id": "uuid", "status": "COMPLETED", "results": [] } } }`.
Retry requests are
`POST /api/v1/browser/executions/:executionId/retry` with
`{ "protocolVersion": "bhasha.browser.v1", "taskId": "uuid", "pageSessionId": "uuid", "idempotencyKey": "retry-key", "actionIds": ["uuid"] }`.
The same retry key and request identity return the same execution state; reuse
of that key for a different request identity returns `409 IDEMPOTENCY_CONFLICT`.
A new key creates no new execution and retries only the supplied eligible failed
action IDs (or all eligible failed actions when `actionIds` is omitted).
Successful actions are never reissued. Retries are rejected for cancelled,
expired, terminal, or non-retryable executions.

Cancellation requests are
`POST /api/v1/browser/executions/:executionId/cancel` with
`{ "taskId": "uuid", "idempotencyKey": "cancel-key" }`.
The response contains the cancelled execution. Cancellation is terminal;
late acknowledgements cannot change it. A browser operation already running in
the extension may physically finish, but the backend will not record a
successful result after cancellation commits.

Retry request identity is persisted as a SHA-256 digest of the authenticated
user, task, page session, execution, protocol version, idempotency key, and
exact action scope. A legacy execution without an identity digest is not
replayed; it must be handled as a new request after its state is re-established.
Registration and instruction issuance likewise reject same-key requests whose
task, page, approval, field, or action identity differs from the original.

Browser integration tests require `TEST_DATABASE_URL`; they never fall back to
`DATABASE_URL` and reject database names that do not end in `_test`. Create a
dedicated database, apply migrations to it with `npx prisma migrate deploy`,
then run `node --test tests/browser/browser.test.js`. The test suite creates
unique fixture users and cleans only those fixtures.

All browser endpoints require `Authorization: Bearer <access-token>`.
Requests use strict Zod envelopes, UUID message IDs, HTTPS page URLs, bounded
field counts/options, and a minimum eight-character idempotency key. The
backend accepts no selectors, scripts, HTML, arbitrary JavaScript, form
submission, generic clicks, or actions outside the four-value action allowlist.

Delivery is at-least-once, not exactly-once: the backend persists idempotency
keys and rejects duplicate action results, while an extension must make DOM
operations safe to repeat when it receives a retried instruction. The backend
does not claim that a browser action was physically executed solely because an
acknowledgement says `SUCCESS`; it only records a validated report from the
authenticated page session.

Available endpoints:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/logout-all`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `PATCH /api/v1/users/me/password`
- `DELETE /api/v1/users/me`

## Conversations

Conversation routes require the same bearer access token:

- `POST /api/v1/conversations`
- `GET /api/v1/conversations?page=1&limit=20&status=ACTIVE`
- `GET /api/v1/conversations/:id`
- `PATCH /api/v1/conversations/:id`
- `DELETE /api/v1/conversations/:id`
- `POST /api/v1/conversations/:id/messages`
- `GET /api/v1/conversations/:id/messages?page=1&limit=50&order=asc`
- `PATCH /api/v1/conversations/:id/messages/:messageId`

Conversation listing is user-scoped, sorted by most recent message, and excludes
deleted conversations by default. Message history is paginated with a maximum
page size of 100 and ordered by `createdAt` plus UUID. The context manager uses a
bounded reverse query and returns messages in chronological order for future
agent components. `beforeMessageId` is supported for bounded context retrieval
and message history navigation.

Conversation deletion is a soft delete: the conversation and its messages remain
available for retention and audit purposes, but deleted conversations cannot be
listed, retrieved for normal use, or receive messages. Message corrections are
restricted to user messages and preserve every previous value in
`message_revisions`. Assistant messages can only be persisted through the
internal `createAssistantMessage` service; there is no public assistant-message
endpoint.

## Profile memories

Profile memories are separate from conversation history. A conversation message
can provide provenance for a proposal, but it never becomes reusable profile
memory automatically. Only an explicitly approved proposal can create, update,
or soft-delete a profile memory.

Supported categories are `PERSONAL`, `CONTACT`, `ADDRESS`, `EDUCATION`,
`EXPERIENCE`, `SKILLS`, `CERTIFICATIONS`, `PREFERENCES`, `LANGUAGE`, and
`OTHER`.

Endpoints:

- `GET /api/v1/memories`
- `POST /api/v1/memories/extract`
- `POST /api/v1/memories/proposals`
- `GET /api/v1/memories/proposals`
- `POST /api/v1/memories/proposals/:id/approve`
- `POST /api/v1/memories/proposals/:id/reject`
- `PATCH /api/v1/memories/:id`
- `DELETE /api/v1/memories/:id`

Proposal creation always produces `PENDING` status. Editing or deleting an
approved memory also produces a pending proposal. Approval and rejection are
ownership-checked, transactional, and recorded in the existing `approvals` and
`audit_logs` tables. Rejected proposals remain as history and are excluded from
approved-memory retrieval.

The extraction endpoint uses a conservative deterministic strategy for a small
set of unambiguous English, Hindi, Marathi, and mixed-language statements. It
returns candidates only; it does not persist or approve them. The
`getRelevantMemories` service provides bounded category/key filtering for future
application workflows without embeddings or semantic search.

Migration `20261031210000_profile_memory_fields` adds memory data types,
lifecycle status, soft-delete timestamps, source-message provenance, proposal
categories, and rejection reasons.

## Form tasks

Form tasks are independent, user-scoped workflows. Multiple tasks may belong to
one conversation, and each task has separate fields, values, mappings, state,
approvals, versioning, and history. No endpoint performs browser automation or
form submission.

Endpoints:

- `POST /api/v1/form-tasks`
- `GET /api/v1/form-tasks`
- `GET /api/v1/form-tasks/:id`
- `PUT /api/v1/form-tasks/:id/webpage`
- `POST /api/v1/form-tasks/:id/fields`
- `GET /api/v1/form-tasks/:id/fields`
- `PATCH /api/v1/form-tasks/:id/fields/:fieldId`
- `DELETE /api/v1/form-tasks/:id/fields/:fieldId`
- `PUT /api/v1/form-tasks/:id/fields/:fieldId/value`
- `POST /api/v1/form-tasks/:id/fields/:fieldId/approve`
- `POST /api/v1/form-tasks/:id/fields/:fieldId/reject`
- `GET /api/v1/form-tasks/:id/missing-information`
- `POST /api/v1/form-tasks/:id/mappings`
- `GET /api/v1/form-tasks/:id/mappings`
- `GET /api/v1/form-tasks/:id/review`
- `POST /api/v1/form-tasks/:id/final-approval`
- `POST /api/v1/form-tasks/:id/pause`
- `POST /api/v1/form-tasks/:id/resume`
- `POST /api/v1/form-tasks/:id/cancel`
- `GET /api/v1/form-tasks/:id/history`
- `DELETE /api/v1/form-tasks/:id`

Task transitions are centralized and version-checked. Field values are
separate from field structure, validated before storage, and preserve previous
values through revision records. Required fields count as complete only when
they have valid approved values. Final approval stores a task-versioned review
snapshot; later value changes revoke that approval and require review again.

Migration `20261031213000_form_task_manager` adds lifecycle states, task
versioning and metadata, field lifecycle/confidence data, field-value execution
state and revisions, field mappings, and final-approval snapshot fields.

Protected requests use `Authorization: Bearer <access-token>`. Account deletion
requires the current password and the exact `DELETE` confirmation. User-owned
operational records are removed explicitly, while audit records are retained
with their user reference anonymized.

## Context Builder

Phase 6 exposes a read-only authenticated context projection:

- `POST /api/v1/conversations/:id/context`

The request accepts either a persisted user message ID or an unpersisted current
message, plus an optional form-task ID and bounded retrieval options. The
versioned `AgentContext` response (`schemaVersion: "1.0"`) includes effective
conversation messages and corrections, approved active profile memories,
resolved form-task state, webpage metadata, detected fields, current values,
missing information, approval state, source references, warnings, and
truncation metadata.

Task selection is ownership-checked. An explicit task must belong to the
conversation; when no task is selected, exactly one active task is resolved and
multiple active tasks produce an ambiguity warning rather than a random choice.
The builder never creates or approves memories, values, or tasks, and never
fills or submits forms. It reads existing Phase 1-5 records through their
service boundaries and requires no Prisma migration.

## Agent Orchestrator

Phase 7 adds an authenticated conversational endpoint:

- `POST /api/v1/conversations/:id/turns`

The endpoint persists the user message once, builds the existing Phase 6
context, sends it to the configured provider-neutral LLM adapter, validates
structured intent/tool output, executes only allowlisted tools, and persists the
assistant response. Configure `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, and
`LLM_BASE_URL` in the environment. Missing provider configuration returns a
safe unavailable response; no fake AI response is generated.

Available tools can retrieve context, approved memories, or tasks, create
pending profile-memory proposals, and propose task field values. Domain
services enforce ownership and validation. The orchestrator cannot approve
memories or fields, fill forms, execute browser code, submit forms, run SQL, or
access Prisma directly. Tool loops are bounded to three iterations and four
tool calls per turn.

## Form Intelligence

Phase 8 adds an authenticated, deterministic mapping endpoint:

- `POST /api/v1/form-tasks/:id/intelligent-mapping`

It matches approved profile facts and explicit conversation answers to detected
fields, validates values against field types and options, reports missing or
conflicting values, and creates proposal-only mappings through the existing
form-task services. Repeating an identical mapping is idempotent. The endpoint
does not approve values, fill fields, submit forms, or send form values to an
LLM. The same bounded workflow is available to the
`run_intelligent_mapping` agent tool for the currently selected task.

## Schema

The schema contains users, refresh tokens, conversations, messages, profile
memories, memory change requests, form tasks, detected fields, field values,
task events, approvals, and audit logs. Foreign-key deletion behavior is
intentional: operational children of a form task are retained while a task
exists, user and task history is protected with `RESTRICT`, and nullable
provenance/audit references use `SET NULL`.
