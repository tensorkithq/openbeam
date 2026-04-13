import { useDetectionStore } from "@/stores"
import type { DetectionResult } from "@/types"

// TODO: Wire to API in WS-3

async function detectVerses(_text: string) {
  const results: DetectionResult[] = [] // stub
  if (results.length > 0) {
    useDetectionStore.getState().addDetections(results)
  }
  return results
}

async function getDetectionStatus() {
  return { has_direct: false, has_semantic: false, has_cloud: false } // stub
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
