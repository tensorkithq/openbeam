# Compromises

OpenBeam runs Rhema's detection pipeline in a browser. That constraint forced trade-offs that don't exist in the desktop app. This document records what we gave up, what we gained, and why.

---

## 1. Fuse.js runs in a Web Worker, not on the main thread

**The problem:** Client-side fuzzy search across 31,102 Bible verses blocks the main thread. Every `fuse.search()` call freezes the UI — the user types a letter, the browser hangs for 50-200ms while Fuse scans 31K documents, then the keystroke appears. At 280ms debounce intervals, the input feels like it's fighting the search.

**The compromise:** We moved Fuse.js into a dedicated Web Worker (`workers/fuse-search.worker.ts`). The worker owns the index entirely — it fetches the verse data from the API, builds the Fuse index, and runs searches. The main thread sends `postMessage` requests and receives results asynchronously.

**What we lost:**
- Direct function calls. The old code was `const results = await fuse.search(query)`. Now it's a `postMessage` → `onmessage` round-trip with a request ID map to match responses to callers.
- Simplicity. A 90-line module became a 3-file architecture: worker, client, facade.
- Debuggability. Worker errors don't show in the component stack trace. You need DevTools > Sources > Workers to inspect.

**What we gained:**
- The input never freezes. The main thread is completely free while the worker searches 31K verses.
- Prefetching. When the user changes the translation dropdown, `prefetchFuseIndex()` fires a background `build-index` message. By the time they type, the index is ready.
- The same function signature. `searchContextWithFuse(query, tid, limit)` still returns a Promise. The RxJS stream, the search panel, and the fallback chain don't know a worker is involved.

**Rhema doesn't need this** because Fuse.js doesn't exist in Rhema. The desktop app uses an in-process Rust HNSW vector index with native threading — search is fast and non-blocking by default.

---

## 2. RxJS orchestrates what Rust channels do natively

**The problem:** The browser has no equivalent to Rust's `mpsc::channel` or `tokio::select!`. The original React hooks used `setTimeout` for debouncing, `useRef` counters for stale request rejection, `setInterval` for polling, and manual cleanup arrays for WebSocket listeners. This worked but was fragile and scattered across 6+ files.

**The compromise:** We added RxJS (`@openbeam/streams` package) as the orchestration layer between events and state. `switchMap` replaces request ID counters, `debounceTime` replaces `setTimeout` refs, `merge` replaces multi-listener cleanup arrays, `interval` replaces `setInterval`.

**What we lost:**
- Bundle size. RxJS adds ~30KB minified to the dependency tree.
- Learning curve. The team must think in observables, not just promises and callbacks.
- A dependency. Rhema's equivalent logic is zero-dependency Rust — channels and select are in the standard library.

**What we gained:**
- Automatic cancellation. `switchMap` unsubscribes from stale in-flight searches when a new keystroke arrives. No request ID tracking, no race conditions.
- Declarative pipelines. The entire search flow — debounce, fallback chain (Fuse → FTS → semantic), result emission — reads as a single pipeline instead of nested callbacks.
- Framework-agnostic core. The `@openbeam/streams` package has zero React dependencies. It produces observables that any UI layer can subscribe to.

**Rhema doesn't need this** because Tokio provides the same primitives natively: `select!` for cancellation, channels for fan-out, `sleep` for debounce. RxJS is the browser equivalent of what Rust's async runtime gives you for free.

---

## 3. Audio goes through a WebSocket, not in-process

**The problem:** Browsers can't run native audio processing. There's no way to call Deepgram's SDK directly from a web page with system audio capture, local VAD, or native PCM encoding.

**The compromise:** Audio flows through an AudioWorklet (Web Worker) for PCM encoding, then over a WebSocket to the server, which proxies to Deepgram. The server holds the user's Deepgram API key only in memory for the duration of the WebSocket connection.

**What we lost:**
- Latency. Each audio chunk travels: microphone → AudioWorklet → main thread → WebSocket → server → Deepgram → server → WebSocket → main thread. Rhema's path is: microphone → native capture → in-process Deepgram SDK. The round-trip adds 50-150ms depending on network conditions.
- Offline mode. No internet, no transcription. Rhema can fall back to local Whisper.
- System audio capture. Browsers only expose microphone input, not desktop audio. Rhema captures both.

**What we gained:**
- Zero installation. Open a URL, grant mic permission, start transcribing.
- Cross-platform. Works on any device with a browser — Chromebook, iPad, phone.
- No API key management on the client. The key lives in `localStorage` and is only sent to the server per-connection. The server never persists it.

---

## 4. Detection runs server-side, not in the browser

**The problem:** The detection pipeline (Aho-Corasick automaton + HNSW vector index + quotation matcher + sentence buffer + sermon context tracker) needs the full Bible database in memory (~48MB SQLite) and a vector index. Loading this in a browser tab is impractical.

**The compromise:** The server runs the detection pipeline. The browser sends finalized transcript text over a WebSocket, and the server returns detected verses. The RxJS stream (`createDetectionStream`) forwards transcript finals to the detection socket and collects results.

**What we lost:**
- Client-side autonomy. If the server goes down, detection stops. Rhema runs everything locally.
- Latency. Transcript text makes a round-trip to the server for detection. In Rhema, detection is in-process — the Aho-Corasick automaton runs in microseconds with no network hop.

**What we gained:**
- Shared Rust crates. The detection pipeline is the same code running in both OpenBeam's server and Rhema's desktop app. No JavaScript rewrite, no WASM porting, no accuracy divergence.
- Lighter client. The browser doesn't load a 48MB database or a vector index. The SPA is ~220KB gzipped.

---

## 5. `memo()` and selector splitting to survive React re-renders

**The problem:** The search panel subscribes to multiple Zustand store slices (`currentChapter`, `semanticResults`, `selectedVerse`, etc.). Any slice change re-renders the entire component, including 30+ verse rows with tooltip wrappers and a regex-based `HighlightedText` component. During active transcription, store updates arrive every few hundred milliseconds.

**The compromise:** We split subscriptions into individual `useBibleStore((s) => s.field)` selectors, wrapped `VerseRow` and `HighlightedText` in `React.memo()`, and added a shallow equality guard in `setSemanticResults` to skip updates when both old and new values are empty arrays.

**What we lost:**
- Simplicity. The code went from `const { translations, books, ... } = useBible()` (one call) to six separate selector calls plus two `memo()` wrappers plus a store guard.
- Readability. New contributors need to understand why verse rows are memoized components instead of inline JSX.

**What we gained:**
- Selecting a verse re-renders only 2 rows (old selection + new selection) instead of all 30+.
- Search results updating doesn't re-render the book tab's verse list (different selector, different reference).
- Repeated empty-array emissions from the search stream don't trigger any re-render at all.

**Rhema doesn't need this** because Tauri's frontend uses a different rendering model. Rhema's UI is also simpler — it doesn't have a search panel with dual tabs, inline highlighting, and live detection results competing for re-renders in the same component tree.

---

## 6. Focus management to prevent input theft

**The problem:** The search panel's quick-nav autocomplete triggers `setPendingNavigation` on every keystroke that matches a full reference (e.g., typing "John 3:16" fires a navigation to load that verse). The navigation handler called `panelRef.focus()` on completion, yanking focus from the input the user was still typing in.

**The compromise:** A `focusAfterNavRef` tri-state ref (`undefined` | `false` | `true`) distinguishes between mid-typing autocomplete previews and explicit user commits (Enter key, verse click, remote control commands). The panel only steals focus after explicit commits.

**What we lost:**
- A clean, single code path. The navigation handler now checks a ref before deciding whether to focus. The ref is set in three different places (autocomplete effect, Enter handler, verse click handler).

**What we gained:**
- Typing is never interrupted. The user can type "Songs of Solomon 8:1" without the panel stealing focus after "Songs of Solomon" resolves to a navigation.
- Arrow-key navigation still works after explicit commits. Press Enter or click a verse, and the green highlight appears with full keyboard navigation.
- The input syncs to the resolved reference after commits, so the user can backspace to edit (e.g., change chapter) instead of retyping the book name.
