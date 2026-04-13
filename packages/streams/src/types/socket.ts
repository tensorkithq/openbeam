export interface SocketMessage {
  type: string
  data?: unknown
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"
