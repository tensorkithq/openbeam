import { merge, type Observable, type Subscription } from "rxjs"
import { distinctUntilChanged, filter, map, share, shareReplay, startWith } from "rxjs/operators"
import type { SocketLike, SendableSocketLike } from "../socket/socket-like"
import type { ConnectionStatus } from "../types/socket"
import type { DetectionResult } from "../types/detection"
import type { TranscriptSegment } from "../types/transcript"
import { fromSocketEvent } from "../socket/from-socket-event"

export interface DetectionStreamConfig {
  /** Finalized transcript segments (from transcription stream). */
  transcriptFinals$: Observable<TranscriptSegment>
  /** Detection WebSocket. */
  socket: SocketLike
  /** Socket to forward finals to (typically the same detection socket). Must support send(). */
  forwardSocket?: SendableSocketLike
}

export interface DetectionStreams {
  /** Batches of detected verses from the pipeline. */
  detections$: Observable<DetectionResult[]>
  /** Detection WebSocket connection lifecycle. */
  connectionStatus$: Observable<ConnectionStatus>
  /** Internal subscription forwarding finals — call .unsubscribe() on teardown. */
  _forwardSubscription: Subscription | null
}

export function createDetectionStream(
  config: DetectionStreamConfig,
): DetectionStreams {
  const { transcriptFinals$, socket, forwardSocket } = config

  // Forward finalized transcripts to the detection socket
  let forwardSub: Subscription | null = null
  if (forwardSocket) {
    forwardSub = transcriptFinals$.subscribe((segment) => {
      forwardSocket.send("transcript:final", { text: segment.text })
    })
  }

  const detections$ = fromSocketEvent<{
    data?: DetectionResult[]
  }>(socket, "detection:result").pipe(
    map((payload) => {
      if (Array.isArray(payload.data)) return payload.data
      if (Array.isArray(payload)) return payload as unknown as DetectionResult[]
      return []
    }),
    filter((results) => results.length > 0),
    share(),
  )

  const connectionStatus$ = merge(
    fromSocketEvent(socket, "_connected").pipe(
      map((): ConnectionStatus => "connected"),
    ),
    fromSocketEvent(socket, "_disconnected").pipe(
      map((): ConnectionStatus => "disconnected"),
    ),
  ).pipe(
    startWith("disconnected" as ConnectionStatus),
    distinctUntilChanged(),
    shareReplay(1),
  )

  return { detections$, connectionStatus$, _forwardSubscription: forwardSub }
}
