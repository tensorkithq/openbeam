use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use url::Url;

use crate::error::SttError;
use crate::keyterms::bible_keyterms;
use crate::types::{SttConfig, TranscriptEvent, Word};

const MAX_RECONNECT_ATTEMPTS: u32 = 3;
const RECONNECT_DELAY: Duration = Duration::from_secs(1);

/// Deepgram WebSocket client for real-time speech-to-text.
///
/// Adapted for server-side proxy use: audio arrives as raw bytes from
/// an async channel (browser WebSocket), not from a local microphone.
pub struct DeepgramClient {
    config: SttConfig,
    cancelled: Arc<AtomicBool>,
}

impl std::fmt::Debug for DeepgramClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("DeepgramClient")
            .field("model", &self.config.model)
            .finish_non_exhaustive()
    }
}

impl DeepgramClient {
    pub fn new(config: SttConfig) -> Self {
        Self {
            config,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Build the Deepgram WebSocket URL with query parameters and keyword boosting.
    fn build_url(&self) -> Result<Url, SttError> {
        let mut url = Url::parse("wss://api.deepgram.com/v1/listen")
            .map_err(|e| SttError::ConnectionFailed(e.to_string()))?;

        {
            let mut q = url.query_pairs_mut();
            q.append_pair("model", &self.config.model);
            q.append_pair("encoding", &self.config.encoding);
            q.append_pair("sample_rate", &self.config.sample_rate.to_string());
            q.append_pair("channels", "1");
            q.append_pair("punctuate", "true");
            q.append_pair("smart_format", "true");
            q.append_pair("interim_results", "true");
            q.append_pair("endpointing", "300");
            q.append_pair("utterance_end_ms", "1000");
            q.append_pair("vad_events", "true");

            if let Some(ref lang) = self.config.language {
                q.append_pair("language", lang);
            }

            // Deepgram Nova-3 keyword boosting: uses `keyterm` (not `keywords`).
            // Each keyterm is a separate query param. Max 100 per request.
            let core_terms = vec![
                "Jesus".to_string(),
                "Christ".to_string(),
                "God".to_string(),
                "Lord".to_string(),
                "Holy Spirit".to_string(),
            ];
            let bible_terms = bible_keyterms();

            let mut seen = std::collections::HashSet::new();
            let mut all_keyterms: Vec<String> = Vec::new();
            for term in core_terms.into_iter().chain(bible_terms.into_iter()) {
                if seen.insert(term.clone()) {
                    all_keyterms.push(term);
                }
                if all_keyterms.len() >= 100 {
                    break;
                }
            }

            for term in &all_keyterms {
                q.append_pair("keyterm", term);
            }
            tracing::info!(
                "Deepgram keyterm boosting: {} keyterms added",
                all_keyterms.len()
            );
        }

        tracing::debug!("Deepgram WebSocket URL built (length={})", url.as_str().len());
        Ok(url)
    }

    /// Connect to Deepgram and proxy audio from `audio_rx`, emitting transcript
    /// events to `event_tx`. Audio arrives as raw bytes (PCM 16-bit LE) from
    /// the browser WebSocket.
    pub async fn connect(
        &self,
        audio_rx: mpsc::Receiver<Vec<u8>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        if self.config.api_key.is_empty() {
            return Err(SttError::ApiKeyMissing);
        }

        let cancelled = self.cancelled.clone();
        let mut attempts: u32 = 0;
        let mut audio_rx = audio_rx;

        loop {
            if cancelled.load(Ordering::SeqCst) {
                tracing::info!("DeepgramClient: cancelled, stopping connection loop");
                break;
            }

            match self
                .try_connect(&mut audio_rx, event_tx.clone(), cancelled.clone())
                .await
            {
                Ok(()) => {
                    tracing::info!("DeepgramClient: connection closed normally");
                    break;
                }
                Err(e) => {
                    attempts += 1;
                    tracing::warn!(
                        "DeepgramClient: connection error (attempt {attempts}/{MAX_RECONNECT_ATTEMPTS}): {e}",
                    );

                    let _ = event_tx.send(TranscriptEvent::Disconnected).await;

                    if attempts >= MAX_RECONNECT_ATTEMPTS {
                        tracing::error!("DeepgramClient: max reconnection attempts reached");
                        let _ = event_tx
                            .send(TranscriptEvent::Error(format!(
                                "Max reconnection attempts reached: {e}"
                            )))
                            .await;
                        return Err(e);
                    }

                    tokio::time::sleep(RECONNECT_DELAY).await;
                }
            }
        }

        Ok(())
    }

    /// Attempt a single WebSocket connection and run send/receive loops.
    async fn try_connect(
        &self,
        audio_rx: &mut mpsc::Receiver<Vec<u8>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
        cancelled: Arc<AtomicBool>,
    ) -> Result<(), SttError> {
        let url = self.build_url()?;

        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|e| SttError::ConnectionFailed(e.to_string()))?;

        let auth_value = format!("Token {}", self.config.api_key);
        request.headers_mut().insert(
            "Authorization",
            HeaderValue::from_str(&auth_value)
                .map_err(|e| SttError::ConnectionFailed(e.to_string()))?,
        );

        let (ws_stream, _response) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| SttError::ConnectionFailed(e.to_string()))?;

        tracing::info!("DeepgramClient: connected to Deepgram");
        let _ = event_tx.send(TranscriptEvent::Connected).await;

        let (mut dg_write, mut dg_read) = ws_stream.split();

        let send_cancelled = cancelled.clone();
        let recv_cancelled = cancelled.clone();

        let send_error = Arc::new(AtomicBool::new(false));
        let recv_error = Arc::new(AtomicBool::new(false));
        let send_err_flag = send_error.clone();
        let recv_err_flag = recv_error.clone();

        // Bridge: async channel from browser audio → Deepgram WS writer
        let (ws_tx, mut ws_rx) = mpsc::channel::<WsCommand>(64);

        // Audio forwarder: reads from browser audio channel, sends to Deepgram
        let audio_forwarder = {
            let ws_tx = ws_tx.clone();
            let cancelled = send_cancelled;
            async move {
                let keepalive_interval = Duration::from_secs(5);
                let mut last_send = tokio::time::Instant::now();

                loop {
                    if cancelled.load(Ordering::SeqCst) {
                        let _ = ws_tx.send(WsCommand::Close).await;
                        break;
                    }

                    tokio::select! {
                        audio = audio_rx.recv() => {
                            match audio {
                                Some(data) if data.is_empty() => {
                                    // Empty frame = stop signal
                                    let _ = ws_tx.send(WsCommand::Close).await;
                                    break;
                                }
                                Some(data) => {
                                    if ws_tx.send(WsCommand::Audio(data)).await.is_err() {
                                        break;
                                    }
                                    last_send = tokio::time::Instant::now();
                                }
                                None => {
                                    // Browser disconnected
                                    let _ = ws_tx.send(WsCommand::Close).await;
                                    break;
                                }
                            }
                        }
                        _ = tokio::time::sleep(Duration::from_millis(100)) => {
                            if last_send.elapsed() >= keepalive_interval {
                                if ws_tx.send(WsCommand::KeepAlive).await.is_err() {
                                    break;
                                }
                                last_send = tokio::time::Instant::now();
                            }
                        }
                    }
                }
            }
        };

        // WS writer: reads commands from bridge channel, writes to Deepgram
        let ws_writer = async move {
            while let Some(cmd) = ws_rx.recv().await {
                match cmd {
                    WsCommand::Audio(data) => {
                        if let Err(e) = dg_write.send(Message::Binary(data.into())).await {
                            tracing::error!("DeepgramClient ws_writer: send error: {e}");
                            send_err_flag.store(true, Ordering::SeqCst);
                            break;
                        }
                    }
                    WsCommand::KeepAlive => {
                        let ka = serde_json::json!({"type": "KeepAlive"}).to_string();
                        if let Err(e) = dg_write.send(Message::Text(ka.into())).await {
                            tracing::error!("DeepgramClient ws_writer: keepalive error: {e}");
                            send_err_flag.store(true, Ordering::SeqCst);
                            break;
                        }
                    }
                    WsCommand::Close => {
                        let close_msg = serde_json::json!({"type": "CloseStream"}).to_string();
                        let _ = dg_write.send(Message::Text(close_msg.into())).await;
                        let _ = dg_write.close().await;
                        break;
                    }
                }
            }
        };

        // Receiver: reads Deepgram JSON responses
        let receiver = async move {
            while let Some(msg_result) = dg_read.next().await {
                if recv_cancelled.load(Ordering::SeqCst) {
                    break;
                }

                match msg_result {
                    Ok(Message::Text(text)) => {
                        if let Err(e) = parse_and_send(&text, &event_tx).await {
                            tracing::warn!("DeepgramClient receiver: parse error: {e}");
                        }
                    }
                    Ok(Message::Close(_)) => {
                        tracing::info!("DeepgramClient receiver: server closed connection");
                        break;
                    }
                    Ok(_) => {}
                    Err(e) => {
                        tracing::error!("DeepgramClient receiver: WebSocket error: {e}");
                        recv_err_flag.store(true, Ordering::SeqCst);
                        let _ = event_tx
                            .send(TranscriptEvent::Error(format!("WebSocket error: {e}")))
                            .await;
                        break;
                    }
                }
            }
        };

        tokio::join!(audio_forwarder, ws_writer, receiver);

        if send_error.load(Ordering::SeqCst) || recv_error.load(Ordering::SeqCst) {
            return Err(SttError::ConnectionFailed(
                "Connection lost unexpectedly".into(),
            ));
        }

        Ok(())
    }

    /// Cancel the current connection and signal shutdown.
    pub fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
}

enum WsCommand {
    Audio(Vec<u8>),
    KeepAlive,
    Close,
}

/// Parse a Deepgram JSON response and send the corresponding `TranscriptEvent`.
async fn parse_and_send(
    text: &str,
    event_tx: &mpsc::Sender<TranscriptEvent>,
) -> Result<(), SttError> {
    let json: serde_json::Value =
        serde_json::from_str(text).map_err(|e| SttError::ParseError(e.to_string()))?;

    let msg_type = json
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    match msg_type {
        "UtteranceEnd" => {
            let _ = event_tx.send(TranscriptEvent::UtteranceEnd).await;
            return Ok(());
        }
        "SpeechStarted" => {
            let _ = event_tx.send(TranscriptEvent::SpeechStarted).await;
            return Ok(());
        }
        "Results" => { /* continue parsing below */ }
        _ => {
            return Ok(());
        }
    }

    let is_final = json
        .get("is_final")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);

    let speech_final = json
        .get("speech_final")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);

    let channel = json.get("channel");
    let alternatives = channel
        .and_then(|c| c.get("alternatives"))
        .and_then(|a| a.as_array());

    let first_alt = alternatives.and_then(|arr| arr.first());

    let transcript = first_alt
        .and_then(|a| a.get("transcript"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    let confidence = first_alt
        .and_then(|a| a.get("confidence"))
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(0.0);

    let words = first_alt
        .and_then(|a| a.get("words"))
        .and_then(|w| w.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|w| {
                    Some(Word {
                        text: w.get("word")?.as_str()?.to_string(),
                        start: w.get("start")?.as_f64()?,
                        end: w.get("end")?.as_f64()?,
                        confidence: w.get("confidence")?.as_f64()?,
                        punctuated_word: w
                            .get("punctuated_word")
                            .and_then(|p| p.as_str())
                            .map(ToString::to_string),
                    })
                })
                .collect::<Vec<Word>>()
        })
        .unwrap_or_default();

    let event = if is_final {
        TranscriptEvent::Final {
            transcript,
            words,
            confidence,
            speech_final,
        }
    } else {
        TranscriptEvent::Partial { transcript, words }
    };

    event_tx
        .send(event)
        .await
        .map_err(|e| SttError::SendError(e.to_string()))?;

    Ok(())
}
