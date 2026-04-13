import { useBibleStore } from "@/stores"
import type { Translation, Book, Verse, CrossReference } from "@/types"
import type { SemanticSearchResult } from "@/types/detection"

// TODO: Wire to API in WS-3

async function loadTranslations() {
  const translations: Translation[] = [] // stub
  useBibleStore.getState().setTranslations(translations)
  return translations
}

async function loadBooks(_translationId?: number) {
  const books: Book[] = [] // stub
  useBibleStore.getState().setBooks(books)
  return books
}

async function loadChapter(
  _bookNumber: number,
  _chapter: number,
  _translationId?: number
) {
  const verses: Verse[] = [] // stub
  useBibleStore.getState().setCurrentChapter(verses)
  return verses
}

async function fetchVerse(
  _bookNumber: number,
  _chapter: number,
  _verse: number,
  _translationId?: number
): Promise<Verse | null> {
  return null // stub
}

async function searchVerses(
  _query: string,
  _limit = 20,
  _translationId?: number
) {
  const results: Verse[] = [] // stub
  useBibleStore.getState().setSearchResults(results)
  return results
}

async function semanticSearch(_query: string, _limit = 10) {
  const results: SemanticSearchResult[] = [] // stub
  useBibleStore.getState().setSemanticResults(results)
  return results
}

async function loadCrossReferences(
  _bookNumber: number,
  _chapter: number,
  _verse: number
) {
  const refs: CrossReference[] = [] // stub
  useBibleStore.getState().setCrossReferences(refs)
  return refs
}

export const bibleActions = {
  loadTranslations,
  loadBooks,
  loadChapter,
  fetchVerse,
  searchVerses,
  semanticSearch,
  loadCrossReferences,
  navigateToVerse: (bookNumber: number, chapter: number, verse: number) =>
    useBibleStore
      .getState()
      .setPendingNavigation({ bookNumber, chapter, verse }),
  selectVerse: (verse: Verse | null) =>
    useBibleStore.getState().selectVerse(verse),
}

export function useBible() {
  const translations = useBibleStore((s) => s.translations)
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)
  const books = useBibleStore((s) => s.books)
  const currentChapter = useBibleStore((s) => s.currentChapter)
  const searchResults = useBibleStore((s) => s.searchResults)
  const semanticResults = useBibleStore((s) => s.semanticResults)
  const selectedVerse = useBibleStore((s) => s.selectedVerse)
  const crossReferences = useBibleStore((s) => s.crossReferences)

  return {
    translations,
    activeTranslationId,
    books,
    currentChapter,
    searchResults,
    semanticResults,
    selectedVerse,
    crossReferences,
    ...bibleActions,
  }
}
