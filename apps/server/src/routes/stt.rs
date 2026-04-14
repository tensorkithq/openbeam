use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    Json,
};
use openbeam_stt::{DeepgramClient, SttConfig, TranscriptEvent, Word};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::mpsc;

/// GET /ws/transcription -- WebSocket upgrade for STT proxy.
pub async fn ws_transcription(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_transcription)
}

/// GET /api/transcription/status -- check if STT infrastructure is available.
pub async fn transcription_status() -> Json<Value> {
    Json(json!({
        "available": true,
        "provider": "deepgram",
        "mode": "byok",
        "description": "Bring your own Deepgram API key via first WebSocket message"
    }))
}

async fn handle_transcription(mut socket: WebSocket) {
    // The first message must be a JSON auth payload: {"type":"auth","key":"dg-xxx"}
    let api_key = match socket.recv().await {
        Some(Ok(Message::Text(text))) => {
            match serde_json::from_str::<Value>(&text) {
                Ok(msg)
                    if msg.get("type").and_then(|v| v.as_str()) == Some("auth") =>
                {
                    msg.get("key")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                }
                _ => String::new(),
            }
        }
        _ => String::new(),
    };

    if api_key.is_empty() {
        tracing::warn!("STT proxy: missing or invalid auth message, rejecting");
        let err = json!({
            "type": "stt:error",
            "message": "First message must be {\"type\":\"auth\",\"key\":\"...\"}"
        });
        let _ = socket
            .send(Message::Text(serde_json::to_string(&err).unwrap().into()))
            .await;
        return;
    }

    tracing::info!("STT proxy: authenticated (key length={})", api_key.len());

    let config = SttConfig::new(api_key);
    let client = DeepgramClient::new(config);

    // Channel: browser audio bytes -> Deepgram client
    let (audio_tx, audio_rx) = mpsc::channel::<Vec<u8>>(128);
    // Channel: Deepgram transcript events -> browser (outgoing WS messages)
    let (event_tx, mut event_rx) = mpsc::channel::<TranscriptEvent>(64);

    // Task: Run the Deepgram client (connects and streams)
    let mut deepgram_task = tokio::spawn(async move {
        if let Err(e) = client.connect(audio_rx, event_tx).await {
            tracing::error!("STT proxy: Deepgram connection error: {e}");
        }
    });

    // Main loop: multiplex browser recv and Deepgram events on the single socket
    loop {
        tokio::select! {
            // Browser -> server: audio or control messages
            browser_msg = socket.recv() => {
                match browser_msg {
                    Some(Ok(Message::Binary(data))) => {
                        if audio_tx.send(data.to_vec()).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                            if parsed.get("type").and_then(|v| v.as_str()) == Some("stop") {
                                tracing::info!("STT proxy: received stop command");
                                let _ = audio_tx.send(Vec::new()).await;
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::info!("STT proxy: browser disconnected");
                        break;
                    }
                    Some(Err(e)) => {
                        tracing::warn!("STT proxy: browser WebSocket error: {e}");
                        break;
                    }
                    _ => {}
                }
            }
            // Deepgram -> browser: transcript events
            event = event_rx.recv() => {
                match event {
                    Some(evt) => {
                        if let Some(json_val) = event_to_json(&evt) {
                            let text = match serde_json::to_string(&json_val) {
                                Ok(t) => t,
                                Err(e) => {
                                    tracing::error!("STT proxy: serialize error: {e}");
                                    continue;
                                }
                            };
                            if socket.send(Message::Text(text.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    None => {
                        // Deepgram client dropped the sender
                        tracing::info!("STT proxy: Deepgram event channel closed");
                        break;
                    }
                }
            }
            // Deepgram task finished unexpectedly
            _ = &mut deepgram_task => {
                tracing::info!("STT proxy: Deepgram task finished");
                break;
            }
        }
    }

    tracing::info!("STT proxy: connection closed");
}

#[derive(Serialize)]
struct WordJson {
    text: String,
    start: f64,
    end: f64,
    confidence: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    punctuated_word: Option<String>,
}

fn words_to_json(words: &[Word]) -> Vec<WordJson> {
    words
        .iter()
        .map(|w| WordJson {
            text: w.text.clone(),
            start: w.start,
            end: w.end,
            confidence: w.confidence,
            punctuated_word: w.punctuated_word.clone(),
        })
        .collect()
}

fn event_to_json(event: &TranscriptEvent) -> Option<Value> {
    match event {
        TranscriptEvent::Partial { transcript, words } => Some(json!({
            "type": "transcript:partial",
            "text": transcript,
            "words": words_to_json(words),
        })),
        TranscriptEvent::Final {
            transcript,
            words,
            confidence,
            speech_final,
        } => Some(json!({
            "type": "transcript:final",
            "text": transcript,
            "words": words_to_json(words),
            "confidence": confidence,
            "speech_final": speech_final,
        })),
        TranscriptEvent::UtteranceEnd => Some(json!({
            "type": "transcript:utterance_end",
        })),
        TranscriptEvent::SpeechStarted => Some(json!({
            "type": "stt:speech_started",
        })),
        TranscriptEvent::Error(msg) => Some(json!({
            "type": "stt:error",
            "message": msg,
        })),
        TranscriptEvent::Connected => Some(json!({
            "type": "stt:connected",
        })),
        TranscriptEvent::Disconnected => Some(json!({
            "type": "stt:disconnected",
        })),
    }
}
