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

// Replace tauri store with localStorage
const getOnboardingComplete = () => localStorage.getItem("onboardingComplete") === "true"
const setOnboardingComplete = (v: boolean) => localStorage.setItem("onboardingComplete", String(v))

/** Load onboardingComplete from localStorage into settings store. */
export async function hydrateOnboardingState(): Promise<void> {
  try {
    const completed = getOnboardingComplete()
    if (completed) {
      useSettingsStore.getState().setOnboardingComplete(true)
    }
  } catch {
    console.warn("[tutorial] Failed to load persisted state, using defaults")
  }
}

/** Write onboardingComplete=true to both Zustand and localStorage. */
export async function persistOnboardingComplete(): Promise<void> {
  useSettingsStore.getState().setOnboardingComplete(true)
  try {
    setOnboardingComplete(true)
  } catch {
    console.warn("[tutorial] Failed to persist onboarding state")
  }
}
