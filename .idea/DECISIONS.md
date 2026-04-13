# Design Decisions

Locked decisions for OpenBeam. This is the source of truth — code and issues must align with these.

---

## D1: Backend Language — Rust (Axum)

Reuse Rhema's 5 Rust crates (`bible`, `detection`, `stt`, `api`, `audio`). The detection pipeline alone (~5k LOC, Aho-Corasick + ONNX + HNSW) is not worth rewriting. Axum wraps them as HTTP/WebSocket endpoints.

## D2: STT Provider — Deepgram Only

No Whisper. No offline fallback. Deepgram is the sole STT provider.

## D3: STT Architecture — BYOK (Bring Your Own Key)

Users provide their own Deepgram API key during onboarding. The key is stored in **browser localStorage only** — the server never persists it. The server acts as a proxy for speed, latency optimization, and response handling. The key is sent per-request from the client.

**Flow:**
```
Onboarding → user enters Deepgram key → saved to localStorage
Audio capture → browser sends audio + key to server proxy
Server → opens Deepgram WebSocket using user's key → streams results back
```

**Why server proxy instead of direct browser→Deepgram:**
- Server handles connection management, reconnection, buffering
- Keyword boosting config stays server-side
- Future: server can rate-limit, log usage, add caching without client changes

**What we do NOT store server-side:**
- No API keys
- No user data
- No session persistence
- No accounts or auth

## D4: Data Persistence — None Server-Side

The server is stateless from a user data perspective. All user preferences, API keys, theme selections, and settings live in browser localStorage. The server holds only shared read-only resources (Bible DB, ONNX model, HNSW index).

## D5: NDI — Deferred

No NDI support at launch. OBS Browser Source is the broadcast output method. NDI companion app is a future consideration only if users request it.

## D6: Tenancy — Open Access, No Auth

No accounts, no auth, no multi-tenancy. The server is a shared utility — anyone can use it. User identity is their browser (localStorage). This may change post-launch if abuse or scaling requires it.

## D7: Broadcast Output — OBS Browser Source

`/overlay` route renders verses on a transparent page. OBS/vMix/xSplit users add it as a Browser Source. Controlled via WebSocket from the main app.

## D8: Hosting Model — TBD

Deferred. Likely open-source self-hosted with optional hosted tier. Decision made during WS-10.
