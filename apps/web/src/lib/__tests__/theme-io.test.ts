import { describe, it, expect } from "vitest"
import { parseThemeFile, serializeThemes, themeFileName } from "../theme-io"
import { BUILTIN_THEMES } from "../builtin-themes"

const base = BUILTIN_THEMES[0]

describe("theme-io", () => {
  it("round-trips a single theme without its identity fields", () => {
    const json = serializeThemes([base])
    const parsed = JSON.parse(json)
    expect(parsed.id).toBeUndefined()
    expect(parsed.builtin).toBeUndefined()
    expect(parsed.pinned).toBeUndefined()
    const [theme] = parseThemeFile(json)
    expect(theme.name).toBe(base.name)
    expect(theme.verseText.fontFamily).toBe(base.verseText.fontFamily)
  })

  it("accepts the export-all array shape", () => {
    const themes = parseThemeFile(serializeThemes([base, BUILTIN_THEMES[1] ?? base]))
    expect(themes).toHaveLength(2)
  })

  it("rejects non-JSON, empty arrays and missing sections", () => {
    expect(() => parseThemeFile("not json")).toThrow(/valid JSON/)
    expect(() => parseThemeFile("[]")).toThrow(/no themes/)
    expect(() => parseThemeFile(JSON.stringify({ name: "x" }))).toThrow(/missing "resolution"/)
    expect(() => parseThemeFile(JSON.stringify({ ...base, name: "  " }))).toThrow(/"name"/)
    const { verseText: _v, ...withoutVerseText } = base
    expect(() => parseThemeFile(JSON.stringify(withoutVerseText))).toThrow(/verseText/)
  })

  it("labels the failing item in a multi-theme file", () => {
    expect(() => parseThemeFile(JSON.stringify([base, { name: "broken" }]))).toThrow(/^Theme 2/)
  })

  it("builds a safe filename", () => {
    expect(themeFileName("Sunday Night / Worship!")).toBe("sunday-night-worship.openbeam-theme.json")
    expect(themeFileName("***")).toBe("theme.openbeam-theme.json")
  })
})
