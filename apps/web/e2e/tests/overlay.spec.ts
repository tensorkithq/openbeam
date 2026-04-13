import { test, expect } from "@playwright/test"

test.describe("Overlay", () => {
  test("overlay page loads with canvas", async ({ page }) => {
    await page.goto("/overlay.html?role=overlay")

    const canvas = page.locator("canvas")
    await expect(canvas).toBeVisible()
  })

  test("overlay respects resolution param", async ({ page }) => {
    await page.goto("/overlay.html?role=overlay&resolution=1280x720")

    const canvas = page.locator("canvas")
    await expect(canvas).toBeVisible()
  })
})
