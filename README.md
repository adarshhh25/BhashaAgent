# BhashaAgent

**Multilingual AI-Powered Browser Assistant & Form Intelligence Platform**

BhashaAgent is an open-source, multilingual browser assistant built as a **Chrome Extension (Manifest V3)** powered by an **Express 5** and **PostgreSQL** orchestration backend. Designed specifically for Indian language speakers, BhashaAgent enables users to navigate, understand, and interact with complex web forms using natural voice and text conversations in **English**, **Hindi (हिंदी)**, **Marathi (मराठी)**, and **Hinglish**.

BhashaAgent implements a **Direct Execution Policy** for explicit user instructions: when a user commands the agent to fill a field, transliterate a name, choose a radio option, or select all checkboxes, the system resolves the target field, verifies field-type compatibility and entity categories, dispatches verified DOM actions, and verifies the update directly in the browser DOM—**with zero automated form submissions**.

---

## Table of Contents

- [1. Problem Statement](#1-problem-statement)
- [2. Key Features](#2-key-features)
- [3. System Architecture](#3-system-architecture)
- [4. Core Execution Workflows](#4-core-execution-workflows)
  - [4.1 Form Inspection & Dynamic Detection](#41-form-inspection--dynamic-detection)
  - [4.2 Direct Form-Filling Execution](#42-direct-form-filling-execution)
  - [4.3 Real-Time Full-Duplex Voice Pipeline](#43-real-time-full-duplex-voice-pipeline)
  - [4.4 Multilingual Script Conversion](#44-multilingual-script-conversion)
  - [4.5 LLM Fallback & Anti-Hallucination Pipeline](#45-llm-fallback--anti-hallucination-pipeline)
- [5. Technology Stack](#5-technology-stack)
- [6. Repository Structure](#6-repository-structure)
- [7. Verified Implementation Matrix](#7-verified-implementation-matrix)
- [8. Installation & Setup](#8-installation--setup)
  - [8.1 Prerequisites](#81-prerequisites)
  - [8.2 Database Setup](#82-database-setup)
  - [8.3 Backend Setup](#83-backend-setup)
  - [8.4 Client Extension Setup](#84-client-extension-setup)
  - [8.5 Loading into Google Chrome](#85-loading-into-google-chrome)
- [9. Environment Variables Reference](#9-environment-variables-reference)
- [10. Testing & Quality Assurance](#10-testing--quality-assurance)
- [11. Privacy, Security & Safety Boundaries](#11-privacy-security--safety-boundaries)
- [12. Known Limitations](#12-known-limitations)
- [13. Navigation & Documentation Links](#13-navigation--documentation-links)

---

## 1. Problem Statement

Web portals across government agencies, academic institutions, banking portals, and utility providers present significant hurdles:

1. **Complex & Rigid Layouts**: Lengthy multi-step forms with nested `<fieldset>` groups, dynamic DOM rendering, and opaque validation rules.
2. **Language Barriers**: Forms are almost exclusively in English or formal administrative Hindi, creating steep barriers for regional language speakers.
3. **Fragile Traditional Autofill**: Conventional browser autofill relies on static heuristics (`name`, `autocomplete`), frequently failing on dynamic single-page applications (SPAs), Devanagari transliteration, custom radio groups, or multi-option checkbox sets.
4. **Data Hallucination & Accidental Submissions**: Unregulated AI browser agents risk hallucinating personal credentials or automatically triggering irreversible form submissions.

BhashaAgent resolves these challenges by bridging conversational AI and deterministic DOM automation: users state their requests naturally in their preferred language, the agent interprets their intent, checks type safety, executes DOM mutations with live readback verification, and leaves the final form submission strictly in the hands of the human user.

---

## 2. Key Features

### 🌐 Multilingual Conversational Intelligence
- **4 Language Profiles**: Native support for **English (`en`)**, **Hindi (`hi`)**, **Marathi (`mr`)**, and **Hinglish (`hinglish`)**.
- **Turn-by-Turn Auto-Detection**: Dynamically adjusts response language to match the user's latest input, maintaining conversational parity across turns.
- **Bi-directional Script Transliteration**: Converts proper names and personal nouns between Devanagari and Latin scripts (`Adarsh Jha` $\leftrightarrow$ `आदर्श झा`) without literal dictionary translation, surname distortion, or name truncation.

### 📋 Intelligent Webpage Form Understanding
- **8-Level Label Precedence**: Resolves accurate semantic labels using `for` attribute $\rightarrow$ `aria-labelledby` $\rightarrow$ `aria-label` $\rightarrow$ enclosing `<label>` $\rightarrow$ container `<fieldset><legend>` $\rightarrow$ preceding heading $\rightarrow$ `placeholder` $\rightarrow$ element `name`/`id`.
- **Radio & Checkbox Grouping**: Automatically clusters related inputs under parent container legends (e.g., `<legend>Pizza Size</legend>` with options `Small`, `Medium`, `Large`; `<legend>Pizza Toppings</legend>` with multi-checkbox options).
- **MutationObserver SPA Tracking**: Automatically re-indexes form fields when dynamic single-page applications add, remove, or modify form inputs.
- **Privacy-Aware Sensitivity Masking**: Automatically detects and redacts passwords, credit card numbers, CVVs, and national IDs from logs, LLM prompts, and telemetry.

### ⚡ Direct Execution Policy (No Approval Modal)
- **Zero-Friction Form Population**: Explicit, direct user instructions (e.g., *"email address mein adarshjha@gmail.com likho"*, *"pizza size large select karo"*, *"select all toppings"*) execute immediately into the active page DOM without requiring an intermediate confirmation modal or approval button click.
- **Strict Target-Field & Entity Validation**: An instruction-to-target validation layer checks entity categories (e.g., `PERSON_NAME` vs `ORGANIZATION_NAME`, `PHONE_NUMBER` vs `POSTAL_CODE`) to prevent misdirection (e.g., filling an organization name or file attachment field when a customer name was requested).
- **Type Compatibility Safeguards**: Rejects text values targeted at file inputs, date pickers, or incompatible widgets.
- **Post-Execution Readback Verification**: The assistant never reports an action as successful until the browser content script has verified that the DOM node value or check state actually matches the requested state.

### 🎙️ Full-Duplex Real-Time Voice Gateway
- **16 kHz PCM Audio Capture**: Clean, low-latency audio capture via a dedicated `AudioWorklet` processor (`pcm-processor.js`).
- **Real-Time Voice Streaming**: Bi-directional WebSocket communication (`/api/v1/voice/ws`) with Gnani Vachana STT and Gnani Timbre TTS (24 kHz linear PCM audio).
- **Interactive Voice Orb**: Real-time visual feedback using an interactive Canvas-rendered particle mesh responding to speech energy, connection state, and audio playback.
- **Instant Barge-In Interruption**: Speaking while the assistant is responding instantly cancels audio playback and frees the session for new input.

### 🛡️ Enterprise AI Provider & Fallback Architecture
- **Primary LLM**: Google Gemini 2.5 Flash via `@google/genai` with model-level fallback to `gemini-flash-lite-latest`.
- **Secondary Provider**: Configured Groq HTTP provider (e.g., `openai/gpt-oss-20b` or OpenAI-compatible endpoint).
- **Dynamic 429 Quota Exhaustion Detection**: Seamlessly routes requests to secondary models when quota limits are reached without freezing turns.
- **Anti-Hallucination Claim Sanitization**: Intercepts false conversational claims when no tool has run or when DOM verification has failed.

### 🔒 Two-Phase Persistent Profile Memory
- **Verified Facts**: Organizes personal details across `IDENTITY`, `CONTACT`, `ADDRESS`, `PREFERENCE`, and `PROFESSIONAL` categories.
- **Proposal Lifecycle**: New memory facts are proposed as `PENDING` and must be explicitly approved by the user before being used in automatic context building.
- **Isolated Ownership**: Every conversation, form task, detected field, and profile memory is strictly scoped to the authenticated user ID.

---

## 3. System Architecture

The following diagram illustrates the complete system topology and execution boundaries:

```mermaid
flowchart TD
    subgraph Browser ["Web Browser Context"]
        Webpage["Target Webpage DOM<br/>(e.g., Government / Booking Form)"]
        CS["Content Script (content.js)<br/>- 8-Level Label Resolver<br/>- MutationObserver<br/>- DOM Action Executor"]
        SW["Background Service Worker (background.js)<br/>- Tab Tracking & Connection Gate<br/>- Message Router"]
        UI["Extension Side Panel & Popup (React 18)<br/>- Conversation Stream<br/>- Canvas Voice Orb<br/>- Profile Memory & Settings"]
        AW["AudioWorklet (pcm-processor.js)<br/>- 16 kHz Mono PCM Chunker"]
        
        Webpage <--> |DOM Inspection & Mutation| CS
        CS <--> |chrome.runtime / tabs messaging| SW
        SW <--> |Internal Messaging| UI
        AW --> |PCM Audio Frames| UI
    end

    subgraph Backend ["BhashaAgent Server (Node.js + Express 5)"]
        HTTP["Express HTTP API (/api/v1/*)<br/>- Auth, Users, Conversations<br/>- Form Tasks, Context, Browser"]
        WS["Voice Gateway WebSocket (/api/v1/voice/ws)<br/>- Frame Assembly & STT/TTS Bridge"]
        
        Router["Deterministic Form Action Router<br/>- Centralized Intent Classifier<br/>- Target Field Validator<br/>- Script Converter (Devanagari/Latin)"]
        Orchestrator["Agent Orchestrator<br/>- Context Builder<br/>- Tool Registry (7 Tools)<br/>- False Claim Sanitizer"]
        Factory["LLM Provider Factory<br/>- Gemini 2.5 Flash<br/>- Gemini Flash Lite Fallback<br/>- Groq HTTP Provider Fallback"]
        
        HTTP --> Router
        HTTP --> Orchestrator
        WS --> Orchestrator
        Router --> Orchestrator
        Orchestrator --> Factory
    end

    subgraph External ["External AI & Speech Services"]
        GeminiAPI["Google Gemini API<br/>(gemini-2.5-flash / lite)"]
        GroqAPI["Groq Cloud API<br/>(gpt-oss-20b)"]
        GnaniSTT["Gnani Vachana STT<br/>(Streaming ASR)"]
        GnaniTTS["Gnani Timbre TTS<br/>(24 kHz Linear PCM)"]
        
        Factory <--> |HTTPS / SDK| GeminiAPI
        Factory <--> |HTTPS REST| GroqAPI
        WS <--> |Secure WebSockets| GnaniSTT
        WS <--> |Secure WebSockets| GnaniTTS
    end

    subgraph Storage ["Database (PostgreSQL)"]
        DB[(PostgreSQL Database<br/>Prisma ORM 6.19)]
        HTTP <--> |Prisma Client| DB
        WS <--> |Prisma Client| DB
    end

    UI <--> |REST HTTP| HTTP
    UI <--> |WebSocket| WS
```

---

## 4. Core Execution Workflows

### 4.1 Form Inspection & Dynamic Detection

1. **Page Load / Tab Switch**: When the user opens the BhashaAgent side panel or navigates to a new URL, `content.js` scans the DOM for visible `<input>`, `<select>`, `<textarea>`, and custom controls.
2. **Field Resolution**:
   - Computes unique `fieldIdentifier` tokens.
   - Evaluates accessibility tree and DOM hierarchy to resolve human-readable labels.
   - Identifies radio groups and checkbox groups via container `<legend>` or surrounding fieldsets.
   - Reads current DOM values (`currentValue`) without querying sensitive inputs (e.g., passwords).
3. **Registration**: Dispatches `BROWSER_REGISTER_PAGE` to `POST /api/v1/browser/register`. The backend upserts active `FormTask` and `DetectedField` records in PostgreSQL.

### 4.2 Direct Form-Filling Execution

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Panel as Side Panel UI
    participant Server as Backend Server
    participant Router as Form Action Router
    participant LLM as Gemini / Groq LLM
    participant CS as Content Script
    participant DOM as Webpage DOM

    User->>Panel: "email address mein adarshjha@gmail.com likho"
    Panel->>Server: POST /api/v1/conversations/:id/turns
    Server->>Router: routeFormAction(text, detectedFields)
    Router->>Router: Classify Intent -> FIELD_VALUE_UPDATE
    Router->>Router: Target Validator: Verify email concept & syntax
    Router-->>Server: FORM_UPDATE (field: custemail, value: adarshjha@gmail.com)
    Server->>Server: setFieldValue() in PostgreSQL (APPROVED, READY)
    Server-->>Panel: turnResult (formActions: [SET_VALUE custemail])
    Panel->>CS: EXECUTE_FILL_INSTRUCTIONS via runtime/scripting
    CS->>DOM: Focus -> Dispatch Input -> Mutate Value -> Dispatch Change
    DOM-->>CS: Value updated
    CS->>DOM: Readback Verification (DOM value === requested value)
    DOM-->>CS: Verification Confirmed
    CS-->>Panel: EXECUTION_ACK (overallStatus: SUCCESS)
    Panel-->>User: Assistant displays confirmation and moves to next field
```

> [!IMPORTANT]
> **No Automatic Submission Policy**: Under no circumstances will BhashaAgent automatically submit a webpage form. Form execution ends with DOM value mutation and readback verification. The final submission action is strictly reserved for the human user.

### 4.3 Real-Time Full-Duplex Voice Pipeline

1. **Capture**: The user taps the microphone or speaks in voice mode. The browser's `AudioWorklet` records audio at 16 kHz, packaging chunks as linear 16-bit mono PCM.
2. **Streaming**: Chunks are forwarded over WebSocket to `/api/v1/voice/ws`.
3. **STT Transcription**: The backend Voice Gateway streams audio to the Gnani Vachana speech engine, resolving transcripts with language detection (`hi-IN`, `mr-IN`, `en-IN`).
4. **Agent Turn**: Completed speech segments trigger the Agent Orchestrator with the active `FormTask` context.
5. **TTS Playback**: The agent's response text is converted to 24 kHz linear PCM via Gnani Timbre TTS and streamed back to the client for playback while the Canvas Voice Orb animates.
6. **Barge-In**: If the user begins speaking while audio is playing, an `INTERRUPT` signal immediately halts audio playback on the client and resets the server gateway.

### 4.4 Multilingual Script Conversion

When a user instructs the agent to write a name in English or Hindi (e.g., *"customer name ko English mein likho"* or *"आदर्श झा उसे English में लिखें"*):
1. **Target Identification**: Resolves the target name field and checks the existing DOM value or explicit candidate name.
2. **Script Detection**: Determines source script (Devanagari vs Latin) and target script.
3. **Transliteration Engine**: Invokes `devanagariToLatin()` or `latinToDevanagari()`, ensuring proper phonetic mapping (e.g., `आदर्श झा` $\rightarrow$ `Adarsh Jha`, `राहुल शर्मा` $\rightarrow$ `Rahul Sharma`) without translation errors or invented surnames.
4. **Direct DOM Mutation**: Updates the field directly in the page DOM with verified Latin or Devanagari casing.

### 4.5 LLM Fallback & Anti-Hallucination Pipeline

1. **Primary Model Call**: The turn is sent to `gemini-2.5-flash` with native function declarations (`propose_field_value`, `propose_profile_memory`, etc.).
2. **Quota / Error Interception**:
   - **429 Quota Exhausted**: Model marked exhausted for the session; request immediately retried with `gemini-flash-lite-latest` or secondary `groq` HTTP provider.
   - **Rate-Limit with `Retry-After`**: Automatically pauses for short intervals before re-attempting.
   - **400 Invalid Arguments**: Automatically strips unsupported parameters (e.g., thinking config) and retries cleanly.
3. **Tool Preservation**: When falling back to secondary providers, tool definitions are preserved so the fallback model can generate valid form actions.
4. **False Claim Interception**: `sanitizeFalseExecutionClaims()` scans the final response text: if the model states a field was filled or an option was selected without a corresponding tool execution and verified DOM result, the response is sanitized to prevent false claims.

---

## 5. Technology Stack

### Frontend (Chrome Extension)
- **Framework**: React 18.3.1
- **Language**: TypeScript 5.9.3 (strict mode)
- **Build Tool**: Vite 8.3.5 with `@vitejs/plugin-react` and custom extension packager
- **Styling**: Tailwind CSS 4.3.3 with `@tailwindcss/vite`
- **Icons**: Lucide React 1.66.0
- **Routing**: React Router DOM 7.18.5 (side panel navigation)
- **Schema Validation**: Zod 4.6.7
- **Browser APIs**: Chrome Extensions Manifest V3 (`sidePanel`, `storage`, `activeTab`, `tabs`, `scripting`, `webAccessibleResources`)

### Backend (Server)
- **Runtime**: Node.js (v20+ recommended)
- **Web Framework**: Express 5.1.0
- **Language**: TypeScript 5.7.3
- **Database ORM**: Prisma Client 6.19.0
- **Database**: PostgreSQL 15+
- **Authentication**: JWT (`jsonwebtoken` 9.0.2) + Argon2id (`argon2` 0.41.1)
- **Rate Limiting**: `express-rate-limit` 8.2.1
- **WebSockets**: `ws` 8.22.1
- **Schema Validation**: Zod 4.1.12

### AI & Speech Integrations
- **Primary AI SDK**: `@google/genai` 2.32.0 (Google Gemini 2.5 Flash / Flash Lite)
- **Secondary AI Provider**: Groq Cloud REST API (OpenAI-compatible chat completions)
- **Speech Recognition (STT)**: Gnani.ai Vachana ASR WebSocket API
- **Speech Synthesis (TTS)**: Gnani.ai Timbre v3.0 Streaming TTS API

---

## 6. Repository Structure

```text
BhashaAgent/
├── client/                               # Chrome Extension Frontend (Manifest V3)
│   ├── public/                           # Static assets, icons, manifest.json
│   ├── scripts/
│   │   └── prepare-extension.js          # IIFE packaging & manifest copy script
│   ├── src/
│   │   ├── app/                          # App entry point, routing & providers
│   │   ├── background/                   # Chrome Service Worker (background.ts)
│   │   ├── components/                   # Shared UI components (Button, Input, Modal, etc.)
│   │   ├── content/                      # Content Script (index.ts - DOM scanner & executor)
│   │   ├── features/
│   │   │   ├── auth/                     # Login, Registration, Account Settings
│   │   │   ├── browser/                  # DOM action executor, execution summary
│   │   │   ├── conversations/            # Chat stream, Message list, Language selector
│   │   │   ├── forms/                    # Form intelligence page, detected field cards
│   │   │   ├── memory/                   # Profile memory manager & fact proposals
│   │   │   └── voice/                    # AudioWorklet capture, Voice Orb, WebSockets
│   │   ├── layouts/                      # Sidepanel and Popup layout shells
│   │   ├── pages/                        # Popup, Permission, and Sidepanel pages
│   │   ├── services/                     # Axios/Fetch API client & session storage
│   │   └── types/                        # Client-side domain and protocol typings
│   ├── tests/                            # Client test suite (120 unit & integration tests)
│   ├── manifest.json                     # Chrome Extension Manifest V3 definition
│   ├── package.json
│   ├── vite.config.ts                    # Vite build configuration (multi-entry)
│   └── README.md                         # Detailed client documentation
│
├── server/                               # Backend Service (Express 5 + Prisma)
│   ├── prisma/
│   │   ├── schema.prisma                 # Database models, relations, indexes & enums
│   │   └── migrations/                   # Migration history
│   ├── src/
│   │   ├── common/                       # HttpError, error handler, utilities
│   │   ├── config/                       # Environment configuration, database client
│   │   ├── modules/
│   │   │   ├── agent/                    # Agent orchestrator, prompt, tools, language detector
│   │   │   ├── auth/                     # Password hashing, JWT auth, refresh token rotation
│   │   │   ├── browser/                  # Browser page registration, execution tracking
│   │   │   ├── context/                  # Multi-source context builder & token budgeter
│   │   │   ├── conversations/            # Conversation & message lifecycle, revision history
│   │   │   ├── form-intelligence/        # Form action router, intent classifier, transliteration
│   │   │   ├── form-tasks/               # Form tasks, detected fields, field value proposals
│   │   │   ├── llm/                      # Gemini SDK provider, Groq HTTP provider, logger
│   │   │   ├── memories/                 # Persistent profile facts, proposal review
│   │   │   ├── users/                    # User profile management
│   │   │   └── voice/                    # WebSocket gateway, Gnani STT/TTS streaming
│   │   └── server.ts                     # Express app setup, CORS, HTTP & WS server startup
│   ├── tests/                            # Server test suite (292 tests across 9 suites)
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md                         # Detailed server documentation
│
├── package.json                          # Root metadata
└── README.md                             # Root project overview (this file)
```

---

## 7. Verified Implementation Matrix

| Capability / Module | Implementation Location | Status | Verification Evidence |
| :--- | :--- | :---: | :--- |
| **Authentication & Tokens** | `server/src/modules/auth/`<br/>`client/src/features/auth/` | **Implemented** | Argon2id hashing, JWT access tokens, 7-day refresh token rotation, single-flight mutex in client `token-storage.service.ts`. |
| **Direct Execution Policy** | `server/src/modules/form-intelligence/`<br/>`client/src/features/browser/` | **Implemented** | Direct execution without approval modals for explicit text/voice requests. Sensitive fields (passwords, cards, file inputs) strictly protected. |
| **Multilingual Intent Routing** | `server/src/modules/form-intelligence/`<br/>`intent-classifier.ts`, `form-action-router.ts` | **Implemented** | Classifies `GENERAL_FORM_ASSISTANCE`, `FIELD_VALUE_UPDATE`, `CONVERT_FIELD_SCRIPT`, `SELECT_ALL_CHECKBOXES`, `OBSERVATION_CORRECTION` across 4 languages. |
| **Target Field Validation** | `server/src/modules/form-intelligence/`<br/>`target-field-validator.ts` | **Implemented** | Entity categories (`PERSON_NAME`, `ORGANIZATION_NAME`, `PHONE_NUMBER`, `POSTAL_CODE`) prevent cross-target field mismatches. |
| **Radio & Checkbox Groups** | `client/src/content/index.ts`<br/>`server/src/modules/form-intelligence/` | **Implemented** | Groups inputs under container `<legend>`, preserves live `checked` flags, supports atomic array selection (`SELECT_ALL_CHECKBOXES`). |
| **Transliteration (Script Conversion)**| `server/src/modules/form-intelligence/`<br/>`script-converter.service.ts` | **Implemented** | Bidirectional phonetic Devanagari $\leftrightarrow$ Latin transliteration for names without dictionary translation. |
| **Gemini & Groq Fallback** | `server/src/modules/llm/`<br/>`gemini.provider.ts`, `http-llm.provider.ts` | **Implemented** | `@google/genai` Gemini 2.5 Flash with fallback to Flash Lite and Groq HTTP; 429 quota exhaustion handling with tool preservation. |
| **Voice Gateway & WebSocket** | `server/src/modules/voice/`<br/>`client/src/features/voice/` | **Implemented** | 16 kHz AudioWorklet capture, `/api/v1/voice/ws` WebSocket gateway, Gnani STT and 24 kHz Timbre TTS streaming with barge-in interruption. |
| **Zero Automated Submission** | `client/src/content/index.ts`<br/>`server/src/modules/agent/` | **Enforced** | No automated `form.submit()` action is ever dispatched or permitted. Form submission is strictly human-controlled. |

---

## 8. Installation & Setup

### 8.1 Prerequisites
- **Node.js**: `v20.x` or higher (verified with Node 20 / 22)
- **Package Manager**: `npm` v10+
- **Database**: PostgreSQL 15+ running locally or via managed cloud service
- **Google Chrome**: Version 116+ (required for Chrome Side Panel API)

### 8.2 Database Setup
Create a PostgreSQL database for BhashaAgent:

```bash
# In PostgreSQL CLI (psql):
CREATE DATABASE bhashaagent;
CREATE DATABASE bhashaagent_test;
```

### 8.3 Backend Setup

1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local environment configuration:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and set your credentials:
   - `DATABASE_URL`: Your PostgreSQL connection string.
   - `JWT_ACCESS_SECRET`: A secure random string (minimum 32 characters).
   - `GEMINI_API_KEY`: Your Google Gemini API key.
   - `GROQ_API_KEY`: (Optional) Your Groq API key for secondary fallback.
   - `GNANI`: (Optional) Your Gnani.ai token for live voice synthesis.
4. Run Prisma database migrations and generate the client:
   ```bash
   npm run db:migrate
   npm run db:generate
   ```
5. Build the TypeScript source:
   ```bash
   npm run build
   ```
6. Start the development server:
   ```bash
   npm run start
   ```
   *The server will start listening at `http://0.0.0.0:5000`.*

### 8.4 Client Extension Setup

1. In a new terminal, navigate to the `client/` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your local client environment file:
   ```bash
   cp .env.example .env
   ```
   *Verify that `VITE_API_BASE_URL=http://localhost:5000` is configured.*
4. Build the extension package:
   ```bash
   npm run build
   ```
   *This compiles the React sidepanel, popup, options page, background service worker, and bundles the standalone IIFE `content.js` into `client/dist/`.*

### 8.5 Loading into Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the `client/dist/` directory from this repository.
5. Click the Extensions puzzle icon in Chrome's toolbar and pin **BhashaAgent**.
6. Open any webpage containing a form (e.g., `https://httpbin.org/forms/post`).
7. Click the BhashaAgent extension icon to open the Side Panel.

---

## 9. Environment Variables Reference

### Backend (`server/.env`)

| Variable | Required | Description | Example / Default |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | Application execution environment | `development` / `production` |
| `PORT` | Yes | HTTP and WebSocket server port | `5000` |
| `DATABASE_URL` | Yes | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/bhashaagent?schema=public` |
| `TEST_DATABASE_URL` | Yes | PostgreSQL test database connection string | `postgresql://user:pass@localhost:5432/bhashaagent_test?schema=public` |
| `JWT_ACCESS_SECRET` | Yes | Secret key for signing JWT access tokens ($\ge 32$ chars) | `your_secure_random_jwt_secret_key` |
| `JWT_ACCESS_EXPIRES_IN` | No | Expiration duration for access tokens | `15m` |
| `JWT_ISSUER` | No | Token issuer claim | `bhashaagent` |
| `JWT_AUDIENCE` | No | Token audience claim | `bhashaagent-api` |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | No | Refresh token lifespan in days | `7` |
| `LLM_PROVIDER` | No | Primary LLM provider identifier | `gemini` |
| `GEMINI_API_KEY` | Yes | Google Gemini API key | `AIzaSy...` |
| `GEMINI_MODEL` | No | Primary Gemini model ID | `gemini-2.5-flash` |
| `GEMINI_FALLBACK_MODEL` | No | Fallback Gemini model on quota exhaustion | `gemini-flash-lite-latest` |
| `GEMINI_TIMEOUT_MS` | No | Gemini API timeout in milliseconds | `30000` |
| `GEMINI_MAX_RETRIES` | No | Maximum retries on transient errors | `2` |
| `GROQ_API_KEY` | No | Secondary Groq API key for provider fallback | `gsk_...` |
| `GROQ_MODEL` | No | Groq fallback model ID | `openai/gpt-oss-20b` |
| `GROQ_BASE_URL` | No | Groq OpenAI-compatible endpoint | `https://api.groq.com/openai/v1/chat/completions` |
| `GNANI` | No | Gnani.ai service token for STT and TTS | `gnani_service_token` |
| `GNANI_TTS_MODEL` | No | Gnani TTS model identifier | `timbre-v3.0` |
| `GNANI_TTS_VOICE` | No | Gnani voice persona | `Shivani` |
| `GNANI_TTS_SAMPLE_RATE` | No | TTS audio output sample rate in Hz | `24000` |

### Frontend (`client/.env`)

| Variable | Required | Description | Example / Default |
| :--- | :---: | :--- | :--- |
| `VITE_API_BASE_URL` | Yes | Base URL for backend HTTP and WebSocket endpoints | `http://localhost:5000` |

> [!CAUTION]
> Never expose `GEMINI_API_KEY`, `GROQ_API_KEY`, `JWT_ACCESS_SECRET`, or `DATABASE_URL` in client environment files. Client builds bundle environment variables with the `VITE_` prefix directly into client-side JavaScript.

---

## 10. Testing & Quality Assurance

BhashaAgent maintains high automated test coverage across both frontend and backend modules:

### Running Backend Tests (292 Tests)

The backend test suite executes unit, integration, and database tests:

```bash
cd server
npm test
```

Specific test suites can also be run independently:
```bash
# Intent Classification & Deterministic Routing (27 tests)
node tests/agent/intent-classification-routing.test.js

# Voice-to-DOM Verification (10 tests)
node tests/agent/voice-to-dom-verification.test.js

# Existing-Field Script Correction & Transliteration (24 tests)
node tests/agent/existing-field-script-correction.test.js

# Instruction-to-Target Field Validation (12 tests)
node tests/agent/instruction-target-validation.test.js

# LLM Fallback & Quota Resilience (25 tests)
node tests/agent/provider-fallback.test.js

# Browser Session & Execution Tracking (68 tests)
npm run test:browser
```

### Running Client Tests (120 Tests)

The client test suite validates tokens, API services, DOM action execution, audio decoding, and voice lifecycle:

```bash
cd client
npm test
```

---

## 11. Privacy, Security & Safety Boundaries

1. **Strictly Explicit Form Population**: Field values are only injected in response to explicit user instructions or confirmed user profile facts.
2. **Sensitive Data Protection**: Passwords, CVVs, payment cards, and file attachments are classified as sensitive. They are never populated automatically, never included in LLM context, and never stored in memory logs.
3. **No Automatic Form Submission**: BhashaAgent does not invoke `.submit()` or click submission buttons. The user reviews the populated fields on the webpage and submits the form manually.
4. **Data Isolation & Ownership**: Every database record (`Conversation`, `FormTask`, `DetectedField`, `FieldValue`, `ProfileMemory`) is bound to the authenticated user ID and protected by database foreign key constraints.
5. **Secure Authentication**: Argon2id password hashing with unique salts, cryptographically signed JWT access tokens, and securely hashed refresh tokens with automatic rotation.

---

## 12. Known Limitations

- **Complex Non-Standard Web Components**: Canvas-based forms or deeply nested closed Shadow DOM controls that do not expose standard HTML form element interfaces cannot be reliably inspected by content scripts.
- **CAPTCHA & Proof-of-Work Gates**: BhashaAgent does not attempt to bypass CAPTCHAs, bot challenges, or SMS OTPs; these must be completed directly by the user.
- **Speech Recognition Ambient Noise**: In high-noise environments, speech recognition accuracy may degrade, requiring users to verify transcribed values in chat.
- **Provider Quota Caps**: When both Gemini and Groq API keys are exhausted or unavailable, conversational turns degrade to deterministic router capabilities.

---

## 13. Navigation & Documentation Links

- 📖 [**Client Extension Documentation**](client/README.md) — Comprehensive guide to Manifest V3, React UI, AudioWorklet, DOM content scripts, Voice Orb, and frontend services.
- ⚙️ [**Server Architecture Documentation**](server/README.md) — In-depth guide to Express 5, PostgreSQL + Prisma schema, Agent Orchestrator, LLM provider fallback, and REST API reference.
