import { merge, type Observable } from "rxjs"
import { filter, map, share } from "rxjs/operators"
import type { SocketLike } from "../socket/socket-like"
import type { RemoteCommand } from "../types/remote"
import { fromSocketEvent } from "../socket/from-socket-event"

export interface RemoteControlStreamConfig {
  socket: SocketLike
}

export interface RemoteControlStreams {
  /** Typed stream of all remote commands. */
  commands$: Observable<RemoteCommand>
}

function hasField<K extends string>(
  data: unknown,
  key: K,
): data is Record<K, unknown> {
  return typeof data === "object" && data !== null && key in data
}

export function createRemoteControlStream(
  config: RemoteControlStreamConfig,
): RemoteControlStreams {
  const { socket } = config

  const commands$ = merge(
    fromSocketEvent(socket, "remote:next").pipe(
      map((): RemoteCommand => ({ type: "next" })),
    ),
    fromSocketEvent(socket, "remote:prev").pipe(
      map((): RemoteCommand => ({ type: "prev" })),
    ),
    fromSocketEvent(socket, "remote:theme").pipe(
      filter((d) => hasField(d, "name") && typeof d.name === "string"),
      map((d): RemoteCommand => ({ type: "theme", name: (d as { name: string }).name })),
    ),
    fromSocketEvent(socket, "remote:opacity").pipe(
      filter((d) => hasField(d, "value") && typeof d.value === "number"),
      map((d): RemoteCommand => ({ type: "opacity", value: (d as { value: number }).value })),
    ),
    fromSocketEvent(socket, "remote:on_air").pipe(
      filter((d) => hasField(d, "active") && typeof d.active === "boolean"),
      map((d): RemoteCommand => ({ type: "on_air", active: (d as { active: boolean }).active })),
    ),
    fromSocketEvent(socket, "remote:show_broadcast").pipe(
      map((): RemoteCommand => ({ type: "show_broadcast" })),
    ),
    fromSocketEvent(socket, "remote:hide_broadcast").pipe(
      map((): RemoteCommand => ({ type: "hide_broadcast" })),
    ),
    fromSocketEvent(socket, "remote:set_confidence").pipe(
      filter((d) => hasField(d, "value") && typeof d.value === "number"),
      map((d): RemoteCommand => ({ type: "set_confidence", value: (d as { value: number }).value })),
    ),
  ).pipe(share())

  return { commands$ }
}
