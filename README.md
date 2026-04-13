# OpenBeam

Real-time AI-powered Bible verse detection for live sermons and broadcasts.

OpenBeam listens to sermon audio, transcribes speech in real-time, detects Bible verse references using multiple AI strategies, and renders broadcast-ready overlays for OBS, vMix, and other production tools.

## Architecture

- **Frontend**: React 19 + Vite + Tailwind v4 + shadcn/ui + Zustand
- **Backend**: Axum (Rust) — detection pipeline, Bible DB, STT proxy
- **Broadcast**: OBS Browser Source overlay

## Project Structure

```
apps/
  web/      — React frontend
  server/   — Axum Rust backend
```

## License

See [LICENSE](./LICENSE).

---

<sup>Inspired by [Rhema](https://github.com/tensorkithq/rhema).</sup>
