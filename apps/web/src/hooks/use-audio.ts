import { useCallback, useRef } from "react"
import { useAudioStore } from "@/stores"
import { transcriptionSocket } from "@/services"
import type { DeviceInfo } from "@/types"

export function useAudio() {
  const store = useAudioStore()
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)

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

  const startCapture = useCallback(
    async (deviceId?: string | null) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      const audioContext = new AudioContext({ sampleRate: 16000 })
      await audioContext.audioWorklet.addModule("/audio-processor.js")

      const source = audioContext.createMediaStreamSource(stream)
      const gainNode = audioContext.createGain()
      gainNode.gain.value = store.gain

      const workletNode = new AudioWorkletNode(audioContext, "pcm-processor")

      workletNode.port.onmessage = (event) => {
        const { type } = event.data
        if (type === "audio") {
          transcriptionSocket.sendBinary(event.data.buffer)
        } else if (type === "level") {
          store.setLevel({ rms: event.data.rms, peak: event.data.peak })
        }
      }

      source.connect(gainNode)
      gainNode.connect(workletNode)
      // Connect to a silent destination so the worklet processes audio
      // without routing mic audio through speakers (avoids feedback)
      workletNode.connect(audioContext.createMediaStreamDestination())

      audioContextRef.current = audioContext
      streamRef.current = stream
      gainNodeRef.current = gainNode

      store.setCapturing(true)
    },
    [store],
  )

  const stopCapture = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close()
      audioContextRef.current = null
    }
    gainNodeRef.current = null
    store.setCapturing(false)
    store.setLevel({ rms: 0, peak: 0 })
  }, [store])

  const setGain = useCallback(
    (gain: number) => {
      store.setGain(gain)
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = gain
      }
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
