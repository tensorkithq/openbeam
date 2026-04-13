import type { Verse } from "./bible"

export interface QueueItem {
  id: string
  verse: Verse
  reference: string
  confidence: number
  source: "manual" | "ai-direct" | "ai-semantic" | "ai-cloud"
  added_at: number
}
