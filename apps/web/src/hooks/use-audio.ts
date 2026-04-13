import { useCallback } from "react"
import { useAudioStore } from "@/stores"
import { useTauriEvent } from "./use-tauri-event"
import type { DeviceInfo, AudioLevel } from "@/types"

export function useAudio() {
  const store = useAudioStore()

  useTauriEvent<AudioLevel>("audio_level", (level) => {
    store.setLevel(level)
  })

  // TODO: Wire to API in WS-3
  const loadDevices = useCallback(async () => {
    const devices: DeviceInfo[] = [] // stub
    store.setDevices(devices)
    return devices
  }, [store])

  // TODO: Wire to API in WS-3
  const startCapture = useCallback(
    async (_deviceId?: string | null) => {
      store.setCapturing(true)
    },
    [store]
  )

  // TODO: Wire to API in WS-3
  const stopCapture = useCallback(async () => {
    store.setCapturing(false)
    store.setLevel({ rms: 0, peak: 0 })
  }, [store])

  // TODO: Wire to API in WS-3
  const setGain = useCallback(
    async (gain: number) => {
      store.setGain(gain)
    },
    [store]
  )

  return {
    ...store,
    loadDevices,
    startCapture,
    stopCapture,
    setGain,
  }
}
