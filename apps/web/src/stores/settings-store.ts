import { create } from "zustand"
import { createId } from "@paralleldrive/cuid2"

const STORAGE_KEY = "openbeam:settings"
const KEY_STORAGE_KEY = "openbeam:deepgram-key"

interface SettingsState {
  sessionId: string
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

type PersistedSettings = Omit<
  SettingsState,
  | "deepgramApiKey"
  | "setDeepgramApiKey"
  | "setActiveTranslationId"
  | "setAudioDeviceId"
  | "setGain"
  | "setAutoMode"
  | "setConfidenceThreshold"
  | "setCooldownMs"
  | "setOnboardingComplete"
>

function loadSettingsFromStorage(): Partial<PersistedSettings> & {
  deepgramApiKey?: string
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore corrupt storage
  }
  return {}
}

function loadDeepgramKey(): string | null {
  try {
    return sessionStorage.getItem(KEY_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistSettings(state: SettingsState) {
  try {
    const payload: PersistedSettings = {
      sessionId: state.sessionId,
      activeTranslationId: state.activeTranslationId,
      audioDeviceId: state.audioDeviceId,
      gain: state.gain,
      autoMode: state.autoMode,
      confidenceThreshold: state.confidenceThreshold,
      cooldownMs: state.cooldownMs,
      onboardingComplete: state.onboardingComplete,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore storage errors
  }
}

function persistDeepgramKey(key: string | null) {
  try {
    if (key) {
      sessionStorage.setItem(KEY_STORAGE_KEY, key)
    } else {
      sessionStorage.removeItem(KEY_STORAGE_KEY)
    }
  } catch {
    // ignore storage errors
  }
}

const persisted = loadSettingsFromStorage()

// Migrate any previously persisted key out of localStorage into sessionStorage,
// then purge it from disk so cleartext copies aren't left behind.
const migratedKey = typeof persisted.deepgramApiKey === "string"
  ? persisted.deepgramApiKey
  : null
if (migratedKey) {
  persistDeepgramKey(migratedKey)
}
if ("deepgramApiKey" in persisted) {
  delete (persisted as { deepgramApiKey?: unknown }).deepgramApiKey
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
  } catch {
    // ignore storage errors
  }
}

const initialDeepgramKey = loadDeepgramKey() ?? migratedKey

export const useSettingsStore = create<SettingsState>((set, get) => ({
  sessionId: persisted.sessionId ?? createId(),
  deepgramApiKey: initialDeepgramKey,
  activeTranslationId: persisted.activeTranslationId ?? 1,
  audioDeviceId: persisted.audioDeviceId ?? null,
  gain: persisted.gain ?? 1.0,
  autoMode: persisted.autoMode ?? false,
  confidenceThreshold: persisted.confidenceThreshold ?? 0.8,
  cooldownMs: persisted.cooldownMs ?? 2500,
  onboardingComplete: persisted.onboardingComplete ?? false,

  setDeepgramApiKey: (deepgramApiKey) => {
    set({ deepgramApiKey })
    persistDeepgramKey(deepgramApiKey)
  },
  setActiveTranslationId: (activeTranslationId) => {
    set({ activeTranslationId })
    persistSettings(get())
  },
  setAudioDeviceId: (audioDeviceId) => {
    set({ audioDeviceId })
    persistSettings(get())
  },
  setGain: (gain) => {
    set({ gain })
    persistSettings(get())
  },
  setAutoMode: (autoMode) => {
    set({ autoMode })
    persistSettings(get())
  },
  setConfidenceThreshold: (confidenceThreshold) => {
    set({ confidenceThreshold })
    persistSettings(get())
  },
  setCooldownMs: (cooldownMs) => {
    set({ cooldownMs })
    persistSettings(get())
  },
  setOnboardingComplete: (onboardingComplete) => {
    set({ onboardingComplete })
    persistSettings(get())
  },
}))
