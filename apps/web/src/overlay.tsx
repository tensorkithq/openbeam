/* eslint-disable react-refresh/only-export-components */
import { createRoot } from "react-dom/client"
import { useRef, useEffect, useCallback, useState } from "react"
import "./index.css"
import { renderVerse } from "@/lib/verse-renderer"
import { OpenBeamSocket } from "@/services/ws"
import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"

interface BroadcastPayload {
  theme: BroadcastTheme
  verse: VerseRenderData | null
}

const params = new URLSearchParams(window.location.search)
const themeFilter = params.get("theme")
const resolutionParam = params.get("resolution")
const outputId = params.get("output") || "main"

let initWidth = 1920
let initHeight = 1080
if (resolutionParam) {
  const [w, h] = resolutionParam.split("x").map(Number)
  if (w > 0 && h > 0) {
    initWidth = w
    initHeight = h
  }
}

// Build WS URL with role=overlay
const role = params.get("role") || "overlay"
const overlaySocket = new OpenBeamSocket(`/ws/overlay?role=${role}`)

function BroadcastCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestData = useRef<BroadcastPayload | null>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const [connected, setConnected] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const data = latestData.current
    if (!data) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }

    const { theme, verse } = data
    canvas.width = theme.resolution.width
    canvas.height = theme.resolution.height
    const result = renderVerse(ctx, theme, verse, {
      scale: 1,
      imageCache: imageCacheRef.current,
    })
    if (!result) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  const preloadBackgroundImage = useCallback((theme: BroadcastTheme) => {
    const bg = theme.background
    if (bg.type !== "image" || !bg.image?.url) return

    const url = bg.image.url
    const cache = imageCacheRef.current
    if (cache.has(url)) return

    const img = new Image()
    img.onload = () => {
      cache.set(url, img)
      draw()
    }
    img.onerror = () => {
      console.warn("[broadcast-output] failed to load background image", { url })
    }
    img.src = url
  }, [draw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = initWidth
      canvas.height = initHeight
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, initWidth, initHeight)
      }
    }

    overlaySocket.connect()

    const offConnected = overlaySocket.on("_connected", () => {
      setConnected(true)
      overlaySocket.send("overlay:ready", { output: outputId })
    })

    const offDisconnected = overlaySocket.on("_disconnected", () => {
      setConnected(false)
    })

    const offUpdate = overlaySocket.on("verse:update", (_, data) => {
      const payload = data as BroadcastPayload
      if (themeFilter && payload.theme?.id !== themeFilter) return
      latestData.current = payload
      if (payload.theme) preloadBackgroundImage(payload.theme)
      draw()
    })

    return () => {
      offConnected()
      offDisconnected()
      offUpdate()
      overlaySocket.disconnect()
    }
  }, [draw, preloadBackgroundImage])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          width: "100vw",
          height: "100vh",
          display: "block",
          objectFit: "contain",
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: 8,
          right: 8,
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: connected ? "#22c55e" : "#6b7280",
          opacity: 0.7,
          pointerEvents: "none",
        }}
      />
      {!connected && (
        <div style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,255,255,0.5)",
          fontSize: 12,
          fontFamily: "system-ui",
        }}>
          Waiting for connection...
        </div>
      )}
    </>
  )
}

const root = document.getElementById("overlay-root")!
createRoot(root).render(<BroadcastCanvas />)
