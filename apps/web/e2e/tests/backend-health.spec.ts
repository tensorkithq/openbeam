import { test, expect } from "@playwright/test"

const HEALTH = "**/api/health"

test.describe("Backend health", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("openbeam:settings", JSON.stringify({
        deepgramApiKey: "test-key-for-e2e",
        onboardingComplete: true,
      }))
      localStorage.setItem("onboardingComplete", "true")
    })
  })

  test("shows a persistent toast while the server is unreachable", async ({ page }) => {
    await page.route(HEALTH, (route) => route.abort("connectionrefused"))
    await page.goto("/")
    await expect(page.getByText("Can't reach the OpenBeam server")).toBeVisible({ timeout: 10000 })
  })

  test("shows nothing when the server is healthy", async ({ page }) => {
    await page.route(HEALTH, (route) =>
      route.fulfill({ json: { status: "ok", service: "openbeam", version: "test" } }),
    )
    await page.goto("/")
    await expect(page.locator("[data-slot='transcript-panel']")).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("Can't reach the OpenBeam server")).toHaveCount(0)
  })

  test("a hung server counts as unreachable", async ({ page }) => {
    // Never respond: the probe must give up on its own deadline.
    await page.route(HEALTH, () => new Promise(() => {}))
    await page.goto("/")
    await expect(page.getByText("Can't reach the OpenBeam server")).toBeVisible({ timeout: 15000 })
  })
})
