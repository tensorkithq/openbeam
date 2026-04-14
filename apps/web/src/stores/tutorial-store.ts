import { create } from "zustand"
import { useSettingsStore } from "./settings-store"

interface TutorialState {
  isRunning: boolean
  startTutorial: () => void
  stopTutorial: () => void
}

export const useTutorialStore = create<TutorialState>((set) => ({
  isRunning: false,
  startTutorial: () => set({ isRunning: true }),
  stopTutorial: () => set({ isRunning: false }),
}))

/** Mark onboarding complete in the single source of truth (settings store). */
export function persistOnboardingComplete(): void {
  useSettingsStore.getState().setOnboardingComplete(true)
}
