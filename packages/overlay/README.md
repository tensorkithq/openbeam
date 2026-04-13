# @openbeam/overlay

Standalone broadcast overlay app for OBS Browser Source, vMix, xSplit, and other production tools.

Renders Bible verses on a transparent canvas at configurable resolution, controlled via WebSocket from the main OpenBeam dashboard.

## Status

**Planned** — this package exists as a migration target. The overlay currently ships as a separate Vite entry point inside `apps/web/` during initial development. This package will become the standalone overlay app once the shared package extraction is complete.

## Migration Path

### Phase 1: Inline (Current)
Overlay lives as a second entry point in `apps/web/`:
```
apps/web/
  index.html        → dashboard SPA
  overlay.html      → broadcast overlay
  src/
    main.tsx        → dashboard entry
    overlay.tsx     → overlay entry
    lib/verse-renderer.ts
    lib/builtin-themes.ts
    types/broadcast.ts
```
This gets the overlay working with zero package overhead. OBS users point at `/overlay.html`.

### Phase 2: Extract shared package
Create `packages/shared/` and move rendering logic + types out of `apps/web/`:
```
packages/shared/
  package.json      → @openbeam/shared
  src/
    verse-renderer.ts    (~1000 LOC Canvas 2D engine)
    builtin-themes.ts    (default theme definitions)
    types/
      broadcast.ts       (BroadcastTheme, VerseRenderData, VerseSegment)
      detection.ts       (DetectionResult, DetectionSource)
```
Both `apps/web/` and `packages/overlay/` import from `@openbeam/shared`.

### Phase 3: Standalone overlay app (this package)
Move overlay out of `apps/web/` into this package:
```
packages/overlay/
  package.json      → @openbeam/overlay (depends on @openbeam/shared)
  vite.config.ts    → single entry point, minimal deps
  index.html
  src/
    main.tsx        → mount canvas, connect WebSocket
    overlay.tsx     → canvas + draw loop + WS client
```

### Benefits of Full Extraction
- **~8KB bundle** — overlay loads in <100ms for OBS (vs ~500KB+ if bundled with dashboard)
- **Independent deploy** — update overlay without touching dashboard
- **Stability isolation** — overlay can't accidentally import shadcn/zustand/Fabric.js
- **Separate versioning** — broadcast houses care about overlay stability in production
- **Separate Dockerfile** — deploy overlay to CDN/edge, dashboard + server elsewhere

### Architecture

```
┌──────────────────┐     WebSocket      ┌──────────────────┐
│  apps/web        │◄──────────────────►│  apps/server     │
│  (dashboard)     │                    │  (Axum backend)  │
└──────────────────┘                    └────────┬─────────┘
                                                 │
                                          WebSocket (verse updates)
                                                 │
                                        ┌────────▼─────────┐
                                        │ packages/overlay  │
                                        │ (OBS Browser Src) │
                                        │                   │
                                        │ Canvas 2D render  │
                                        │ Transparent bg    │
                                        │ Theme-controlled  │
                                        └───────────────────┘
```

### OBS Browser Source Usage (future)
```
URL:        https://your-server/overlay?theme=classic-dark
Width:      1920
Height:     1080
CSS:        body { background: transparent; }
```

### Rendering Engine
The overlay uses pure Canvas 2D rendering (no DOM) via the shared `verse-renderer.ts`:
- Text with shadows, outlines, transforms
- Image/gradient/solid backgrounds with blur, brightness, tint
- 9-point anchor layout with padding and offset
- Reference positioning (above/below/inline)
- Text box with rounded corners and opacity
- Respects theme resolution (720p, 1080p, 4K)

### WebSocket Protocol
```json
// Server → Overlay: verse update
{
  "type": "verse:update",
  "theme": { /* BroadcastTheme */ },
  "verse": { /* VerseRenderData | null (null = clear) */ }
}

// Overlay → Server: ready signal
{
  "type": "overlay:ready",
  "resolution": { "width": 1920, "height": 1080 }
}
```
