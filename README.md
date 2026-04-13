<p align="center">
  <h1 align="center">OpenBeam</h1>
  <p align="center">
    Real-time Bible verse detection for live sermons — in your browser.
    <br />
    <a href="https://openbeam.tensorkit.net"><strong>Try it live</strong></a> &middot; <a href="https://github.com/openbezal/rhema">Rhema Desktop</a> &middot; <a href="#quick-start">Quick Start</a>
  </p>
</p>

---

OpenBeam is the cloud companion to [Rhema](https://github.com/openbezal/rhema), a desktop application for real-time Bible verse detection during live sermons. OpenBeam brings the same multi-strategy detection pipeline to the browser — no downloads, no installation, no setup beyond a Deepgram API key.

A preacher says *"nothing can separate us from God's love"* and OpenBeam surfaces **Romans 8:38-39** in real-time, ready for your broadcast overlay.

## Why OpenBeam exists

Rhema is a powerful desktop tool, but trying it means downloading a Tauri app, compiling Rust, setting up ONNX models, and configuring NDI. That's a lot to ask before you even know if verse detection is useful for your ministry.

OpenBeam removes that barrier. Open a URL, enter your Deepgram key, and start detecting verses. If it changes how you do live services — and we think it will — [Rhema Desktop](https://github.com/openbezal/rhema) is there when you're ready for the full broadcast production experience.

## Detection Pipeline

OpenBeam doesn't use a single method to find verses. It runs four strategies simultaneously and merges results with confidence weighting:

### Aho-Corasick Automaton — Direct References
A compiled finite automaton that matches all 66 book names, their abbreviations, and spoken variants in a single pass over the transcript. When a preacher says *"turn to First Corinthians chapter 13"*, the automaton catches it instantly — no regex backtracking, no LLM round-trip.

Handles fuzzy spoken formats: *"one nineteen verse one oh five"* resolves to Psalm 119:105.

### Semantic Search — Paraphrases and Allusions
Embeds transcript segments via [Qwen3-Embedding-8B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) through OpenRouter, then searches a pre-built HNSW vector index of 31,000+ verse embeddings. This catches what pattern matching cannot — when a speaker alludes to a verse without naming it.

*"Put on the full armor so you can stand against the enemy's schemes"* matches **Ephesians 6:11** even though no book or chapter was mentioned.

### Quotation Matching — Verbatim Text
An inverted word index built from every verse in the Bible. When someone quotes scripture word-for-word (or close to it), the overlap score surfaces the match even without a direct reference.

*"The Lord is my shepherd, I shall not want"* immediately resolves to **Psalm 23:1**.

### Ensemble Merger
All three strategies feed into a confidence-weighted merger with deduplication and cooldown. A verse detected by multiple strategies gets a boosted confidence score. A verse that was just displayed gets suppressed to avoid repetition. The result: the right verse surfaces at the right time.

## Architecture

```
  Browser Microphone
        |
        v
  ┌─────────────────┐     WebSocket      ┌──────────────────────┐
  │   React 19 SPA  │ ◄────────────────► │    Axum Server       │
  │                  │    /ws/transcription│    (Rust)            │
  │  Zustand stores  │    /ws/detection   │                      │
  │  shadcn/ui       │    /ws/overlay     │  ┌────────────────┐  │
  │  Tailwind v4     │                    │  │ Aho-Corasick   │  │
  │                  │                    │  │ HNSW + Qwen3   │  │
  └─────────┬────────┘                    │  │ Quotation Index│  │
            │                             │  │ Sentence Buffer│  │
            │                             │  │ Sermon Context │  │
            │                             │  └────────────────┘  │
  ┌─────────▼────────┐                    │                      │
  │  OBS Browser Src │ ◄──── /ws/overlay  │  SQLite + FTS5       │
  │  /overlay.html   │                    │  10+ translations    │
  │  transparent bg  │                    │  340k cross-refs     │
  └──────────────────┘                    └──────────────────────┘
                                                    │
                                            Deepgram (user's key)
                                            OpenRouter (platform)
```

| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, Vite 7, Tailwind CSS v4, shadcn/ui, Zustand, Fabric.js |
| **Backend** | Axum (Rust), SQLite + FTS5, Aho-Corasick, HNSW vector search |
| **Speech-to-Text** | Deepgram Nova-3 (BYOK — bring your own key) |
| **Embeddings** | Qwen3-Embedding-8B via OpenRouter (platform-provided) |
| **Broadcast** | OBS Browser Source overlay with Canvas 2D rendering |
| **Remote Control** | OSC (Stream Deck, TouchOSC) + HTTP API |

## Quick Start

### Hosted

Visit [openbeam.tensorkit.net](https://openbeam.tensorkit.net), enter your [Deepgram API key](https://console.deepgram.com), and start transcribing.

### Self-Hosted

```bash
git clone https://github.com/tensorkithq/openbeam.git
cd openbeam

# Enter dev shell (requires Nix)
nix develop

# Set your OpenRouter key for embeddings
echo "OPENROUTER_API_KEY=sk-or-..." > .env

# Launch both services
start
```

The `start` command builds the Rust server (:4001) and launches the Vite dev server (:4000). Run `status` to check health, `stop` to shut down, `logs` to tail output.

### Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/XXXXXX?referralCode=openbeam)

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | — | Qwen3 embedding API key (platform cost, ~$11/mo at 10K users) |
| `PORT` | No | 4001 | Server port |
| `DB_PATH` | No | ./data/openbeam.db | Bible database path |
| `RUST_LOG` | No | info | Log level |

Users provide their own Deepgram API key in the browser. It's stored in `localStorage` — the server never sees it except as a pass-through to Deepgram's WebSocket.

## Features

- **Real-time transcription** with live partial results as the speaker talks
- **Multi-strategy verse detection** running four algorithms simultaneously
- **10+ Bible translations** — KJV, NIV, ESV, NASB, NKJV, NLT, AMP, plus Spanish, French, Portuguese
- **340,000+ cross-references** from openbible.info
- **Full-text search** across all translations via SQLite FTS5
- **Broadcast overlay** for OBS, vMix, xSplit — transparent Canvas 2D rendering
- **Theme designer** — visual editor for verse overlay appearance (fonts, colors, backgrounds, layout)
- **Verse queue** with drag-and-drop reordering
- **Remote control** via OSC (Stream Deck, TouchOSC) and HTTP API
- **Audio level metering** with gain control
- **Sermon context tracking** — detects when a preacher is reading through a chapter sequentially
- **Zero server-side user data** — all preferences in browser localStorage

## Project Structure

```
apps/
  web/              React dashboard SPA
  server/           Axum Rust backend
    crates/
      bible/        SQLite Bible DB + FTS5 search
      detection/    Aho-Corasick, HNSW, quotation matcher, pipeline
      stt/          Deepgram WebSocket client
      api/          OSC + HTTP remote control
packages/
  overlay/          Broadcast overlay (standalone, see migration plan)
```

## Design Decisions

We made deliberate trade-offs to keep OpenBeam simple and portable:

| Decision | What we chose | Why |
|----------|--------------|-----|
| **STT** | Deepgram only (BYOK) | Real-time WebSocket streaming. Whisper API is batch-only — too slow for live. |
| **Embeddings** | OpenRouter (Qwen3-8B), platform-paid | $0.01/1M tokens. 10K users costs ~$11/month. Users don't need a second API key. |
| **Broadcast** | OBS Browser Source | Covers 80%+ of use cases. NDI requires native code — deferred to Rhema Desktop. |
| **User data** | Browser localStorage only | Server is stateless. No accounts, no auth, no database of user preferences. |
| **Detection** | Server-side Rust | The pipeline (Aho-Corasick + HNSW + quotation index) needs the full Bible DB in memory. Browser can't do this efficiently. |
| **Backend** | Rust (Axum) | Reuses Rhema's detection crates directly. No rewrite needed. |

## OpenBeam vs Rhema Desktop

OpenBeam is not a replacement for Rhema. It's the evaluation ramp.

| Capability | OpenBeam (Cloud) | Rhema (Desktop) |
|-----------|-----------------|-----------------|
| Installation | None — open a URL | Download + build |
| Verse detection | Full pipeline | Full pipeline |
| Transcription | Deepgram (cloud) | Deepgram + Whisper (local, offline) |
| Broadcast output | OBS Browser Source | NDI + display output |
| Audio capture | Browser microphone | System audio + mic |
| Embeddings | Cloud API (Qwen3-8B) | Local ONNX (Qwen3-0.6B) |
| Offline mode | No | Yes (Whisper + local ONNX) |
| Theme designer | Yes | Yes |
| Remote control | OSC + HTTP | OSC + HTTP |
| User data | Browser only | Local app storage |

## Acknowledgments

OpenBeam is built on the architecture and detection pipeline of [Rhema](https://github.com/openbezal/rhema), an open-source desktop application by the [OpenBezal](https://github.com/openbezal) team. The Rust crates powering verse detection (Aho-Corasick automaton, HNSW vector index, quotation matcher, sentence buffer, sermon context tracker) were lifted directly from Rhema and adapted for web deployment.

The Bible database includes public domain translations and cross-reference data from [openbible.info](https://www.openbible.info/labs/cross-references/).

## License

See [LICENSE](./LICENSE).
