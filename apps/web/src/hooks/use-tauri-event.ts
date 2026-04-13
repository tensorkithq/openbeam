import { useEffect } from "react"

// Stub: will be replaced by WebSocket subscriptions in WS-3
export function useTauriEvent<T>(
  _event: string,
  _handler: (payload: T) => void
) {
  useEffect(() => {
    // No-op until WS-3 wires WebSocket
  }, [])
}
