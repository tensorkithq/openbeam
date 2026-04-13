import { useDetectionStore } from "@/stores"
import { api } from "@/services"

async function detectVerses(text: string) {
  const results = await api.detectVerses(text)
  if (results.length > 0) {
    useDetectionStore.getState().addDetections(results)
  }
  return results
}

async function getDetectionStatus() {
  return api.detectionStatus()
}

export const detectionActions = {
  detectVerses,
  getDetectionStatus,
  clearDetections: () => useDetectionStore.getState().clearDetections(),
  removeDetection: (verseRef: string) =>
    useDetectionStore.getState().removeDetection(verseRef),
}

export function useDetection() {
  const detections = useDetectionStore((s) => s.detections)
  const autoMode = useDetectionStore((s) => s.autoMode)
  const confidenceThreshold = useDetectionStore((s) => s.confidenceThreshold)

  return {
    detections,
    autoMode,
    confidenceThreshold,
    ...detectionActions,
  }
}
