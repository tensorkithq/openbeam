import { create } from "zustand"
import type { TranscriptSegment } from "@/types"

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

interface TranscriptState {
  segments: TranscriptSegment[]
  currentPartial: string
  isTranscribing: boolean
  connectionStatus: ConnectionStatus

  addSegment: (segment: TranscriptSegment) => void
  setPartial: (text: string) => void
  setTranscribing: (transcribing: boolean) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  clearTranscript: () => void
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  segments: [],
  currentPartial: "",
  isTranscribing: false,
  connectionStatus: "disconnected",

  addSegment: (segment) =>
    set((state) => ({
      segments: [...state.segments, segment],
      currentPartial: "",
    })),
  setPartial: (currentPartial) => set({ currentPartial }),
  setTranscribing: (isTranscribing) => set({ isTranscribing }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  clearTranscript: () => set({ segments: [], currentPartial: "" }),
}))
