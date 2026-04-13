import { create } from "zustand"

const STORAGE_KEY = "openbeam:settings"

interface SettingsState {
  deepgramApiKey: string | null
  activeTranslationId: number
  audioDeviceId: string | null
  gain: number
  autoMode: boolean
  confidenceThreshold: number
  cooldownMs: number
  onboardingComplete: boolean

  setDeepgramApiKey: (key: string | null) => void
  setActiveTranslationId: (id: number) => void
  setAudioDeviceId: (id: string | null) => void
  setGain: (gain: number) => void
  setAutoMode: (auto: boolean) => void
  setConfidenceThreshold: (threshold: number) => void
  setCooldownMs: (ms: number) => void
  setOnboardingComplete: (complete: boolean) => void
}

function loadFromStorage(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore corrupt storage
  }
  return {}
}

function persistToStorage(state: SettingsState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        deepgramApiKey: state.deepgramApiKey,
        activeTranslationId: state.activeTranslationId,
        audioDeviceId: state.audioDeviceId,
        gain: state.gain,
        autoMode: state.autoMode,
        confidenceThreshold: state.confidenceThreshold,
        cooldownMs: state.cooldownMs,
        onboardingComplete: state.onboardingComplete,
      })
    )
  } catch {
    // ignore storage errors
  }
}

const persisted = loadFromStorage()

export const useSettingsStore = create<SettingsState>((set, get) => ({
  deepgramApiKey: persisted.deepgramApiKey ?? null,
  activeTranslationId: persisted.activeTranslationId ?? 1,
  audioDeviceId: persisted.audioDeviceId ?? null,
  gain: persisted.gain ?? 1.0,
  autoMode: persisted.autoMode ?? false,
  confidenceThreshold: persisted.confidenceThreshold ?? 0.8,
  cooldownMs: persisted.cooldownMs ?? 2500,
  onboardingComplete: persisted.onboardingComplete ?? false,

  setDeepgramApiKey: (deepgramApiKey) => {
    set({ deepgramApiKey })
    persistToStorage(get())
  },
  setActiveTranslationId: (activeTranslationId) => {
    set({ activeTranslationId })
    persistToStorage(get())
  },
  setAudioDeviceId: (audioDeviceId) => {
    set({ audioDeviceId })
    persistToStorage(get())
  },
  setGain: (gain) => {
    set({ gain })
    persistToStorage(get())
  },
  setAutoMode: (autoMode) => {
    set({ autoMode })
    persistToStorage(get())
  },
  setConfidenceThreshold: (confidenceThreshold) => {
    set({ confidenceThreshold })
    persistToStorage(get())
  },
  setCooldownMs: (cooldownMs) => {
    set({ cooldownMs })
    persistToStorage(get())
  },
  setOnboardingComplete: (onboardingComplete) => {
    set({ onboardingComplete })
    persistToStorage(get())
  },
}))
