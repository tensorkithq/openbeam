import { useEffect } from "react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { useBibleStore } from "@/stores/bible-store"
import { useQueueStore } from "@/stores/queue-store"
import { toVerseRenderData } from "@/hooks/use-broadcast"
import type { Verse } from "@/types"

// TODO: Wire to WebSocket in WS-3 — all listen/invoke calls replaced with stubs

/**
 * Listens for remote control events and dispatches to Zustand stores.
 * Mount this hook once at the app root level.
 */
export function useRemoteControl() {
  useEffect(() => {
    // TODO: Wire to WebSocket in WS-3
    // All Tauri listen() calls have been removed.
    // Remote control events will be received via WebSocket when WS-3 is implemented.
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

    // TODO: Wire to API in WS-3 — fetch full verse from backend
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

// Keep parsePayload available for future use
void parsePayload
