# BhashaAgent

BhashaAgent is an AI-powered multilingual browser assistant and form intelligence platform built as a Chrome Extension (Manifest V3) backed by an Express and PostgreSQL orchestration service. The system enables users to interact in Indian languages (English, Hindi, Marathi, and Hinglish) to converse, manage persistent profile memories, inspect complex browser-rendered web forms, map personal details deterministically to form inputs, and execute human-reviewed autofill workflows with zero automated submissions.

This repository contains the complete monorepo comprising the React 18 browser extension frontend ([client/](client/)) and the Node.js TypeScript backend service ([server/](server/)).

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [System Architecture](#system-architecture)
4. [End-to-End Request Lifecycles](#end-to-end-request-lifecycles)
   - [Conversational Chat Lifecycle](#conversational-chat-lifecycle)
   - [Browser Form Inspection and Autofill Lifecycle](#browser-form-inspection-and-autofill-lifecycle)
5. [Technology Stack](#technology-stack)
6. [Repository Structure](#repository-structure)
7. [Frontend Architecture](#frontend-architecture)
8. [Backend Architecture](#backend-architecture)
9. [AI Agent Architecture](#ai-agent-architecture)
10. [Memory Architecture](#memory-architecture)
11. [Browser Form Intelligence Pipeline](#browser-form-intelligence-pipeline)
12. [Multilingual Architecture](#multilingual-architecture)
13. [Voice Streaming Architecture](#voice-streaming-architecture)
14. [Database Architecture](#database-architecture)
15. [API Documentation](#api-documentation)
16. [Prerequisites](#prerequisites)
17. [Installation and Setup](#installation-and-setup)
18. [Environment Variables](#environment-variables)
19. [Running and Building the Project](#running-and-building-the-project)
20. [Testing and Quality Assurance](#testing-and-quality-assurance)
21. [Security and Privacy Controls](#security-and-privacy-controls)
22. [Troubleshooting](#troubleshooting)
23. [Current Limitations](#current-limitations)
24. [Development Guidelines](#development-guidelines)
25. [Project Status](#project-status)
26. [License and Acknowledgements](#license-and-acknowledgements)

---

## Project Overview

Web forms across government portals, utility services, banking applications, and educational institutions are frequently complex, poorly labeled, dynamic, and presented in languages that users may struggle to parse. Conversely, generic browser autofill solutions rely on rigid heuristic tag matches, fail on dynamic or custom form controls, lack multilingual transliteration, and cannot reason about user profile data across multi-step processes.

BhashaAgent addresses these challenges by combining:
1. **Multilingual Conversational Assistance**: Natural language understanding and generation across English (`en`), Hindi (`hi`), Marathi (`mr`), and Hinglish (`hi-Latn`), allowing users to articulate information naturally in Devanagari or Latin transliteration.
2. **Deterministic DOM Form Inspection**: In-page content script DOM scanners that extract active input fields, resolve semantic labels, determine visibility, classify field types and sensitivity, and track DOM mutations.
3. **Structured Form Intelligence & Human Approval**: Form tasks that map user-approved profile facts to detected web inputs, compute confidence scores, and enforce an immutable user approval barrier before any in-page action is executed.
4. **Non-Submitting DOM Automation**: Browser execution scripts that populate approved values (`SET_VALUE`, `SELECT_OPTION`, `CHECK_RADIO`) and verify DOM updates, while explicitly forbidding automated form submissions.
5. **Real-Time Voice Gateway**: A bi-directional WebSocket audio pipeline supporting 16 kHz microphone capture via AudioWorklet, real-time speech recognition (STT), turn orchestration, and low-latency speech synthesis (TTS) with visual particle feedback.

### Implementation Status Matrix

| Capability | Status | Implementation Reference |
| :--- | :--- | :--- |
| Multilingual Chat (`en`, `hi`, `mr`, `hi-Latn`) | Implemented | [client/src/features/conversations/](client/src/features/conversations/), [server/src/modules/agent/](server/src/modules/agent/) |
| Chrome Manifest V3 Sidepanel & Popup | Implemented | [client/manifest.json](client/manifest.json), [client/src/sidepanel/](client/src/sidepanel/), [client/src/pages/popup/](client/src/pages/popup/) |
| DOM Form Inspection & Dynamic Mutation Tracking | Implemented | [client/src/content/](client/src/content/) |
| Deterministic & LLM-Assisted Field Mapping | Implemented | [server/src/modules/form-tasks/](server/src/modules/form-tasks/), [server/src/modules/agent/agent.tools.ts](server/src/modules/agent/agent.tools.ts) |
| Human-in-the-Loop Approval Snapshots | Implemented | [server/src/modules/form-tasks/form-task.service.ts](server/src/modules/form-tasks/form-task.service.ts), [client/src/features/forms/](client/src/features/forms/) |
| Non-Submitting In-Page Form Filling | Implemented | [client/src/features/browser/services/dom-action-executor.ts](client/src/features/browser/services/dom-action-executor.ts) |
| Post-Fill Verification & Undo Restoration | Implemented | [client/src/features/browser/components/ExecutionSummaryView.tsx](client/src/features/browser/components/ExecutionSummaryView.tsx) |
| Two-Phase Persistent Profile Memory | Implemented | [server/src/modules/memories/](server/src/modules/memories/), [client/src/features/memory/](client/src/features/memory/) |
| Multi-turn Agent Orchestration & Anti-Fabrication | Implemented | [server/src/modules/agent/agent.orchestrator.ts](server/src/modules/agent/agent.orchestrator.ts) |
| LLM Provider Abstraction (Gemini with Lite Fallback) | Implemented | [server/src/modules/llm/](server/src/modules/llm/) |
| Full-Duplex Real-Time Voice Streaming | Implemented | [server/src/modules/voice/](server/src/modules/voice/), [client/src/features/voice/](client/src/features/voice/) |
| Automated Form Submission | Prohibited | Explicit architectural boundary enforced across frontend and backend |

---

## Key Features

### Multilingual Assistant
- Supports 4 language profiles: English (`en`), Hindi (`hi`), Marathi (`mr`), and Hinglish (`hi-Latn`).
- Turn-by-turn language auto-detection dynamically adapts the assistant response language to the user's latest input.
- Devanagari Unicode preservation guarantees field values and names are never mangled across storage or DOM injection.
- Message revision tracking records edits and corrections for auditability and model prompt alignment.

### Browser Form Intelligence
- Scans visible, non-disabled DOM elements (`<input>`, `<select>`, `<textarea>`, ARIA widgets, custom radio groups).
- Resolves field labels through an 8-level precedence heuristic (for-attribute, aria-labelledby, aria-label, wrapping labels, preceding headings, placeholders, title attributes, name/id tokens).
- Dynamic mutation handling via `MutationObserver` tracks SPA field renders and multi-step form transitions without losing state.
- Sensitive field masking automatically redacts passwords, national identity tokens, CVVs, and credit card numbers from LLM context and client logs.
- Deterministic and agentic field matching links detected inputs to verified user profile memories with confidence tracking.
- Pre-fill approval barrier requires explicit human confirmation before dispatching fill instructions.
- Post-fill verification compares DOM input states with approved values to flag failed population or page script interference.
- Undo restoration allows reverting fields to their pre-filled states within the active session.

### Conversational Intelligence
- Multi-turn agent loop with model output validation against Zod schemas.
- Anti-fabrication grounding check (`isValueGroundedInUserUtterance`) prevents the model from hallucinating personal data not explicitly supplied by the user or approved in memory.
- Dynamic token budgeting across recent messages, relevant older turns, approved memory facts, and active form task fields.
- Resilient fallback routing: automatically degrades from primary LLM to secondary fallback model upon provider timeouts or schema validation failures.

### Memory Management
- Dual-phase proposal workflow: model proposes profile candidates (`PENDING`), user reviews and approves (`APPROVED`) or rejects (`REJECTED`).
- Versioned field tracking retains previous values on updates and logs audit trails.
- Explicit deletion lifecycle removes memories from active context construction.

### Voice Intelligence
- Full-duplex voice streaming over WebSocket protocol `bhasha.voice.v1`.
- Single-use 60-second HMAC tickets gate WebSocket upgrades without exposing long-lived auth credentials.
- 16 kHz mono linear PCM capture via dedicated AudioWorklet (`pcm-processor.js`).
- Gnani Vachana STT engine converts streaming audio frames into Devanagari/Latin transcripts.
- Gnani Timbre TTS engine streams 24 kHz audio chunks for low-latency voice playback.
- Barge-in detection interrupts ongoing TTS playback immediately upon user speech detection.

### Authentication and Security
- User registration and login utilizing Argon2id password hashing (minimum 12 characters, memory cost 64 MB, time cost 3 iterations).
- Single-flight refresh token rotation mutex prevents token race conditions during concurrent API requests.
- SHA-256 token hashing in PostgreSQL database mitigates credential exposure in the event of database dumps.
- Strict per-user database tenancy ensures cross-tenant data isolation across all endpoints and queries.

---

## System Architecture

The following architecture diagram represents the complete component interaction across browser client surfaces, backend services, external providers, and database storage:

```mermaid
graph TD
    subgraph Browser ["Chrome Browser Environment (Manifest V3)"]
        User["User"] --> Sidepanel["Side Panel (React 18 / Vite)"]
        User --> Popup["Action Popup"]
        User --> WebpageDOM["Webpage Form DOM"]
        
        Sidepanel <--> SW["Background Service Worker"]
        Popup <--> SW
        SW <--> CS["Content Script (DOM Scanner & Executor)"]
        CS <--> WebpageDOM
    end

    subgraph Backend ["BhashaAgent Backend (Node.js / Express 5)"]
        HTTP["HTTP API Gateway (0.0.0.0:5000)"]
        WS["Voice Gateway (ws://.../api/v1/voice/ws)"]
        
        AuthMW["Auth Middleware & Token Verifier"]
        Orchestrator["Agent Orchestrator"]
        ContextBuilder["Context Builder"]
        FormService["Form Task Service"]
        MemoryService["Profile Memory Service"]
        VoiceManager["Voice Session Manager"]
        
        HTTP --> AuthMW
        AuthMW --> FormService
        AuthMW --> MemoryService
        AuthMW --> Orchestrator
        Orchestrator <--> ContextBuilder
        Orchestrator <--> FormService
        Orchestrator <--> MemoryService
        
        WS --> VoiceManager
        VoiceManager <--> Orchestrator
    end

    subgraph Providers ["External AI & Speech Providers"]
        Gemini["Google Gemini Pro / Flash"]
        FallbackLLM["Groq / OpenAI HTTP Fallback"]
        GnaniSTT["Gnani Vachana STT"]
        GnaniTTS["Gnani Timbre TTS"]
        
        Orchestrator --> Gemini
        Orchestrator -.-> FallbackLLM
        VoiceManager <--> GnaniSTT
        VoiceManager <--> GnaniTTS
    end

    subgraph Storage ["Persistence Layer"]
        Prisma["Prisma ORM 6.19"]
        Postgres[("PostgreSQL Database")]
        
        FormService --> Prisma
        MemoryService --> Prisma
        Orchestrator --> Prisma
        AuthMW --> Prisma
        Prisma --> Postgres
    end

    Sidepanel -- "HTTP REST (bhasha.browser.v1)" --> HTTP
    Sidepanel -- "WebSocket (bhasha.voice.v1)" --> WS
```

---

## End-to-End Request Lifecycles

### Conversational Chat Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Client as Side Panel UI
    participant Server as Express HTTP API
    participant Context as Context Builder
    participant Orch as Agent Orchestrator
    participant LLM as Gemini Provider
    participant DB as PostgreSQL (Prisma)

    User->>Client: Enters message ("Fill my passport form")
    Client->>Server: POST /api/v1/conversations/:id/turns (Bearer Token)
    Server->>Server: Authenticate user & verify conversation tenancy
    Server->>DB: Store user message record
    Server->>Context: Build context (Token budget: 8,000 tokens)
    Context->>DB: Fetch recent messages, approved memories, active form tasks
    Context-->>Orch: Structured Context Object
    
    loop Agent Execution Loop (Max 3 rounds)
        Orch->>LLM: Generate response (System prompt, context, tools)
        LLM-->>Orch: Tool call or structured output
        alt Tool Call (e.g. ProposeFieldValue)
            Orch->>Orch: Verify grounding against user input / approved memory
            Orch->>DB: Persist proposed field value
            Orch-->>LLM: Tool result
        else Final Natural Response
            Orch->>Orch: Validate Zod response schema
        end
    end

    Orch->>DB: Store assistant message & tool execution traces
    Orch-->>Server: Final response payload
    Server-->>Client: 200 OK (assistant message, tool activities, active form status)
    Client-->>User: Render response in selected language
```

### Browser Form Inspection and Autofill Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant DOM as Webpage DOM
    participant CS as Content Script
    participant SW as Background Worker
    participant Panel as Side Panel UI
    participant API as Form & Browser API
    participant DB as PostgreSQL

    User->>Panel: Clicks "Scan Webpage Form"
    Panel->>SW: chrome.runtime.sendMessage(SCAN_FORM)
    SW->>CS: chrome.tabs.sendMessage(INSPECT_DOM)
    CS->>DOM: Query inputs, textareas, selects, custom radios
    CS->>DOM: Run label resolution & compute visibility
    CS-->>SW: FormInspectionResult (detected fields, selectors, values)
    SW-->>Panel: Relay inspection payload
    
    Panel->>API: POST /api/v1/forms/tasks (url, title, fields)
    API->>DB: Create FormTask & DetectedField records
    API->>API: Auto-map fields matching approved ProfileMemory
    API-->>Panel: FormTask detail (fields + mapped values + confidence)
    
    User->>Panel: Reviews mapped fields & clicks "Approve Values"
    Panel->>API: POST /api/v1/forms/tasks/:id/approve (approved field list)
    API->>DB: Create Approval snapshot & FieldValue records
    API-->>Panel: Approval confirmed
    
    User->>Panel: Clicks "Fill Approved Fields"
    Panel->>API: POST /api/v1/browser/instructions (FormTask ID)
    API->>API: Build idempotent instruction list (SET_VALUE, SELECT_OPTION, CHECK_RADIO)
    API-->>Panel: Instruction payload + Execution ID
    
    Panel->>SW: EXECUTE_DOM_ACTIONS(instructions)
    SW->>CS: Relay actions
    CS->>DOM: Execute in-page values (preserves Unicode, dispatches input/change events)
    CS->>DOM: Verify DOM states match intended values
    CS-->>SW: ExecutionResult (successCount, failureCount, previousValues)
    SW-->>Panel: Verification report
    Panel->>API: POST /api/v1/browser/executions/:id/acknowledge
    Panel-->>User: Visual execution summary (Form remains unsubmitted for human review)
```

---

## Technology Stack

| Layer | Technology | Version | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React | `18.3.1` | Declarative UI rendering for extension side panel and popup surfaces. |
| **Programming Language** | TypeScript | `5.7.2` | Full static type safety across frontend and backend domain boundaries. |
| **Bundler & Dev Server** | Vite | `8.3.5` | Fast build bundling with `@crxjs/vite-plugin` for Manifest V3 packaging. |
| **Extension Packaging** | CRXJS | `2.0.0-beta.28` | Manifest V3 build integration, service worker bundling, and HMR. |
| **Styling System** | Tailwind CSS | `4.0.0` | Atomic CSS design tokens aligned with BhashaAgent visual palette. |
| **Client Routing** | React Router DOM | `6.28.1` | Client-side routing between chat, memory, account, and form pages. |
| **Iconography** | Lucide React | `0.475.0` | Clean, accessible vector icons for UI actions and navigation. |
| **Backend Framework** | Express | `5.1.0` | Native asynchronous routing and robust HTTP middleware pipeline. |
| **Database** | PostgreSQL | `14+` | Relational ACID persistence with full foreign key constraints and cascades. |
| **ORM** | Prisma ORM | `6.19.3` | Schema-driven database migrations, relation modeling, and type-safe queries. |
| **Password Hashing** | Argon2 | `0.41.1` | Argon2id memory-hard password hashing adhering to OWASP recommendations. |
| **Authentication** | JSON Web Token (JWT) | `9.0.2` | Short-lived RS256/HS256 access tokens and cryptographically random refresh tokens. |
| **Primary LLM** | Google Gen AI SDK | `2.32.0` | Structured multi-turn agent turns using Gemini 1.5 Pro and Gemini 1.5 Flash. |
| **Fallback LLM** | Groq / OpenAI HTTP | Standard HTTP | Low-latency fallback providers when primary LLM encounters rate limits or errors. |
| **Real-Time Voice Transport** | ws | `8.22.0` | High-throughput RFC 6455 WebSocket gateway for full-duplex binary audio. |
| **Speech-to-Text (STT)** | Gnani Vachana | Cloud API | Real-time streaming ASR specialized for Indian regional languages. |
| **Text-to-Speech (TTS)** | Gnani Timbre | Cloud API | Low-latency 24 kHz speech synthesis for natural Indian language voices. |
| **Validation** | Zod | `4.1.8` | Strict runtime input/output validation for REST payloads and LLM outputs. |
| **Test Runner (Frontend)** | Node Test Runner / TSX | `4.19.2` | Native TypeScript test execution without heavy external dependencies. |
| **Test Runner (Backend)** | Node Test Runner (`node:test`) | Built-in | Fast assertion runner with TAP reporting for backend integration tests. |

---

## Repository Structure

```
BhashaAgent/
├── client/                                 # Chrome Extension Frontend (Manifest V3)
│   ├── public/                             # Static assets copied directly to dist/
│   │   ├── icons/                          # Extension icons (16, 32, 48, 128px, Logo.png)
│   │   ├── manifest.json                   # Canonical Chrome MV3 manifest
│   │   └── pcm-processor.js                # Isolated AudioWorklet processor for 16 kHz capture
│   ├── scripts/                            # Build and packaging automation
│   │   ├── generate-icons.ps1              # High-DPI icon generator
│   │   └── prepare-extension.js            # Post-build packaging and content script cleanup
│   ├── src/                                # Application source code
│   │   ├── app/                            # React application router and root provider
│   │   ├── background/                     # Manifest V3 service worker (session & tab coordinator)
│   │   ├── components/                     # Shared UI components (BhashaLogo, Modal, Layouts)
│   │   ├── content/                        # In-page content script (DOM scanner & action executor)
│   │   ├── features/                       # Modular feature domains
│   │   │   ├── auth/                       # Login, registration, account deletion, session storage
│   │   │   ├── browser/                    # Form inspection, fill modals, execution summaries
│   │   │   ├── conversations/              # Chat stream, message composer, revision history, sidebar
│   │   │   ├── forms/                      # Form task dashboard, field mapping, approvals
│   │   │   ├── memory/                     # Profile memory dashboard, pending proposal reviews
│   │   │   └── voice/                      # Voice Orb canvas, WebSocket client, AudioWorklet capture
│   │   ├── layouts/                        # Base layouts (SidePanelLayout, PopupLayout)
│   │   ├── pages/                          # Standalone views (PopupPage, AccountPage, PermissionPage)
│   │   ├── services/                       # Centralized API client and error models
│   │   ├── sidepanel/                      # Main extension sidepanel entry point
│   │   └── types/                          # Shared TypeScript contracts and interfaces
│   ├── tests/                              # Frontend test suites (108 tests passing)
│   ├── index.html                          # Sidepanel HTML entry point
│   ├── package.json                        # Frontend dependencies and build scripts
│   ├── tsconfig.json                       # Frontend TypeScript compiler configuration
│   └── vite.config.ts                      # Vite build configuration with Tailwind v4
│
├── server/                                 # Node.js TypeScript Backend Service
│   ├── prisma/                             # Database schema and migration management
│   │   ├── migrations/                     # 11 linear SQL migration steps
│   │   └── schema.prisma                   # Canonical Prisma schema (18 models, 15 enums)
│   ├── src/                                # Server source code
│   │   ├── common/                         # Shared middleware and types
│   │   │   ├── middleware/                 # Auth guard, error handler, rate limiters
│   │   │   └── types/                      # Common application types and interfaces
│   │   ├── config/                         # Environment schema, defaults, and validation
│   │   ├── modules/                        # Domain-driven modules
│   │   │   ├── agent/                      # Multi-turn orchestrator, tool registry, grounding verifier
│   │   │   ├── auth/                       # Argon2id hashing, JWT rotation, session revocation
│   │   │   ├── browser/                    # Browser automation protocol (bhasha.browser.v1)
│   │   │   ├── context/                    # Context Builder with dynamic token budgeting
│   │   │   ├── conversations/              # Conversation lifecycle, message revisions, archives
│   │   │   ├── form-intelligence/          # Form analysis, heuristics, and mapping logic
│   │   │   ├── form-tasks/                 # Form tasks, detected fields, approvals
│   │   │   ├── llm/                        # Gemini provider, HTTP provider, LLM factory, redaction
│   │   │   ├── memories/                   # Profile memory proposals, approval/rejection workflows
│   │   │   ├── users/                      # User profile management and account deletion
│   │   │   └── voice/                      # WebSocket voice gateway (bhasha.voice.v1), Gnani & Timbre
│   │   └── server.ts                       # Dual HTTP and WebSocket entry point
│   ├── tests/                              # Backend test suites (148 tests passing)
│   ├── package.json                        # Backend dependencies and scripts
│   └── tsconfig.json                       # Backend TypeScript compiler configuration
│
└── README.md                               # Root project documentation
```

---

## Frontend Architecture

The frontend is packaged as a Chrome Extension complying strictly with **Manifest V3**. It provides two distinct presentation surfaces:

1. **Side Panel (`index.html` → `src/sidepanel/main.tsx`)**:
   - The primary interactive workspace for the user.
   - Hosts full conversation chat streams, voice interaction mode with an interactive 3D particle Canvas Voice Orb, form inspection reviews, field approval dialogs, and profile memory controls.
   - Built with React 18, React Router DOM, and Tailwind CSS v4.

2. **Action Popup (`popup.html` → `src/popup/main.tsx`)**:
   - A compact extension toolbar popup for rapid status inspection, active authentication display, quick links to open the side panel, and account logout.

3. **Dedicated Permission Page (`permission.html` → `src/permission/PermissionPage.tsx`)**:
   - Chrome Manifest V3 side panels cannot invoke `navigator.mediaDevices.getUserMedia()` directly due to sandbox constraints.
   - BhashaAgent launches a dedicated tab to guide the user through granting microphone permissions, storing state in `chrome.storage.local`.

### Chrome Extension Manifest V3 Topology

```mermaid
graph LR
    subgraph MV3 ["Manifest V3 Surface Isolation"]
        SidePanel["Side Panel (UI)"] <--> |chrome.runtime| BG["Background Service Worker"]
        Popup["Action Popup (UI)"] <--> |chrome.runtime| BG
        BG <--> |chrome.tabs.sendMessage| CS["Content Script (Isolated World)"]
        CS <--> |Direct DOM Access| Page["Webpage Form DOM"]
    end
    
    subgraph Net ["Network Communication"]
        SidePanel --> |HTTP REST / JWT| API["Backend Express API"]
        SidePanel --> |WebSocket / Audio| WS["Backend Voice Gateway"]
    end
```

### Content Script and DOM Automation
The content script ([client/src/content/index.ts](client/src/content/index.ts)) runs inside the web page context and communicates with the background worker via `chrome.runtime`:
- **DOM Scanner**: Detects `<input>`, `<select>`, `<textarea>`, and radio buttons. Extracts bounding boxes, computed styles, ARIA labels, placeholders, and surrounding text.
- **Dynamic Watcher**: Uses `MutationObserver` to notify the sidepanel when new form fields appear during dynamic multi-step wizards.
- **DOM Action Executor**: Dispatches trusted synthetic input events (`input`, `change`, `blur`) following `SET_VALUE`, `SELECT_OPTION`, or `CHECK_RADIO` actions, ensuring Devanagari text is entered accurately.
- **Safety Boundary**: The content script **contains no form submission code**. It explicitly halts after filling and verifying field values, leaving form submission to the human user.

---

## Backend Architecture

The backend is built with **Express 5.1.0** and TypeScript. It implements a dual-transport gateway:
- **HTTP/1.1 REST Gateway** handling authenticated resource CRUD, conversational agent turns, and form approvals.
- **WebSocket Gateway** (`ws://0.0.0.0:5000/api/v1/voice/ws`) handling streaming binary audio and real-time voice turns under the `bhasha.voice.v1` protocol.

```mermaid
graph TD
    Client["Client (Extension)"] --> |HTTP Requests| HTTPRouter["Express HTTP Router (/api/v1)"]
    Client --> |Upgrade Header| WSServer["WebSocket Server (/api/v1/voice/ws)"]

    subgraph Middleware ["Middleware Pipeline"]
        CORS["CORS Config"]
        Helmet["Security Headers"]
        RateLimit["Rate Limiter"]
        AuthGuard["JWT Auth Guard"]
    end

    HTTPRouter --> CORS --> Helmet --> RateLimit --> AuthGuard

    subgraph Controllers ["Domain Modules"]
        AuthController["Auth Module"]
        ConvController["Conversation Module"]
        FormController["Form Task Module"]
        MemoryController["Profile Memory Module"]
        AgentController["Agent Turn Module"]
    end

    AuthGuard --> AuthController
    AuthGuard --> ConvController
    AuthGuard --> FormController
    AuthGuard --> MemoryController
    AuthGuard --> AgentController

    subgraph CoreEngine ["AI & Context Engine"]
        ContextBuilder["Context Builder"]
        AgentOrchestrator["Agent Orchestrator"]
        LLMFactory["LLM Factory & Fallbacks"]
        GroundingVerifier["Anti-Fabrication Verifier"]
    end

    AgentController --> ContextBuilder
    AgentController --> AgentOrchestrator
    AgentOrchestrator <--> LLMFactory
    AgentOrchestrator <--> GroundingVerifier

    subgraph DataAccess ["Database Layer"]
        PrismaClient["Prisma Client 6.19"]
        PostgresDB[("PostgreSQL Database")]
    end

    Controllers --> PrismaClient
    CoreEngine --> PrismaClient
    WSServer --> PrismaClient
    PrismaClient --> PostgresDB
```

---

## AI Agent Architecture

The AI agent architecture uses a multi-turn reasoning and tool execution loop managed by the `AgentOrchestrator` ([server/src/modules/agent/agent.orchestrator.ts](server/src/modules/agent/agent.orchestrator.ts)).

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Orch as Agent Orchestrator
    participant Context as Context Builder
    participant ToolReg as Tool Registry
    participant Ground as Grounding Verifier
    participant LLM as Primary LLM (Gemini)
    participant Fallback as Fallback LLM (Groq/OpenAI)

    Client->>Orch: executeTurn(userId, conversationId, userText, formTaskId)
    Orch->>Context: buildContext(userId, conversationId, formTaskId)
    Context-->>Orch: Formatted Context Object (Budgets enforced)
    
    loop Turn Loop (Up to 3 Iterations)
        Orch->>LLM: invoke(systemPrompt, context, tools)
        alt LLM Fails / Times out / Invalid JSON
            Orch->>Fallback: invoke fallback model
            Fallback-->>Orch: Tool calls or natural text
        else LLM Responds Successfully
            LLM-->>Orch: Tool calls or natural text
        end

        alt Model Calls Tool (e.g. ProposeFieldValue)
            Orch->>Ground: isValueGroundedInUserUtterance(value, context)
            alt Value Not Grounded (Hallucination Detected)
                Ground-->>Orch: REJECT tool call
                Orch->>Orch: Intercept fabrication & re-prompt model
            else Value Grounded
                Ground-->>Orch: APPROVE tool call
                Orch->>ToolReg: execute tool in database transaction
                ToolReg-->>Orch: Tool execution result
            end
        else Model Returns Final Text
            Orch->>Orch: Validate output against Zod schema
            Orch->>Orch: Break loop
        end
    end

    Orch-->>Client: Final natural language response + turn metadata
```

### Anti-Fabrication Grounding Verification
To prevent the model from inventing personal details (such as passport numbers, Aadhaar numbers, phone numbers, or addresses) when filling forms, the `AgentOrchestrator` runs all proposed values through `isValueGroundedInUserUtterance()` ([server/src/modules/agent/agent.tools.ts](server/src/modules/agent/agent.tools.ts)). If a proposed value does not exist verbatim in the user's latest message or in verified, approved `ProfileMemory` records, the tool call is rejected and the agent is instructed to ask the user directly for the value.

---

## Memory Architecture

BhashaAgent separates memory into three distinct operational layers:

```mermaid
graph TD
    subgraph MemoryLayers ["Three Memory Layers"]
        PPM["Layer 1: Persistent Profile Memory<br/>(Long-term user facts: name, DOB, address, passport)"]
        CM["Layer 2: Conversation Memory<br/>(Short-term context: messages, edits, revisions)"]
        FTS["Layer 3: Form Task State<br/>(Session context: detected inputs, proposed values, approvals)"]
    end

    PPM --> |Two-Phase Approval| ContextBuilder["Context Builder (Token Budget Engine)"]
    CM --> |Sliding Window + Revisions| ContextBuilder
    FTS --> |Active Field Snapshot| ContextBuilder

    ContextBuilder --> |Budgeted Context Payload (Max 8000 tokens)| AgentOrchestrator["Agent Orchestrator"]
```

1. **Persistent Profile Memory (`ProfileMemory` & `MemoryChangeRequest`)**:
   - Stores long-term user facts organized by categories (`IDENTITY`, `CONTACT`, `TRAVEL`, `EMPLOYMENT`, `EDUCATION`, `PREFERENCE`, `OTHER`).
   - Uses a strict **two-phase proposal workflow**: When the agent extracts potential facts from chat, it creates a `MemoryChangeRequest` with status `PENDING`. Facts are only committed to `ProfileMemory` when explicitly approved by the user.
2. **Conversation Memory (`Conversation`, `Message`, `MessageRevision`)**:
   - Retains conversation history with support for message editing and correction tracking.
   - Message revisions maintain an immutable audit trail of what the user originally said versus what was corrected.
3. **Form Task State (`FormTask`, `DetectedField`, `FieldValue`, `Approval`)**:
   - Manages the lifecycle of an active webpage form inspection (`DETECTED` → `MAPPING` → `REVIEW` → `APPROVED` → `EXECUTING` → `COMPLETED` → `CANCELLED`).
   - `Approval` snapshots record the exact JSON state of fields approved by the user before DOM actions are dispatched.

---

## Browser Form Intelligence Pipeline

```mermaid
flowchart TD
    Scan["1. DOM Scan via Content Script"] --> Filter["2. Filter Invisible / Disabled Elements"]
    Filter --> Label["3. Heuristic Label Resolution (8-level precedence)"]
    Label --> Classify["4. Field Type & Sensitivity Classification"]
    Classify --> TaskCreate["5. Create FormTask on Backend"]
    
    TaskCreate --> AutoMap["6. Auto-map Approved ProfileMemory Facts"]
    TaskCreate --> AgentMap["7. Agent Turn Proposes Remaining Values"]
    AutoMap --> Review["8. User Review in Sidepanel UI"]
    AgentMap --> Review
    
    Review --> |User Modifies / Approves| Snap["9. Create Immutable Approval Snapshot"]
    Snap --> GenInst["10. Generate Idempotent Browser Instructions"]
    GenInst --> Exec["11. Content Script Executes DOM Actions (SET_VALUE / SELECT_OPTION)"]
    Exec --> Verify["12. Post-Fill DOM State Verification"]
    Verify --> Summary["13. Visual Execution Summary (Human Submits Form)"]
```

### Safe Autofill Execution Rules
1. **Never Submit**: The content script executor contains handlers for `SET_VALUE`, `SELECT_OPTION`, and `CHECK_RADIO`. No `submit()` or click on `button[type="submit"]` exists in the execution engine.
2. **Event Dispatching**: Standard DOM property assignments do not trigger React or Angular internal state updates. BhashaAgent uses native prototype property setters followed by synthetic `input`, `change`, and `blur` events.
3. **Devanagari Preservation**: Text input values are applied directly via Unicode string assignment, preventing transliteration corruption.
4. **Idempotency**: Every execution instruction set contains an SHA-256 hash computed over instruction parameters, preventing accidental double-application.

---

## Multilingual Architecture

BhashaAgent implements native support for four language formats:
- **English (`en`)**
- **Hindi (`hi`)** (Devanagari script)
- **Marathi (`mr`)** (Devanagari script)
- **Hinglish (`hi-Latn`)** (Hindi articulated using Latin characters)

### Language Resolution & Switching Pipeline
- **Turn-by-turn Language Detection**: The backend utility `language-detector.ts` inspects incoming user messages using Unicode script block analysis and Latin phonetic heuristics to determine whether the user is speaking English, Hindi, Marathi, or Hinglish.
- **Dynamic Context Instruction**: The resolved turn language is injected into the model's system prompt instructions, ensuring the assistant responds naturally in the user's chosen language.
- **Voice Turn Language Harmonization**: During voice sessions, `voice-language.ts` resolves language conflicts between client preference, speech provider transcript metadata, and detected utterance language to ensure speech synthesis (TTS) matches the spoken tongue.

---

## Voice Streaming Architecture

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Worklet as AudioWorklet (pcm-processor.js)
    participant ClientWS as Client WebSocket Client
    participant Gateway as Voice Gateway (Express / ws)
    participant STT as Gnani Vachana STT
    participant Orch as Agent Orchestrator
    participant TTS as Gnani Timbre TTS

    User->>ClientWS: Opens Voice Mode
    ClientWS->>Gateway: POST /api/v1/voice/ticket (Bearer Token)
    Gateway-->>ClientWS: 200 OK (Single-use HMAC Ticket)
    ClientWS->>Gateway: ws://.../voice/ws?ticket=HMAC (Protocol: bhasha.voice.v1)
    Gateway->>Gateway: Validate ticket & establish session
    Gateway-->>ClientWS: SESSION_READY
    
    User->>Worklet: Speaks into microphone (16 kHz Linear PCM)
    Worklet->>ClientWS: Float32Array PCM samples
    ClientWS->>Gateway: Binary Audio Chunks (16 kHz 16-bit Mono)
    Gateway->>STT: Stream audio frames
    
    STT-->>Gateway: Partial & Final Transcripts
    Gateway-->>ClientWS: TRANSCRIPT event (Real-time subtitle preview)
    
    Gateway->>Orch: Process finalized user utterance
    Orch-->>Gateway: Assistant response text
    Gateway-->>ClientWS: ASSISTANT_RESPONSE event
    
    Gateway->>TTS: Stream synthesis request
    TTS-->>Gateway: 24 kHz Linear PCM chunks
    Gateway-->>ClientWS: AUDIO_CHUNK events (Base64 audio)
    ClientWS-->>User: Playback audio through Web Audio API
    
    opt Barge-In Interruption
        User->>Worklet: Speaks while assistant is talking
        Worklet->>ClientWS: Audio detected
        ClientWS->>Gateway: USER_INTERRUPT event
        Gateway->>TTS: Cancel active generation
        ClientWS->>ClientWS: Flush audio buffer & resume listening state
    end
```

---

## Database Architecture

BhashaAgent uses PostgreSQL managed via **Prisma ORM 6.19.3**. The database schema comprises **18 models**, **15 enums**, and **11 linear migrations**:

```mermaid
erDiagram
    User ||--o{ RefreshToken : owns
    User ||--o{ Conversation : creates
    User ||--o{ ProfileMemory : stores
    User ||--o{ MemoryChangeRequest : proposes
    User ||--o{ FormTask : owns
    User ||--o{ Approval : grants
    User ||--o{ AuditLog : generates
    User ||--o{ BrowserPageSession : registers

    Conversation ||--o{ Message : contains
    Conversation ||--o{ FormTask : associates
    Conversation ||--o{ AuditLog : logs
    
    Message ||--o{ MessageRevision : tracks
    
    ProfileMemory ||--o{ MemoryChangeRequest : targets
    ProfileMemory ||--o{ FieldMapping : populates
    
    FormTask ||--o{ DetectedField : discovers
    FormTask ||--o{ FieldValue : assigns
    FormTask ||--o{ TaskEvent : logs
    FormTask ||--o{ Approval : validates
    FormTask ||--o{ BrowserExecution : triggers
    
    DetectedField ||--o{ FieldValue : receives
    DetectedField ||--o{ FieldMapping : maps
    
    FieldValue ||--o{ FieldValueRevision : versions
    
    BrowserPageSession ||--o{ BrowserExecution : scopes
    BrowserExecution ||--o{ BrowserActionResult : records

    User {
        string id PK
        string email UK
        string passwordHash
        string fullName
        Role role
        Language preferredLanguage
        DateTime createdAt
    }

    Conversation {
        string id PK
        string userId FK
        string title
        ConversationStatus status
        Language language
        DateTime createdAt
    }

    Message {
        string id PK
        string conversationId FK
        MessageSender sender
        string content
        int turnIndex
        DateTime createdAt
    }

    ProfileMemory {
        string id PK
        string userId FK
        MemoryCategory category
        string key
        string value
        MemoryStatus status
        float confidence
    }

    FormTask {
        string id PK
        string userId FK
        string conversationId FK
        string pageUrl
        string formTitle
        FormTaskStatus status
        DateTime createdAt
    }

    DetectedField {
        string id PK
        string formTaskId FK
        string name
        string label
        FieldType fieldType
        string selector
        boolean isSensitive
    }

    FieldValue {
        string id PK
        string formTaskId FK
        string fieldId FK
        string value
        ValueSource source
        float confidence
    }

    Approval {
        string id PK
        string formTaskId FK
        string userId FK
        json approvedSnapshot
        DateTime createdAt
    }

    BrowserExecution {
        string id PK
        string formTaskId FK
        string pageSessionId FK
        ExecutionStatus status
        string idempotencyHash
    }
```

---

## API Documentation

The backend exposes a versioned REST API mounted at `/api/v1`. All endpoints (except public authentication routes) require a valid JWT passed in the `Authorization: Bearer <token>` header.

### Authentication & Account Endpoints
| Method | Endpoint | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new user with email and password | Public |
| `POST` | `/api/v1/auth/login` | Authenticate user and receive access & refresh tokens | Public |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token and obtain new access token | Public (Requires valid Refresh Token) |
| `POST` | `/api/v1/auth/logout` | Revoke current refresh token | Authenticated |
| `POST` | `/api/v1/auth/logout-all` | Revoke all active sessions for current user | Authenticated |
| `GET` | `/api/v1/users/me` | Fetch authenticated user profile | Authenticated |
| `PATCH` | `/api/v1/users/me` | Update profile information and preferred language | Authenticated |
| `PUT` | `/api/v1/users/me/password` | Change password with current password verification | Authenticated |
| `DELETE` | `/api/v1/users/me` | Permanently delete user account and all tenant data | Authenticated |

### Conversation & Chat Endpoints
| Method | Endpoint | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/conversations` | List user conversations (supports status filter and pagination) | Authenticated |
| `POST` | `/api/v1/conversations` | Create a new conversation | Authenticated |
| `GET` | `/api/v1/conversations/:id` | Fetch conversation details and recent message history | Authenticated |
| `PATCH` | `/api/v1/conversations/:id` | Rename or update conversation status | Authenticated |
| `DELETE` | `/api/v1/conversations/:id` | Soft delete / archive conversation | Authenticated |
| `GET` | `/api/v1/conversations/:id/messages` | Retrieve paginated message history | Authenticated |
| `POST` | `/api/v1/conversations/:id/messages` | Create a raw user message | Authenticated |
| `PATCH` | `/api/v1/conversations/:id/messages/:messageId` | Edit a previous message (triggers revision snapshot) | Authenticated |
| `GET` | `/api/v1/conversations/:id/messages/:messageId/revisions` | View message edit history | Authenticated |
| `POST` | `/api/v1/conversations/:id/turns` | Execute a complete AI agent conversational turn | Authenticated |

### Profile Memory Endpoints
| Method | Endpoint | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/memories` | List approved user profile memory records | Authenticated |
| `POST` | `/api/v1/memories` | Manually add a profile memory record | Authenticated |
| `PATCH` | `/api/v1/memories/:id` | Update an existing memory (creates an UPDATE proposal) | Authenticated |
| `DELETE` | `/api/v1/memories/:id` | Delete memory (creates a DELETE proposal) | Authenticated |
| `GET` | `/api/v1/memories/proposals` | List pending memory change proposals | Authenticated |
| `POST` | `/api/v1/memories/proposals/:id/approve` | Approve a pending memory proposal | Authenticated |
| `POST` | `/api/v1/memories/proposals/:id/reject` | Reject a pending memory proposal | Authenticated |
| `POST` | `/api/v1/memories/extract` | Run LLM extraction over conversation turns to find facts | Authenticated |

### Form Intelligence Endpoints
| Method | Endpoint | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/forms/tasks` | List active and historical form tasks | Authenticated |
| `POST` | `/api/v1/forms/tasks` | Register detected form fields from webpage DOM scan | Authenticated |
| `GET` | `/api/v1/forms/tasks/:id` | Get complete form task details, fields, and proposed values | Authenticated |
| `PATCH` | `/api/v1/forms/tasks/:id` | Update form task status or active metadata | Authenticated |
| `POST` | `/api/v1/forms/tasks/:id/values` | Set or update a field value for a detected field | Authenticated |
| `POST` | `/api/v1/forms/tasks/:id/approve` | Submit user approval snapshot for mapped field values | Authenticated |
| `GET` | `/api/v1/forms/tasks/:id/approvals` | View approval history for a form task | Authenticated |

### Browser Automation Endpoints (`bhasha.browser.v1`)
| Method | Endpoint | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/browser/register` | Register an active webpage browser session | Authenticated |
| `POST` | `/api/v1/browser/instructions` | Generate verified fill instructions for approved fields | Authenticated |
| `GET` | `/api/v1/browser/executions/:id` | Check execution status and action results | Authenticated |
| `POST` | `/api/v1/browser/executions/:id/acknowledge` | Acknowledge client-side completion and record results | Authenticated |
| `POST` | `/api/v1/browser/executions/:id/retry` | Re-issue instructions for failed fields | Authenticated |
| `POST` | `/api/v1/browser/executions/:id/cancel` | Cancel an ongoing execution | Authenticated |

### Voice Endpoints (`bhasha.voice.v1`)
| Method | Endpoint | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/voice/ticket` | Generate a single-use 60-second HMAC WebSocket ticket | Authenticated |
| `GET` | `/api/v1/voice/status` | Check voice service health and provider availability | Authenticated |
| `WS` | `/api/v1/voice/ws` | Real-time bi-directional binary audio WebSocket stream | Authenticated via Ticket query param |

---

## Prerequisites

Before setting up BhashaAgent locally, ensure your system meets the following verified requirements:

- **Node.js**: `v18.0.0` or higher (Node `v20.x` or `v22.x` recommended).
- **npm**: `v9.x` or higher (distributed with Node.js).
- **PostgreSQL**: `v14.0` or higher running locally or accessible via network.
- **Google Chrome**: Version 114+ (required for Chrome Extension Side Panel API support).
- **External AI Credentials** (at least one is required for conversational intelligence):
  - Google Gemini API Key (`GEMINI_API_KEY`).
  - Groq API Key (`GROQ_API_KEY`) or OpenAI API Key (`OPENAI_API_KEY`) for fallback provider.
- **Speech Provider Credentials** (required for voice features):
  - Gnani API Key and Access Token (`GNANI_API_KEY`, `GNANI_ACCESS_TOKEN`, `GNANI_TOKEN`).

---

## Installation and Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd BhashaAgent
```

### 2. Backend Setup
1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create the backend environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Configure database and credentials in `server/.env` (refer to [Environment Variables](#environment-variables)).
5. Run Prisma database migrations:
   ```bash
   npx prisma migrate dev
   ```
6. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The backend will boot on `http://0.0.0.0:5000` with WebSockets available at `ws://0.0.0.0:5000/api/v1/voice/ws`.*

### 3. Frontend Setup
1. Open a new terminal and navigate to the `client/` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create the frontend environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Verify `VITE_API_URL` points to `http://localhost:5000/api/v1`.
5. Build the Chrome extension:
   ```bash
   npm run build
   ```
   *The production-ready extension artifacts will be compiled into `client/dist/`.*

### 4. Load Extension in Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** via the toggle in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the `client/dist/` directory inside this repository.
5. The **BhashaAgent** extension icon will appear in your Chrome toolbar. Click it to open the popup or sidepanel.

---

## Environment Variables

### Backend Configuration (`server/.env`)

| Variable | Required | Purpose | Format / Example |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/bhasha_db?schema=public` |
| `PORT` | No | HTTP server bind port (defaults to `5000`) | `5000` |
| `NODE_ENV` | No | Runtime environment (`development`, `production`, `test`) | `development` |
| `CORS_ORIGIN` | No | Allowed CORS origin (supports `chrome-extension://*`) | `chrome-extension://*,http://localhost:5173` |
| `JWT_SECRET` | Yes | Secret key for signing access tokens | 32+ character random string |
| `JWT_EXPIRES_IN` | No | Access token expiration duration | `15m` |
| `REFRESH_TOKEN_EXPIRES_DAYS` | No | Refresh token lifespan in days | `30` |
| `VOICE_TICKET_SECRET` | No | HMAC key for 60s voice WebSocket tickets | 32+ character random string |
| `GEMINI_API_KEY` | Optional* | Google Gemini primary LLM API key | `AIzaSy...` |
| `GROQ_API_KEY` | Optional* | Groq fallback LLM API key | `gsk_...` |
| `OPENAI_API_KEY` | Optional* | OpenAI fallback LLM API key | `sk-...` |
| `GNANI_API_KEY` | Optional** | Gnani voice platform API key | Service credential string |
| `GNANI_ACCESS_TOKEN` | Optional** | Gnani STT access token | Bearer token string |
| `GNANI_TOKEN` | Optional** | Gnani TTS authorization token | Bearer token string |

*\*Note: At least one LLM API key must be provided for conversational and form intelligence.*
*\*\*Note: Gnani credentials are required only when running the real-time voice pipeline.*

### Frontend Configuration (`client/.env`)

| Variable | Required | Purpose | Format / Example |
| :--- | :--- | :--- | :--- |
| `VITE_API_URL` | Yes | Base URL for backend HTTP REST endpoints | `http://localhost:5000/api/v1` |
| `VITE_WS_URL` | No | WebSocket endpoint for real-time voice streaming | `ws://localhost:5000/api/v1/voice/ws` |

---

## Running and Building the Project

| Command | Working Directory | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `server/` | Starts backend development server with TypeScript hot reloading (`tsx watch`). |
| `npm run build` | `server/` | Compiles backend TypeScript to production JavaScript in `server/dist/`. |
| `npm start` | `server/` | Runs compiled backend production server (`node dist/server.js`). |
| `npm test` | `server/` | Executes backend build and runs all 148 Node test runner suites. |
| `npm run dev` | `client/` | Starts Vite development server for frontend testing. |
| `npm run build` | `client/` | Runs typecheck (`tsc -b`), bundles extension with Vite, and runs packaging script (`dist/`). |
| `npm test` | `client/` | Executes all 108 frontend test suites across auth, forms, voice, and browser automation. |

---

## Testing and Quality Assurance

BhashaAgent maintains automated test suites covering both frontend client modules and backend domain services.

### Local Verification Snapshot (Executed 2026-11-13)

- **Frontend Tests (`client/`)**:
  - Test Runner: Node Test Runner with `tsx`
  - Suites: **30 passed**, 0 failed
  - Tests: **108 passed**, 0 failed
  - Coverage: Token & session storage, refresh token mutex coordinator, Zod validation consistency, browser protocol (`bhasha.browser.v1`), DOM action executor allowlist, voice protocol schemas (`bhasha.voice.v1`), AudioWorklet chunking, voice session deduplication, and lifecycle error transitions.

- **Backend Tests (`server/`)**:
  - Test Runner: Node Test Runner (`node:test`)
  - Suites: **5 passed**, 0 failed
  - Tests: **148 passed**, 0 failed
  - Coverage: Database foundation and Prisma constraints, authentication and Argon2id hashing, multi-turn Agent Orchestrator loops, anti-fabrication grounding verifiers, tool selection and repair, Context Builder token budgeting, Profile Memory two-phase proposals, Form Task creation, approvals, and WebSocket Voice Gateway lifecycle.

---

## Security and Privacy Controls

1. **Password Hashing**: Stored passwords use Argon2id with recommended cryptographic work factors (memory cost: 64 MB, iterations: 3, parallelism: 1). Raw passwords are never logged or stored.
2. **Single-Flight Refresh Mutex**: The client coordinates concurrent token refreshes through an in-memory lock (`client/src/features/auth/services/token-storage.ts`). If multiple API calls fail with 401 simultaneously, exactly one refresh request is sent to the backend.
3. **Multi-Tenant Data Isolation**: Every database query across conversations, messages, memories, form tasks, and execution logs includes `WHERE userId = :authenticatedUserId`.
4. **Anti-Fabrication Policy**: Agent field proposals are rejected at runtime if they contain synthetic personal data not grounded in user utterances or approved memories.
5. **Human-in-the-Loop Barrier**: The browser automation engine requires explicit user approval snapshots before generating fill instructions.
6. **No Automated Submission**: Automated form submission is prohibited by design. The extension populates approved fields and instructs the user to inspect and submit the form manually.
7. **Sensitive Data Masking**: Fields classified as sensitive (passwords, PINs, card numbers) have values masked in logging and are excluded from long-term memory proposals.

---

## Troubleshooting

### 1. Database Connection Failures
- **Symptom**: `PrismaClientInitializationError: Can't reach database server at localhost:5432`.
- **Resolution**: Ensure your PostgreSQL service is running (`pg_isready`) and verify that `DATABASE_URL` in `server/.env` contains valid credentials and port numbers. Run `npx prisma db push` or `npx prisma migrate dev` to verify network connectivity.

### 2. Extension Microphone Access Denied
- **Symptom**: Error indicating `Microphone access denied` when launching Voice Mode.
- **Resolution**: Chrome extension side panels cannot invoke `getUserMedia` directly. Click the extension's prompt to open the dedicated permission page (`permission.html`), grant microphone permission in that tab, and return to the side panel.

### 3. Voice WebSocket Handshake Rejection
- **Symptom**: WebSocket connection closes immediately with code `1008` (Policy Violation).
- **Resolution**: Voice WebSocket connections require a single-use HMAC ticket. Ensure the client first calls `POST /api/v1/voice/ticket` with a valid JWT access token, and passes the ticket in the query string (`?ticket=...`). Ensure `VOICE_TICKET_SECRET` is identical across server restarts.

### 4. DOM Action Execution Not Filling Fields
- **Symptom**: Webpage fields remain blank after clicking "Fill Approved Fields".
- **Resolution**: Inspect the target page for nested cross-origin `<iframe>` elements. Chrome content scripts cannot manipulate cross-origin frames without explicit iframe declarations. Verify that target inputs are visible, non-disabled, and not protected by CAPTCHAs.

---

## Current Limitations

- **Cross-Origin iframes**: The DOM scanner and action executor operate on the top-level webpage window. Forms embedded inside cross-origin third-party iframes (e.g. certain payment gateway frames) cannot be scanned or populated.
- **CAPTCHA Bypass Prohibited**: In alignment with security guidelines, BhashaAgent does not solve, bypass, or interact with CAPTCHAs, Cloudflare Turnstile, or anti-bot verification challenges.
- **Single-Domain Form Scope**: Form tasks are currently bound to the registering webpage origin and session. Forms spanning multiple domain redirects must be scanned as separate tasks.

---

## Development Guidelines

1. **Preserve Subsystem Boundaries**:
   - The frontend must never attempt to execute database queries or call LLM APIs directly. All AI and persistence logic must flow through the backend `/api/v1` routes.
   - The backend must never generate executable DOM automation scripts containing form submission commands.
2. **Schema & Migration Workflows**:
   - When modifying `server/prisma/schema.prisma`, always create a formal migration using `npx prisma migrate dev --name <migration-name>` inside the `server/` directory. Never edit historical migration files.
3. **Devanagari & Unicode Hygiene**:
   - Always verify that new endpoints, utilities, and DOM injectors preserve full UTF-8 Unicode Devanagari encodings. Never apply string sanitizers that strip non-ASCII character ranges.
4. **Run Verification Before Committing**:
   - Ensure both test suites pass before submitting pull requests:
     ```bash
     npm --prefix server test
     npm --prefix client test
     ```

---

## Project Status

- **Monorepo Structure**: Fully configured with decoupled `client/` and `server/` applications.
- **Frontend Extension**: Built and validated for Chrome Manifest V3 with React 18, Vite 8, and Tailwind v4.
- **Backend Service**: Fully operational Express 5 service with PostgreSQL, Prisma 6.19, and WebSocket voice gateway.
- **Test Baseline**: **256 total passing tests** (108 frontend tests, 148 backend tests, 0 failures).

---

## License and Acknowledgements

### License
No open-source license file is currently present in the repository root. All rights are reserved by the repository maintainers unless explicitly specified otherwise.

### Acknowledgements
BhashaAgent utilizes the following open-source frameworks and external platforms:
- [React](https://react.dev/) & [Vite](https://vitejs.dev/) for extension frontend architecture.
- [Express](https://expressjs.com/) for backend HTTP routing.
- [Prisma](https://www.prisma.io/) & [PostgreSQL](https://www.postgresql.org/) for database persistence.
- [Google Gemini API](https://ai.google.dev/) for multimodal LLM inference.
- [Gnani.ai](https://www.gnani.ai/) for Vachana ASR and Timbre TTS regional speech services.
- [Argon2](https://github.com/ranisalt/node-argon2) for secure password hashing.
