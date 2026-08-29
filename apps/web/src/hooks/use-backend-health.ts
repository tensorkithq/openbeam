import { useEffect } from "react"
import { toast } from "sonner"
import { useBackendStore } from "@/stores/backend-store"
import type { HealthResponse } from "@/services/api"

const API_BASE = import.meta.env.VITE_API_URL ?? ""
const TOAST_ID = "backend-unreachable"
const HEALTHY_INTERVAL_MS = 30_000
const UNHEALTHY_INTERVAL_MS = 10_000
const REQUEST_TIMEOUT_MS = 5_000

// A hung backend never rejects a plain fetch, so every probe carries its own
// deadline. Anything other than a 2xx inside the deadline counts as down.
async function probeHealth(): Promise<HealthResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) return null
    return (await res.json()) as HealthResponse
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Polls the API server, records its capabilities, and keeps a persistent
 * toast up while it is unreachable. Without this, an outage looks like an app with no data:
 * empty translation list, empty search, a transcript that never fills.
 */
export function useBackendHealth() {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let wasDown = false

    const tick = async () => {
      const health = await probeHealth()
      if (cancelled) return
      useBackendStore.getState().setHealth(health)
      const up = health !== null

      if (!up) {
        toast.error("Can't reach the OpenBeam server", {
          id: TOAST_ID,
          description:
            "Bible search, verse detection and transcription are unavailable until it comes back. Retrying…",
          duration: Infinity,
        })
      } else if (wasDown) {
        toast.success("Reconnected to the OpenBeam server", { id: TOAST_ID, duration: 4_000 })
      }
      wasDown = !up

      timer = setTimeout(tick, up ? HEALTHY_INTERVAL_MS : UNHEALTHY_INTERVAL_MS)
    }

    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      toast.dismiss(TOAST_ID)
    }
  }, [])
}
