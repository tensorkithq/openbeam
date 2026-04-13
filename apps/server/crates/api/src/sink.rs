use std::sync::Arc;
use tokio::sync::broadcast;

use crate::dispatch::CommandSink;
use crate::error::CommandError;

/// WebSocket-based command sink that broadcasts events to all connected clients.
pub struct WebSocketCommandSink {
    tx: broadcast::Sender<String>,
}

impl WebSocketCommandSink {
    pub fn new(tx: broadcast::Sender<String>) -> Self {
        Self { tx }
    }

    pub fn sender(&self) -> &broadcast::Sender<String> {
        &self.tx
    }
}

impl CommandSink for WebSocketCommandSink {
    fn emit_event(&self, event: &str, payload: &str) -> Result<(), CommandError> {
        let msg = serde_json::json!({"type": event, "data": payload}).to_string();
        let _ = self.tx.send(msg);
        Ok(())
    }

    fn invoke_backend(&self, action: &str, _args: &str) -> Result<(), CommandError> {
        // In web version, backend actions also route to frontend via WS
        let event = format!("remote:{action}");
        self.emit_event(&event, "{}")
    }
}

/// Create a new `WebSocketCommandSink` wrapped in `Arc<dyn CommandSink>`.
pub fn new_ws_sink(tx: broadcast::Sender<String>) -> Arc<dyn CommandSink> {
    Arc::new(WebSocketCommandSink::new(tx))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ws_sink_sends_json() {
        let (tx, mut rx) = broadcast::channel(16);
        let sink = WebSocketCommandSink::new(tx);

        sink.emit_event("remote:next", "{}").unwrap();

        let msg = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "remote:next");
    }

    #[test]
    fn ws_sink_invoke_backend_routes_as_event() {
        let (tx, mut rx) = broadcast::channel(16);
        let sink = WebSocketCommandSink::new(tx);

        sink.invoke_backend("show_broadcast", "{}").unwrap();

        let msg = rx.try_recv().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&msg).unwrap();
        assert_eq!(parsed["type"], "remote:show_broadcast");
    }
}
