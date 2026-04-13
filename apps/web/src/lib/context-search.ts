import Fuse from "fuse.js"
import type { SemanticSearchResult } from "@/types/detection"

type VerseSearchRow = {
  book_number: number
  book_name: string
  chapter: number
  verse: number
  text: string
}

type ContextSearchDoc = SemanticSearchResult

const DEFAULT_LIMIT = 15
const MIN_SIMILARITY = 0.55

const fuseByTranslation = new Map<number, Fuse<ContextSearchDoc>>()

// TODO: Wire to API in WS-3
async function fetchVersesForSearch(_translationId: number): Promise<VerseSearchRow[]> {
  return []
}

function normalizeQuery(query: string) {
  return query
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

function rowToDoc(row: VerseSearchRow): ContextSearchDoc {
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

async function getFuseIndex(translationId: number): Promise<Fuse<ContextSearchDoc>> {
  const existing = fuseByTranslation.get(translationId)
  if (existing) return existing

  const rows = await fetchVersesForSearch(translationId)
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

function fuseScoreToSimilarity(score: number | undefined) {
  const clamped = Math.min(1, Math.max(0, score ?? 1))
  return Number((1 - clamped).toFixed(4))
}

export function clearContextSearchCache(translationId?: number) {
  if (translationId == null) {
    fuseByTranslation.clear()
    return
  }
  fuseByTranslation.delete(translationId)
}

export async function searchContextWithFuse(
  query: string,
  translationId: number,
  limit = DEFAULT_LIMIT
): Promise<SemanticSearchResult[]> {
  const normalized = normalizeQuery(query)
  if (normalized.length < 2) return []

  const fuse = await getFuseIndex(translationId)
  const hits = fuse.search(normalized, { limit })

  return hits
    .map(({ item, score }) => ({ ...item, similarity: fuseScoreToSimilarity(score) }))
    .filter((result) => result.similarity >= MIN_SIMILARITY)
}
