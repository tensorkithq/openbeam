import { describe, it, expect } from "vitest"
import { of, firstValueFrom } from "rxjs"
import { fallbackChain } from "../fallback-chain"

describe("fallbackChain", () => {
  it("returns first non-empty result", async () => {
    const result = await firstValueFrom(
      of("query").pipe(
        fallbackChain(
          () => Promise.resolve([]),
          () => Promise.resolve([{ id: 1 }, { id: 2 }]),
          () => Promise.resolve([{ id: 99 }]),
        ),
      ),
    )
    expect(result).toEqual([{ id: 1 }, { id: 2 }])
  })

  it("returns empty when all strategies return empty", async () => {
    const result = await firstValueFrom(
      of("query").pipe(
        fallbackChain(
          () => Promise.resolve([]),
          () => Promise.resolve([]),
        ),
      ),
    )
    expect(result).toEqual([])
  })

  it("returns first strategy result when non-empty", async () => {
    const result = await firstValueFrom(
      of("query").pipe(
        fallbackChain(
          () => Promise.resolve([{ id: 1 }]),
          () => Promise.resolve([{ id: 2 }]),
        ),
      ),
    )
    expect(result).toEqual([{ id: 1 }])
  })

  it("falls through on error to next strategy", async () => {
    const result = await firstValueFrom(
      of("query").pipe(
        fallbackChain(
          () => Promise.reject(new Error("fail")),
          () => Promise.resolve([{ id: 2 }]),
        ),
      ),
    )
    expect(result).toEqual([{ id: 2 }])
  })

  it("returns empty when all strategies error", async () => {
    const result = await firstValueFrom(
      of("query").pipe(
        fallbackChain(
          () => Promise.reject(new Error("fail1")),
          () => Promise.reject(new Error("fail2")),
        ),
      ),
    )
    expect(result).toEqual([])
  })
})
