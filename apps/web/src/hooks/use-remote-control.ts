import { useEffect, useRef } from "react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { useBibleStore } from "@/stores/bible-store"
import { useQueueStore } from "@/stores/queue-store"
import { useSettingsStore } from "@/stores/settings-store"
import { toVerseRenderData } from "@/hooks/use-broadcast"
import { remoteSocket, api } from "@/services"
import type { Verse } from "@/types"

/**
 * Listens for remote control events via WebSocket and dispatches to Zustand stores.
 * Also syncs StatusSnapshot to the server every second.
 * Mount this hook once at the app root level.
 */
export function useRemoteControl() {
  const syncTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    remoteSocket.connect()

    const unsubs = [
      remoteSocket.on("remote:next", () => {
        navigateNext()
      }),
      remoteSocket.on("remote:prev", () => {
        navigatePrev()
      }),
      remoteSocket.on("remote:theme", (_type, data) => {
        const payload = parsePayload(data)
        const name = payload?.name as string | undefined
        if (!name) return
        const { themes, setActiveTheme } = useBroadcastStore.getState()
        const theme = themes.find(
          (t) => t.name.toLowerCase() === name.toLowerCase()
        )
        if (theme) setActiveTheme(theme.id)
      }),
      remoteSocket.on("remote:opacity", (_type, data) => {
        const payload = parsePayload(data)
        const value = payload?.value as number | undefined
        if (value !== undefined) {
          console.log("[remote-control] opacity:", value)
        }
      }),
      remoteSocket.on("remote:on_air", (_type, data) => {
        const payload = parsePayload(data)
        const active = payload?.active as boolean | undefined
        if (active !== undefined) {
          useBroadcastStore.getState().setLive(active)
        }
      }),
      remoteSocket.on("remote:show_broadcast", () => {
        useBroadcastStore.getState().setLive(true)
      }),
      remoteSocket.on("remote:hide_broadcast", () => {
        useBroadcastStore.getState().setLive(false)
      }),
      remoteSocket.on("remote:set_confidence", (_type, data) => {
        const payload = parsePayload(data)
        const value = payload?.value as number | undefined
        if (value !== undefined) {
          useSettingsStore.getState().setConfidenceThreshold(value)
        }
      }),
    ]

    // Sync status snapshot to server every 1s
    syncTimer.current = setInterval(() => {
      const { isLive, liveVerse, activeThemeId, themes } =
        useBroadcastStore.getState()
      const { items } = useQueueStore.getState()
      const { confidenceThreshold } = useSettingsStore.getState()
      const activeTheme = themes.find((t) => t.id === activeThemeId)

      api
        .updateRemoteStatus({
          on_air: isLive,
          active_theme: activeTheme?.name ?? null,
          live_verse: liveVerse?.reference ?? null,
          queue_length: items.length,
          confidence_threshold: confidenceThreshold,
        })
        .catch(() => {
          // Server may not be reachable yet
        })
    }, 1000)

    return () => {
      unsubs.forEach((unsub) => unsub())
      remoteSocket.disconnect()
      if (syncTimer.current) {
        clearInterval(syncTimer.current)
        syncTimer.current = null
      }
    }
  }, [])
}

/**
 * Find the index of the currently displayed verse in the queue.
 */
function findCurrentVerseIndex(): number | null {
  const { liveVerse } = useBroadcastStore.getState()
  if (!liveVerse) return null

  const { items } = useQueueStore.getState()
  const index = items.findIndex(
    (item) => item.reference === liveVerse.reference
  )
  return index >= 0 ? index : null
}

/**
 * Present a queue item at the given index to the live display.
 */
export async function presentQueueItem(index: number) {
  try {
    const { items } = useQueueStore.getState()
    const item = items[index]
    if (!item) return

    const { verse } = item

    const verseToPresent: Verse = verse

    const bibleState = useBibleStore.getState()
    const translation =
      bibleState.translations.find(
        (t) => t.id === bibleState.activeTranslationId
      )?.abbreviation ?? "KJV"

    bibleState.selectVerse(verseToPresent)
    useBroadcastStore
      .getState()
      .setLiveVerse(toVerseRenderData(verseToPresent, translation))
  } catch (e) {
    console.warn("[remote-control] presentQueueItem failed:", e)
  }
}

/**
 * Navigate to next verse in queue.
 */
export function navigateNext() {
  const { items, activeIndex } = useQueueStore.getState()
  if (items.length === 0) return

  const currentIndex = activeIndex ?? findCurrentVerseIndex()
  const nextIndex = Math.min(
    currentIndex === null ? 0 : currentIndex + 1,
    items.length - 1
  )
  useQueueStore.getState().setActive(nextIndex)
  presentQueueItem(nextIndex)
}

/**
 * Navigate to previous verse in queue.
 */
export function navigatePrev() {
  const { items, activeIndex } = useQueueStore.getState()
  if (items.length === 0) return

  const currentIndex = activeIndex ?? findCurrentVerseIndex()
  const prevIndex = Math.max(
    currentIndex === null ? 0 : currentIndex - 1,
    0
  )
  useQueueStore.getState().setActive(prevIndex)
  presentQueueItem(prevIndex)
}

/**
 * Safely parse a JSON string payload.
 */
function parsePayload(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof raw === "object" && raw !== null) {
    return raw as Record<string, unknown>
  }
  return null
}
