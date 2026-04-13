import { describe, it, expect } from "vitest"
import { firstValueFrom } from "rxjs"
import { take, toArray } from "rxjs/operators"
import { createTranscriptionStream } from "../transcription.stream"
import type { SocketLike } from "../../socket/socket-like"

function createMockSocket(): SocketLike & {
  simulateEvent: (type: string, data: unknown) => void
} {
  const handlers = new Map<string, Set<(type: string, data: unknown) => void>>()
  return {
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
      return () => {
        handlers.get(type)?.delete(handler)
      }
    },
    simulateEvent(type, data) {
      handlers.get(type)?.forEach((h) => h(type, data))
    },
  }
}

describe("createTranscriptionStream", () => {
  it("emits partials from socket events", async () => {
    const socket = createMockSocket()
    const { partials$ } = createTranscriptionStream({ socket })

    const value = firstValueFrom(partials$)
    socket.simulateEvent("transcript:partial", { text: "hello" })
    expect(await value).toEqual({ text: "hello" })
  })

  it("emits finals with generated segment data", async () => {
    const socket = createMockSocket()
    const { finals$ } = createTranscriptionStream({ socket })

    const value = firstValueFrom(finals$)
    socket.simulateEvent("transcript:final", {
      text: "hello world",
      confidence: 0.95,
      words: [{ text: "hello", start: 0, end: 0.5, confidence: 0.9, punctuated: "Hello" }],
    })

    const segment = await value
    expect(segment.text).toBe("hello world")
    expect(segment.confidence).toBe(0.95)
    expect(segment.is_final).toBe(true)
    expect(segment.words).toHaveLength(1)
    expect(segment.id).toBeTruthy()
    expect(segment.timestamp).toBeGreaterThan(0)
  })

  it("emits connection status changes", async () => {
    const socket = createMockSocket()
    const { connectionStatus$ } = createTranscriptionStream({ socket })

    const statuses = firstValueFrom(
      connectionStatus$.pipe(take(3), toArray()),
    )

    socket.simulateEvent("_connected", {})
    socket.simulateEvent("_disconnected", {})

    expect(await statuses).toEqual(["disconnected", "connected", "disconnected"])
  })

  it("emits errors from socket", async () => {
    const socket = createMockSocket()
    const { errors$ } = createTranscriptionStream({ socket })

    const value = firstValueFrom(errors$)
    socket.simulateEvent("transcript:error", { message: "bad key" })
    expect(await value).toEqual({ message: "bad key" })
  })
})
