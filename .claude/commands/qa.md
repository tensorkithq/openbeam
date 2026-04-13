# /qa — End-to-End QA Validation

Run Playwright E2E tests against the OpenBeam web app to validate workstream deliverables.

## Usage
```
/qa              — run all tests
/qa onboarding   — test API key entry flow
/qa transcript   — test transcription pipeline
/qa detection    — test verse detection UI
/qa overlay      — test broadcast overlay rendering
/qa smoke        — quick smoke test (app loads, no errors)
```

## What This Does

1. Starts the Vite dev server (`bun run dev` in apps/web)
2. Runs Playwright tests matching the specified suite
3. Reports pass/fail with screenshots on failure

## Test Suites

### `onboarding`
- App loads at localhost:3000
- Click settings button `[data-tour="settings"]`
- Navigate to Speech section
- Enter Deepgram API key in `input[placeholder="Enter your Deepgram API key..."]`
- Click Save
- Verify key persisted in localStorage
- Verify "Key configured" badge appears

### `transcript`
- Mock WebSocket at `/ws/transcription`
- Click "Start transcribing"
- Inject mock Deepgram responses (partial → final)
- Verify `data-slot="transcript-panel"` shows transcript text
- Verify connection status dot turns green
- Click "Stop transcribing"
- Verify clean disconnect

### `detection`
- Mock detection WebSocket at `/ws/detection`
- Inject mock detection results with varying confidence/source
- Verify `data-slot="detections-panel"` shows detection cards
- Verify confidence dots (red/yellow/green) render correctly
- Verify source badges (Direct/Context/Quote/Semantic) render
- Click "Present" on a detection
- Verify verse appears in preview panel

### `overlay`
- Navigate to `/overlay?theme=classic-dark`
- Mock WebSocket verse update
- Verify canvas renders verse text on transparent background
- Verify theme styling applied (font, colors, position)
- Test resolution params (?resolution=1920x1080)

### `smoke`
- App loads without console errors
- Dashboard grid renders (transport bar, 4 panels, search + detections)
- Theme toggle works (light ↔ dark)
- No unhandled promise rejections

## Mock Data

### Deepgram WebSocket Response
```json
{
  "type": "Results",
  "channel_index": [0, 1],
  "duration": 1.5,
  "start": 0.0,
  "is_final": true,
  "speech_final": true,
  "channel": {
    "alternatives": [{
      "transcript": "Let's turn to John chapter 3 verse 16",
      "confidence": 0.95,
      "words": [
        {"word": "Let's", "start": 0.0, "end": 0.2, "confidence": 0.98, "punctuated_word": "Let's"},
        {"word": "turn", "start": 0.2, "end": 0.4, "confidence": 0.97, "punctuated_word": "turn"},
        {"word": "to", "start": 0.4, "end": 0.5, "confidence": 0.99, "punctuated_word": "to"},
        {"word": "John", "start": 0.5, "end": 0.8, "confidence": 0.96, "punctuated_word": "John"},
        {"word": "chapter", "start": 0.8, "end": 1.0, "confidence": 0.94, "punctuated_word": "chapter"},
        {"word": "3", "start": 1.0, "end": 1.1, "confidence": 0.93, "punctuated_word": "3"},
        {"word": "verse", "start": 1.1, "end": 1.3, "confidence": 0.95, "punctuated_word": "verse"},
        {"word": "16", "start": 1.3, "end": 1.5, "confidence": 0.97, "punctuated_word": "16."}
      ]
    }]
  }
}
```

### Detection Result
```json
{
  "type": "detection:result",
  "data": {
    "verse_ref": "John 3:16",
    "verse_text": "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    "book_name": "John",
    "book_number": 43,
    "chapter": 3,
    "verse": 16,
    "confidence": 0.95,
    "source": "direct",
    "auto_queued": true,
    "transcript_snippet": "Let's turn to John chapter 3 verse 16"
  }
}
```

## Test Audio Fixture
Place eval audio file at: `apps/web/e2e/fixtures/sermon-eval.wav`
(ElevenLabs recording of the eval script — covers direct refs, contextual, quotation, semantic, edge cases)

## Implementation

Tests live in `apps/web/e2e/` using Playwright Test.

```
apps/web/e2e/
  fixtures/
    sermon-eval.wav          — eval audio (user-provided)
    deepgram-responses.json  — mock WS messages
    detection-results.json   — mock detection data
  helpers/
    mock-ws.ts               — WebSocket mock server
    test-utils.ts            — common helpers
  tests/
    onboarding.spec.ts
    transcript.spec.ts
    detection.spec.ts
    overlay.spec.ts
    smoke.spec.ts
  playwright.config.ts
```
