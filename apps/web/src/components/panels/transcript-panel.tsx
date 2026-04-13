import { useEffect, useRef, useState } from "react"
import { PanelHeader } from "@/components/ui/panel-header"
import { LevelMeter } from "@/components/ui/level-meter"
import { Button } from "@/components/ui/button"
import { ApiKeyPrompt } from "@/components/ui/api-key-prompt"
import { MicIcon, MicOffIcon } from "lucide-react"
import { toast } from "sonner"
import {
  useTranscriptStore,
  useAudioStore,
  useDetectionStore,
  useQueueStore,
  useBibleStore,
} from "@/stores"
import { useTranscription } from "@/hooks/use-transcription"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import { bibleActions } from "@/hooks/use-bible"
import type { TranscriptSegment } from "@/types"
import type { DetectionResult } from "@/types"

export function TranscriptPanel() {
  const segments = useTranscriptStore((s) => s.segments)
  const currentPartial = useTranscriptStore((s) => s.currentPartial)
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)
  const connectionStatus = useTranscriptStore((s) => s.connectionStatus)
  const audioLevel = useAudioStore((s) => s.level)
  const { startTranscription, stopTranscription } = useTranscription()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showKeyPrompt, setShowKeyPrompt] = useState(false)
  const [isStarting, setIsStarting] = useState(false)

  // TODO: Wire to WebSocket in WS-3
  useTauriEvent<{ rms: number; peak: number }>("audio_level", (payload) => {
    useAudioStore.getState().setLevel(payload)
  })

  useTauriEvent("stt_connected", () => {
    useTranscriptStore.getState().setConnectionStatus("connected")
  })
  useTauriEvent("stt_disconnected", () => {
    useTranscriptStore.getState().setConnectionStatus("disconnected")
  })
  useTauriEvent<string>("stt_error", () => {
    useTranscriptStore.getState().setConnectionStatus("error")
  })

  useTauriEvent<{ text: string; is_final: boolean; confidence: number }>(
    "transcript_partial",
    (payload) => {
      useTranscriptStore.getState().setPartial(payload.text)
    }
  )

  useTauriEvent<{ text: string; is_final: boolean; confidence: number }>(
    "transcript_final",
    (payload) => {
      const segment: TranscriptSegment = {
        id: crypto.randomUUID(),
        text: payload.text,
        is_final: true,
        confidence: payload.confidence,
        words: [],
        timestamp: Date.now(),
      }
      useTranscriptStore.getState().addSegment(segment)
    }
  )

  useTauriEvent<{ abbreviation: string; translation_id: number }>(
    "translation_command",
    (data) => {
      useBibleStore.getState().setActiveTranslation(data.translation_id)
      console.log(`[VOICE] Translation switched to ${data.abbreviation}`)
    }
  )

  useTauriEvent<DetectionResult[]>("verse_detections", (detections) => {
    useDetectionStore.getState().addDetections(detections)

    const directHit = detections.find(
      (d) => d.source === "direct" || d.source === "contextual" || (d.source === "quotation" && d.auto_queued)
    )
    if (directHit && directHit.book_number > 0) {
      bibleActions.selectVerse({
        id: 0,
        translation_id: useBibleStore.getState().activeTranslationId,
        book_number: directHit.book_number,
        book_name: directHit.book_name,
        book_abbreviation: "",
        chapter: directHit.chapter,
        verse: directHit.verse,
        text: directHit.verse_text,
      })
      useBibleStore
        .getState()
        .setPendingNavigation({
          bookNumber: directHit.book_number,
          chapter: directHit.chapter,
          verse: directHit.verse,
        })
    }

    for (const d of detections) {
      if (d.auto_queued) {
        useQueueStore.getState().addItem({
          id: crypto.randomUUID(),
          verse: {
            id: 0,
            translation_id: 1,
            book_number: d.book_number,
            book_name: d.book_name,
            book_abbreviation: "",
            chapter: d.chapter,
            verse: d.verse,
            text: d.verse_text,
          },
          reference: d.verse_ref,
          confidence: d.confidence,
          source: d.source === "direct" ? "ai-direct" : "ai-semantic",
          added_at: Date.now(),
        })
      }
    }
  })

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
        setShowKeyPrompt(true)
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

      <ApiKeyPrompt
        open={showKeyPrompt}
        onOpenChange={setShowKeyPrompt}
        service="Deepgram"
        description="Live transcription needs a Deepgram API key. Add it in settings so the app can start listening."
      />
    </div>
  )
}
