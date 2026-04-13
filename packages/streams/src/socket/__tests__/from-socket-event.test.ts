import { describe, it, expect, vi } from "vitest"
import { take, toArray } from "rxjs/operators"
import { firstValueFrom } from "rxjs"
import { fromSocketEvent } from "../from-socket-event"
import type { SocketLike } from "../socket-like"

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

describe("fromSocketEvent", () => {
  it("emits values when socket fires matching events", async () => {
    const socket = createMockSocket()
    const values = firstValueFrom(
      fromSocketEvent<{ text: string }>(socket, "test:event").pipe(
        take(2),
        toArray(),
      ),
    )

    socket.simulateEvent("test:event", { text: "hello" })
    socket.simulateEvent("test:event", { text: "world" })

    const result = await values
    expect(result).toEqual([{ text: "hello" }, { text: "world" }])
  })

  it("does not emit for non-matching event types", async () => {
    const socket = createMockSocket()
    const handler = vi.fn()

    const sub = fromSocketEvent(socket, "test:event").subscribe(handler)

    socket.simulateEvent("other:event", { text: "ignored" })
    expect(handler).not.toHaveBeenCalled()

    sub.unsubscribe()
  })

  it("unsubscribes from socket on observable unsubscribe", () => {
    const socket = createMockSocket()
    const handler = vi.fn()

    const sub = fromSocketEvent(socket, "test:event").subscribe(handler)
    socket.simulateEvent("test:event", "before")
    expect(handler).toHaveBeenCalledTimes(1)

    sub.unsubscribe()
    socket.simulateEvent("test:event", "after")
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
