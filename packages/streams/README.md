# @openbeam/streams

RxJS stream orchestration library for OpenBeam. Framework-agnostic — produces observables that any UI layer can subscribe to.

## Install

```bash
pnpm add @openbeam/streams rxjs
```

## What it does

Replaces manual debounce timers, request ID counters, setInterval polling, and multi-event WebSocket wiring with composable RxJS streams. The library handles:

- **Transcription** — WebSocket events → typed `partials$` and `finals$` observables
- **Detection** — consumes transcript finals, produces `detections$` from the detection WebSocket
- **Search** — debounced input with automatic cancellation and Fuse.js → FTS → semantic fallback chain
- **Remote control** — merges 8 WebSocket event types into a single typed `commands$` observable
- **Status sync** — interval-based polling with automatic cleanup

## Usage

### Socket adapter

Wrap any object with an `.on(type, handler)` method:

```ts
import { fromSocketEvent } from "@openbeam/streams"

const partials$ = fromSocketEvent<{ text: string }>(socket, "transcript:partial")
```

### Stream factories

Each factory accepts dependencies via config — no globals, no framework imports.

```ts
import { createTranscriptionStream, createSearchStream } from "@openbeam/streams"

// Transcription: socket events → typed observables
const { partials$, finals$, connectionStatus$ } = createTranscriptionStream({
  socket: transcriptionSocket,
})

// Search: debounce + switchMap + fallback chain
const { results$, isSearching$ } = createSearchStream({
  query$: querySubject,
  translationId$: translationSubject,
  fuseSearch: myFuseSearchFn,
  ftsSearch: myFtsSearchFn,
  debounceMs: 280,
})
```

### Lifecycle management

```ts
import { StreamOrchestrator } from "@openbeam/streams"

const orchestrator = new StreamOrchestrator()
orchestrator.add(partials$.subscribe(handlePartial))
orchestrator.add(finals$.subscribe(handleFinal))

// Cleanup everything at once
orchestrator.destroy()
```

### Custom operators

```ts
import { fallbackChain } from "@openbeam/streams"

// Try strategies in order, return first non-empty result
// switchMap at outer level auto-cancels in-flight chains
source$.pipe(
  fallbackChain(
    (input) => fuseSearch(input),
    (input) => ftsSearch(input),
    (input) => semanticSearch(input),
  ),
)
```

## Exports

| Export | Description |
|--------|------------|
| `fromSocketEvent` | Socket event → Observable adapter |
| `createTranscriptionStream` | Partials, finals, connection status, errors |
| `createDetectionStream` | Detection results from pipeline |
| `createSearchStream` | Debounced search with fallback chain |
| `createRemoteControlStream` | Typed remote command stream |
| `createStatusSyncStream` | Interval-based status polling |
| `fallbackChain` | Custom operator: cascading async fallback |
| `StreamOrchestrator` | Subscription + teardown lifecycle manager |
| Types | All shared data types (Verse, DetectionResult, etc.) |

## Architecture

```
Events (WebSocket, user input) → @openbeam/streams (compose, cancel, debounce) → State (Zustand)
```

The library owns orchestration. The web app owns state and UI. Types are defined here and re-exported by consumers.
