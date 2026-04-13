import { Page, expect } from "@playwright/test"

/** Wait for the app shell to be ready (root element visible, no console errors). */
export async function waitForAppReady(page: Page) {
  await expect(page.locator("#root")).toBeVisible()
}

/** Collect page errors during a test. Returns the error array for assertions. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(err.message))
  return errors
}

/** Set a value in localStorage before the page loads. */
export async function setLocalStorage(
  page: Page,
  key: string,
  value: string,
) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value)
    },
    { key, value },
  )
}
