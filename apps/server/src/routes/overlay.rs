use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, watch, RwLock};

pub struct BroadcastRelay {
    pub tx: broadcast::Sender<String>,
    pub state_tx: watch::Sender<Option<String>>,
    pub state_rx: watch::Receiver<Option<String>>,
}

impl BroadcastRelay {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        let (state_tx, state_rx) = watch::channel(None);
        Self {
            tx,
            state_tx,
            state_rx,
        }
    }
}

pub struct SessionRelayMap {
    relays: RwLock<HashMap<String, Arc<BroadcastRelay>>>,
}

impl SessionRelayMap {
    pub fn new() -> Self {
        Self {
            relays: RwLock::new(HashMap::new()),
        }
    }

    pub async fn get_or_create(&self, session_id: &str) -> Arc<BroadcastRelay> {
        {
            let map = self.relays.read().await;
            if let Some(relay) = map.get(session_id) {
                return relay.clone();
            }
        }
        let mut map = self.relays.write().await;
        map.entry(session_id.to_string())
            .or_insert_with(|| Arc::new(BroadcastRelay::new()))
            .clone()
    }
}

#[derive(Deserialize)]
pub struct OverlayQuery {
    #[serde(default = "default_role")]
    role: String,
    #[serde(default = "default_session")]
    session: String,
}

fn default_role() -> String {
    "overlay".to_string()
}

fn default_session() -> String {
    "default".to_string()
}

pub async fn ws_overlay(
    ws: WebSocketUpgrade,
    Query(params): Query<OverlayQuery>,
    State(map): State<Arc<SessionRelayMap>>,
) -> impl IntoResponse {
    let relay = map.get_or_create(&params.session).await;
    ws.on_upgrade(move |socket| handle_overlay(socket, params.role, relay))
}

async fn handle_overlay(socket: WebSocket, role: String, relay: Arc<BroadcastRelay>) {
    match role.as_str() {
        "dashboard" => handle_dashboard(socket, relay).await,
        _ => handle_overlay_client(socket, relay).await,
    }
}

async fn handle_dashboard(mut socket: WebSocket, relay: Arc<BroadcastRelay>) {
    tracing::info!("overlay: dashboard connected");

    while let Some(Ok(msg)) = socket.recv().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let parsed: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if msg_type == "verse:update" {
            let raw = text.to_string();
            let _ = relay.state_tx.send(Some(raw.clone()));
            let _ = relay.tx.send(raw);
        }
    }

    tracing::info!("overlay: dashboard disconnected");
}

async fn handle_overlay_client(mut socket: WebSocket, relay: Arc<BroadcastRelay>) {
    tracing::info!("overlay: client connected");

    // Send cached state on connect
    let cached = relay.state_rx.borrow().clone();
    if let Some(msg) = cached {
        let _ = socket.send(Message::Text(msg.into())).await;
    }

    let mut rx = relay.tx.subscribe();

    loop {
        tokio::select! {
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                            let msg_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            if msg_type == "overlay:ready" {
                                let cached = relay.state_rx.borrow().clone();
                                if let Some(msg) = cached {
                                    if socket.send(Message::Text(msg.into())).await.is_err() {
                                        break;
                                    }
                                }
                            }
                        }
                    }
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
                        tracing::warn!("overlay: client lagged by {n} messages");
                    }
                    Err(_) => break,
                }
            }
        }
    }

    tracing::info!("overlay: client disconnected");
}
