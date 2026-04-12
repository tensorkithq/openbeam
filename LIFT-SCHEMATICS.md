# OpenBeam — Lift Schematics from Rhema

## Overview

OpenBeam is a web replatform of Rhema, a Tauri v2 desktop application for real-time AI-powered Bible verse detection during live sermons with broadcast overlay output.

**Source**: `rhema/` (Tauri v2 + React 19 + Rust backend)
**Target**: `openbeam/` (Web app — React 19 frontend + Axum API server)

---

## Architecture

```
┌─────────────────────────────────────────┐
│           React 19 Frontend             │
│   (ported from Rhema, Tauri deps removed)│
│   Vite · Zustand · shadcn/ui · TW v4   │
├─────────────────────────────────────────┤
│        Service Abstraction Layer        │
│   api.detect() / api.transcribe()       │
│   (replaces ~35 Tauri invoke commands)  │
├───────────┬─────────────────────────────┤
│ WebSocket │  REST API (JSON)            │
├───────────┴─────────────────────────────┤
│            Axum Backend Server          │
│  ┌──────────┬───────────┬────────────┐  │
│  │ Bible DB │ Detection │ STT Proxy  │  │
│  │ (SQLite  │ Pipeline  │ (Deepgram) │  │
│  │  + FTS5) │ (ONNX,    │            │  │
│  │          │  HNSW,    │            │  │
│  │          │  Aho-Cor.)│            │  │
│  └──────────┴───────────┴────────────┘  │
├─────────────────────────────────────────┤
│  /overlay — transparent broadcast page  │
│  (OBS Browser Source / vMix / xSplit)   │
└─────────────────────────────────────────┘
```

---

## Workstream Breakdown

### WS-1: Project Scaffolding & Monorepo Setup
Bootstrap the project structure. Monorepo with two packages:
- `apps/web` — React 19 + Vite frontend
- `apps/server` — Axum Rust backend

Includes: Turborepo or simple workspace config, shared TypeScript types, CI skeleton, Dockerfile stubs, `.env` management, README.

**Rhema sources touched**: `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`

---

### WS-2: Frontend Port — UI Components & Layout
Lift the React frontend out of Rhema. Remove all Tauri dependencies (`@tauri-apps/*`), replace with stub service layer. Goal: the app renders, navigates, and shows UI — with no backend wired up.

**Rhema sources lifted**:
- `src/components/` — all panels, controls, broadcast, settings, tutorial, ui
- `src/stores/` — all 8 Zustand stores (audio, transcript, bible, queue, detection, broadcast, settings, tutorial)
- `src/types/` — all type definitions
- `src/lib/` — verse-renderer, context-search, quick-search, builtin-themes, utils
- `src/hooks/` — lifted but gutted of Tauri invoke calls (replaced with service layer stubs)
- `index.html`, `index.css`, `App.tsx`, `main.tsx`
- `components.json` (shadcn config)
- shadcn/ui component library (`src/components/ui/`)

**Key changes**:
- Remove `@tauri-apps/api`, `@tauri-apps/plugin-*` imports
- Replace `invoke()` calls with service abstraction
- Replace `listen()` event subscriptions with WebSocket subscriptions
- Replace `tauri-plugin-store` with `localStorage` or IndexedDB

---

### WS-3: Service Abstraction Layer
Create the bridge between frontend hooks and backend API. Single module that all hooks call instead of Tauri invoke.

**Interface mapping** (Tauri command → API call):
| Tauri Command | HTTP Method | Endpoint |
|---|---|---|
| `get_audio_devices` | — | Browser `navigator.mediaDevices` |
| `start_transcription` | WS | `/ws/transcription` |
| `stop_transcription` | POST | `/api/transcription/stop` |
| `list_translations` | GET | `/api/bible/translations` |
| `list_books` | GET | `/api/bible/books` |
| `get_chapter` | GET | `/api/bible/chapter/:translation/:book/:chapter` |
| `get_verse` | GET | `/api/bible/verse/:id` |
| `search_verses` | GET | `/api/bible/search?q=...` |
| `get_cross_references` | GET | `/api/bible/cross-references/:verseId` |
| `set_active_translation` | POST | `/api/bible/translation` |
| `detect_verses` | POST | `/api/detection/detect` |
| `semantic_search` | POST | `/api/detection/semantic` |
| `quotation_search` | POST | `/api/detection/quotation` |
| `detection_status` | GET | `/api/detection/status` |
| `start_ndi` | — | Replaced by overlay route |
| `stop_ndi` | — | Replaced by overlay route |
| `push_ndi_frame` | — | Replaced by overlay route |
| `start_osc` | POST | `/api/remote/osc/start` |
| `stop_osc` | POST | `/api/remote/osc/stop` |
| `start_http` | POST | `/api/remote/http/start` |
| `stop_http` | POST | `/api/remote/http/stop` |
| `list_monitors` | — | Not applicable (web) |

**Real-time events** (Tauri event → WebSocket message):
| Tauri Event | WS Message Type |
|---|---|
| `transcript_partial` | `{ type: "transcript:partial", ... }` |
| `transcript_final` | `{ type: "transcript:final", ... }` |
| `detection_result` | `{ type: "detection:result", ... }` |
| `audio_level` | `{ type: "audio:level", ... }` |
| `ndi_status` | `{ type: "broadcast:status", ... }` |

---

### WS-4: Axum Backend Server — Bible API
Wrap `rhema-bible` crate as REST endpoints. This is the lowest-risk backend work — the crate is well-isolated.

**Rhema crates reused**: `rhema-bible`
**Endpoints**: translations, books, chapters, verses, FTS5 search, cross-references
**Data**: Ship `rhema.db` with the server (or build from source via data pipeline)

---

### WS-5: Axum Backend Server — Detection Pipeline API
Expose the verse detection pipeline as HTTP + WebSocket endpoints. This is the highest-complexity backend work.

**Rhema crates reused**: `rhema-detection`, `rhema-bible` (dependency)
**State management**: The detection pipeline has stateful components (sentence buffer, sermon context, reading mode) — needs per-session state on the server.
**Endpoints**:
- `POST /api/detection/detect` — single-shot detection
- `WS /ws/detection` — streaming detection (receives transcript chunks, emits detections)
- `GET /api/detection/status` — pipeline health
- `POST /api/detection/semantic` — standalone semantic search
- `POST /api/detection/quotation` — standalone quotation search

**Server-side resources**: ONNX model (~571MB INT8), HNSW index, Bible DB, Aho-Corasick automaton — loaded once, shared across sessions.

---

### WS-6: Axum Backend Server — STT Proxy
Proxy Deepgram WebSocket connections through the server so API keys stay server-side.

**Flow**: Browser mic → WebSocket to server → server WebSocket to Deepgram → results back
**Rhema crates reused**: `rhema-stt` (Deepgram client)
**Alternative**: Deepgram browser SDK with server-issued temporary auth tokens

---

### WS-7: Audio Capture — Web Audio API
Replace Rust `cpal` audio capture with browser Web Audio API.

**Changes**:
- Device enumeration: `navigator.mediaDevices.enumerateDevices()`
- Capture: `getUserMedia({ audio: true })` → `AudioContext` → `AudioWorkletNode`
- Level metering: AudioWorklet processor for RMS/peak
- VAD: Port or replace voice activity detection
- Gain: `GainNode` in audio graph

**Browser constraints**: user must grant mic permission, limited device selection UX, no system audio capture (desktop-only feature lost)

---

### WS-8: Broadcast Overlay System
Replace NDI with a dedicated overlay route for OBS Browser Source.

**Approach**:
- `/overlay` route — transparent HTML page that renders the active verse with the active theme
- Connects to server via WebSocket to receive live verse updates
- Existing `verse-renderer.ts` Canvas 2D code works as-is
- Theme system ports directly — themes stored server-side, synced to overlay via WS
- OBS/vMix/xSplit users add this as a Browser Source

**Bonus**: `/overlay/control` route — simple remote control panel for presentation operators

---

### WS-9: Remote Control API
Port OSC and HTTP remote control from Tauri to the Axum server.

**Rhema crates reused**: `rhema-api`
**Changes**: Already an Axum HTTP server — lift it into the main server process. OSC stays as a server-side UDP listener. Wire commands to session state via channels.

---

### WS-10: Auth, Sessions & Deployment
Production concerns for web deployment.

**Auth**: API key or simple auth (start minimal — single-tenant, move to multi-tenant later)
**Sessions**: WebSocket session management, per-user detection pipeline state
**Deployment**: Dockerize server (Rust binary + SQLite DB + ONNX model), static frontend to CDN/Vercel, environment variable management
**CI/CD**: GitHub Actions — build, lint, typecheck, test, Docker image publish

---

## Migration Order (Recommended)

```
Phase 1: Foundation
  WS-1  Project Scaffolding
  WS-2  Frontend Port (UI renders, no backend)
  WS-3  Service Abstraction Layer

Phase 2: Core Backend
  WS-4  Bible API
  WS-5  Detection Pipeline API
  WS-6  STT Proxy

Phase 3: Media & IO
  WS-7  Audio Capture (Web Audio)
  WS-8  Broadcast Overlay
  WS-9  Remote Control API

Phase 4: Production
  WS-10 Auth, Sessions & Deployment
```

---

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Backend language | Rust (Axum) | Reuse 5 existing Rhema crates without rewrite |
| Detection pipeline | Server-side | ONNX model (571MB) + HNSW index not viable in browser |
| NDI replacement | OBS Browser Source | Covers 80%+ of broadcast use cases, zero native code |
| STT approach | Server-proxied Deepgram | API key security, reuse existing Deepgram client |
| Offline/Whisper | Dropped for web | No viable browser-side equivalent |
| Database | SQLite on server | Existing schema + FTS5 works, no migration needed |
| Monorepo | apps/web + apps/server | Clear separation, shared types |

## Decisions Deferred

| Decision | Options | Decide By |
|---|---|---|
| Multi-tenancy | Single-user vs. team accounts | WS-10 |
| NDI companion app | Build lightweight Tauri bridge or drop NDI | Post-launch |
| Hosting | Self-hosted vs. managed SaaS | WS-10 |
| WebGPU Whisper | Experimental local STT in browser | Post-launch |
