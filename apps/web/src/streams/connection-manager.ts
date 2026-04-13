import { OpenBeamSocket } from "@/services/ws"

export interface ConnectionManagerConfig {
  transcription: string
  detection: string
  overlay: string
  remote: string
}

export interface ConnectionManager {
  transcription: OpenBeamSocket
  detection: OpenBeamSocket
  overlay: OpenBeamSocket
  remote: OpenBeamSocket
  connectAll(): void
  disconnectAll(): void
}

export function createConnectionManager(config: ConnectionManagerConfig): ConnectionManager {
  const transcription = new OpenBeamSocket(config.transcription)
  const detection = new OpenBeamSocket(config.detection)
  const overlay = new OpenBeamSocket(config.overlay)
  const remote = new OpenBeamSocket(config.remote)

  return {
    transcription,
    detection,
    overlay,
    remote,
    connectAll() {
      // Connect always-on sockets. Transcription is on-demand (needs API key).
      detection.connect()
      overlay.connect()
      remote.connect()
    },
    disconnectAll() {
      transcription.disconnect()
      detection.disconnect()
      overlay.disconnect()
      remote.disconnect()
    },
  }
}
