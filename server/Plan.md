# BhashaAgent – Backend Development Roadmap (Fresh Start)

My recommendation is to stop modifying the partially developed backend and build a completely new backend from scratch, keeping the existing project untouched as a reference.

We will build BhashaAgent as a natural conversational AI browser agent, not as a traditional form-filling application with a chatbot attached.

The user should be able to speak or type naturally, explain what they want to accomplish, answer follow-up questions, correct information, and ask the agent to fill forms.

The agent should understand the conversation, inspect the current webpage, identify relevant form fields, prepare values, and fill them only according to the user's instructions.

## Core technology decisions

Backend&#x20;

Node.js + TypeScript



Database&#x20;

PostgreSQL



Authentication&#x20;

JWT



ORM&#x20;

Prisma



Voice&#x20;

Gnani AI – STT + TTS



AI architecture&#x20;

Agent Orchestrator



Communication&#x20;

REST + WebSocket



Background jobs&#x20;

Redis + BullMQ (where needed)



## 1. The architecture we are building

The most important decision is to keep the three memory layers separate. They can work together, but they must never become one combined memory store.

User Interface / Browser Extension

Natural text conversation · Voice · Current webpage context

Authentication & Conversation Gateway

JWT validation · User identification · Session handling · WebSocket

Context Builder

Retrieves only the relevant context for each conversational turn

Profile Memory

Reusable approved information

Conversation Memory

Messages and corrections

Form Task State

Fields and execution progress

Agent Orchestrator

Intent understanding · Natural conversation · Tool selection · Response generation

Conversation Engine

Clarifications and responses

Form Intelligence

Field mapping and value proposals

Voice Service

Gnani STT / TTS

Browser Action Service

Approved form-fill instructions

PostgreSQL Database

Users · Conversations · Messages · Profile Memory · Form Tasks · Audit Records

Important: The backend will not directly manipulate the browser DOM. It will communicate structured form-fill instructions to the browser extension. The extension will perform the actual interaction with the webpage.

## 2. Three independent memory systems

| Memory              | Purpose                           | Persistence          |
| ------------------- | --------------------------------- | -------------------- |
| Profile Memory      | Reusable user information         | Across conversations |
| Conversation Memory | Messages, answers, corrections    | Across conversations |
| Form Task State     | Current webpage and form progress | Per task             |

### A. Profile Memory

Example:

- Full name
- Email address
- Phone number
- Educational qualifications
- Professional experience
- Other reusable application information

Rules:

- Information can be proposed by the AI.
- The user must explicitly approve a new or changed profile entry.
- The agent cannot silently update the profile.
- The user can review, edit and delete information.

### B. Conversation Memory

Stores:

- User messages
- Assistant messages
- Conversation history
- Clarifications
- User corrections
- Relevant conversation context

This allows the user to continue an existing conversation after closing and reopening the application.

### C. Form Task State

Stores the current form-filling workflow:

- Current webpage and form context
- Detected form fields
- Field types and labels
- Proposed values
- Missing information
- User-approved values
- Field mapping status
- Execution status
- Errors and retries

It must be isolated from persistent profile memory.

## 3. Complete backend development divided into work packages

We should not ask the coding agent to implement the entire backend in one go. That is how partially implemented features, conflicting schemas and broken integrations accumulate.

Instead, we will have independent development phases with clearly defined completion criteria.

Development strategy

Backend first

- One work package at a time.
- Complete its implementation before moving forward.
- Run basic testing at the end of each package.
- Do not repeatedly run the entire test suite for every small code change.
- Maintain backward-compatible interfaces between completed packages.
- Comprehensive security hardening happens in the final phase.

### Phase 0 – Fresh backend foundation

Starting phase

Objective: Create a clean backend without depending on the partially developed implementation.

Tasks:

1. Create a new backend directory, for example `bhashaagent-backend`.
2. Initialize Node.js with TypeScript.
3. Configure Express.js.
4. Configure Prisma ORM.
5. Connect PostgreSQL.
6. Configure environment variables.
7. Establish centralized error handling.
8. Establish request validation.
9. Configure logging.
10. Define a modular folder structure.
11. Configure development and production scripts.
12. Add database migration support.

Suggested structure:

```
bhashaagent-backend/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── config/
│   ├── common/
│   │   ├── errors/
│   │   ├── middleware/
│   │   ├── validators/
│   │   └── utils/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── conversations/
│   │   ├── messages/
│   │   ├── profile-memory/
│   │   ├── form-tasks/
│   │   ├── context-builder/
│   │   ├── agent/
│   │   ├── voice/
│   │   ├── browser/
│   │   └── audit/
│   │
│   ├── integrations/
│   │   ├── llm/
│   │   └── gnani/
│   │
│   ├── websocket/
│   ├── app.ts
│   └── server.ts
│
├── tests/
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

Basic testing: Backend starts, PostgreSQL connects, Prisma can execute a query, and health endpoint works.

### Phase 1 – Database architecture and data models

Objective: Design the complete PostgreSQL database before implementing business logic.

Proposed database entities:

| Table                  | Responsibility                     |
| ---------------------- | ---------------------------------- |
| users                  | User accounts                      |
| refresh_tokens         | Authentication sessions            |
| conversations          | Saved conversations                |
| messages               | Conversation messages              |
| profile_memories       | Approved reusable information      |
| memory_change_requests | Proposed profile changes           |
| form_tasks             | Form-filling sessions              |
| detected_fields        | Fields detected on webpages        |
| field_values           | Proposed and approved field values |
| task_events            | Form task state transitions        |
| approvals              | User approval records              |
| audit_logs             | Important system actions           |

Important relationships:

- One user can have multiple conversations.
- One conversation contains multiple messages.
- One user can have multiple approved profile memories.
- One conversation can have multiple form tasks.
- One form task can have multiple detected fields.
- Every approval must be associated with the relevant user and action.

Important database decisions:

- Use PostgreSQL foreign keys and proper constraints.
- Use UUID primary keys.
- Use timestamps (`createdAt`, `updatedAt`).
- Use transactions for multi-step state changes.
- Use JSONB only for genuinely flexible structured data, not as a replacement for relational modelling.
- Maintain migrations instead of manually changing database tables.

Basic testing: Run migrations, create sample records, verify relationships, update records and test transaction rollback.

### Phase 2 – Authentication and user management

Objective: Implement proper JWT-based authentication before allowing access to user-specific information.

Features:

1. User registration.
2. Login using email and password.
3. Password hashing using Argon2id or bcrypt.
4. JWT access token.
5. Refresh token mechanism.
6. Logout.
7. Token refresh.
8. Current user profile endpoint.
9. Update account details.
10. Password change.
11. Account deletion.

Suggested API structure:

| Method | Endpoint                | Purpose        |
| ------ | ----------------------- | -------------- |
| POST   | `/api/v1/auth/register` | Register       |
| POST   | `/api/v1/auth/login`    | Login          |
| POST   | `/api/v1/auth/refresh`  | Refresh token  |
| POST   | `/api/v1/auth/logout`   | Logout         |
| GET    | `/api/v1/users/me`      | Current user   |
| PATCH  | `/api/v1/users/me`      | Update profile |
| DELETE | `/api/v1/users/me`      | Delete account |

JWT requirements:

- Short-lived access tokens.
- Rotating refresh tokens.
- Refresh token revocation.
- Proper token expiry validation.
- Authenticated API middleware.
- User identity derived from validated JWT claims, never from a client-supplied user ID.

Basic testing: Registration, login, access to protected endpoints, expired tokens, refresh, logout and multiple-user isolation.

### Phase 3 – Conversation Manager

Core functionality

Objective: Build the actual conversational foundation.

This is where BhashaAgent starts behaving like a conversational agent instead of a form-filling tool.

Features:

1. Start a new conversation.
2. Continue an existing conversation.
3. Retrieve conversation history.
4. Save every user and assistant message.
5. Maintain conversation status.
6. Support text messages.
7. Support multilingual messages.
8. Support message corrections.
9. Maintain conversation context.
10. Support conversation renaming and deletion.
11. Preserve conversations across application restarts.

Suggested APIs:

```
POST   /api/v1/conversations
GET    /api/v1/conversations
GET    /api/v1/conversations/:id
PATCH  /api/v1/conversations/:id
DELETE /api/v1/conversations/:id

POST   /api/v1/conversations/:id/messages
GET    /api/v1/conversations/:id/messages
```

Important: Conversation history and profile memory must not be mixed.

Example:

User: "I am applying for a software engineering internship."

Agent: "Great! Which company are you applying to?"

User: "Google."

Agent: "What position are you applying for?"

User: "Software Engineering Intern."

All messages are saved, and the agent should understand the complete conversation when the user responds.

Basic testing: Create conversations, send messages, retrieve history, restart the backend and verify persistence.

### Phase 4 – Profile Memory Manager

Objective: Build reusable user information with explicit approval.

Features:

1. Extract potential reusable information from conversations.
2. Propose new profile memories.
3. Identify changes to existing memories.
4. Show the proposed changes.
5. Accept or reject changes.
6. Edit approved memories.
7. Delete memories.
8. Retrieve relevant memories for future applications.
9. Track approval history.

Example:

User: "My highest qualification is B.E. Computer Engineering."

Agent: "Would you like me to save this as profile information for future applications?"

User: "Yes."

Only then should the information become approved profile memory.

Suggested APIs:

```
GET    /api/v1/memories
POST   /api/v1/memories/proposals
GET    /api/v1/memories/proposals
POST   /api/v1/memories/proposals/:id/approve
POST   /api/v1/memories/proposals/:id/reject
PATCH  /api/v1/memories/:id
DELETE /api/v1/memories/:id
```

Basic testing: Propose information, reject it, approve it, retrieve it from a different conversation and verify that rejected information is never treated as approved memory.

### Phase 5 – Form Task Manager

Objective: Build the state-management engine responsible for individual form-filling tasks.

This module must be independent of the conversation engine.

A single conversation may contain multiple form tasks.

Features:

1. Create form task.
2. Associate task with a conversation.
3. Receive webpage metadata.
4. Receive detected form fields.
5. Store field labels and types.
6. Maintain field values.
7. Identify missing information.
8. Track field confidence.
9. Track field approval.
10. Track execution status.
11. Handle user corrections.
12. Maintain task history.
13. Support pause and resume.

Suggested task lifecycle:

CREATED

FIELDS_DETECTED

MAPPING_IN_PROGRESS

AWAITING_INFORMATION / REVIEW

AWAITING_FINAL_APPROVAL

APPROVED_FOR_FILLING

FILLING / COMPLETED

Failure, cancellation and paused states must also be supported.

Critical rule: filling requires final user approval. Submitting a form is a separate action and must never happen automatically.

Basic testing: Create tasks, store detected fields, update values, pause/resume tasks, approve and reject transitions, and verify task isolation.

### Phase 6 – Context Builder

Objective: Combine the right information before every conversational response.

This is one of the most important components in the entire architecture.

The Context Builder retrieves information from:

1. Current user message.
2. Recent conversation messages.
3. Relevant older conversation context.
4. Approved profile memory.
5. Current form task state.
6. Current webpage and detected form fields.

It should produce a structured context object for the Agent Orchestrator.

Example:

```
interface AgentContext {
  user: {
    id: string;
    preferredLanguage?: string;
  };

  conversation: {
    id: string;
    recentMessages: Message[];
    summary?: string;
  };

  profileMemory: {
    approvedFacts: ProfileMemory[];
  };

  formTask: {
    id?: string;
    webpage?: WebpageContext;
    detectedFields: DetectedField[];
    proposedValues: FieldValue[];
    missingInformation: string[];
    status?: string;
  };
}
```

Responsibilities:

- Retrieve relevant information.
- Avoid duplicate information.
- Respect user corrections.
- Never include unapproved profile suggestions as facts.
- Avoid sending unnecessary conversation history to the LLM.
- Keep form task context isolated.
- Handle missing context gracefully.

Basic testing: Verify context construction for a new conversation, existing conversation, approved profile memory, corrected values and active form task.

### Phase 7 – Agent Orchestrator and Natural Conversation Engine

Most important phase

Objective: Make BhashaAgent intelligent enough to understand user instructions and conduct natural conversations.

This is the central brain.

It must not behave like a rigid sequence of questions.

It should understand the user's intent, identify missing information, ask relevant questions, remember answers and decide which tool to invoke.

Core responsibilities:

1. Understand natural-language instructions.
2. Detect user intent.
3. Understand multilingual input.
4. Maintain conversational continuity.
5. Interpret corrections.
6. Decide whether to answer or ask a question.
7. Decide whether to start or continue a form task.
8. Retrieve profile information.
9. Request missing information.
10. Propose form-field values.
11. Invoke tools through controlled interfaces.
12. Generate natural conversational responses.
13. Handle ambiguous instructions.
14. Prevent hallucinated profile details.

Example of expected behaviour

User:

"I want to apply for this job."

Agent:

"Sure! I can help you complete the application. Let me first understand the details."

User:

"Use my existing details."

Agent:

"Absolutely. I'll use your previously approved profile information wherever it matches the application."

User:

"Also, update my phone number to the new one."

Agent:

"Sure. What is your new phone number?"

User provides the number.

Agent:

"Would you like me to save this new number to your profile for future applications, or use it only for this application?"

The agent should understand that these are two different actions:

- Updating persistent profile memory.
- Updating the current form task.

The first requires explicit memory approval. The second requires form-fill approval before execution.

Agent tool architecture

```
Agent Orchestrator
       |
       ├── Conversation Tool
       |
       ├── Context Retrieval Tool
       |
       ├── Profile Memory Tool
       |
       ├── Form Task Tool
       |
       ├── Field Mapping Tool
       |
       ├── Approval Tool
       |
       └── Browser Action Tool
```

The LLM should not directly write arbitrary database records or execute browser operations. It should request typed, validated tools through the backend.

Basic testing: Run scripted conversational scenarios involving new applications, returning users, missing details, corrections, ambiguous instructions, multilingual messages and multiple form tasks.

### Phase 8 – Form Intelligence and Field Mapping Engine

Objective: Translate natural-language instructions and stored user information into accurate webpage field values.

Example detected fields:

```
[
  {
    "label": "Full Name",
    "type": "text",
    "required": true
  },
  {
    "label": "Email Address",
    "type": "email",
    "required": true
  },
  {
    "label": "Highest Qualification",
    "type": "select",
    "required": true
  }
]
```

The agent should map approved profile information to detected fields.

Responsibilities:

- Match field labels and descriptions.
- Understand field types.
- Map profile information.
- Use current conversation answers.
- Handle dropdowns, checkboxes and radio buttons.
- Identify missing values.
- Detect conflicting values.
- Calculate mapping confidence.
- Generate a review summary.
- Prevent invented values.

Example output:

```
{
  "taskId": "task-uuid",
  "fields": [
    {
      "fieldId": "field-1",
      "proposedValue": "Adarsh Jha",
      "source": "approved_profile",
      "confidence": 0.99,
      "status": "proposed"
    },
    {
      "fieldId": "field-2",
      "proposedValue": null,
      "source": null,
      "confidence": 0,
      "status": "missing"
    }
  ]
}
```

The mapping engine proposes values. It does not fill the webpage by itself.

Basic testing: Test field matching, incorrect labels, dropdowns, missing values, conflicting profile information and confidence thresholds.

### Phase 9 – Browser Communication and Action Protocol

Objective: Connect the backend to the existing BhashaAgent Chrome extension.

The backend should provide a structured communication contract so that frontend development can happen independently.

Responsibilities:

1. Receive webpage metadata.
2. Receive detected form fields.
3. Associate webpage data with a form task.
4. Return proposed field mappings.
5. Send approved fill instructions.
6. Receive browser execution acknowledgements.
7. Track successful fields.
8. Handle failed field interactions.
9. Support retry and cancellation.
10. Synchronize task state.

Example browser action:

```
{
  "type": "FORM_FILL",
  "taskId": "task-uuid",
  "approvalId": "approval-uuid",
  "actions": [
    {
      "fieldId": "field-1",
      "value": "Adarsh Jha",
      "action": "SET_VALUE"
    }
  ]
}
```

Use a versioned action protocol and idempotency keys to avoid duplicate execution.

The extension must validate the target page and field mapping before acting.

Important: The browser action protocol must never contain an instruction to submit the application unless a separate explicit submission approval is implemented.

Basic testing: Simulate browser messages, validate action payloads, receive acknowledgements and test failure recovery.

### Phase 10 – Gnani AI Voice Integration

Voice support

Objective: Enable natural voice conversations using Gnani AI for both Speech-to-Text and Text-to-Speech.

We will not build a separate voice chatbot. Voice and text must use the same Conversation Manager and Agent Orchestrator.

Architecture:

Voice Input

Microphone audio

Gnani STT

Speech to text

Voice Output

Audio response

Gnani TTS

Text to speech

Shared Conversation Engine

Same context · Same memory · Same agent · Same form task

Features:

- Audio input handling.
- STT integration.
- Language detection and language selection.
- Transcription storage.
- Text-to-speech generation.
- Voice response delivery.
- Voice and text conversation synchronization.
- Error handling and timeouts.
- Support for interrupted or cancelled voice operations.
- Audio lifecycle management.

Example:

User speaks in Hindi.

Gnani STT converts the speech into text.

The Conversation Manager stores the message.

The Context Builder retrieves relevant context.

The Agent Orchestrator generates a response.

Gnani TTS converts the response into speech.

The conversation remains the same whether the user speaks or types.

Basic testing: Test STT, TTS, transcription persistence, multilingual messages, voice-to-text continuity and text-to-voice continuity.

### Phase 11 – Approval and Audit Management

Objective: Establish reliable approval workflows before the final security-hardening phase.

This phase formalizes the user control rules.

There are three distinct approval categories:

| Approval            | What it controls                                |
| ------------------- | ----------------------------------------------- |
| Profile approval    | Saving or changing reusable profile information |
| Form-fill approval  | Writing values into webpage fields              |
| Submission approval | Submitting an application or form               |

Approval records should include:

- User ID.
- Related conversation.
- Related form task, where applicable.
- Approval type.
- Approved data or action.
- Approval timestamp.
- Approval status.
- Action execution result.

Rules:

1. No profile memory updates without approval.
2. No form filling without final approval.
3. No automatic submission.
4. Corrections after approval should invalidate affected approval records.
5. An approval for one form task cannot authorize another form task.
6. The agent must show users what they are approving.

Basic testing: Approve, reject, revoke where supported, test stale approvals and verify approval-to-task association.

### Phase 12 – Complete Security Hardening and Production Readiness

Final security phase

As requested, the comprehensive security work will be consolidated here rather than repeatedly interrupting implementation with extensive security testing.

However, authentication and basic access controls must exist from Phase 2. We cannot safely build user-specific APIs without them.

Final security scope:

- JWT lifecycle and refresh-token rotation review.
- Password and credential security.
- Rate limiting.
- CORS restrictions.
- CSRF protection where applicable.
- Input validation and sanitization.
- SQL injection prevention.
- XSS-related data handling.
- Secure HTTP headers.
- Secret management.
- Encryption of sensitive stored data.
- User-level resource isolation.
- Authorization checks on every protected resource.
- WebSocket authentication and authorization.
- Browser message validation.
- Prompt injection and untrusted webpage content handling.
- SSRF protection for URL-related features.
- Audit log integrity.
- Sensitive information redaction.
- Dependency vulnerability scanning.
- Production logging and monitoring.
- Backup and database recovery strategy.
- Security and abuse-case testing.

Also test malicious webpage instructions. A webpage must never be able to override the user's instructions or trigger unauthorized form operations.

Final testing: Integration tests, end-to-end tests, multi-user isolation, security testing, failure recovery and production deployment validation.

## 4. Final development order

Here is the exact sequence we should follow.

## Backend implementation tracker

0 / 13 phases completed

0%

00

Fresh backend foundation

01

PostgreSQL database architecture

02

JWT authentication and user management

03

Conversation Manager

04

Profile Memory Manager

05

Form Task Manager

06

Context Builder

07

Agent Orchestrator and natural conversation

08

Form Intelligence and Field Mapping

09

Browser Communication Protocol

10

Gnani AI STT and TTS

11

Approval and Audit Management

12

Complete Security Hardening

## 5. How we will test

I agree with your approach of avoiding excessive testing after every small change.

We will use two testing levels:

| Testing level                                  | When                        |
| ---------------------------------------------- | --------------------------- |
| Basic smoke testing                            | After every completed phase |
| Comprehensive integration and security testing | Final phase                 |

For example, after Phase 3, we only verify that conversations are created, messages are saved and history is retrieved. We don't need to repeatedly test the entire authentication, memory, voice and browser workflows.

However, every phase must have:

- Successful TypeScript compilation.
- Successful database migration where applicable.
- Basic API or module testing.
- No broken previously completed functionality.
- A documented completion report.

We should also maintain an API contract and database schema version throughout development.

## 6. Important architectural decisions to preserve

These are non-negotiable throughout implementation:

1. Natural conversation first: The agent must understand instructions instead of forcing users through predefined question sequences.
2. One shared agent: Voice and text must use the same conversation and memory architecture.
3. PostgreSQL: All persistent application data must use PostgreSQL.
4. JWT authentication: Every user's conversations, memories and form tasks must be isolated.
5. Conversation persistence: Both active sessions and saved conversation history must persist.
6. Profile memory: Only explicitly approved information becomes reusable profile memory.
7. Form task isolation: Current form information must not automatically become permanent profile information.
8. Final approval: The user must approve the final form-fill operation.
9. No automatic submission: Filling and submitting are separate actions.
10. Context Builder: The Orchestrator must receive relevant context rather than independently fetching unrelated data.
11. Fresh implementation: Do not carry forward partially implemented backend logic just to save time.

## 7. Additional implementation requirements

A few things should be designed correctly from the beginning:

- Use a provider abstraction for the LLM so the conversational engine is not tightly coupled to one model.
- Keep Gnani AI credentials and API calls exclusively on the backend.
- Use a versioned API (`/api/v1`) and versioned WebSocket events.
- Make agent tool calls structured and validated.
- Maintain resumable conversations and form tasks.
- Keep database operations transactional when approval and execution states change.
- Do not let an LLM directly modify approved memories or execute browser actions.
- Treat webpage text and instructions as untrusted input.

## 8. My recommendation: How we should start

We should not start with the Agent Orchestrator immediately. The database and conversation persistence must be reliable first.

Start with Phase 0 and Phase 1 together as the initial foundation milestone, then proceed sequentially.

For every phase, I recommend creating a detailed master implementation prompt containing:

1. Existing architecture and completed work.
2. Exact requirements for that phase.
3. Files and modules to create.
4. Database changes.
5. API contracts.
6. Business logic and edge cases.
7. Integration requirements.
8. What must not be modified.
9. Basic testing instructions.
10. Completion criteria.

The coding agent should not begin the next phase until the current phase is completed and its basic tests pass.

One particularly important rule: Do not let the coding agent redesign completed architecture or recreate existing modules in subsequent phases. It should extend the established interfaces.

This gives us a clean backend foundation and avoids repeating the problems caused by modifying the partially completed project.

We can now begin with the Phase 0 + Phase 1 detailed master prompt, covering fresh setup, PostgreSQL architecture, Prisma schema, relationships, migrations and initial smoke tests.