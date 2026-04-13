//! Speech-to-text integration for OpenBeam.
//!
//! Provides a Deepgram WebSocket client for real-time transcription with
//! Bible keyword boosting. Designed for BYOK (bring your own key) usage
//! where each connection supplies its own Deepgram API key.
//!
//! # Key types
//!
//! - [`DeepgramClient`] — Deepgram WebSocket streaming client
//! - [`TranscriptEvent`] — streaming transcript events (partial, final, etc.)
//! - [`SttConfig`] — per-connection configuration (includes user's API key)
//! - [`SttError`] — error type for STT operations

pub mod deepgram;
pub mod error;
pub mod keyterms;
pub mod types;

pub use deepgram::DeepgramClient;
pub use error::SttError;
pub use keyterms::bible_keyterms;
pub use types::{SttConfig, TranscriptEvent, Word};
