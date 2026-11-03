# BhashaAgent — Client

Multilingual AI-powered browser assistant. Chrome Extension built with React 18, TypeScript, Vite, and Tailwind CSS v4.

## Architecture

BhashaAgent runs as a Chrome Extension (Manifest V3) with two UI surfaces:

| Surface | Description | Entry Point |
|---------|-------------|-------------|
| **Side Panel** | Primary application — full conversation, memory, forms, voice | `index.html` → `src/sidepanel/main.tsx` |
| **Popup** | Compact overlay — quick actions and status | `popup.html` → `src/popup/main.tsx` |

## Prerequisites

- Node.js 18+
- npm
- Google Chrome (for extension testing)

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Start development server
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite development server |
| `npm run build` | TypeScript check + production build |
| `npm run build:extension` | Full extension build (build + copy manifest & icons) |
| `npm run typecheck` | TypeScript type checking only |
| `npm run lint` | ESLint |
| `npm run preview` | Preview production build |

## Loading the Extension in Chrome

1. Run the extension build:
   ```bash
   npm run build:extension
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **Load unpacked**

5. Select the `client/dist/` directory

6. The BhashaAgent icon appears in the toolbar

7. Right-click the icon → **Open Side Panel** to use the primary interface

## Project Structure

```
client/
├── public/icons/           # Extension icons (16, 32, 48, 128px)
├── src/
│   ├── app/                # App shell, router, providers
│   ├── components/         # Shared UI components (future)
│   ├── features/           # Feature modules (future: auth, chat, memory, forms, voice, settings)
│   ├── hooks/              # Shared React hooks (future)
│   ├── layouts/            # SidePanelLayout, PopupLayout
│   ├── lib/                # Shared utilities (future)
│   ├── pages/              # Route page components
│   │   ├── sidepanel/      # Side Panel pages
│   │   └── popup/          # Popup pages
│   ├── services/api/       # Centralized API client
│   ├── sidepanel/          # Side Panel entry point (main.tsx)
│   ├── popup/              # Popup entry point (main.tsx)
│   ├── types/              # Shared TypeScript types
│   └── index.css           # Global styles and design tokens
├── index.html              # Side Panel HTML entry
├── popup.html              # Popup HTML entry
├── manifest.json           # Chrome Extension Manifest V3
├── vite.config.ts          # Vite build configuration
└── package.json
```

## Design System

Uses a curated Apple-style light palette. All design tokens are defined as CSS custom properties and Tailwind theme values in `src/index.css`.

| Token | Usage | Hex |
|-------|-------|-----|
| `page-bg` | Page background | `#F5F5F7` |
| `card` | Cards and panels | `#FFFFFF` |
| `accent` | Primary accent / buttons | `#0071E3` |
| `text-primary` | Primary text | `#1D1D1F` |
| `text-secondary` | Secondary text | `#6E6E73` |

See `src/index.css` for the complete token reference.

## Milestone Status

- [x] **FE-1** — Foundation, extension architecture, build configuration
- [ ] FE-2 — Authentication
- [ ] FE-3 — Conversations
- [ ] FE-4 — Profile Memory
- [ ] FE-5 — Form Intelligence
- [ ] FE-6 — Settings
- [ ] FE-7 — Voice Orb Component
- [ ] FE-8 — Voice Integration
