use openbeam_bible::BibleDb;
use openbeam_detection::{DetectionPipeline, QuotationMatcher};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Shared application state for the OpenBeam server.
///
/// Holds the detection pipeline, quotation matcher, and Bible database
/// so they can be shared across Axum handlers.
pub struct AppState {
    pub detection_pipeline: Mutex<DetectionPipeline>,
    pub quotation_matcher: Mutex<QuotationMatcher>,
    pub bible_db: Arc<BibleDb>,
}
