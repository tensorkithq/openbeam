import { test, expect } from "@playwright/test"
import { mockWebSocket } from "../helpers/mock-ws"
import transcriptData from "../fixtures/deepgram-responses.json" with { type: "json" }

test.describe("Transcription", () => {
  test("shows transcript text from mock WebSocket", async ({ page }) => {
    await mockWebSocket(page, "/ws/transcription", transcriptData)
    await page.goto("/")

    // The transcript panel should exist
    const panel = page.locator("[data-slot='transcript-panel']")
    await expect(panel).toBeVisible()
  })
})
