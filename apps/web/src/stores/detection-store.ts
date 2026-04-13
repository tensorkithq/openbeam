import { create } from "zustand"
import type { DetectionResult } from "@/types"

interface DetectionState {
  detections: DetectionResult[]
  autoMode: boolean
  confidenceThreshold: number

  addDetection: (detection: DetectionResult) => void
  addDetections: (detections: DetectionResult[]) => void
  setDetections: (detections: DetectionResult[]) => void
  removeDetection: (verseRef: string) => void
  clearDetections: () => void
  setAutoMode: (auto: boolean) => void
  setConfidenceThreshold: (threshold: number) => void
}

export const useDetectionStore = create<DetectionState>((set) => ({
  detections: [],
  autoMode: false,
  confidenceThreshold: 0.8,

  addDetection: (detection) =>
    set((state) => {
      const filtered = state.detections.filter(
        (d) => d.verse_ref !== detection.verse_ref || d.confidence > detection.confidence,
      )
      if (filtered.length < state.detections.length) {
        return { detections: [detection, ...filtered].slice(0, 50) }
      }
      if (state.detections.some((d) => d.verse_ref === detection.verse_ref)) {
        return state
      }
      return { detections: [detection, ...state.detections].slice(0, 50) }
    }),
  addDetections: (incoming) =>
    set((state) => {
      const map = new Map<string, DetectionResult>()
      for (const d of incoming) {
        const existing = map.get(d.verse_ref)
        if (!existing || d.confidence > existing.confidence) {
          map.set(d.verse_ref, d)
        }
      }
      for (const d of state.detections) {
        if (!map.has(d.verse_ref)) {
          map.set(d.verse_ref, d)
        }
      }
      return { detections: [...map.values()].slice(0, 50) }
    }),
  setDetections: (detections) => set({ detections }),
  removeDetection: (verseRef) =>
    set((state) => ({
      detections: state.detections.filter((d) => d.verse_ref !== verseRef),
    })),
  clearDetections: () => set({ detections: [] }),
  setAutoMode: (autoMode) => set({ autoMode }),
  setConfidenceThreshold: (confidenceThreshold) =>
    set({ confidenceThreshold }),
}))
