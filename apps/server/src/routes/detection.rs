use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use openbeam_detection::MergedDetection;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::state::AppState;

#[derive(Deserialize)]
pub struct DetectRequest {
    pub text: String,
}

#[derive(Serialize)]
pub struct DetectionResult {
    pub book_number: i32,
    pub book_name: String,
    pub chapter: i32,
    pub verse_start: i32,
    pub verse_end: Option<i32>,
    pub verse_id: Option<i64>,
    pub confidence: f64,
    pub source: String,
    pub transcript_snippet: String,
    pub auto_queued: bool,
}

#[derive(Deserialize)]
pub struct SemanticRequest {
    pub query: String,
    #[serde(default = "default_k")]
    pub k: usize,
}

fn default_k() -> usize {
    5
}

#[derive(Serialize)]
pub struct SemanticSearchResult {
    pub verse_id: i64,
    pub similarity: f64,
}

#[derive(Serialize)]
pub struct DetectionStatus {
    pub has_direct: bool,
    pub has_semantic: bool,
    pub has_cloud: bool,
}

fn merged_to_result(m: &MergedDetection) -> DetectionResult {
    let source = match &m.detection.source {
        openbeam_detection::DetectionSource::DirectReference => "direct".to_string(),
        openbeam_detection::DetectionSource::Contextual => "contextual".to_string(),
        openbeam_detection::DetectionSource::QuotationMatch { similarity } => {
            format!("quotation:{similarity:.2}")
        }
        openbeam_detection::DetectionSource::SemanticLocal { similarity } => {
            format!("semantic_local:{similarity:.2}")
        }
        openbeam_detection::DetectionSource::SemanticCloud { similarity } => {
            format!("semantic_cloud:{similarity:.2}")
        }
        other => format!("{other:?}"),
    };

    DetectionResult {
        book_number: m.detection.verse_ref.book_number,
        book_name: m.detection.verse_ref.book_name.clone(),
        chapter: m.detection.verse_ref.chapter,
        verse_start: m.detection.verse_ref.verse_start,
        verse_end: m.detection.verse_ref.verse_end,
        verse_id: m.detection.verse_id,
        confidence: m.detection.confidence,
        source,
        transcript_snippet: m.detection.transcript_snippet.clone(),
        auto_queued: m.auto_queued,
    }
}

/// POST /api/detection/detect -- one-shot full pipeline detection.
pub async fn detect(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DetectRequest>,
) -> Result<Json<Vec<DetectionResult>>, DetectionError> {
    let mut pipeline = state.detection_pipeline.lock().await;
    let results = pipeline.process(&body.text);
    Ok(Json(results.iter().map(merged_to_result).collect()))
}

/// POST /api/detection/semantic -- standalone semantic search.
pub async fn semantic_search(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SemanticRequest>,
) -> Result<Json<Vec<SemanticSearchResult>>, DetectionError> {
    let mut pipeline = state.detection_pipeline.lock().await;
    let results = pipeline.semantic_search(&body.query, body.k);
    Ok(Json(
        results
            .into_iter()
            .map(|(verse_id, similarity)| SemanticSearchResult {
                verse_id,
                similarity,
            })
            .collect(),
    ))
}

/// POST /api/detection/quotation -- standalone quotation matching.
pub async fn quotation_search(
    State(state): State<Arc<AppState>>,
    Json(body): Json<DetectRequest>,
) -> Result<Json<Vec<DetectionResult>>, DetectionError> {
    let matcher = state.quotation_matcher.lock().await;
    let detections = matcher.match_transcript(&body.text);

    // Wrap raw detections in MergedDetection for uniform output
    let results: Vec<DetectionResult> = detections
        .iter()
        .map(|d| {
            let source = match &d.source {
                openbeam_detection::DetectionSource::QuotationMatch { similarity } => {
                    format!("quotation:{similarity:.2}")
                }
                other => format!("{other:?}"),
            };
            DetectionResult {
                book_number: d.verse_ref.book_number,
                book_name: d.verse_ref.book_name.clone(),
                chapter: d.verse_ref.chapter,
                verse_start: d.verse_ref.verse_start,
                verse_end: d.verse_ref.verse_end,
                verse_id: d.verse_id,
                confidence: d.confidence,
                source,
                transcript_snippet: d.transcript_snippet.clone(),
                auto_queued: false,
            }
        })
        .collect();

    Ok(Json(results))
}

/// GET /api/detection/status -- pipeline health check.
pub async fn status(
    State(state): State<Arc<AppState>>,
) -> Json<DetectionStatus> {
    let pipeline = state.detection_pipeline.lock().await;
    Json(DetectionStatus {
        has_direct: true,
        has_semantic: pipeline.has_semantic(),
        has_cloud: pipeline.has_cloud(),
    })
}

#[derive(Debug)]
pub struct DetectionError(String);

impl IntoResponse for DetectionError {
    fn into_response(self) -> Response {
        (StatusCode::INTERNAL_SERVER_ERROR, self.0).into_response()
    }
}
