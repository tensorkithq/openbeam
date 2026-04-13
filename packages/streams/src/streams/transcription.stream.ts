import { merge, type Observable } from "rxjs"
import { distinctUntilChanged, map, share, shareReplay, startWith } from "rxjs/operators"
import type { SocketLike } from "../socket/socket-like"
import type { ConnectionStatus } from "../types/socket"
import type { TranscriptSegment, Word } from "../types/transcript"
import { fromSocketEvent } from "../socket/from-socket-event"

export interface TranscriptionStreamConfig {
  socket: SocketLike
}

export interface TranscriptionStreams {
  /** Partial (interim) transcript text as the speaker talks. */
  partials$: Observable<{ text: string }>
  /** Finalized transcript segments with confidence and word timings. */
  finals$: Observable<TranscriptSegment>
  /** WebSocket connection lifecycle. */
  connectionStatus$: Observable<ConnectionStatus>
  /** Transcription errors from the server. */
  errors$: Observable<{ message: string }>
}

export function createTranscriptionStream(
  config: TranscriptionStreamConfig,
): TranscriptionStreams {
  const { socket } = config

  const partials$ = fromSocketEvent<{ text: string }>(
    socket,
    "transcript:partial",
  ).pipe(share())

  const finals$ = fromSocketEvent<{
    text: string
    confidence: number
    words: Word[]
  }>(socket, "transcript:final").pipe(
    map(
      (payload): TranscriptSegment => ({
        id: crypto.randomUUID(),
        text: payload.text,
        is_final: true,
        confidence: payload.confidence,
        words: payload.words ?? [],
        timestamp: Date.now(),
      }),
    ),
    share(),
  )

  const connectionStatus$ = merge(
    fromSocketEvent(socket, "_connected").pipe(
      map((): ConnectionStatus => "connected"),
    ),
    fromSocketEvent(socket, "_disconnected").pipe(
      map((): ConnectionStatus => "disconnected"),
    ),
    fromSocketEvent(socket, "transcript:error").pipe(
      map((): ConnectionStatus => "error"),
    ),
  ).pipe(
    startWith("disconnected" as ConnectionStatus),
    distinctUntilChanged(),
    shareReplay(1),
  )

  const errors$ = fromSocketEvent<{ message: string }>(
    socket,
    "transcript:error",
  )

  return { partials$, finals$, connectionStatus$, errors$ }
}
