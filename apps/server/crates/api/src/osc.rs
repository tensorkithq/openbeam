use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use rosc::{OscMessage, OscPacket};

use crate::coerce::parse_osc;
use crate::dispatch::{CommandDispatcher, CommandSink};
use crate::error::CommandError;

/// Configuration for the OSC listener.
#[derive(Debug, Clone)]
pub struct OscConfig {
    pub port: u16,
    pub host: String,
}

impl Default for OscConfig {
    fn default() -> Self {
        Self {
            port: 8000,
            host: "0.0.0.0".into(),
        }
    }
}

/// Handle to a running OSC listener. Dropping or calling `stop()` shuts it down.
pub struct OscHandle {
    active: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
    bound_port: u16,
}

impl OscHandle {
    pub fn stop(&mut self) {
        self.active.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }

    pub fn bound_port(&self) -> u16 {
        self.bound_port
    }
}

impl Drop for OscHandle {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Start the OSC UDP listener on a dedicated thread.
///
/// The listener binds to `config.host:config.port`, reads incoming UDP packets,
/// decodes OSC messages, parses them into `RemoteCommand` via `parse_osc`,
/// and dispatches through the provided `CommandSink`.
///
/// Returns a handle that can be used to stop the listener, with the actual bound port.
pub fn start_osc_listener(
    config: OscConfig,
    sink: Arc<dyn CommandSink>,
) -> Result<OscHandle, CommandError> {
    let bind_addr = format!("{}:{}", config.host, config.port);

    let socket = UdpSocket::bind(&bind_addr).map_err(|e| {
        CommandError::DispatchFailed(format!("Failed to bind OSC on {bind_addr}: {e}"))
    })?;

    let bound_port = socket.local_addr().map(|a| a.port()).unwrap_or(config.port);

    socket
        .set_read_timeout(Some(Duration::from_millis(100)))
        .map_err(|e| CommandError::DispatchFailed(format!("Failed to set read timeout: {e}")))?;

    let active = Arc::new(AtomicBool::new(true));
    let thread_active = active.clone();

    let thread = std::thread::Builder::new()
        .name("osc-listener".into())
        .spawn(move || {
            tracing::info!("OSC listener started on {bind_addr} (port {bound_port})");

            let mut buf = [0u8; 4096];

            while thread_active.load(Ordering::SeqCst) {
                let (size, _src) = match socket.recv_from(&mut buf) {
                    Ok(result) => result,
                    Err(ref e)
                        if e.kind() == std::io::ErrorKind::WouldBlock
                            || e.kind() == std::io::ErrorKind::TimedOut =>
                    {
                        continue;
                    }
                    Err(e) => {
                        tracing::debug!("OSC recv error: {e}");
                        continue;
                    }
                };

                let packet = match rosc::decoder::decode_udp(&buf[..size]) {
                    Ok((_rest, packet)) => packet,
                    Err(e) => {
                        tracing::debug!("OSC decode error: {e:?}");
                        continue;
                    }
                };

                handle_packet(&packet, &*sink);
            }

            tracing::info!("OSC listener stopped");
        })
        .map_err(|e| CommandError::DispatchFailed(format!("Failed to spawn OSC thread: {e}")))?;

    Ok(OscHandle {
        active,
        thread: Some(thread),
        bound_port,
    })
}

fn handle_packet(packet: &OscPacket, sink: &dyn CommandSink) {
    match packet {
        OscPacket::Message(msg) => handle_message(msg, sink),
        OscPacket::Bundle(bundle) => {
            for content in &bundle.content {
                handle_packet(content, sink);
            }
        }
    }
}

fn handle_message(msg: &OscMessage, sink: &dyn CommandSink) {
    match parse_osc(&msg.addr, &msg.args) {
        Ok(cmd) => {
            tracing::debug!("OSC command: {cmd}");
            if let Err(e) = CommandDispatcher::dispatch(&cmd, sink) {
                tracing::warn!("OSC dispatch error for {}: {e}", msg.addr);
            }
        }
        Err(e) => {
            tracing::debug!("OSC parse error for {}: {e}", msg.addr);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    struct MockSink {
        commands: Mutex<Vec<String>>,
    }

    impl MockSink {
        fn new() -> Self {
            Self {
                commands: Mutex::new(Vec::new()),
            }
        }

        fn command_count(&self) -> usize {
            self.commands.lock().unwrap().len()
        }
    }

    impl CommandSink for MockSink {
        fn emit_event(&self, event: &str, _payload: &str) -> Result<(), CommandError> {
            self.commands.lock().unwrap().push(event.to_string());
            Ok(())
        }

        fn invoke_backend(&self, action: &str, _args: &str) -> Result<(), CommandError> {
            self.commands.lock().unwrap().push(action.to_string());
            Ok(())
        }
    }

    #[test]
    fn osc_listener_binds_and_stops() {
        let sink: Arc<dyn CommandSink> = Arc::new(MockSink::new());
        let config = OscConfig {
            port: 0,
            host: "127.0.0.1".into(),
        };

        let mut handle = start_osc_listener(config, sink).expect("should bind");
        assert!(handle.bound_port() > 0);
        assert!(handle.is_active());

        handle.stop();
        assert!(!handle.is_active());
    }

    #[test]
    fn osc_listener_receives_and_dispatches() {
        let sink = Arc::new(MockSink::new());
        let config = OscConfig {
            port: 0,
            host: "127.0.0.1".into(),
        };

        let handle = start_osc_listener(config, sink.clone() as Arc<dyn CommandSink>)
            .expect("should bind");
        let port = handle.bound_port();

        let send_socket = UdpSocket::bind("127.0.0.1:0").unwrap();
        let msg = rosc::OscMessage {
            addr: "/openbeam/next".into(),
            args: vec![],
        };
        let packet = rosc::OscPacket::Message(msg);
        let encoded = rosc::encoder::encode(&packet).unwrap();
        send_socket
            .send_to(&encoded, format!("127.0.0.1:{port}"))
            .unwrap();

        std::thread::sleep(Duration::from_millis(200));

        assert!(
            sink.command_count() > 0,
            "Should have received at least one command"
        );

        let mut handle = handle;
        handle.stop();
    }

    #[test]
    fn handle_message_dispatches_next() {
        let sink = MockSink::new();
        let msg = OscMessage {
            addr: "/openbeam/next".into(),
            args: vec![],
        };
        handle_message(&msg, &sink);
        assert_eq!(sink.command_count(), 1);
    }

    #[test]
    fn handle_message_ignores_unknown_address() {
        let sink = MockSink::new();
        let msg = OscMessage {
            addr: "/foo/bar".into(),
            args: vec![],
        };
        handle_message(&msg, &sink);
        assert_eq!(sink.command_count(), 0);
    }
}
