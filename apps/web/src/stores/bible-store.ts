import { create } from "zustand"
import type { Translation, Book, Verse, CrossReference } from "@/types"
import type { SemanticSearchResult } from "@/types/detection"

interface PendingNavigation {
  bookNumber: number
  chapter: number
  verse: number
}

interface BibleState {
  translations: Translation[]
  activeTranslationId: number
  books: Book[]
  searchResults: Verse[]
  semanticResults: SemanticSearchResult[]
  selectedVerse: Verse | null
  currentChapter: Verse[]
  crossReferences: CrossReference[]
  pendingNavigation: PendingNavigation | null

  setTranslations: (translations: Translation[]) => void
  setActiveTranslation: (id: number) => void
  setBooks: (books: Book[]) => void
  setSearchResults: (results: Verse[]) => void
  setSemanticResults: (results: SemanticSearchResult[]) => void
  selectVerse: (verse: Verse | null) => void
  setCurrentChapter: (verses: Verse[]) => void
  setCrossReferences: (refs: CrossReference[]) => void
  setPendingNavigation: (nav: PendingNavigation | null) => void
}

export const useBibleStore = create<BibleState>((set, get) => ({
  translations: [],
  activeTranslationId: 1,
  books: [],
  searchResults: [],
  semanticResults: [],
  selectedVerse: null,
  currentChapter: [],
  crossReferences: [],
  pendingNavigation: null,

  setTranslations: (translations) => set({ translations }),
  setActiveTranslation: (activeTranslationId) => set({ activeTranslationId }),
  setBooks: (books) => set({ books }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setSemanticResults: (semanticResults) => {
    const current = get().semanticResults
    if (current.length === 0 && semanticResults.length === 0) return
    if (current === semanticResults) return
    set({ semanticResults })
  },
  selectVerse: (selectedVerse) => set({ selectedVerse }),
  setCurrentChapter: (currentChapter) => set({ currentChapter }),
  setCrossReferences: (crossReferences) => set({ crossReferences }),
  setPendingNavigation: (pendingNavigation) => set({ pendingNavigation }),
}))
