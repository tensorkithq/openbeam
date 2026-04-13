export type RemoteCommand =
  | { type: "next" }
  | { type: "prev" }
  | { type: "theme"; name: string }
  | { type: "opacity"; value: number }
  | { type: "on_air"; active: boolean }
  | { type: "show_broadcast" }
  | { type: "hide_broadcast" }
  | { type: "set_confidence"; value: number }

export interface StatusSnapshot {
  on_air: boolean
  active_theme: string | null
  live_verse: string | null
  queue_length: number
  confidence_threshold: number
}
