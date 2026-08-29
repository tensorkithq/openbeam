// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/streams/setup", () => ({ getManager: () => null }))

import { useBroadcastStore } from "../broadcast-store"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"

const store = () => useBroadcastStore.getState()
const defaultId = BUILTIN_THEMES[0].id

function addCustom(name = "Custom") {
  store().duplicateTheme(defaultId)
  const created = store().themes.at(-1)!
  store().renameTheme(created.id, name)
  return store().themes.find((t) => t.id === created.id)!
}

beforeEach(() => {
  localStorage.clear()
  useBroadcastStore.setState({
    themes: [...BUILTIN_THEMES],
    activeThemeId: defaultId,
    altActiveThemeId: defaultId,
    editingThemeId: null,
    draftTheme: null,
  })
})

describe("renameTheme", () => {
  it("renames a custom theme and persists it", () => {
    const theme = addCustom("Evening")
    expect(theme.name).toBe("Evening")
    const persisted = JSON.parse(localStorage.getItem("openbeam:themes")!)
    expect(persisted.map((t: { name: string }) => t.name)).toContain("Evening")
  })

  it("ignores blank names and built-in themes", () => {
    const theme = addCustom("Keep")
    store().renameTheme(theme.id, "   ")
    expect(store().themes.find((t) => t.id === theme.id)!.name).toBe("Keep")
    store().renameTheme(defaultId, "Hacked")
    expect(store().themes.find((t) => t.id === defaultId)!.name).toBe(BUILTIN_THEMES[0].name)
  })

  it("keeps the open draft in sync", () => {
    const theme = addCustom("Before")
    store().startEditing(theme.id)
    store().renameTheme(theme.id, "After")
    expect(store().draftTheme?.name).toBe("After")
  })
})

describe("deleteTheme", () => {
  it("resets any output using the theme to the default", () => {
    const theme = addCustom()
    store().setActiveTheme(theme.id)
    store().setAltActiveTheme(theme.id)
    store().deleteTheme(theme.id)
    expect(store().themes.some((t) => t.id === theme.id)).toBe(false)
    expect(store().activeThemeId).toBe(defaultId)
    expect(store().altActiveThemeId).toBe(defaultId)
    const settings = JSON.parse(localStorage.getItem("openbeam:broadcast-settings")!)
    expect(settings.activeThemeId).toBe(defaultId)
    expect(settings.altActiveThemeId).toBe(defaultId)
  })

  it("leaves outputs on other themes alone and clears an open draft", () => {
    const a = addCustom("A")
    const b = addCustom("B")
    store().setActiveTheme(a.id)
    store().startEditing(b.id)
    store().deleteTheme(b.id)
    expect(store().activeThemeId).toBe(a.id)
    expect(store().editingThemeId).toBeNull()
    expect(store().draftTheme).toBeNull()
  })

  it("never deletes a built-in theme", () => {
    store().deleteTheme(defaultId)
    expect(store().themes.some((t) => t.id === defaultId)).toBe(true)
  })
})

describe("importTheme", () => {
  it("assigns a fresh id and marks the theme custom", () => {
    const { id: _id, ...payload } = BUILTIN_THEMES[0]
    const imported = store().importTheme({ ...payload, id: "ignored", builtin: true, pinned: true })
    expect(imported.id).not.toBe("ignored")
    expect(imported.builtin).toBe(false)
    expect(imported.pinned).toBe(false)
    expect(store().themes.at(-1)?.id).toBe(imported.id)
    const persisted = JSON.parse(localStorage.getItem("openbeam:themes")!)
    expect(persisted).toHaveLength(1)
  })
})
