// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useBackendHealth } from "../use-backend-health"
import { useBackendStore } from "@/stores/backend-store"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}))

import { toast } from "sonner"

function Probe() {
  useBackendHealth()
  return null
}

let root: Root
let container: HTMLDivElement
const fetchMock = vi.fn()
const healthy = {
  status: "ok",
  service: "openbeam",
  version: "test",
  capabilities: { bible: true, detection: { direct: true, semantic: false, quotation: true }, stt: true, overlay: true },
}
const okResponse = () => ({ ok: true, json: async () => healthy })

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function mount() {
  await act(async () => {
    root.render(<Probe />)
  })
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe("useBackendHealth", () => {
  it("raises a persistent toast when the probe fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    await mount()
    await flush()

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(useBackendStore.getState().reachable).toBe(false)
    expect(toast.error).toHaveBeenCalledWith(
      "Can't reach the OpenBeam server",
      expect.objectContaining({ id: "backend-unreachable", duration: Infinity }),
    )
  })

  it("treats a non-2xx as unreachable", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 })
    await mount()
    await flush()
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it("stays quiet while healthy and records capabilities", async () => {
    fetchMock.mockResolvedValue(okResponse())
    await mount()
    await flush()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(useBackendStore.getState().reachable).toBe(true)
    expect(useBackendStore.getState().capabilities?.detection.semantic).toBe(false)
  })

  it("gives up on a hung server after the request deadline", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        }),
    )
    await mount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_999)
    })
    expect(toast.error).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it("announces recovery once and retries faster while down", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("down"))
    fetchMock.mockResolvedValue(okResponse())
    await mount()
    await flush()
    expect(toast.error).toHaveBeenCalledTimes(1)

    // Down: next probe after 10s, not 30s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith(
      "Reconnected to the OpenBeam server",
      expect.objectContaining({ id: "backend-unreachable" }),
    )

    // Healthy again: next probe after 30s, and no second success toast.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it("dismisses the toast on unmount", async () => {
    fetchMock.mockRejectedValue(new TypeError("down"))
    await mount()
    await flush()
    await act(async () => root.unmount())
    expect(toast.dismiss).toHaveBeenCalledWith("backend-unreachable")
    root = createRoot(document.createElement("div")) // so afterEach has something to unmount
  })
})
