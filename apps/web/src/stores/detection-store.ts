import { create } from "zustand"
import type { DetectionResult } from "@/types"

interface DetectionState {
  detections: DetectionResult[]

  addDetections: (detections: DetectionResult[]) => void
  removeDetection: (verseRef: string) => void
  clearDetections: () => void
}

export const useDetectionStore = create<DetectionState>((set) => ({
  detections: [],

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
  removeDetection: (verseRef) =>
    set((state) => ({
      detections: state.detections.filter((d) => d.verse_ref !== verseRef),
    })),
  clearDetections: () => set({ detections: [] }),
}))
