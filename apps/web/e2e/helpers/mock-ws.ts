import { Page } from "@playwright/test"

export interface MockMessage {
  type: string
  data?: unknown
  [key: string]: unknown
}

export async function mockWebSocket(
  page: Page,
  urlPattern: string,
  messages: MockMessage[] = [],
) {
  await page.addInitScript(
    (args) => {
      const { urlPattern, messages } = args as {
        urlPattern: string
        messages: MockMessage[]
      }
      const OriginalWebSocket = window.WebSocket

      class MockWebSocket extends EventTarget {
        url: string
        readyState = 1 // OPEN
        static OPEN = 1
        static CLOSED = 3

        constructor(url: string) {
          super()
          this.url = url

          if (url.includes(urlPattern)) {
            setTimeout(() => {
              this.readyState = 1
              this.dispatchEvent(new Event("open"))
              // Send queued mock messages
              for (const msg of messages) {
                setTimeout(() => {
                  const event = new MessageEvent("message", {
                    data: JSON.stringify(msg),
                  })
                  this.dispatchEvent(event)
                }, 100)
              }
            }, 50)
          } else {
            // Fall through to real WebSocket for non-matching URLs
            return new OriginalWebSocket(url) as unknown as MockWebSocket
          }
        }

        send(_data: string | ArrayBuffer) {
          /* no-op for mock */
        }
        close() {
          this.readyState = 3
        }
      }

      ;(window as unknown as Record<string, unknown>).WebSocket =
        MockWebSocket
    },
    { urlPattern, messages },
  )
}
