import { type Observable, type OperatorFunction, switchMap, defer, from, of } from "rxjs"
import { catchError } from "rxjs/operators"

/**
 * Tries async strategies in order, returning the first non-empty result.
 *
 * Combined with switchMap at the source level, this gives automatic
 * cancellation of in-flight chains when a new input arrives.
 */
export function fallbackChain<TInput, TResult>(
  ...strategies: Array<(input: TInput) => Promise<TResult[]>>
): OperatorFunction<TInput, TResult[]> {
  return (source$: Observable<TInput>) =>
    source$.pipe(
      switchMap((input) => {
        const tryStrategy = (index: number): Observable<TResult[]> => {
          if (index >= strategies.length) return of([])
          return defer(() => from(strategies[index](input))).pipe(
            catchError(() => of([] as TResult[])),
            switchMap((results) =>
              results.length > 0 ? of(results) : tryStrategy(index + 1),
            ),
          )
        }
        return tryStrategy(0)
      }),
    )
}
