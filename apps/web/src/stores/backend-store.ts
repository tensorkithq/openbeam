import { create } from "zustand"
import type { HealthResponse } from "@/services/api"

interface BackendState {
  /** null until the first health probe answers */
  reachable: boolean | null
  capabilities: HealthResponse["capabilities"] | null
  setHealth: (health: HealthResponse | null) => void
}

export const useBackendStore = create<BackendState>((set) => ({
  reachable: null,
  capabilities: null,
  setHealth: (health) =>
    set({ reachable: health !== null, capabilities: health?.capabilities ?? null }),
}))
