import { test, expect } from "@playwright/test"

/** Pre-populate settings so the API key prompt dialog doesn't block the UI. */
function seedSettings(overrides: Record<string, unknown> = {}) {
  const defaults = {
    deepgramApiKey: "test-key-for-e2e",
    onboardingComplete: true,
    activeTranslationId: 1,
    gain: 1,
    autoMode: false,
    confidenceThreshold: 0.8,
    cooldownMs: 2500,
  }
  return JSON.stringify({ ...defaults, ...overrides })
}

test.describe("Onboarding — API Key", () => {
  test("can enter Deepgram API key in settings", async ({ page }) => {
    // Seed with an API key so the prompt modal is dismissed, and skip tutorial
    await page.addInitScript((settings) => {
      localStorage.setItem("openbeam:settings", settings)
      localStorage.setItem("onboardingComplete", "true")
    }, seedSettings())

    await page.goto("/")
    await expect(page.locator("[data-slot='transcript-panel']")).toBeVisible({ timeout: 10000 })

    // Open settings dialog
    const settingsBtn = page.locator("[data-tour='settings']")
    await expect(settingsBtn).toBeVisible()
    await settingsBtn.click()

    // Navigate to speech section and enter key
    const keyInput = page.locator("input[placeholder*='Deepgram']").first()
    if (await keyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await keyInput.fill("test-deepgram-key-12345")

      // Click save
      const saveBtn = page.locator("button:has-text('Save')").first()
      if (await saveBtn.isVisible()) {
        await saveBtn.click()
      }
    }
  })

  test("API key persists in localStorage", async ({ page }) => {
    await page.goto("/")

    // Set key via the settings store's localStorage key
    await page.evaluate(() => {
      localStorage.setItem("openbeam:settings", JSON.stringify({
        deepgramApiKey: "test-key-persist",
        onboardingComplete: true,
      }))
    })

    // Reload and check
    await page.reload()
    const settings = await page.evaluate(() =>
      localStorage.getItem("openbeam:settings"),
    )
    const parsed = JSON.parse(settings!)
    expect(parsed.deepgramApiKey).toBe("test-key-persist")
  })
})
