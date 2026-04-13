import { test, expect } from "@playwright/test"

test.describe("Smoke Tests", () => {
  test("app loads without errors", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    await page.goto("/")
    await expect(page.locator("#root")).toBeVisible()
    expect(errors).toEqual([])
  })

  test("dashboard grid renders", async ({ page }) => {
    await page.goto("/")
    // Transport bar, panels should be visible
    await expect(page.locator("text=OpenBeam").first()).toBeVisible()
  })
})
