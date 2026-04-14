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
use super::detection_shared::{format_verse_ref, source_label};

#[derive(Deserialize)]
pub struct DetectRequest {
    pub text: String,
}

#[derive(Serialize)]
pub struct DetectionResult {
    pub verse_ref: String,
    pub verse_text: String,
    pub book_name: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    pub verse_end: Option<i32>,
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
    pub verse_ref: String,
    pub verse_text: String,
    pub book_name: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    pub similarity: f64,
}

#[derive(Serialize)]
pub struct DetectionStatus {
    pub has_direct: bool,
    pub has_semantic: bool,
    pub has_cloud: bool,
}

fn merged_to_result(m: &MergedDetection, bible_db: &openbeam_bible::BibleDb) -> DetectionResult {
    let ref_ = &m.detection.verse_ref;
    let verse_text = bible_db
        .get_verse(1, ref_.book_number, ref_.chapter, ref_.verse_start)
        .ok()
        .flatten()
        .map(|v| v.text)
        .unwrap_or_default();

    DetectionResult {
        verse_ref: format_verse_ref(&ref_.book_name, ref_.chapter, ref_.verse_start, ref_.verse_end),
        verse_text,
        book_name: ref_.book_name.clone(),
        book_number: ref_.book_number,
        chapter: ref_.chapter,
        verse: ref_.verse_start,
        verse_end: ref_.verse_end,
        confidence: m.detection.confidence,
        source: source_label(&m.detection.source),
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
    Ok(Json(results.iter().map(|m| merged_to_result(m, &state.bible_db)).collect()))
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
            .filter_map(|(verse_id, similarity)| {
                let v = state.bible_db.get_verse_by_id(verse_id).ok()??;
                Some(SemanticSearchResult {
                    verse_ref: format_verse_ref(&v.book_name, v.chapter, v.verse, None),
                    verse_text: v.text,
                    book_name: v.book_name,
                    book_number: v.book_number,
                    chapter: v.chapter,
                    verse: v.verse,
                    similarity,
                })
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

    let results: Vec<DetectionResult> = detections
        .iter()
        .map(|d| {
            let ref_ = &d.verse_ref;
            let verse_text = state
                .bible_db
                .get_verse(1, ref_.book_number, ref_.chapter, ref_.verse_start)
                .ok()
                .flatten()
                .map(|v| v.text)
                .unwrap_or_default();

            DetectionResult {
                verse_ref: format_verse_ref(&ref_.book_name, ref_.chapter, ref_.verse_start, ref_.verse_end),
                verse_text,
                book_name: ref_.book_name.clone(),
                book_number: ref_.book_number,
                chapter: ref_.chapter,
                verse: ref_.verse_start,
                verse_end: ref_.verse_end,
                confidence: d.confidence,
                source: source_label(&d.source),
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
