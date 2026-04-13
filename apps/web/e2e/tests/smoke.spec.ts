import { test, expect } from "@playwright/test"

test.describe("Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Seed settings so the API key prompt modal doesn't block the dashboard,
    // and skip the Joyride tutorial overlay
    await page.addInitScript(() => {
      localStorage.setItem("openbeam:settings", JSON.stringify({
        deepgramApiKey: "test-key-for-e2e",
        onboardingComplete: true,
      }))
      localStorage.setItem("onboardingComplete", "true")
    })
  })

  test("app loads without errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/")
    // Wait for React to render actual content inside #root
    await expect(page.locator("[data-slot='transcript-panel']")).toBeVisible({ timeout: 10000 })
    expect(errors).toEqual([])
  })

  test("dashboard grid renders", async ({ page }) => {
    await page.goto("/")
    // Wait for panels to render — these are the core dashboard slots
    await expect(page.locator("[data-slot='transcript-panel']")).toBeVisible({ timeout: 10000 })
    await expect(page.locator("[data-slot='detections-panel']")).toBeVisible()
    await expect(page.locator("[data-slot='search-panel']")).toBeVisible()
    await expect(page.locator("[data-slot='queue-panel']")).toBeVisible()
  })
})
