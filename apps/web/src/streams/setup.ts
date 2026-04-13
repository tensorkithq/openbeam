import {
  createTranscriptionStream,
  createDetectionStream,
  createRemoteControlStream,
  createStatusSyncStream,
  StreamOrchestrator,
  type RemoteCommand,
} from "@openbeam/streams"
import { api } from "@/services"
import { useTranscriptStore } from "@/stores/transcript-store"
import { useDetectionStore } from "@/stores/detection-store"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { useQueueStore } from "@/stores/queue-store"
import { useSettingsStore } from "@/stores/settings-store"
import { navigateNext, navigatePrev } from "@/hooks/use-remote-control"
import { createConnectionManager, type ConnectionManager } from "./connection-manager"

let manager: ConnectionManager | null = null

export function getManager(): ConnectionManager | null {
  return manager
}

function dispatchRemoteCommand(cmd: RemoteCommand) {
  switch (cmd.type) {
    case "next":
      navigateNext()
      break
    case "prev":
      navigatePrev()
      break
    case "theme": {
      const { themes, setActiveTheme } = useBroadcastStore.getState()
      const theme = themes.find(
        (t) => t.name.toLowerCase() === cmd.name.toLowerCase(),
      )
      if (theme) setActiveTheme(theme.id)
      break
    }
    case "on_air":
      useBroadcastStore.getState().setLive(cmd.active)
      break
    case "show_broadcast":
      useBroadcastStore.getState().setLive(true)
      break
    case "hide_broadcast":
      useBroadcastStore.getState().setLive(false)
      break
    case "set_confidence":
      useSettingsStore.getState().setConfidenceThreshold(cmd.value)
      break
    case "opacity":
      break
  }
}

/**
 * Initialize all stream subscriptions. Call once at app root.
 * Returns a cleanup function.
 */
export function initializeStreams(): () => void {
  manager = createConnectionManager({
    transcription: "/ws/transcription",
    detection: "/ws/detection",
    overlay: "/ws/overlay?role=dashboard",
    remote: "/ws/remote",
  })

  // Create stream instances (cold until subscribed)
  const transcriptionStreams = createTranscriptionStream({
    socket: manager.transcription,
  })

  const detectionStreams = createDetectionStream({
    transcriptFinals$: transcriptionStreams.finals$,
    socket: manager.detection,
    forwardSocket: manager.detection,
  })

  const remoteControlStreams = createRemoteControlStream({
    socket: manager.remote,
  })

  const orchestrator = new StreamOrchestrator()

  // Transcription → transcript store
  orchestrator.add(
    transcriptionStreams.partials$.subscribe(({ text }) => {
      useTranscriptStore.getState().setPartial(text)
    }),
  )
  orchestrator.add(
    transcriptionStreams.finals$.subscribe((segment) => {
      useTranscriptStore.getState().addSegment(segment)
    }),
  )
  orchestrator.add(
    transcriptionStreams.connectionStatus$.subscribe((status) => {
      useTranscriptStore.getState().setConnectionStatus(status)
    }),
  )

  // Detection → detection store
  manager.connectAll()
  orchestrator.add(
    detectionStreams.detections$.subscribe((results) => {
      useDetectionStore.getState().addDetections(results)
    }),
  )
  if (detectionStreams._forwardSubscription) {
    orchestrator.add(detectionStreams._forwardSubscription)
  }

  // Remote control → dispatch commands
  orchestrator.add(
    remoteControlStreams.commands$.subscribe(dispatchRemoteCommand),
  )

  // Status sync → poll every 5s
  const statusSync = createStatusSyncStream({
    getSnapshot: () => {
      const { isLive, liveVerse, activeThemeId, themes } =
        useBroadcastStore.getState()
      const { items } = useQueueStore.getState()
      const { confidenceThreshold } = useSettingsStore.getState()
      const activeTheme = themes.find((t) => t.id === activeThemeId)
      return {
        on_air: isLive,
        active_theme: activeTheme?.name ?? null,
        live_verse: liveVerse?.reference ?? null,
        queue_length: items.length,
        confidence_threshold: confidenceThreshold,
      }
    },
    updateStatus: api.updateRemoteStatus,
    intervalMs: 5000,
  })
  orchestrator.add(statusSync.subscription)
  orchestrator.addTeardown(statusSync.destroy)

  return () => {
    orchestrator.destroy()
    manager?.disconnectAll()
    manager = null
  }
}
