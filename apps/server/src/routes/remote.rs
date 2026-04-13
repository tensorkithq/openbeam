use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use openbeam_api::{
    CommandDispatcher, OscConfig, OscHandle, RemoteCommand, SharedStatus, StatusUpdate,
    WebSocketCommandSink,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};

/// Shared state for remote control routes.
pub struct RemoteState {
    pub command_tx: broadcast::Sender<String>,
    pub sink: Arc<WebSocketCommandSink>,
    pub osc: Mutex<Option<OscHandle>>,
    pub status: SharedStatus,
}

impl RemoteState {
    pub fn new() -> Self {
        let (command_tx, _) = broadcast::channel(64);
        let sink = Arc::new(WebSocketCommandSink::new(command_tx.clone()));
        Self {
            command_tx,
            sink,
            osc: Mutex::new(None),
            status: openbeam_api::new_shared_status(),
        }
    }
}

// --- WebSocket: dashboard receives remote command events ---

pub async fn ws_remote(
    ws: WebSocketUpgrade,
    State(state): State<Arc<RemoteState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_remote_ws(socket, state))
}

async fn handle_remote_ws(mut socket: WebSocket, state: Arc<RemoteState>) {
    tracing::info!("remote: WebSocket client connected");

    let mut rx = state.command_tx.subscribe();

    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(msg) => {
                        if socket.send(Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!("remote: client lagged by {n} messages");
                    }
                    Err(_) => break,
                }
            }
        }
    }

    tracing::info!("remote: WebSocket client disconnected");
}

// --- OSC management ---

#[derive(Deserialize)]
pub struct StartOscRequest {
    pub port: u16,
}

#[derive(Serialize)]
pub struct StartOscResponse {
    pub port: u16,
}

pub async fn start_osc(
    State(state): State<Arc<RemoteState>>,
    Json(body): Json<StartOscRequest>,
) -> impl IntoResponse {
    let mut osc_guard = state.osc.lock().await;

    // Stop existing listener if running
    if let Some(mut handle) = osc_guard.take() {
        handle.stop();
    }

    let config = OscConfig {
        port: body.port,
        host: "0.0.0.0".into(),
    };

    match openbeam_api::start_osc_listener(config, state.sink.clone()) {
        Ok(handle) => {
            let bound_port = handle.bound_port();
            tracing::info!("OSC listener started on port {bound_port}");
            *osc_guard = Some(handle);
            (StatusCode::OK, Json(serde_json::json!({ "port": bound_port })))
        }
        Err(e) => {
            tracing::error!("Failed to start OSC: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        }
    }
}

pub async fn stop_osc(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    let mut osc_guard = state.osc.lock().await;
    if let Some(mut handle) = osc_guard.take() {
        handle.stop();
        tracing::info!("OSC listener stopped");
    }
    StatusCode::OK
}

#[derive(Serialize)]
pub struct OscStatusResponse {
    pub active: bool,
    pub port: Option<u16>,
}

pub async fn osc_status(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    let osc_guard = state.osc.lock().await;
    let (active, port) = match osc_guard.as_ref() {
        Some(handle) if handle.is_active() => (true, Some(handle.bound_port())),
        _ => (false, None),
    };
    Json(OscStatusResponse { active, port })
}

// --- HTTP control endpoint ---

#[derive(Serialize)]
struct ControlResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub async fn control(
    State(state): State<Arc<RemoteState>>,
    Json(cmd): Json<RemoteCommand>,
) -> impl IntoResponse {
    tracing::debug!("Remote control command: {cmd}");
    match CommandDispatcher::dispatch(&cmd, &*state.sink) {
        Ok(()) => (
            StatusCode::OK,
            Json(ControlResponse {
                success: true,
                error: None,
            }),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ControlResponse {
                success: false,
                error: Some(e.to_string()),
            }),
        ),
    }
}

// --- Status snapshot ---

pub async fn get_status(State(state): State<Arc<RemoteState>>) -> impl IntoResponse {
    let snapshot = state.status.read().await;
    Json(snapshot.clone())
}

pub async fn update_status(
    State(state): State<Arc<RemoteState>>,
    Json(update): Json<StatusUpdate>,
) -> impl IntoResponse {
    let mut snapshot = state.status.write().await;
    snapshot.apply_update(&update);
    StatusCode::OK
}
