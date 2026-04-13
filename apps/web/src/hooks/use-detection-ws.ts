import { useEffect } from "react"
import { detectionSocket } from "@/services"
import { useDetectionStore } from "@/stores/detection-store"
import type { DetectionResult } from "@/types"

export function useDetectionWebSocket() {
  useEffect(() => {
    detectionSocket.connect()

    const off = detectionSocket.on("detection:result", (_, data) => {
      const results = (data as { data: DetectionResult[] }).data
      if (results?.length) {
        useDetectionStore.getState().addDetections(results)
      }
    })

    return () => {
      off()
      detectionSocket.disconnect()
    }
  }, [])
}
