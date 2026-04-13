import { useCallback } from "react"
import { useAudioStore } from "@/stores"
import type { DeviceInfo } from "@/types"

export function useAudio() {
  const store = useAudioStore()

  const loadDevices = useCallback(async () => {
    const mediaDevices = await navigator.mediaDevices.enumerateDevices()
    const audioInputs = mediaDevices.filter((d) => d.kind === "audioinput")
    const devices: DeviceInfo[] = audioInputs.map((d, i) => ({
      id: d.deviceId,
      name: d.label || `Microphone ${i + 1}`,
      sample_rate: 48000, // Browser default
      channels: 1,
      is_default: d.deviceId === "default",
    }))
    store.setDevices(devices)
    return devices
  }, [store])

  // Stub — Web Audio capture will be implemented in WS-7
  const startCapture = useCallback(
    async (_deviceId?: string | null) => {
      store.setCapturing(true)
    },
    [store],
  )

  // Stub — Web Audio capture will be implemented in WS-7
  const stopCapture = useCallback(async () => {
    store.setCapturing(false)
    store.setLevel({ rms: 0, peak: 0 })
  }, [store])

  const setGain = useCallback(
    async (gain: number) => {
      store.setGain(gain)
    },
    [store],
  )

  return {
    ...store,
    loadDevices,
    startCapture,
    stopCapture,
    setGain,
  }
}
