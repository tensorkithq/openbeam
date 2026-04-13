use rhema_detection::{DetectionPipeline, QuotationMatcher};
use tokio::sync::Mutex;

/// Shared application state for the OpenBeam server.
///
/// Holds the detection pipeline and quotation matcher behind async
/// mutexes so they can be shared across Axum handlers.
pub struct AppState {
    pub detection_pipeline: Mutex<DetectionPipeline>,
    pub quotation_matcher: Mutex<QuotationMatcher>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            detection_pipeline: Mutex::new(DetectionPipeline::new()),
            quotation_matcher: Mutex::new(QuotationMatcher::new()),
        }
    }
}
