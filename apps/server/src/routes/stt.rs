use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query,
    },
    response::IntoResponse,
    Json,
};
use openbeam_stt::{DeepgramClient, SttConfig, TranscriptEvent, Word};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc;

#[derive(Deserialize)]
pub struct SttQuery {
    key: String,
}

/// GET /ws/transcription?key=dg-xxx -- WebSocket upgrade for STT proxy.
pub async fn ws_transcription(
    ws: WebSocketUpgrade,
    Query(params): Query<SttQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_transcription(socket, params.key))
}

/// GET /api/transcription/status -- check if STT infrastructure is available.
pub async fn transcription_status() -> Json<Value> {
    Json(json!({
        "available": true,
        "provider": "deepgram",
        "mode": "byok",
        "description": "Bring your own Deepgram API key via WebSocket query param"
    }))
}

async fn handle_transcription(socket: WebSocket, api_key: String) {
    if api_key.is_empty() {
        tracing::warn!("STT proxy: empty API key, rejecting connection");
        let (mut sender, _) = socket.split();
        let err = json!({
            "type": "stt:error",
            "message": "API key is required"
        });
        let _ = sender
            .send(Message::Text(serde_json::to_string(&err).unwrap().into()))
            .await;
        return;
    }

    tracing::info!("STT proxy: new connection (key length={})", api_key.len());

    let config = SttConfig::new(api_key);
    let client = DeepgramClient::new(config);

    // Channel: browser audio bytes → Deepgram client
    let (audio_tx, audio_rx) = mpsc::channel::<Vec<u8>>(128);
    // Channel: Deepgram transcript events → browser
    let (event_tx, mut event_rx) = mpsc::channel::<TranscriptEvent>(64);

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Task 1: Read from browser WebSocket, forward audio to Deepgram client
    let browser_reader = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.recv().await {
            match msg {
                Message::Binary(data) => {
                    if audio_tx.send(data.to_vec()).await.is_err() {
                        break;
                    }
                }
                Message::Text(text) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                        if parsed.get("type").and_then(|v| v.as_str()) == Some("stop") {
                            tracing::info!("STT proxy: received stop command");
                            // Send empty vec to signal close
                            let _ = audio_tx.send(Vec::new()).await;
                            break;
                        }
                    }
                }
                Message::Close(_) => {
                    tracing::info!("STT proxy: browser closed connection");
                    break;
                }
                _ => {}
            }
        }
        // Dropping audio_tx signals the Deepgram client to close
    });

    // Task 2: Read transcript events from Deepgram, send to browser
    let browser_writer = tokio::spawn(async move {
        use axum::extract::ws::Message as WsMsg;

        while let Some(event) = event_rx.recv().await {
            let json = match event_to_json(&event) {
                Some(j) => j,
                None => continue,
            };
            let text = match serde_json::to_string(&json) {
                Ok(t) => t,
                Err(e) => {
                    tracing::error!("STT proxy: failed to serialize event: {e}");
                    continue;
                }
            };
            if ws_sender.send(WsMsg::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    // Task 3: Run the Deepgram client (connects and streams)
    let deepgram_task = tokio::spawn(async move {
        if let Err(e) = client.connect(audio_rx, event_tx).await {
            tracing::error!("STT proxy: Deepgram connection error: {e}");
        }
    });

    // Wait for any task to finish, then clean up
    tokio::select! {
        _ = browser_reader => {
            tracing::debug!("STT proxy: browser reader finished");
        }
        _ = browser_writer => {
            tracing::debug!("STT proxy: browser writer finished");
        }
        _ = deepgram_task => {
            tracing::debug!("STT proxy: Deepgram task finished");
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
            speech_final: _,
        } => Some(json!({
            "type": "transcript:final",
            "text": transcript,
            "words": words_to_json(words),
            "confidence": confidence,
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
