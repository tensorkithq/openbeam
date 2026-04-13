import { useEffect, useRef, useState } from "react"
import { PanelHeader } from "@/components/ui/panel-header"
import { LevelMeter } from "@/components/ui/level-meter"
import { Button } from "@/components/ui/button"
import { MicIcon, MicOffIcon } from "lucide-react"
import { toast } from "sonner"
import {
  useTranscriptStore,
  useAudioStore,
} from "@/stores"
import { useTranscription } from "@/hooks/use-transcription"

export function TranscriptPanel() {
  const segments = useTranscriptStore((s) => s.segments)
  const currentPartial = useTranscriptStore((s) => s.currentPartial)
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)
  const connectionStatus = useTranscriptStore((s) => s.connectionStatus)
  const audioLevel = useAudioStore((s) => s.level)
  const { startTranscription, stopTranscription } = useTranscription()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isStarting, setIsStarting] = useState(false)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [segments, currentPartial])

  const handleStart = async () => {
    setIsStarting(true)
    try {
      await startTranscription()
    } catch (e) {
      const err = e as DOMException | Error
      console.error("[AUDIO] Failed to start transcription:", err)
      useTranscriptStore.getState().setConnectionStatus("error")

      if (err.name === "NotAllowedError") {
        toast.error("Microphone access denied")
      } else if (err.name === "NotFoundError") {
        toast.error("No microphone found")
      } else if (String(err).includes("No Deepgram API key")) {
        toast.error("No Deepgram API key configured. Add one in Settings.")
      } else {
        toast.error("Failed to start transcription")
      }
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    try {
      await stopTranscription()
    } catch (e) {
      console.error("Failed to stop transcription:", e)
    }
  }

  return (
    <div
      data-slot="transcript-panel"
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <PanelHeader
        title="Live transcript"
        icon={<MicIcon className="size-3" />}
      >
        <div className="flex items-center gap-2">
          {isTranscribing && (
            <span
              className={`size-2 rounded-full ${
                connectionStatus === "connected"
                  ? "bg-emerald-500"
                  : connectionStatus === "connecting"
                    ? "animate-pulse bg-amber-500"
                    : connectionStatus === "error"
                      ? "bg-red-500"
                      : "bg-muted-foreground/40"
              }`}
              title={connectionStatus}
            />
          )}
          <LevelMeter level={audioLevel.rms} bars={5} />
        </div>
      </PanelHeader>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2 p-3">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-card to-transparent" />

          {segments.length === 0 && !currentPartial && !isTranscribing && (
            <p className="text-sm text-muted-foreground">
              Click "Start transcribing" to begin
            </p>
          )}

          {segments.map((seg, idx) => {
            const distFromEnd = segments.length - 1 - idx
            const opacity =
              distFromEnd === 0
                ? "text-foreground/80"
                : distFromEnd === 1
                  ? "text-foreground/60"
                  : distFromEnd <= 3
                    ? "text-foreground/40"
                    : "text-foreground/25"
            return (
              <p
                key={seg.id}
                className={`text-sm leading-relaxed transition-colors duration-300 ${opacity}`}
              >
                {seg.text}
              </p>
            )
          })}

          {currentPartial && (
            <p className="border-l-2 border-primary pl-2 text-base leading-relaxed text-foreground">
              {currentPartial}
              <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-border px-3 py-2">
        {isTranscribing ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleStop}
          >
            <MicOffIcon className="size-3" />
            Stop transcribing
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={handleStart} disabled={isStarting}>
              <MicIcon className="size-3" />
            {isStarting ? "Requesting mic..." : "Start transcribing"}
          </Button>
        )}
      </div>

    </div>
  )
}
