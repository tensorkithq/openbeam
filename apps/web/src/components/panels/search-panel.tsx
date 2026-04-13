import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { getAutocompleteSuggestion, getTabNavigationResult } from "@/lib/quick-search"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  BookOpenIcon,
  SparklesIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  PlusIcon,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useBible, bibleActions } from "@/hooks/use-bible"
import { useBibleStore, useQueueStore } from "@/stores"
import type { Book, Verse } from "@/types"
import { Input } from "@/components/ui/input"
import { searchContextWithFuse } from "@/lib/context-search"

type SearchTab = "book" | "context"

/** Highlights words from the query that appear in the text (like Logos AI). */
function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>

  const queryWords = new Set(
    query.toLowerCase().split(/\s+/).filter((w) => w.length >= 2)
  )
  if (queryWords.size === 0) return <>{text}</>

  const parts = text.split(/(\s+)/)
  return (
    <>
      {parts.map((part, i) => {
        const cleaned = part.toLowerCase().replace(/[^a-z']/g, "")
        if (cleaned.length >= 2 && queryWords.has(cleaned)) {
          return (
            <mark key={i} className="rounded-[2px] bg-primary/80 px-0.5 text-foreground">
              {part}
            </mark>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

export function SearchPanel() {
  const [activeTab, setActiveTab] = useState<SearchTab>("book")
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [chapter, setChapter] = useState(1)
  const [selectedVerseId, setSelectedVerseId] = useState<number | null>(null)
  const [_chapterInput, setChapterInput] = useState("")
  const [contextQuery, setContextQuery] = useState("")

  // EasyWorship-style autocomplete
  const [quickInput, setQuickInput] = useState("")
  const [showQuickVerses, setShowQuickVerses] = useState(false)
  const [quickVersesList, setQuickVersesList] = useState<Verse[]>([])

  const quickInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    translations,
    books,
    currentChapter,
    semanticResults,
    activeTranslationId,
    selectedVerse,
  } = useBible()

  const quickSuggestion = useMemo(
    () => getAutocompleteSuggestion(quickInput, books).suggestion,
    [quickInput, books]
  )

  const quickInputStyle = useMemo(
    () => quickSuggestion && quickSuggestion !== quickInput ? { caretColor: 'var(--foreground)' } : undefined,
    [quickSuggestion, quickInput]
  )

  const selectedBookNumber = selectedBook?.book_number

  // Load initial data
  useEffect(() => {
    bibleActions.loadTranslations().catch(console.error)
    bibleActions.loadBooks().catch(console.error)
  }, [])

  // Load chapter when book + chapter are set
  useEffect(() => {
    if (selectedBookNumber && chapter >= 1) {
      bibleActions.loadChapter(selectedBookNumber, chapter).catch(console.error)
    }
  }, [selectedBookNumber, chapter, activeTranslationId])

  const effectiveSelectedVerseId = useMemo(() => {
    if (!selectedVerseId || currentChapter.length === 0) return null
    if (currentChapter.some((v) => v.id === selectedVerseId)) return selectedVerseId
    if (!selectedVerse) return null
    return currentChapter.find((v) => v.verse === selectedVerse.verse)?.id ?? null
  }, [currentChapter, selectedVerseId, selectedVerse])

  useEffect(() => {
    if (!selectedVerseId || !selectedVerse || currentChapter.length === 0) return
    const stillExists = currentChapter.some((v) => v.id === selectedVerseId)
    if (!stillExists) {
      const match = currentChapter.find((v) => v.verse === selectedVerse.verse)
      if (match && match.id !== selectedVerse.id) {
        bibleActions.selectVerse(match)
      }
    }
  }, [currentChapter, selectedVerseId, selectedVerse])

  const applyNavigationSelection = useCallback(
    (book: Book, navChapter: number) => {
      setActiveTab("book")
      setSelectedBook(book)
      setChapter(navChapter)
      setChapterInput("")
    },
    []
  )

  useEffect(() => {
    let lastHandledKey: string | null = null

    const unsubscribe = useBibleStore.subscribe((state) => {
      const pendingNavigation = state.pendingNavigation
      if (!pendingNavigation) {
        lastHandledKey = null
        return
      }

      const { bookNumber, chapter: navChapter, verse: navVerse } = pendingNavigation
      const pendingKey = `${bookNumber}:${navChapter}:${navVerse}`
      if (pendingKey === lastHandledKey) return

      const book = state.books.find((b) => b.book_number === bookNumber)
      if (!book) return

      lastHandledKey = pendingKey
      applyNavigationSelection(book, navChapter)

      bibleActions.loadChapter(bookNumber, navChapter).then((verses) => {
        const target = verses.find((v) => v.verse === navVerse)
        if (target) {
          setSelectedVerseId(target.id)
          bibleActions.selectVerse(target)
          document
            .getElementById(`verse-${target.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" })
        }
        panelRef.current?.focus()
      }).catch(console.error).finally(() => {
        useBibleStore.getState().setPendingNavigation(null)
      })
    })

    return unsubscribe
  }, [applyNavigationSelection])

  const handleVerseClick = useCallback((verse: Verse) => {
    setSelectedVerseId(verse.id)
    bibleActions.selectVerse(verse)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (chapter > 1) {
          setChapter((c) => c - 1)
          setChapterInput("")
          setSelectedVerseId(null)
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        setChapter((c) => c + 1)
        setChapterInput("")
        setSelectedVerseId(null)
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (currentChapter.length === 0) return
        const currentIdx = effectiveSelectedVerseId
          ? currentChapter.findIndex((v) => v.id === effectiveSelectedVerseId)
          : -1
        const nextIdx = Math.min(currentIdx + 1, currentChapter.length - 1)
        const next = currentChapter[nextIdx]
        if (next) {
          setSelectedVerseId(next.id)
          bibleActions.selectVerse(next)
          document
            .getElementById(`verse-${next.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (currentChapter.length === 0) return
        const currentIdx = effectiveSelectedVerseId
          ? currentChapter.findIndex((v) => v.id === effectiveSelectedVerseId)
          : currentChapter.length
        const prevIdx = Math.max(currentIdx - 1, 0)
        const prev = currentChapter[prevIdx]
        if (prev) {
          setSelectedVerseId(prev.id)
          bibleActions.selectVerse(prev)
          document
            .getElementById(`verse-${prev.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
        }
      }
    },
    [chapter, currentChapter, effectiveSelectedVerseId]
  )

  const contextDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contextSearchRequestIdRef = useRef(0)

  const runContextSearch = useCallback(async (query: string, translationId: number) => {
    const requestId = ++contextSearchRequestIdRef.current

    try {
      const fuseResults = await searchContextWithFuse(query, translationId, 15)
      if (requestId !== contextSearchRequestIdRef.current) return

      if (fuseResults.length > 0) {
        useBibleStore.getState().setSemanticResults(fuseResults)
        return
      }

      const ftsResults = await bibleActions.searchVerses(query, 20, translationId)
      if (requestId !== contextSearchRequestIdRef.current) return
      if (ftsResults.length > 0) {
        const mapped = ftsResults.slice(0, 15).map((v, idx) => ({
          verse_ref: `${v.book_name} ${v.chapter}:${v.verse}`,
          verse_text: v.text,
          book_name: v.book_name,
          book_number: v.book_number,
          chapter: v.chapter,
          verse: v.verse,
          similarity: Math.max(0.5, 0.72 - idx * 0.015),
        }))
        useBibleStore.getState().setSemanticResults(mapped)
        return
      }

      // TODO: Wire to API in WS-3 — semantic_search invoke replaced with stub
      const semanticResults: Array<{
        verse_ref: string
        verse_text: string
        book_name: string
        book_number: number
        chapter: number
        verse: number
        similarity: number
      }> = []
      if (requestId !== contextSearchRequestIdRef.current) return
      useBibleStore.getState().setSemanticResults(semanticResults)
    } catch (err) {
      console.warn("Context search failed:", err)
      if (requestId !== contextSearchRequestIdRef.current) return
      useBibleStore.getState().setSemanticResults([])
    }
  }, [])

  const handleContextSearch = useCallback((query: string) => {
    setContextQuery(query)
    if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
    if (query.length >= 5) {
      const translationId = useBibleStore.getState().activeTranslationId
      contextDebounceRef.current = setTimeout(() => {
        runContextSearch(query, translationId).catch(console.error)
      }, 280)
    } else {
      contextSearchRequestIdRef.current += 1
      useBibleStore.getState().setSemanticResults([])
    }
  }, [runContextSearch])

  useEffect(() => {
    if (activeTab !== "context" || contextQuery.length < 5) return
    if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
    contextDebounceRef.current = setTimeout(() => {
      runContextSearch(contextQuery, activeTranslationId).catch(console.error)
    }, 120)
  }, [activeTranslationId, activeTab, contextQuery, runContextSearch])

  useEffect(() => {
    return () => {
      if (contextDebounceRef.current) clearTimeout(contextDebounceRef.current)
    }
  }, [])

  // EasyWorship-style autocomplete logic
  useEffect(() => {
    const result = getAutocompleteSuggestion(quickInput, books)

    if (result.matchedBook && result.chapter && result.verse) {
      useBibleStore.getState().setPendingNavigation({
        bookNumber: result.matchedBook.book_number,
        chapter: result.chapter,
        verse: result.verse
      })
    }

    // TODO: Wire to API in WS-3 — invoke("get_chapter") replaced with stub
    if (result.stage === "chapter" && result.matchedBook && result.chapter) {
      bibleActions.loadChapter(result.matchedBook.book_number, result.chapter).then(verses => {
        setQuickVersesList(verses)
        setShowQuickVerses(true)
      }).catch(console.error)
    } else if (result.stage === "verse" && result.matchedBook && result.chapter) {
      bibleActions.loadChapter(result.matchedBook.book_number, result.chapter).then(verses => {
        setQuickVersesList(verses)
        setShowQuickVerses(true)
      }).catch(console.error)
    } else {
      queueMicrotask(() => setShowQuickVerses(false))
    }
  }, [quickInput, books, activeTranslationId])

  const handleQuickKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Tab" || e.key === "ArrowRight") && quickSuggestion && quickSuggestion !== quickInput) {
      e.preventDefault()
      const nextInput = getTabNavigationResult(quickInput, quickSuggestion)
      setQuickInput(nextInput)
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      setQuickInput("")
      setShowQuickVerses(false)
      return
    }

    if (e.key === "Escape") {
      e.preventDefault()
      setQuickInput("")
      setShowQuickVerses(false)
      return
    }
  }, [quickInput, quickSuggestion])

  const handleQuickVerseClick = useCallback((verse: Verse) => {
    useBibleStore.getState().setPendingNavigation({
      bookNumber: verse.book_number,
      chapter: verse.chapter,
      verse: verse.verse
    })
    setQuickInput("")
    setShowQuickVerses(false)
  }, [])

  // TODO: Wire to API in WS-3 — invoke("set_active_translation") replaced with direct store call
  const handleTranslationChange = useCallback(async (v: string) => {
    const id = Number(v)
    useBibleStore.getState().setActiveTranslation(id)
  }, [])

  return (
    <div
      ref={panelRef}
      data-slot="search-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card"
      onKeyDown={activeTab === "book" ? handleKeyDown : undefined}
      tabIndex={-1}
    >
      {/* STICKY: Tab row + search input */}
      <div className="flex shrink-0 items-center gap-0 border-b border-border min-h-11">
        <div className="flex items-center gap-1 px-3 py-1.5">

          <button
            data-tour="book-search"
            onClick={() => setActiveTab("book")}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              activeTab === "book"
                ? "border-primary/50 bg-primary/15"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <BookOpenIcon className={cn("size-3.5", activeTab === "book" ? "text-primary" : "text-muted-foreground")} />
            Book search
          </button>
          <button
            data-tour="context-search"
            onClick={() => {
              setActiveTab("context")
              setContextQuery("")
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              activeTab === "context"
                ? "border-primary/50 bg-primary/15"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            <SparklesIcon className={cn("size-3.5", activeTab === "context" ? "text-primary" : "text-muted-foreground")} />
            Context search
          </button>
        </div>

        {activeTab === "book" ? (
          <div className="flex flex-1 items-center gap-2 pr-3">
            <div className="relative flex-1">
              {quickSuggestion && quickSuggestion !== quickInput && (
                <div className="absolute inset-0 flex items-center px-3 pointer-events-none z-10">
                  <span className="text-xs font-normal">
                    <span className="text-foreground">{quickInput}</span>
                    <span className="text-muted-foreground">{quickSuggestion.slice(quickInput.length)}</span>
                  </span>
                </div>
              )}

              <Input
                ref={quickInputRef}
                data-tour="quick-nav"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyDown={handleQuickKeyDown}
                placeholder="Type: J → John 3:16"
                className={cn(
                  "h-7 text-xs relative bg-background",
                  quickSuggestion && quickSuggestion !== quickInput ? "text-transparent" : ""
                )}
                style={quickInputStyle}
              />

              {showQuickVerses && quickVersesList.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 max-h-64 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                  <div className="p-1">
                    {quickVersesList.map((verse) => (
                      <button
                        key={verse.id}
                        onClick={() => handleQuickVerseClick(verse)}
                        className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                      >
                        <span className="shrink-0 font-semibold text-primary w-6 text-right">
                          {verse.verse}
                        </span>
                        <span className="flex-1 text-muted-foreground line-clamp-1">
                          {verse.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Select
              value={String(activeTranslationId)}
              onValueChange={handleTranslationChange}
            >
              <SelectTrigger size="sm" className="h-7 w-[72px] shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {translations.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.abbreviation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2 pr-3">
            <Input
              placeholder="Search verse text..."
              value={contextQuery}
              onChange={(e) => handleContextSearch(e.target.value)}
              className="h-7 flex-1 text-xs"
            />
              <Select
                value={String(activeTranslationId)}
                onValueChange={handleTranslationChange}
              >
                <SelectTrigger size="sm" className="h-7 w-[72px] shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {translations.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.abbreviation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          </div>
        )}
      </div>



      {activeTab === "book" && (
        <>
          <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 min-h-9">
            {selectedBook ?
              <h3 className="text-sm font-semibold text-foreground">
                {selectedBook.name} {chapter}
              </h3> : null}
            {selectedBook ? <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  if (chapter > 1) {
                    setChapter((c) => c - 1)
                    setChapterInput("")
                    setSelectedVerseId(null)
                  }
                }}
                disabled={chapter <= 1}
              >
                <ArrowLeftIcon className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setChapter((c) => c + 1)
                  setChapterInput("")
                  setSelectedVerseId(null)
                }}
              >
                <ArrowRightIcon className="size-3" />
              </Button>
            </div> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-0 p-2">
              <TooltipProvider>
                {currentChapter.map((verse) => (
                  <div
                    key={verse.id}
                    id={`verse-${verse.id}`}
                    onClick={() => handleVerseClick(verse)}
                    className={cn(
                      "group flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors",
                      verse.id === effectiveSelectedVerseId
                        ? "border border-primary/50 bg-primary/10"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <span className="w-6 shrink-0 text-right text-sm font-semibold text-primary">
                      {verse.verse}
                    </span>
                    <p className="flex-1 text-sm leading-relaxed text-foreground/80">
                      {verse.text}
                    </p>
                    {verse.id === effectiveSelectedVerseId && (
                      <CheckIcon className="size-4 shrink-0 text-ai-direct" />
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className={cn(
                            "shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                            verse.id === effectiveSelectedVerseId
                              ? "hover:bg-primary/20 hover:text-primary"
                              : "bg-primary/40! text-primary-foreground hover:bg-primary!"
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            useQueueStore.getState().addItem({
                              id: crypto.randomUUID(),
                              verse,
                              reference: `${verse.book_name} ${verse.chapter}:${verse.verse}`,
                              confidence: 1,
                              source: "manual",
                              added_at: Date.now(),
                            })
                          }}
                        >
                          <PlusIcon className="size-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">Add to queue</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </TooltipProvider>
            </div>
          </div>
        </>
      )}

      {activeTab === "context" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-0 p-2">
            {contextQuery.length < 5 && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Search by meaning — type a phrase, paraphrase, or topic...
              </p>
            )}
            {contextQuery.length >= 5 && semanticResults.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No results found
              </p>
            )}
            <TooltipProvider>
              {semanticResults.map((result) => (
                <div
                  key={`${result.book_number}-${result.chapter}-${result.verse}`}
                  onClick={() => {
                    bibleActions.selectVerse({
                      id: 0,
                      translation_id: activeTranslationId,
                      book_number: result.book_number,
                      book_name: result.book_name,
                      book_abbreviation: "",
                      chapter: result.chapter,
                      verse: result.verse,
                      text: result.verse_text,
                    })
                  }}
                  className="group flex flex-col cursor-pointer gap-1 rounded-lg p-3 transition-colors hover:bg-muted/50 relative"
                >
                  <div className="flex shrink-0 flex-row items-start gap-2">
                    <span className="text-xs font-semibold ">
                      {result.book_name}   {result.chapter}:{result.verse}
                    </span>
                    <span
                      className="mt-0.5 text-[0.5rem] text-muted-foreground"
                    >
                      {Math.round(result.similarity * 100)}%
                    </span>
                  </div>
                  <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
                    <HighlightedText text={result.verse_text} query={contextQuery} />
                  </p>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground hover:bg-primary/80"
                        onClick={(e) => {
                          e.stopPropagation()
                          useQueueStore.getState().addItem({
                            id: crypto.randomUUID(),
                            verse: {
                              id: 0,
                              translation_id: activeTranslationId,
                              book_number: result.book_number,
                              book_name: result.book_name,
                              book_abbreviation: "",
                              chapter: result.chapter,
                              verse: result.verse,
                              text: result.verse_text,
                            },
                            reference: `${result.book_name} ${result.chapter}:${result.verse}`,
                            confidence: result.similarity,
                            source: "manual",
                            added_at: Date.now(),
                          })
                        }}
                      >
                        <PlusIcon className="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Add to queue</TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </TooltipProvider>
          </div>
        </div>
      )}
    </div>
  )
}
