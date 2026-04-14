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

// One-time migration: move standalone key into settings store
try {
  const legacy = localStorage.getItem("onboardingComplete")
  if (legacy === "true") {
    useSettingsStore.getState().setOnboardingComplete(true)
    localStorage.removeItem("onboardingComplete")
  }
} catch {
  // ignore
}

/** Mark onboarding complete in the single source of truth (settings store). */
export function persistOnboardingComplete(): void {
  useSettingsStore.getState().setOnboardingComplete(true)
}
