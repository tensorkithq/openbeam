use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use openbeam_bible::BibleDb;
use openbeam_detection::{DetectionMerger, SentenceBuffer, SermonContext};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::state::AppState;

#[derive(Deserialize)]
struct WsIncoming {
    #[serde(rename = "type")]
    msg_type: String,
    text: Option<String>,
}

#[derive(Serialize)]
struct WsOutgoing {
    #[serde(rename = "type")]
    msg_type: String,
    data: Vec<WsDetectionResult>,
}

#[derive(Serialize)]
struct WsDetectionResult {
    verse_ref: String,
    verse_text: String,
    book_name: String,
    book_number: i32,
    chapter: i32,
    verse: i32,
    verse_end: Option<i32>,
    confidence: f64,
    source: String,
    transcript_snippet: String,
    auto_queued: bool,
}

/// GET /ws/detection -- WebSocket upgrade handler.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let bible_db = state.bible_db.clone();
    ws.on_upgrade(move |socket| handle_socket(socket, state, bible_db))
}

fn format_verse_ref(book_name: &str, chapter: i32, verse: i32, verse_end: Option<i32>) -> String {
    match verse_end {
        Some(end) if end != verse => format!("{book_name} {chapter}:{verse}-{end}"),
        _ => format!("{book_name} {chapter}:{verse}"),
    }
}

fn source_label(source: &openbeam_detection::DetectionSource) -> String {
    match source {
        openbeam_detection::DetectionSource::DirectReference => "direct".to_string(),
        openbeam_detection::DetectionSource::Contextual => "contextual".to_string(),
        openbeam_detection::DetectionSource::QuotationMatch { .. } => "quotation".to_string(),
        openbeam_detection::DetectionSource::SemanticLocal { .. } => "semantic_local".to_string(),
        openbeam_detection::DetectionSource::SemanticCloud { .. } => "semantic_cloud".to_string(),
        other => format!("{other:?}"),
    }
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>, bible_db: Arc<BibleDb>) {
    // Per-connection state
    let mut buffer = SentenceBuffer::new();
    let mut context = SermonContext::new();
    let mut merger = DetectionMerger::new();

    while let Some(Ok(msg)) = socket.recv().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let incoming: WsIncoming = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("invalid ws message: {e}");
                continue;
            }
        };

        let transcript = match incoming.text {
            Some(t) if !t.is_empty() => t,
            _ => continue,
        };

        // Determine processing strategy based on message type
        let results = match incoming.msg_type.as_str() {
            "transcript:final" => {
                let mut all_results = Vec::new();

                // Direct detection on raw fragment
                {
                    let mut pipeline = state.detection_pipeline.lock().await;
                    let direct = pipeline.detect_direct(&transcript);
                    all_results.extend(merger.merge(direct, vec![]));
                }

                // Buffer for semantic + quotation: flush on sentence boundary
                if let Some(sentence) = buffer.append(&transcript) {
                    let mut pipeline = state.detection_pipeline.lock().await;
                    let semantic = pipeline.detect_semantic(&sentence);
                    drop(pipeline);

                    let quotation_matcher = state.quotation_matcher.lock().await;
                    let quotation = quotation_matcher.match_transcript(&sentence);
                    drop(quotation_matcher);

                    all_results.extend(merger.merge_all(vec![], semantic, quotation));
                }

                all_results
            }
            "transcript:speech_final" => {
                let flushed = buffer.force_flush().unwrap_or(transcript.clone());

                // Run direct + semantic via pipeline
                let mut pipeline = state.detection_pipeline.lock().await;
                let direct = pipeline.detect_direct(&flushed);
                let semantic = pipeline.detect_semantic(&flushed);
                drop(pipeline);

                // Run quotation on accumulated text
                let quotation_matcher = state.quotation_matcher.lock().await;
                let quotation = quotation_matcher.match_transcript(&flushed);
                drop(quotation_matcher);

                // Merge all three with per-connection merger
                merger.merge_all(direct, semantic, quotation)
            }
            _ => {
                tracing::debug!("unknown ws message type: {}", incoming.msg_type);
                continue;
            }
        };

        if results.is_empty() {
            continue;
        }

        // Update sermon context with detected verses
        for r in &results {
            let source_name = format!("{:?}", r.detection.source);
            context.update(&r.detection.verse_ref, r.detection.confidence, &source_name);
        }

        let response = WsOutgoing {
            msg_type: "detection:result".to_string(),
            data: results
                .iter()
                .map(|m| {
                    let ref_ = &m.detection.verse_ref;
                    let verse_text = bible_db
                        .get_verse(1, ref_.book_number, ref_.chapter, ref_.verse_start)
                        .ok()
                        .flatten()
                        .map(|v| v.text)
                        .unwrap_or_default();

                    WsDetectionResult {
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
                })
                .collect(),
        };

        let json = match serde_json::to_string(&response) {
            Ok(j) => j,
            Err(e) => {
                tracing::error!("failed to serialize ws response: {e}");
                continue;
            }
        };

        if socket.send(Message::Text(json.into())).await.is_err() {
            break; // Client disconnected
        }
    }

    tracing::debug!("detection ws connection closed");
}
