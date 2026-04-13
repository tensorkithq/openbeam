import { useCallback } from "react"
import { useTranscriptStore } from "@/stores"
import { useSettingsStore } from "@/stores/settings-store"
import { getManager } from "@/streams/setup"
import { useAudio } from "./use-audio"

export function useTranscription() {
  const store = useTranscriptStore()
  const { startCapture, stopCapture } = useAudio()

  const startTranscription = useCallback(async () => {
    const settings = useSettingsStore.getState()

    if (!settings.deepgramApiKey) {
      throw new Error("No Deepgram API key")
    }

    // Start audio capture first — mic data flows via worklet to the socket
    await startCapture(settings.audioDeviceId)

    store.setTranscribing(true)
    store.setConnectionStatus("connecting")
    getManager()?.transcription.connect({ key: settings.deepgramApiKey })
  }, [store, startCapture])

  const stopTranscription = useCallback(async () => {
    await stopCapture()
    store.setTranscribing(false)
    store.setPartial("")
    getManager()?.transcription.disconnect()
  }, [store, stopCapture])

  return {
    ...store,
    startTranscription,
    stopTranscription,
  }
}
