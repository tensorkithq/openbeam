use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Snapshot of the current application state, served by `GET /api/remote/status`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatusSnapshot {
    pub on_air: bool,
    pub active_theme: Option<String>,
    pub live_verse: Option<String>,
    pub queue_length: usize,
    pub confidence_threshold: f32,
}

/// Partial update for status fields sent from the frontend.
#[derive(Debug, Clone, Deserialize)]
pub struct StatusUpdate {
    pub on_air: Option<bool>,
    pub active_theme: Option<String>,
    pub live_verse: Option<String>,
    pub queue_length: Option<usize>,
    pub confidence_threshold: Option<f32>,
}

/// Shared, thread-safe status snapshot.
pub type SharedStatus = Arc<RwLock<StatusSnapshot>>;

/// Create a new shared status snapshot with default values.
pub fn new_shared_status() -> SharedStatus {
    Arc::new(RwLock::new(StatusSnapshot::default()))
}

impl StatusSnapshot {
    /// Merge a partial update into this snapshot.
    pub fn apply_update(&mut self, update: &StatusUpdate) {
        if let Some(on_air) = update.on_air {
            self.on_air = on_air;
        }
        if let Some(ref theme) = update.active_theme {
            self.active_theme = Some(theme.clone());
        }
        if let Some(ref verse) = update.live_verse {
            self.live_verse = Some(verse.clone());
        }
        if let Some(len) = update.queue_length {
            self.queue_length = len;
        }
        if let Some(threshold) = update.confidence_threshold {
            self.confidence_threshold = threshold;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_partial_update() {
        let mut snap = StatusSnapshot::default();
        assert!(!snap.on_air);

        let update = StatusUpdate {
            on_air: Some(true),
            active_theme: Some("Dark".into()),
            live_verse: None,
            queue_length: None,
            confidence_threshold: None,
        };

        snap.apply_update(&update);
        assert!(snap.on_air);
        assert_eq!(snap.active_theme.as_deref(), Some("Dark"));
        assert!(snap.live_verse.is_none());
    }
}
