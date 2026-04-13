# OpenBeam

Real-time AI-powered Bible verse detection for live sermons and broadcasts.

OpenBeam listens to sermon audio, transcribes speech in real-time, detects Bible verse references using multiple AI strategies, and renders broadcast-ready overlays for OBS, vMix, and other production tools.

## How It Works

OpenBeam uses a multi-strategy detection pipeline to find Bible verses in real-time speech:

- **Aho-Corasick automaton** — blazing-fast pattern matching across all 66 book names and their abbreviations, with fuzzy matching for spoken formats ("First Corinthians", "one nineteen verse one oh five")
- **Semantic search** — ONNX embeddings (Qwen3-0.6B) + HNSW vector index for paraphrase and allusion detection
- **Quotation matching** — inverted word index that catches verbatim or near-verbatim verse quotes
- **Ensemble merger** — confidence-weighted combination of all strategies with deduplication and cooldown

## Architecture

- **Frontend**: React 19 + Vite + Tailwind v4 + shadcn/ui + Zustand
- **Backend**: Axum (Rust) — detection pipeline, Bible DB, STT proxy
- **Broadcast**: OBS Browser Source overlay
- **STT**: Deepgram (BYOK — bring your own key)

## Project Structure

```
apps/
  web/          — React dashboard SPA
  server/       — Axum Rust backend
packages/
  overlay/      — Broadcast overlay for OBS/vMix/xSplit (standalone)
```

## License

See [LICENSE](./LICENSE).

---

<sup>Inspired by [Rhema](https://github.com/openbezal/rhema).</sup>
