import {
  type Observable,
  BehaviorSubject,
  combineLatest,
  merge,
  of,
  defer,
  from,
} from "rxjs"
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  tap,
  shareReplay,
  catchError,
} from "rxjs/operators"
import type { SemanticSearchResult } from "../types/detection"

const EMPTY: SemanticSearchResult[] = []

export interface SearchStreamConfig {
  /** User input query (push new values on each keystroke). */
  query$: Observable<string>
  /** Active translation ID (push when user changes translation). */
  translationId$: Observable<number>
  /** Client-side fuzzy search (Fuse.js). */
  fuseSearch: (
    query: string,
    translationId: number,
    limit: number,
  ) => Promise<SemanticSearchResult[]>
  /** Server-side full-text search. */
  ftsSearch: (
    query: string,
    translationId: number,
    limit: number,
  ) => Promise<SemanticSearchResult[]>
  /** Optional server-side semantic/vector search. */
  semanticSearch?: (
    query: string,
    limit: number,
  ) => Promise<SemanticSearchResult[]>
  /** Debounce delay in ms (default 280). */
  debounceMs?: number
  /** Minimum query length to trigger search (default 5). */
  minQueryLength?: number
}

export interface SearchStreams {
  /** Search results — emits [] when query is too short or no results. */
  results$: Observable<SemanticSearchResult[]>
  /** True while a search is in-flight. */
  isSearching$: Observable<boolean>
}

export function createSearchStream(config: SearchStreamConfig): SearchStreams {
  const {
    query$,
    translationId$,
    fuseSearch,
    ftsSearch,
    semanticSearch,
    debounceMs = 280,
    minQueryLength = 5,
  } = config

  const isSearching$ = new BehaviorSubject(false)

  const input$ = combineLatest([
    query$.pipe(map((q) => q.trim())),
    translationId$.pipe(distinctUntilChanged()),
  ])

  const searched$ = input$.pipe(
    filter(([query]) => query.length >= minQueryLength),
    debounceTime(debounceMs),
    tap(() => isSearching$.next(true)),
    switchMap(([query, translationId]) => {
      const strategies: Array<
        (q: string, tid: number) => Promise<SemanticSearchResult[]>
      > = [
        (q, tid) => fuseSearch(q, tid, 15),
        (q, tid) => ftsSearch(q, tid, 20),
      ]
      if (semanticSearch) {
        strategies.push((q) => semanticSearch(q, 10))
      }

      const tryStrategy = (
        index: number,
      ): Observable<SemanticSearchResult[]> => {
        if (index >= strategies.length) return of([])
        return defer(() => from(strategies[index](query, translationId))).pipe(
          catchError(() => of([] as SemanticSearchResult[])),
          switchMap((results) =>
            results.length > 0 ? of(results) : tryStrategy(index + 1),
          ),
        )
      }

      return tryStrategy(0)
    }),
    tap(() => isSearching$.next(false)),
    shareReplay(1),
  )

  const cleared$ = query$.pipe(
    map((q) => q.trim()),
    filter((q) => q.length < minQueryLength),
    tap(() => isSearching$.next(false)),
    map((): SemanticSearchResult[] => []),
  )

  const results$ = merge(searched$, cleared$)

  return {
    results$,
    isSearching$: isSearching$.asObservable(),
  }
}
