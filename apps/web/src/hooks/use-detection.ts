import { useDetectionStore } from "@/stores"
import { useSettingsStore } from "@/stores/settings-store"
import { api } from "@/services"

async function detectVerses(text: string) {
  const results = await api.detectVerses(text)
  if (results.length > 0) {
    useDetectionStore.getState().addDetections(results)
  }
  return results
}

export const detectionActions = {
  detectVerses,
  clearDetections: () => useDetectionStore.getState().clearDetections(),
  removeDetection: (verseRef: string) =>
    useDetectionStore.getState().removeDetection(verseRef),
}

export function useDetection() {
  const detections = useDetectionStore((s) => s.detections)
  const autoMode = useSettingsStore((s) => s.autoMode)
  const confidenceThreshold = useSettingsStore((s) => s.confidenceThreshold)

  return {
    detections,
    autoMode,
    confidenceThreshold,
    ...detectionActions,
  }
}
