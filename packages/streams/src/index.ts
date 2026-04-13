// Types
export type {
  DeviceInfo,
  AudioLevel,
  AudioConfig,
  Word,
  TranscriptSegment,
  TranscriptEventPayload,
  Translation,
  Book,
  Verse,
  CrossReference,
  QueueItem,
  DetectionResult,
  DetectionStatus,
  SemanticSearchResult,
  VerseRenderData,
  VerseSegment,
  SocketMessage,
  ConnectionStatus,
  RemoteCommand,
  StatusSnapshot,
} from "./types"

// Socket
export { fromSocketEvent } from "./socket"
export type { SocketLike, SendableSocketLike } from "./socket"

// Stream factories
export {
  createTranscriptionStream,
  type TranscriptionStreamConfig,
  type TranscriptionStreams,
} from "./streams"
export {
  createDetectionStream,
  type DetectionStreamConfig,
  type DetectionStreams,
} from "./streams"
export {
  createSearchStream,
  type SearchStreamConfig,
  type SearchStreams,
} from "./streams"
export {
  createRemoteControlStream,
  type RemoteControlStreamConfig,
  type RemoteControlStreams,
} from "./streams"
export {
  createStatusSyncStream,
  type StatusSyncStreamConfig,
} from "./streams"

// Operators
export { fallbackChain } from "./operators"

// Lifecycle
export { StreamOrchestrator } from "./util"
