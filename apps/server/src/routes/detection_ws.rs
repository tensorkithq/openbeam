use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use rhema_detection::{DetectionPipeline, SentenceBuffer, SermonContext};
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
    book_number: i32,
    book_name: String,
    chapter: i32,
    verse_start: i32,
    verse_end: Option<i32>,
    verse_id: Option<i64>,
    confidence: f64,
    source: String,
    auto_queued: bool,
}

/// GET /ws/detection -- WebSocket upgrade handler.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
    // Per-connection state
    let mut buffer = SentenceBuffer::new();
    let mut context = SermonContext::new();

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
                // Accumulate in sentence buffer; run direct detection on each fragment
                let mut all_results = Vec::new();

                // Always run direct detection on the raw fragment
                {
                    let mut pipeline = state.detection_pipeline.lock().await;
                    let direct = pipeline.process_direct(&transcript);
                    all_results.extend(direct);
                }

                // Buffer for semantic: flush on sentence boundary
                if let Some(sentence) = buffer.append(&transcript) {
                    let mut pipeline = state.detection_pipeline.lock().await;
                    let semantic = pipeline.process_semantic(&sentence);
                    all_results.extend(semantic);
                }

                all_results
            }
            "transcript:speech_final" => {
                // Force-flush the buffer and run full pipeline
                let flushed = buffer.force_flush().unwrap_or(transcript.clone());
                let mut pipeline = state.detection_pipeline.lock().await;
                pipeline.process(&flushed)
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
                    let source = match &m.detection.source {
                        rhema_detection::DetectionSource::DirectReference => {
                            "direct".to_string()
                        }
                        rhema_detection::DetectionSource::Contextual => {
                            "contextual".to_string()
                        }
                        rhema_detection::DetectionSource::QuotationMatch { similarity } => {
                            format!("quotation:{similarity:.2}")
                        }
                        rhema_detection::DetectionSource::SemanticLocal { similarity } => {
                            format!("semantic_local:{similarity:.2}")
                        }
                        rhema_detection::DetectionSource::SemanticCloud { similarity } => {
                            format!("semantic_cloud:{similarity:.2}")
                        }
                        other => format!("{other:?}"),
                    };

                    WsDetectionResult {
                        book_number: m.detection.verse_ref.book_number,
                        book_name: m.detection.verse_ref.book_name.clone(),
                        chapter: m.detection.verse_ref.chapter,
                        verse_start: m.detection.verse_ref.verse_start,
                        verse_end: m.detection.verse_ref.verse_end,
                        verse_id: m.detection.verse_id,
                        confidence: m.detection.confidence,
                        source,
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
