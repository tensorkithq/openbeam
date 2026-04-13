//! Remote control API for OpenBeam.
//!
//! Implements: OSC server (UDP/rosc), WebSocket command sink,
//! shared status snapshot.

pub mod coerce;
pub mod command;
pub mod dispatch;
pub mod error;
pub mod osc;
pub mod sink;
pub mod status;

pub use coerce::{coerce_bool, coerce_f32_normalized, coerce_string, parse_osc};
pub use command::RemoteCommand;
pub use dispatch::{CommandDispatcher, CommandSink};
pub use error::CommandError;
pub use osc::{start_osc_listener, OscConfig, OscHandle};
pub use sink::{new_ws_sink, WebSocketCommandSink};
pub use status::{new_shared_status, SharedStatus, StatusSnapshot, StatusUpdate};
