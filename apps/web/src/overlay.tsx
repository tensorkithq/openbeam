import { createRoot } from "react-dom/client"

createRoot(document.getElementById("overlay-root")!).render(
  <div style={{ width: "100vw", height: "100vh", background: "transparent" }}>
    <canvas id="overlay-canvas" />
  </div>
)
