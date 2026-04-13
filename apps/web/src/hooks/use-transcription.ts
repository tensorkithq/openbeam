import { useCallback, useEffect, useRef } from "react"
import { useTranscriptStore } from "@/stores"
import { useSettingsStore } from "@/stores/settings-store"
import { transcriptionSocket } from "@/services"

export function useTranscription() {
  const store = useTranscriptStore()
  const cleanups = useRef<(() => void)[]>([])

  // Wire WebSocket transcript events to store
  useEffect(() => {
    const offPartial = transcriptionSocket.on("transcript:partial", (_, data) => {
      const payload = data as { text: string }
      store.setPartial(payload.text)
    })

    const offFinal = transcriptionSocket.on("transcript:final", (_, data) => {
      const payload = data as {
        text: string
        confidence: number
        words: { text: string; start: number; end: number; confidence: number; punctuated: string }[]
      }
      const segment = {
        id: crypto.randomUUID(),
        text: payload.text,
        is_final: true,
        confidence: payload.confidence,
        words: payload.words ?? [],
        timestamp: Date.now(),
      }
      store.addSegment(segment)
    })

    const offConnected = transcriptionSocket.on("_connected", () => {
      store.setConnectionStatus("connected")
    })

    const offDisconnected = transcriptionSocket.on("_disconnected", () => {
      store.setConnectionStatus("disconnected")
    })

    const offError = transcriptionSocket.on("transcript:error", (_, data) => {
      const payload = data as { message: string }
      console.error("[transcription] error:", payload.message)
      store.setConnectionStatus("error")
    })

    cleanups.current = [offPartial, offFinal, offConnected, offDisconnected, offError]

    return () => {
      cleanups.current.forEach((fn) => fn())
      cleanups.current = []
    }
  }, [store])

  const startTranscription = useCallback(async () => {
    store.setTranscribing(true)
    store.setConnectionStatus("connecting")
    transcriptionSocket.connect()

    // Send API key so the backend can authenticate with the STT provider
    const apiKey = useSettingsStore.getState().deepgramApiKey
    if (apiKey) {
      transcriptionSocket.send("auth", { apiKey })
    }
  }, [store])

  const stopTranscription = useCallback(async () => {
    store.setTranscribing(false)
    store.setPartial("")
    transcriptionSocket.disconnect()
  }, [store])

  return {
    ...store,
    startTranscription,
    stopTranscription,
  }
}
