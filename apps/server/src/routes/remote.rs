use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
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
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};

/// Per-session state: command broadcast channel + status snapshot.
pub struct RemoteSessionState {
    pub command_tx: broadcast::Sender<String>,
    pub sink: Arc<WebSocketCommandSink>,
    pub status: SharedStatus,
}

impl RemoteSessionState {
    pub fn new() -> Self {
        let (command_tx, _) = broadcast::channel(64);
        let sink = Arc::new(WebSocketCommandSink::new(command_tx.clone()));
        Self {
            command_tx,
            sink,
            status: openbeam_api::new_shared_status(),
        }
    }
}

const MAX_SESSIONS: usize = 500;

fn is_valid_session_id(id: &str) -> bool {
    id.len() <= 64
        && !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// Maps session IDs to per-session remote state.
pub struct SessionRemoteMap {
    sessions: RwLock<HashMap<String, Arc<RemoteSessionState>>>,
}

impl SessionRemoteMap {
    pub fn new() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
        }
    }

    pub async fn get_or_create(&self, session_id: &str) -> Arc<RemoteSessionState> {
        if !is_valid_session_id(session_id) {
            tracing::warn!(
                "remote: invalid session ID rejected (len={}, id={:?})",
                session_id.len(),
                &session_id[..session_id.len().min(64)]
            );
            return Arc::new(RemoteSessionState::new());
        }

        {
            let map = self.sessions.read().await;
            if let Some(state) = map.get(session_id) {
                return state.clone();
            }
        }

        let mut map = self.sessions.write().await;
        // Re-check after acquiring write lock
        if let Some(state) = map.get(session_id) {
            return state.clone();
        }
        if map.len() >= MAX_SESSIONS {
            tracing::warn!(
                "remote: session map at capacity ({MAX_SESSIONS}), creating ephemeral state for {session_id:?}"
            );
            return Arc::new(RemoteSessionState::new());
        }
        map.entry(session_id.to_string())
            .or_insert_with(|| Arc::new(RemoteSessionState::new()))
            .clone()
    }
}

/// Global state for remote control routes: session map + OSC handle.
pub struct RemoteState {
    pub sessions: SessionRemoteMap,
    pub osc: Mutex<Option<OscHandle>>,
}

impl RemoteState {
    pub fn new() -> Self {
        Self {
            sessions: SessionRemoteMap::new(),
            osc: Mutex::new(None),
        }
    }
}

fn default_session() -> String {
    "default".to_string()
}

// --- WebSocket: dashboard receives remote command events ---

#[derive(Deserialize)]
pub struct RemoteQuery {
    #[serde(default = "default_session")]
    session: String,
}

pub async fn ws_remote(
    ws: WebSocketUpgrade,
    Query(params): Query<RemoteQuery>,
    State(state): State<Arc<RemoteState>>,
) -> impl IntoResponse {
    let session = state.sessions.get_or_create(&params.session).await;
    ws.on_upgrade(move |socket| handle_remote_ws(socket, session))
}

async fn handle_remote_ws(mut socket: WebSocket, session: Arc<RemoteSessionState>) {
    tracing::info!("remote: WebSocket client connected");

    let mut rx = session.command_tx.subscribe();

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

pub async fn start_osc(
    State(state): State<Arc<RemoteState>>,
    Json(body): Json<StartOscRequest>,
) -> impl IntoResponse {
    if body.port < 1024 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "port must be >= 1024" })),
        );
    }

    let mut osc_guard = state.osc.lock().await;

    // Stop existing listener if running
    if let Some(mut handle) = osc_guard.take() {
        handle.stop();
    }

    let config = OscConfig {
        port: body.port,
        host: "127.0.0.1".into(),
    };

    // OSC is global — dispatch to the "default" session
    let default_session = state.sessions.get_or_create("default").await;
    match openbeam_api::start_osc_listener(config, default_session.sink.clone()) {
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

#[derive(Deserialize)]
pub struct ControlQuery {
    #[serde(default = "default_session")]
    session: String,
}

pub async fn control(
    Query(params): Query<ControlQuery>,
    State(state): State<Arc<RemoteState>>,
    Json(cmd): Json<RemoteCommand>,
) -> impl IntoResponse {
    let session = state.sessions.get_or_create(&params.session).await;
    tracing::debug!("Remote control command: {cmd}");
    match CommandDispatcher::dispatch(&cmd, &*session.sink) {
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

#[derive(Deserialize)]
pub struct StatusQuery {
    #[serde(default = "default_session")]
    session: String,
}

pub async fn get_status(
    Query(params): Query<StatusQuery>,
    State(state): State<Arc<RemoteState>>,
) -> impl IntoResponse {
    let session = state.sessions.get_or_create(&params.session).await;
    let snapshot = session.status.read().await;
    Json(snapshot.clone())
}

pub async fn update_status(
    Query(params): Query<StatusQuery>,
    State(state): State<Arc<RemoteState>>,
    Json(update): Json<StatusUpdate>,
) -> impl IntoResponse {
    let session = state.sessions.get_or_create(&params.session).await;
    let mut snapshot = session.status.write().await;
    snapshot.apply_update(&update);
    StatusCode::OK
}
