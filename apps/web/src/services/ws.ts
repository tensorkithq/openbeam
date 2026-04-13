type MessageHandler = (type: string, data: unknown) => void

export class OpenBeamSocket {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<MessageHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private url: string

  constructor(path: string) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    this.url = `${protocol}//${window.location.host}${path}`
  }

  connect() {
    if (this.ws) this.disconnect()

    this.ws = new WebSocket(this.url)

    this.ws.onopen = () => this.emit("_connected", {})

    this.ws.onclose = () => {
      this.emit("_disconnected", {})
      this.scheduleReconnect()
    }

    this.ws.onerror = () => this.ws?.close()

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        if (msg.type) this.emit(msg.type, msg.data ?? msg)
      } catch {
        // ignore non-JSON messages
      }
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }

  send(type: string, data?: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }))
    }
  }

  sendBinary(data: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(handler)
    return () => {
      this.handlers.get(type)?.delete(handler)
    }
  }

  private emit(type: string, data: unknown) {
    this.handlers.get(type)?.forEach((h) => h(type, data))
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => this.connect(), 3000)
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instances
export const transcriptionSocket = new OpenBeamSocket("/ws/transcription")
export const detectionSocket = new OpenBeamSocket("/ws/detection")
export const overlaySocket = new OpenBeamSocket("/ws/overlay?role=dashboard")
export const remoteSocket = new OpenBeamSocket("/ws/remote")
