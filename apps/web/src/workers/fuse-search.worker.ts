import Fuse from "fuse.js"

interface VerseSearchRow {
  book_number: number
  book_name: string
  chapter: number
  verse: number
  text: string
}

interface SearchDoc {
  verse_ref: string
  verse_text: string
  book_name: string
  book_number: number
  chapter: number
  verse: number
  similarity: number
}

type WorkerRequest =
  | { type: "build-index"; id: number; translationId: number; apiBase: string }
  | { type: "search"; id: number; query: string; translationId: number; limit: number; apiBase: string }

const fuseByTranslation = new Map<number, Fuse<SearchDoc>>()
const MIN_SIMILARITY = 0.55

function rowToDoc(row: VerseSearchRow): SearchDoc {
  return {
    verse_ref: `${row.book_name} ${row.chapter}:${row.verse}`,
    verse_text: row.text,
    book_name: row.book_name,
    book_number: row.book_number,
    chapter: row.chapter,
    verse: row.verse,
    similarity: 0,
  }
}

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim()
}

function fuseScoreToSimilarity(score: number | undefined): number {
  const clamped = Math.min(1, Math.max(0, score ?? 1))
  return Number((1 - clamped).toFixed(4))
}

async function fetchVersesForSearch(apiBase: string, translationId: number): Promise<VerseSearchRow[]> {
  const res = await fetch(`${apiBase}/api/bible/verses-for-search/${translationId}`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

async function getOrBuildIndex(apiBase: string, translationId: number): Promise<Fuse<SearchDoc>> {
  const existing = fuseByTranslation.get(translationId)
  if (existing) return existing

  const rows = await fetchVersesForSearch(apiBase, translationId)
  const docs = rows.map(rowToDoc)

  const fuse = new Fuse(docs, {
    includeScore: true,
    shouldSort: true,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: "verse_text", weight: 0.92 },
      { name: "book_name", weight: 0.08 },
    ],
  })

  fuseByTranslation.set(translationId, fuse)
  return fuse
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    if (msg.type === "build-index") {
      await getOrBuildIndex(msg.apiBase, msg.translationId)
      self.postMessage({ type: "index-ready", id: msg.id, translationId: msg.translationId })
    } else if (msg.type === "search") {
      const fuse = await getOrBuildIndex(msg.apiBase, msg.translationId)
      const normalized = normalizeQuery(msg.query)
      if (normalized.length < 2) {
        self.postMessage({ type: "search-result", id: msg.id, results: [] })
        return
      }
      const hits = fuse.search(normalized, { limit: msg.limit })
      const results = hits
        .map(({ item, score }) => ({ ...item, similarity: fuseScoreToSimilarity(score) }))
        .filter((r) => r.similarity >= MIN_SIMILARITY)
      self.postMessage({ type: "search-result", id: msg.id, results })
    }
  } catch (err) {
    self.postMessage({
      type: "error",
      id: msg.id,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
