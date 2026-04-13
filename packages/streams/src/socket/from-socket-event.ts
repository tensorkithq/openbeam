import { Observable } from "rxjs"
import type { SocketLike } from "./socket-like"

/**
 * Creates a cold Observable from a socket event.
 *
 * Subscribes via socket.on() when the Observable is subscribed to,
 * and calls the returned unsubscribe function on teardown.
 */
export function fromSocketEvent<T = unknown>(
  socket: SocketLike,
  eventType: string,
): Observable<T> {
  return new Observable<T>((subscriber) => {
    const unsubscribe = socket.on(eventType, (_type, data) => {
      subscriber.next(data as T)
    })
    return unsubscribe
  })
}
