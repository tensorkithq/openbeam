import { EMPTY, Subject, type Subscription, from, interval } from "rxjs"
import { catchError, switchMap, takeUntil, map } from "rxjs/operators"
import type { StatusSnapshot } from "../types/remote"

export interface StatusSyncStreamConfig {
  /** Returns the current status snapshot from app state. */
  getSnapshot: () => StatusSnapshot
  /** Sends the snapshot to the server. */
  updateStatus: (snapshot: StatusSnapshot) => Promise<void>
  /** Polling interval in ms (default 5000). */
  intervalMs?: number
}

export function createStatusSyncStream(config: StatusSyncStreamConfig): {
  subscription: Subscription
  destroy: () => void
} {
  const { getSnapshot, updateStatus, intervalMs = 5000 } = config
  const destroy$ = new Subject<void>()

  const subscription = interval(intervalMs)
    .pipe(
      takeUntil(destroy$),
      map(() => getSnapshot()),
      switchMap((snapshot) =>
        from(updateStatus(snapshot)).pipe(catchError(() => EMPTY)),
      ),
    )
    .subscribe()

  return {
    subscription,
    destroy: () => {
      destroy$.next()
      destroy$.complete()
    },
  }
}
