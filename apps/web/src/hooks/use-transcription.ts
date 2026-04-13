import { useCallback } from "react"
import { useTranscriptStore } from "@/stores"
import { useTauriEvent } from "./use-tauri-event"

interface TranscriptPartialPayload {
  text: string
  is_final: boolean
  confidence: number
}

export function useTranscription() {
  const store = useTranscriptStore()

  // TODO: Wire to WebSocket in WS-3
  useTauriEvent<TranscriptPartialPayload>("transcript_partial", (payload) => {
    store.setPartial(payload.text)
  })

  useTauriEvent<TranscriptPartialPayload>("transcript_final", (payload) => {
    const segment = {
      id: crypto.randomUUID(),
      text: payload.text,
      is_final: true,
      confidence: payload.confidence,
      words: [],
      timestamp: Date.now(),
    }
    store.addSegment(segment)
  })

  // TODO: Wire to API in WS-3
  const startTranscription = useCallback(async () => {
    store.setTranscribing(true)
  }, [store])

  // TODO: Wire to API in WS-3
  const stopTranscription = useCallback(async () => {
    store.setTranscribing(false)
    store.setPartial("")
  }, [store])

  return {
    ...store,
    startTranscription,
    stopTranscription,
  }
}
