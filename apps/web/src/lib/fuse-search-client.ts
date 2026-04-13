import type { SemanticSearchResult } from "@openbeam/streams"

interface SearchResponse {
  type: "search-result"
  id: number
  results: SemanticSearchResult[]
}

interface IndexReadyResponse {
  type: "index-ready"
  id: number
  translationId: number
}

interface ErrorResponse {
  type: "error"
  id: number
  message: string
}

type WorkerResponse = SearchResponse | IndexReadyResponse | ErrorResponse

let worker: Worker | null = null
let requestId = 0
const pending = new Map<
  number,
  { resolve: (results: SemanticSearchResult[]) => void; reject: (err: Error) => void }
>()

function getApiBase(): string {
  return import.meta.env.VITE_API_URL ?? ""
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL("../workers/fuse-search.worker.ts", import.meta.url),
      { type: "module" },
    )
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.type === "error") {
        entry.reject(new Error(msg.message))
      } else if (msg.type === "search-result") {
        entry.resolve(msg.results)
      } else if (msg.type === "index-ready") {
        entry.resolve([])
      }
    }
    worker.onerror = (err) => {
      for (const [id, entry] of pending) {
        entry.reject(new Error(`Worker error: ${err.message}`))
        pending.delete(id)
      }
    }
  }
  return worker
}

export function searchContextWithFuse(
  query: string,
  translationId: number,
  limit = 15,
): Promise<SemanticSearchResult[]> {
  return new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject })
    getWorker().postMessage({
      type: "search",
      id,
      query,
      translationId,
      limit,
      apiBase: getApiBase(),
    })
  })
}

export function prefetchFuseIndex(translationId: number): void {
  const id = ++requestId
  // Fire-and-forget — we don't need to wait for the result
  pending.set(id, { resolve: () => pending.delete(id), reject: () => pending.delete(id) })
  getWorker().postMessage({
    type: "build-index",
    id,
    translationId,
    apiBase: getApiBase(),
  })
}

export function clearContextSearchCache(): void {
  if (worker) {
    worker.terminate()
    worker = null
    pending.clear()
  }
}
