use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use openbeam_bible::BibleDb;
use openbeam_detection::{
    Detection, DetectionMerger, DetectionSource, MergedDetection, ReadingMode, SentenceBuffer,
    SermonContext, VerseRef,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::state::AppState;
use super::detection_shared::{format_verse_ref, source_label};

#[derive(Deserialize)]
struct WsIncoming {
    #[serde(rename = "type")]
    msg_type: String,
    text: Option<String>,
    translation_id: Option<i64>,
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

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn reading_advance_to_detection(advance: &openbeam_detection::ReadingAdvance, snippet: &str) -> Detection {
    Detection {
        verse_ref: VerseRef {
            book_number: advance.book_number,
            book_name: advance.book_name.clone(),
            chapter: advance.chapter,
            verse_start: advance.verse,
            verse_end: None,
        },
        verse_id: None,
        confidence: advance.confidence,
        source: DetectionSource::Contextual,
        transcript_snippet: snippet.to_string(),
        detected_at: now_ms(),
    }
}

fn activate_reading_on_direct(
    reading_mode: &mut ReadingMode,
    direct: &[Detection],
    bible_db: &BibleDb,
    translation_id: i64,
) {
    for det in direct {
        if matches!(det.source, DetectionSource::DirectReference) {
            let ref_ = &det.verse_ref;
            match bible_db.get_chapter(translation_id, ref_.book_number, ref_.chapter) {
                Ok(chapter_verses) => {
                    let verses_data: Vec<(i32, String)> = chapter_verses
                        .iter()
                        .map(|v| (v.verse, v.text.clone()))
                        .collect();
                    reading_mode.start(
                        ref_.book_number, &ref_.book_name, ref_.chapter, ref_.verse_start, verses_data,
                    );
                    tracing::info!(
                        "[READING] Activated: {} {}:{}", ref_.book_name, ref_.chapter, ref_.verse_start
                    );
                }
                Err(e) => {
                    tracing::warn!("[READING] Failed to load chapter: {e}");
                }
            }
        }
    }
}

fn check_reading_advances(
    reading_mode: &mut ReadingMode,
    merger: &mut DetectionMerger,
    text: &str,
    bible_db: &BibleDb,
    translation_id: i64,
) -> Vec<MergedDetection> {
    let mut results = Vec::new();

    if let Some(advance) = reading_mode.check_transcript(text) {
        tracing::info!("[READING] Advance: {}", advance.reference);
        let det = reading_advance_to_detection(&advance, text);
        results.extend(merger.merge(vec![det], vec![]));
    }

    if let Some(chapter_change) = reading_mode.check_chapter_command(text) {
        tracing::info!(
            "[READING] Chapter change: {} {}", chapter_change.book_name, chapter_change.new_chapter
        );
        match bible_db.get_chapter(translation_id, chapter_change.book_number, chapter_change.new_chapter) {
            Ok(new_verses) => {
                let verses_data: Vec<(i32, String)> = new_verses
                    .iter()
                    .map(|v| (v.verse, v.text.clone()))
                    .collect();
                reading_mode.start(
                    chapter_change.book_number, &chapter_change.book_name, chapter_change.new_chapter, 1, verses_data,
                );
                if let Some(first) = new_verses.first() {
                    let det = Detection {
                        verse_ref: VerseRef {
                            book_number: chapter_change.book_number,
                            book_name: chapter_change.book_name.clone(),
                            chapter: chapter_change.new_chapter,
                            verse_start: first.verse,
                            verse_end: None,
                        },
                        verse_id: None,
                        confidence: 1.0,
                        source: DetectionSource::Contextual,
                        transcript_snippet: text.to_string(),
                        detected_at: now_ms(),
                    };
                    results.extend(merger.merge(vec![det], vec![]));
                }
            }
            Err(e) => {
                tracing::warn!("[READING] Failed to load new chapter: {e}");
            }
        }
    }

    results
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>, bible_db: Arc<BibleDb>) {
    // Per-connection state
    let mut buffer = SentenceBuffer::new();
    let mut context = SermonContext::new();
    let mut merger = DetectionMerger::new();
    let mut reading_mode = ReadingMode::new();

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

        let translation_id = incoming.translation_id.unwrap_or(1);

        // Determine processing strategy based on message type
        let mut results = match incoming.msg_type.as_str() {
            "transcript:final" => {
                let mut all_results = Vec::new();

                let direct = {
                    let mut pipeline = state.detection_pipeline.lock().await;
                    pipeline.detect_direct(&transcript)
                };

                activate_reading_on_direct(&mut reading_mode, &direct, &bible_db, translation_id);
                all_results.extend(merger.merge(direct, vec![]));
                all_results.extend(check_reading_advances(
                    &mut reading_mode, &mut merger, &transcript, &bible_db, translation_id,
                ));

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

                let mut pipeline = state.detection_pipeline.lock().await;
                let direct = pipeline.detect_direct(&flushed);
                let semantic = pipeline.detect_semantic(&flushed);
                drop(pipeline);

                activate_reading_on_direct(&mut reading_mode, &direct, &bible_db, translation_id);

                let quotation_matcher = state.quotation_matcher.lock().await;
                let quotation = quotation_matcher.match_transcript(&flushed);
                drop(quotation_matcher);

                let mut all_results = merger.merge_all(direct, semantic, quotation);
                all_results.extend(check_reading_advances(
                    &mut reading_mode, &mut merger, &flushed, &bible_db, translation_id,
                ));

                all_results
            }
            _ => {
                tracing::debug!("unknown ws message type: {}", incoming.msg_type);
                continue;
            }
        };

        if results.is_empty() {
            continue;
        }

        // Resolve semantic/quotation detections that have verse_id but empty verse_ref
        for r in &mut results {
            if r.detection.verse_ref.book_number == 0 {
                if let Some(vid) = r.detection.verse_id {
                    if let Ok(Some(v)) = bible_db.get_verse_by_id(vid) {
                        r.detection.verse_ref.book_number = v.book_number;
                        r.detection.verse_ref.book_name = v.book_name;
                        r.detection.verse_ref.chapter = v.chapter;
                        r.detection.verse_ref.verse_start = v.verse;
                    }
                }
            }
        }

        // Drop results that couldn't be resolved
        results.retain(|r| r.detection.verse_ref.book_number != 0);

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
                        .get_verse(translation_id, ref_.book_number, ref_.chapter, ref_.verse_start)
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
