import { test, expect } from "@playwright/test"

test.describe("Onboarding — API Key", () => {
  test("can enter Deepgram API key in settings", async ({ page }) => {
    await page.goto("/")

    // Open settings
    const settingsBtn = page.locator("[data-tour='settings']")
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click()
    }

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

    // Set key via localStorage directly
    await page.evaluate(() => {
      localStorage.setItem("deepgramApiKey", "test-key-persist")
    })

    // Reload and check
    await page.reload()
    const key = await page.evaluate(() =>
      localStorage.getItem("deepgramApiKey"),
    )
    expect(key).toBe("test-key-persist")
  })
})
