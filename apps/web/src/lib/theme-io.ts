import type { BroadcastTheme } from "@/types"

/**
 * Themes travel as plain JSON. On import we check the shape closely enough
 * that the canvas renderer cannot hit undefined, then hand out a fresh id so
 * a re-imported file never collides with the theme it came from.
 */

const REQUIRED_SECTIONS = [
  "resolution",
  "background",
  "textBox",
  "verseText",
  "verseNumbers",
  "reference",
  "layout",
  "transition",
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateTheme(value: unknown, label: string): BroadcastTheme {
  if (!isRecord(value)) throw new Error(`${label}: expected an object`)
  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new Error(`${label}: missing "name"`)
  }
  for (const key of REQUIRED_SECTIONS) {
    if (!isRecord(value[key])) throw new Error(`${label}: missing "${key}" section`)
  }
  const resolution = value.resolution as Record<string, unknown>
  if (typeof resolution.width !== "number" || typeof resolution.height !== "number") {
    throw new Error(`${label}: "resolution" needs numeric width and height`)
  }
  return value as unknown as BroadcastTheme
}

/** Accepts one theme object or an array of them (the "Export All" shape). */
export function parseThemeFile(text: string): BroadcastTheme[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("File is not valid JSON")
  }
  const items = Array.isArray(data) ? data : [data]
  if (items.length === 0) throw new Error("File contains no themes")
  return items.map((item, i) => validateTheme(item, items.length > 1 ? `Theme ${i + 1}` : "Theme"))
}

/** Strip runtime identity so the file is safe to share and re-import. */
export function serializeThemes(themes: BroadcastTheme[]): string {
  const clean = themes.map(({ id: _id, builtin: _builtin, pinned: _pinned, ...rest }) => rest)
  return JSON.stringify(clean.length === 1 ? clean[0] : clean, null, 2)
}

export function themeFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  return `${slug || "theme"}.openbeam-theme.json`
}

export function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
