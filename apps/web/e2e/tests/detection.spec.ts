import { test, expect } from "@playwright/test"
import { mockWebSocket } from "../helpers/mock-ws"
import detectionData from "../fixtures/detection-results.json"

test.describe("Detection", () => {
  test("shows detection results from mock WebSocket", async ({ page }) => {
    await mockWebSocket(page, "/ws/detection", detectionData)
    await page.goto("/")

    // The detections panel should exist
    const panel = page.locator("[data-slot='detections-panel']")
    await expect(panel).toBeVisible()
  })
})
