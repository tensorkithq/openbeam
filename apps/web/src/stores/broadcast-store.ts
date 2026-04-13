import { create } from "zustand"
import type { BroadcastTheme, VerseRenderData } from "@/types"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import { overlaySocket } from "@/services"

const THEMES_KEY = "openbeam:themes"
const BROADCAST_SETTINGS_KEY = "openbeam:broadcast-settings"

function loadBroadcastSettings(): { activeThemeId?: string; altActiveThemeId?: string } {
  try {
    const raw = localStorage.getItem(BROADCAST_SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore corrupt storage
  }
  return {}
}

function persistBroadcastSettings(activeThemeId: string, altActiveThemeId: string) {
  try {
    localStorage.setItem(BROADCAST_SETTINGS_KEY, JSON.stringify({ activeThemeId, altActiveThemeId }))
  } catch {
    // ignore storage errors
  }
}

function emitTo(label: string, _event: string, payload: unknown) {
  overlaySocket.send("verse:update", { label, ...(payload as Record<string, unknown>) })
}

function loadThemesFromStorage(): BroadcastTheme[] {
  try {
    const raw = localStorage.getItem(THEMES_KEY)
    if (raw) {
      const custom = JSON.parse(raw) as BroadcastTheme[]
      // Merge: always use fresh builtins + persisted custom themes
      const customIds = new Set(custom.map((t) => t.id))
      return [
        ...BUILTIN_THEMES,
        ...custom.filter((t) => !t.builtin && !BUILTIN_THEMES.some((b) => b.id === t.id)),
      ]
    }
  } catch {
    // ignore corrupt storage
  }
  return [...BUILTIN_THEMES]
}

function persistThemes(themes: BroadcastTheme[]) {
  try {
    // Only persist custom (non-builtin) themes — builtins are always loaded fresh
    const custom = themes.filter((t) => !t.builtin)
    localStorage.setItem(THEMES_KEY, JSON.stringify(custom))
  } catch {
    // ignore storage errors
  }
}

type SelectedElement = "verse" | "reference" | null

interface BroadcastState {
  themes: BroadcastTheme[]
  activeThemeId: string
  altActiveThemeId: string
  isLive: boolean
  liveVerse: VerseRenderData | null

  // Designer state
  isDesignerOpen: boolean
  editingThemeId: string | null
  draftTheme: BroadcastTheme | null
  selectedElement: SelectedElement

  // Theme management
  loadThemes: () => void
  saveTheme: (theme: BroadcastTheme) => void
  deleteTheme: (id: string) => void
  duplicateTheme: (id: string) => void
  setActiveTheme: (id: string) => void
  setAltActiveTheme: (id: string) => void
  setLive: (live: boolean) => void
  setLiveVerse: (verse: VerseRenderData | null) => void
  syncBroadcastOutput: () => void
  syncBroadcastOutputFor: (outputId: string) => void

  // Designer actions
  setDesignerOpen: (open: boolean) => void
  startEditing: (themeId: string) => void
  updateDraft: (updates: Partial<BroadcastTheme>) => void
  updateDraftNested: (path: string, value: unknown) => void
  saveDraft: () => void
  discardDraft: () => void
  setSelectedElement: (el: SelectedElement) => void
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".")
  const isIndex = (key: string) => /^\d+$/.test(key)
  const result: Record<string, unknown> = Array.isArray(obj) ? [...obj] as unknown as Record<string, unknown> : { ...obj }

  let current: Record<string, unknown> | unknown[] = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const nextKey = keys[i + 1]
    const currentIndex = isIndex(key) ? Number(key) : key
    const existing = (current as Record<string, unknown> | unknown[])[currentIndex as keyof typeof current]
    const nextContainer = Array.isArray(existing)
      ? [...existing]
      : existing && typeof existing === "object"
        ? { ...(existing as Record<string, unknown>) }
        : isIndex(nextKey)
          ? []
          : {}

    ;(current as Record<string, unknown> | unknown[])[currentIndex as keyof typeof current] = nextContainer as never
    current = nextContainer as Record<string, unknown> | unknown[]
  }

  const lastKey = keys[keys.length - 1]
  const lastIndex = isIndex(lastKey) ? Number(lastKey) : lastKey
  ;(current as Record<string, unknown> | unknown[])[lastIndex as keyof typeof current] = value as never

  return result
}

const initialThemes = loadThemesFromStorage()
const savedBroadcast = loadBroadcastSettings()

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
  themes: initialThemes,
  activeThemeId: savedBroadcast.activeThemeId ?? BUILTIN_THEMES[0].id,
  altActiveThemeId: savedBroadcast.altActiveThemeId ?? BUILTIN_THEMES[0].id,
  isLive: false,
  liveVerse: null,
  isDesignerOpen: false,
  editingThemeId: null,
  draftTheme: null,
  selectedElement: null,

  loadThemes: () => {
    const themes = loadThemesFromStorage()
    set({ themes })
  },
  saveTheme: (theme) => {
    set((s) => {
      const themes = s.themes.some((t) => t.id === theme.id)
        ? s.themes.map((t) => (t.id === theme.id ? theme : t))
        : [...s.themes, theme]
      persistThemes(themes)
      return { themes }
    })
  },
  deleteTheme: (id) => {
    set((s) => {
      const themes = s.themes.filter((t) => t.id !== id || t.builtin)
      persistThemes(themes)
      return { themes }
    })
  },
  duplicateTheme: (id) => {
    const s = get()
    const source = s.themes.find((t) => t.id === id)
    if (!source) return
    const newTheme: BroadcastTheme = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} Copy`,
      builtin: false,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => {
      const themes = [...s.themes, newTheme]
      persistThemes(themes)
      return { themes }
    })
  },
  syncBroadcastOutputFor: (outputId: string) => {
    const s = get()
    const themeId = outputId === "alt" ? s.altActiveThemeId : s.activeThemeId
    const label = outputId === "alt" ? "broadcast-alt" : "broadcast"
    const theme = s.themes.find((t) => t.id === themeId) ?? s.themes[0]
    if (!theme) return

    emitTo(label, "broadcast:verse-update", {
      theme,
      verse: s.liveVerse,
    })
  },
  syncBroadcastOutput: () => {
    get().syncBroadcastOutputFor("main")
    get().syncBroadcastOutputFor("alt")
  },
  setActiveTheme: (activeThemeId) => {
    set({ activeThemeId })
    persistBroadcastSettings(activeThemeId, get().altActiveThemeId)
    get().syncBroadcastOutputFor("main")
  },
  setAltActiveTheme: (altActiveThemeId) => {
    set({ altActiveThemeId })
    persistBroadcastSettings(get().activeThemeId, altActiveThemeId)
    get().syncBroadcastOutputFor("alt")
  },
  setLive: (isLive) => set({ isLive }),
  setLiveVerse: (liveVerse) => {
    set({ liveVerse })
    get().syncBroadcastOutput()
  },

  // Designer
  setDesignerOpen: (isDesignerOpen) => {
    if (!isDesignerOpen) {
      set({ isDesignerOpen, editingThemeId: null, draftTheme: null, selectedElement: null })
    } else {
      set({ isDesignerOpen })
    }
  },
  startEditing: (themeId) => {
    const theme = get().themes.find((t) => t.id === themeId)
    if (!theme) return
    set({
      editingThemeId: themeId,
      draftTheme: { ...theme, updatedAt: Date.now() },
      selectedElement: null,
    })
  },
  updateDraft: (updates) =>
    set((s) => ({
      draftTheme: s.draftTheme ? { ...s.draftTheme, ...updates, updatedAt: Date.now() } : null,
    })),
  updateDraftNested: (path, value) =>
    set((s) => ({
      draftTheme: s.draftTheme
        ? (setNestedValue(s.draftTheme as unknown as Record<string, unknown>, path, value) as unknown as BroadcastTheme)
        : null,
    })),
  saveDraft: () => {
    const { draftTheme } = get()
    if (!draftTheme) return
    if (draftTheme.builtin) {
      const customTheme = {
        ...draftTheme,
        id: crypto.randomUUID(),
        name: `${draftTheme.name} (Custom)`,
        builtin: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      set((s) => {
        const themes = [...s.themes, customTheme]
        persistThemes(themes)
        return {
          themes,
          activeThemeId: customTheme.id,
          editingThemeId: customTheme.id,
          draftTheme: customTheme,
        }
      })
    } else {
      get().saveTheme(draftTheme)
    }
  },
  discardDraft: () => {
    const { editingThemeId } = get()
    if (editingThemeId) {
      get().startEditing(editingThemeId)
    }
  },
  setSelectedElement: (selectedElement) => set({ selectedElement }),
}))
