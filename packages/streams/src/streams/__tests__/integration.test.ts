import { describe, it, expect, vi } from "vitest"
import { firstValueFrom, Subject, BehaviorSubject } from "rxjs"
import { take, toArray, skip } from "rxjs/operators"
import { createTranscriptionStream } from "../transcription.stream"
import { createDetectionStream } from "../detection.stream"
import { createSearchStream } from "../search.stream"
import { createRemoteControlStream } from "../remote-control.stream"
import { createStatusSyncStream } from "../status-sync.stream"
import type { SocketLike, SendableSocketLike } from "../../socket/socket-like"
import type { DetectionResult } from "../../types/detection"

function createMockSocket(): SocketLike & SendableSocketLike & {
  simulateEvent: (type: string, data: unknown) => void
  sentMessages: Array<{ type: string; data?: Record<string, unknown> }>
} {
  const handlers = new Map<string, Set<(type: string, data: unknown) => void>>()
  const sentMessages: Array<{ type: string; data?: Record<string, unknown> }> = []
  return {
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
      return () => { handlers.get(type)?.delete(handler) }
    },
    send(type, data) {
      sentMessages.push({ type, data })
    },
    simulateEvent(type, data) {
      handlers.get(type)?.forEach((h) => h(type, data))
    },
    sentMessages,
  }
}

describe("transcription → detection pipeline", () => {
  it("forwards final transcripts to detection socket", async () => {
    const transcriptionSocket = createMockSocket()
    const detectionSocket = createMockSocket()

    const transcription = createTranscriptionStream({ socket: transcriptionSocket })
    const detection = createDetectionStream({
      transcriptFinals$: transcription.finals$,
      socket: detectionSocket,
      forwardSocket: detectionSocket,
    })

    // Subscribe to activate the pipeline
    const detectionPromise = firstValueFrom(detection.detections$)

    // Simulate a final transcript arriving
    transcriptionSocket.simulateEvent("transcript:final", {
      text: "The Lord is my shepherd",
      confidence: 0.92,
      words: [],
    })

    // Verify the text was forwarded to detection socket
    expect(detectionSocket.sentMessages).toHaveLength(1)
    expect(detectionSocket.sentMessages[0]).toEqual({
      type: "transcript:final",
      data: { text: "The Lord is my shepherd" },
    })

    // Now simulate detection results coming back
    const mockDetection: DetectionResult = {
      verse_ref: "Psalm 23:1",
      verse_text: "The LORD is my shepherd; I shall not want.",
      book_name: "Psalms",
      book_number: 19,
      chapter: 23,
      verse: 1,
      confidence: 0.95,
      source: "quotation",
      auto_queued: false,
      transcript_snippet: "The Lord is my shepherd",
    }
    detectionSocket.simulateEvent("detection:result", { data: [mockDetection] })

    const results = await detectionPromise
    expect(results).toHaveLength(1)
    expect(results[0].verse_ref).toBe("Psalm 23:1")
    expect(results[0].source).toBe("quotation")

    // Cleanup
    detection._forwardSubscription?.unsubscribe()
  })

  it("handles multiple finals in sequence", async () => {
    const transcriptionSocket = createMockSocket()
    const detectionSocket = createMockSocket()

    const transcription = createTranscriptionStream({ socket: transcriptionSocket })
    createDetectionStream({
      transcriptFinals$: transcription.finals$,
      socket: detectionSocket,
      forwardSocket: detectionSocket,
    })

    // Collect 3 finals
    const finalsPromise = firstValueFrom(
      transcription.finals$.pipe(take(3), toArray()),
    )

    transcriptionSocket.simulateEvent("transcript:final", { text: "first", confidence: 0.9, words: [] })
    transcriptionSocket.simulateEvent("transcript:final", { text: "second", confidence: 0.85, words: [] })
    transcriptionSocket.simulateEvent("transcript:final", { text: "third", confidence: 0.88, words: [] })

    const finals = await finalsPromise
    expect(finals).toHaveLength(3)
    expect(finals.map((f) => f.text)).toEqual(["first", "second", "third"])
    expect(detectionSocket.sentMessages).toHaveLength(3)
  })

  it("partials and finals are independent streams", async () => {
    const socket = createMockSocket()
    const { partials$, finals$ } = createTranscriptionStream({ socket })

    const partialSpy = vi.fn()
    const finalSpy = vi.fn()

    const sub1 = partials$.subscribe(partialSpy)
    const sub2 = finals$.subscribe(finalSpy)

    socket.simulateEvent("transcript:partial", { text: "hel" })
    socket.simulateEvent("transcript:partial", { text: "hello" })
    socket.simulateEvent("transcript:final", { text: "hello world", confidence: 0.9, words: [] })
    socket.simulateEvent("transcript:partial", { text: "the" })

    expect(partialSpy).toHaveBeenCalledTimes(3)
    expect(finalSpy).toHaveBeenCalledTimes(1)

    sub1.unsubscribe()
    sub2.unsubscribe()
  })

  it("detection stream filters out empty results", async () => {
    const detectionSocket = createMockSocket()
    const transcriptionSocket = createMockSocket()

    const transcription = createTranscriptionStream({ socket: transcriptionSocket })
    const detection = createDetectionStream({
      transcriptFinals$: transcription.finals$,
      socket: detectionSocket,
    })

    const spy = vi.fn()
    const sub = detection.detections$.subscribe(spy)

    detectionSocket.simulateEvent("detection:result", { data: [] })
    detectionSocket.simulateEvent("detection:result", { data: undefined })

    // Neither should emit (both are empty/falsy)
    expect(spy).not.toHaveBeenCalled()

    sub.unsubscribe()
  })
})

describe("search stream integration", () => {
  it("debounces rapid keystrokes and only searches once", async () => {
    const query$ = new Subject<string>()
    const translationId$ = new BehaviorSubject(1)
    const fuseSpy = vi.fn().mockResolvedValue([
      { verse_ref: "John 3:16", verse_text: "For God so loved", book_name: "John", book_number: 43, chapter: 3, verse: 16, similarity: 0.9 },
    ])

    const { results$ } = createSearchStream({
      query$,
      translationId$,
      fuseSearch: fuseSpy,
      ftsSearch: vi.fn().mockResolvedValue([]),
      debounceMs: 50, // Short for testing
    })

    // Collect results — skip any initial clears, take the first non-empty
    const resultPromise = firstValueFrom(
      results$.pipe(skip(0)),
    )

    // Rapid keystrokes — only last one should trigger search (all ≥5 chars)
    query$.next("for god")
    query$.next("for god so")
    query$.next("for god so loved")

    // Wait for debounce to fire
    await new Promise((r) => setTimeout(r, 80))

    const result = await resultPromise
    expect(result).toHaveLength(1)
    expect(result[0].verse_ref).toBe("John 3:16")

    // Fuse should only be called once (debounced)
    expect(fuseSpy).toHaveBeenCalledTimes(1)
    expect(fuseSpy).toHaveBeenCalledWith("for god so loved", 1, 15)
  })

  it("falls through to FTS when Fuse returns empty", async () => {
    const query$ = new Subject<string>()
    const translationId$ = new BehaviorSubject(1)
    const fuseSpy = vi.fn().mockResolvedValue([])
    const ftsSpy = vi.fn().mockResolvedValue([
      { verse_ref: "Rom 8:28", verse_text: "All things work together", book_name: "Romans", book_number: 45, chapter: 8, verse: 28, similarity: 0.7 },
    ])

    const { results$ } = createSearchStream({
      query$,
      translationId$,
      fuseSearch: fuseSpy,
      ftsSearch: ftsSpy,
      debounceMs: 10,
    })

    const resultPromise = firstValueFrom(results$)
    query$.next("all things work together")

    const result = await resultPromise
    expect(result).toHaveLength(1)
    expect(fuseSpy).toHaveBeenCalledTimes(1)
    expect(ftsSpy).toHaveBeenCalledTimes(1)
  })

  it("clears results when query is too short", async () => {
    const query$ = new Subject<string>()
    const translationId$ = new BehaviorSubject(1)

    const { results$ } = createSearchStream({
      query$,
      translationId$,
      fuseSearch: vi.fn().mockResolvedValue([]),
      ftsSearch: vi.fn().mockResolvedValue([]),
      debounceMs: 10,
      minQueryLength: 5,
    })

    const resultPromise = firstValueFrom(results$)
    query$.next("hi") // Too short

    const result = await resultPromise
    expect(result).toEqual([])
  })

  it("latest query wins when multiple fire", async () => {
    const query$ = new Subject<string>()
    const translationId$ = new BehaviorSubject(1)
    const calls: string[] = []

    const fuseSpy = vi.fn().mockImplementation((q: string) => {
      calls.push(q)
      return Promise.resolve([
        { verse_ref: `result-for-${q}`, verse_text: q, book_name: "Test", book_number: 1, chapter: 1, verse: 1, similarity: 0.9 },
      ])
    })

    const { results$ } = createSearchStream({
      query$,
      translationId$,
      fuseSearch: fuseSpy,
      ftsSearch: vi.fn().mockResolvedValue([]),
      debounceMs: 30,
    })

    const allResults: string[] = []
    const sub = results$.subscribe((r) => {
      if (r.length > 0) allResults.push(r[0].verse_ref)
    })

    // Send first query, wait for debounce, then send second
    query$.next("first query here")
    await new Promise((r) => setTimeout(r, 50))
    query$.next("second query here")
    await new Promise((r) => setTimeout(r, 50))

    // Both should have fired since they were spaced apart
    expect(calls).toContain("first query here")
    expect(calls).toContain("second query here")
    // Latest result should be present
    expect(allResults).toContain("result-for-second query here")

    sub.unsubscribe()
  })

  it("does not re-emit empty results on repeated short keystrokes", async () => {
    const query$ = new Subject<string>()
    const translationId$ = new BehaviorSubject(1)

    const { results$ } = createSearchStream({
      query$,
      translationId$,
      fuseSearch: vi.fn().mockResolvedValue([]),
      ftsSearch: vi.fn().mockResolvedValue([]),
      debounceMs: 10,
      minQueryLength: 5,
    })

    const emissions: unknown[] = []
    const sub = results$.subscribe((r) => emissions.push(r))

    // Multiple short keystrokes — should only emit [] once
    query$.next("hi")
    query$.next("hel")
    query$.next("he")
    query$.next("h")

    await new Promise((r) => setTimeout(r, 30))

    expect(emissions).toHaveLength(1)
    expect(emissions[0]).toEqual([])

    sub.unsubscribe()
  })

  it("does not double-search when translationId replays", async () => {
    const query$ = new Subject<string>()
    const translationId$ = new BehaviorSubject(1)
    const fuseSpy = vi.fn().mockResolvedValue([
      { verse_ref: "Gen 1:1", verse_text: "In the beginning", book_name: "Genesis", book_number: 1, chapter: 1, verse: 1, similarity: 0.9 },
    ])

    const { results$ } = createSearchStream({
      query$,
      translationId$,
      fuseSearch: fuseSpy,
      ftsSearch: vi.fn().mockResolvedValue([]),
      debounceMs: 20,
    })

    const sub = results$.subscribe(() => {})

    query$.next("in the beginning")
    await new Promise((r) => setTimeout(r, 50))

    // Should only call fuse once, not twice from BehaviorSubject replay
    expect(fuseSpy).toHaveBeenCalledTimes(1)

    sub.unsubscribe()
  })
})

describe("remote control stream", () => {
  it("maps all remote event types to typed commands", async () => {
    const socket = createMockSocket()
    const { commands$ } = createRemoteControlStream({ socket })

    const commandsPromise = firstValueFrom(commands$.pipe(take(6), toArray()))

    socket.simulateEvent("remote:next", {})
    socket.simulateEvent("remote:prev", {})
    socket.simulateEvent("remote:theme", { name: "Classic Dark" })
    socket.simulateEvent("remote:on_air", { active: true })
    socket.simulateEvent("remote:show_broadcast", {})
    socket.simulateEvent("remote:set_confidence", { value: 0.7 })

    const commands = await commandsPromise
    expect(commands).toEqual([
      { type: "next" },
      { type: "prev" },
      { type: "theme", name: "Classic Dark" },
      { type: "on_air", active: true },
      { type: "show_broadcast" },
      { type: "set_confidence", value: 0.7 },
    ])
  })

  it("filters out malformed payloads", () => {
    const socket = createMockSocket()
    const { commands$ } = createRemoteControlStream({ socket })

    const spy = vi.fn()
    const sub = commands$.subscribe(spy)

    // These should be filtered out — missing required fields
    socket.simulateEvent("remote:theme", {}) // no name
    socket.simulateEvent("remote:on_air", {}) // no active
    socket.simulateEvent("remote:set_confidence", { value: "not a number" }) // wrong type

    expect(spy).not.toHaveBeenCalled()

    // This should pass
    socket.simulateEvent("remote:next", {})
    expect(spy).toHaveBeenCalledTimes(1)

    sub.unsubscribe()
  })
})

describe("status sync stream", () => {
  it("polls at the configured interval", async () => {
    vi.useFakeTimers()

    const getSnapshot = vi.fn().mockReturnValue({
      on_air: true,
      active_theme: "Dark",
      live_verse: "John 3:16",
      queue_length: 3,
      confidence_threshold: 0.8,
    })
    const updateStatus = vi.fn().mockResolvedValue(undefined)

    const sync = createStatusSyncStream({
      getSnapshot,
      updateStatus,
      intervalMs: 1000,
    })

    // Advance 3 intervals
    await vi.advanceTimersByTimeAsync(3000)

    expect(updateStatus).toHaveBeenCalledTimes(3)
    expect(getSnapshot).toHaveBeenCalledTimes(3)
    expect(updateStatus).toHaveBeenCalledWith({
      on_air: true,
      active_theme: "Dark",
      live_verse: "John 3:16",
      queue_length: 3,
      confidence_threshold: 0.8,
    })

    sync.destroy()
    vi.useRealTimers()
  })

  it("stops polling after destroy", async () => {
    vi.useFakeTimers()

    const updateStatus = vi.fn().mockResolvedValue(undefined)
    const sync = createStatusSyncStream({
      getSnapshot: () => ({
        on_air: false,
        active_theme: null,
        live_verse: null,
        queue_length: 0,
        confidence_threshold: 0.8,
      }),
      updateStatus,
      intervalMs: 500,
    })

    await vi.advanceTimersByTimeAsync(1500) // 3 polls
    expect(updateStatus).toHaveBeenCalledTimes(3)

    sync.destroy()

    await vi.advanceTimersByTimeAsync(2000) // Should not poll anymore
    expect(updateStatus).toHaveBeenCalledTimes(3)

    vi.useRealTimers()
  })

  it("silently ignores update failures", async () => {
    vi.useFakeTimers()

    const updateStatus = vi.fn().mockRejectedValue(new Error("network error"))
    const sync = createStatusSyncStream({
      getSnapshot: () => ({
        on_air: false,
        active_theme: null,
        live_verse: null,
        queue_length: 0,
        confidence_threshold: 0.8,
      }),
      updateStatus,
      intervalMs: 500,
    })

    // Should not throw
    await vi.advanceTimersByTimeAsync(1500)
    expect(updateStatus).toHaveBeenCalledTimes(3)

    sync.destroy()
    vi.useRealTimers()
  })
})
