import type { Translation, Book, Verse, CrossReference } from "@/types"
import type { DetectionResult, SemanticSearchResult } from "@/types/detection"

const API_BASE = import.meta.env.VITE_API_URL ?? "" // Same origin in dev (Vite proxy), explicit URL in production

export interface StatusSnapshot {
  on_air: boolean
  active_theme: string | null
  live_verse: string | null
  queue_length: number
  confidence_threshold: number
}

export interface RemoteCommand {
  command: string
  value?: unknown
}

export interface VersesForSearchRow {
  book_number: number
  book_name: string
  chapter: number
  verse: number
  text: string
}

export const api = {
  // Bible
  listTranslations: (): Promise<Translation[]> =>
    get("/api/bible/translations"),

  listBooks: (translationId: number): Promise<Book[]> =>
    get(`/api/bible/books?translationId=${translationId}`),

  getChapter: (
    translationId: number,
    bookNumber: number,
    chapter: number,
  ): Promise<Verse[]> =>
    get(`/api/bible/chapter/${translationId}/${bookNumber}/${chapter}`),

  getVerse: (
    translationId: number,
    bookNumber: number,
    chapter: number,
    verse: number,
  ): Promise<Verse | null> =>
    get(
      `/api/bible/verse/${translationId}/${bookNumber}/${chapter}/${verse}`,
    ),

  getVerseById: (id: number): Promise<Verse | null> =>
    get(`/api/bible/verse/${id}`),

  searchVerses: (
    query: string,
    translationId: number,
    limit?: number,
  ): Promise<Verse[]> =>
    get(
      `/api/bible/search?q=${encodeURIComponent(query)}&translationId=${translationId}&limit=${limit ?? 50}`,
    ),

  getCrossReferences: (
    bookNumber: number,
    chapter: number,
    verse: number,
  ): Promise<CrossReference[]> =>
    get(`/api/bible/cross-references/${bookNumber}/${chapter}/${verse}`),

  getTranslationVersesForSearch: (
    translationId: number,
  ): Promise<VersesForSearchRow[]> =>
    get(`/api/bible/verses-for-search/${translationId}`),

  // Detection
  detectVerses: (text: string): Promise<DetectionResult[]> =>
    post("/api/detection/detect", { text }),

  detectionStatus: (): Promise<{
    has_direct: boolean
    has_semantic: boolean
    has_cloud: boolean
  }> => get("/api/detection/status"),

  semanticSearch: (
    query: string,
    k?: number,
  ): Promise<SemanticSearchResult[]> =>
    post("/api/detection/semantic", { query, k: k ?? 10 }),

  quotationSearch: (text: string): Promise<DetectionResult[]> =>
    post("/api/detection/quotation", { text }),

  // Remote control
  startOsc: (port: number): Promise<number> =>
    post("/api/remote/osc/start", { port }),

  stopOsc: (): Promise<void> => post("/api/remote/osc/stop", {}),

  getOscStatus: (): Promise<{ active: boolean; port?: number }> =>
    get("/api/remote/osc/status"),

  getRemoteStatus: (): Promise<StatusSnapshot> =>
    get("/api/remote/status"),

  updateRemoteStatus: (update: Partial<StatusSnapshot>): Promise<void> =>
    post("/api/remote/status", update),

  sendControlCommand: (cmd: RemoteCommand): Promise<{ success: boolean }> =>
    post("/api/v1/control", cmd),

  // Health
  health: (): Promise<{ status: string; service: string; version: string }> =>
    get("/api/health"),
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json()
}

export class ApiError extends Error {
  status: number
  body: string

  constructor(status: number, body: string) {
    super(`API error ${status}: ${body}`)
    this.status = status
    this.body = body
  }
}
