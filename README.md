# OpenBeam

Real-time AI-powered Bible verse detection for live sermons — web edition.

Replatformed from [Rhema](https://github.com/tensorkithq/rhema) (Tauri desktop) to a full web application.

## Architecture

- **Frontend**: React 19 + Vite + Tailwind v4 + shadcn/ui + Zustand
- **Backend**: Axum (Rust) — reuses Rhema's detection pipeline, Bible DB, and STT proxy
- **Broadcast**: OBS Browser Source overlay (replaces NDI)

## Project Structure

```
apps/
  web/      — React frontend
  server/   — Axum Rust backend
```

See [LIFT-SCHEMATICS.md](./LIFT-SCHEMATICS.md) for full migration plan.
