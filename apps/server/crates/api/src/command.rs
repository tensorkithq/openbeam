use serde::{Deserialize, Serialize};
use std::fmt;

/// Unified command type for all remote control protocols (OSC, HTTP).
///
/// Both OSC messages and HTTP JSON requests parse into this enum.
/// The `CommandDispatcher` then routes each variant to the appropriate
/// backend action or frontend event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "command", content = "value", rename_all = "snake_case")]
pub enum RemoteCommand {
    Next,
    Prev,
    Show,
    Hide,
    Theme(String),
    Opacity(f32),
    Confidence(f32),
    OnAir(bool),
}

impl fmt::Display for RemoteCommand {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RemoteCommand::Next => write!(f, "next"),
            RemoteCommand::Prev => write!(f, "prev"),
            RemoteCommand::Show => write!(f, "show"),
            RemoteCommand::Hide => write!(f, "hide"),
            RemoteCommand::Theme(name) => write!(f, "theme({name})"),
            RemoteCommand::Opacity(val) => write!(f, "opacity({val:.2})"),
            RemoteCommand::Confidence(val) => write!(f, "confidence({val:.2})"),
            RemoteCommand::OnAir(active) => write!(f, "on_air({active})"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialize_next() {
        let json = serde_json::to_value(&RemoteCommand::Next).unwrap();
        assert_eq!(json, serde_json::json!({"command": "next"}));
    }

    #[test]
    fn serialize_theme() {
        let json = serde_json::to_value(&RemoteCommand::Theme("Dark".into())).unwrap();
        assert_eq!(json, serde_json::json!({"command": "theme", "value": "Dark"}));
    }

    #[test]
    fn serialize_on_air() {
        let json = serde_json::to_value(&RemoteCommand::OnAir(true)).unwrap();
        assert_eq!(json, serde_json::json!({"command": "on_air", "value": true}));
    }

    #[test]
    fn deserialize_next() {
        let cmd: RemoteCommand = serde_json::from_str(r#"{"command":"next"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::Next);
    }

    #[test]
    fn deserialize_theme() {
        let cmd: RemoteCommand =
            serde_json::from_str(r#"{"command":"theme","value":"Minimal"}"#).unwrap();
        assert_eq!(cmd, RemoteCommand::Theme("Minimal".into()));
    }

    #[test]
    fn roundtrip_all_variants() {
        let variants = vec![
            RemoteCommand::Next,
            RemoteCommand::Prev,
            RemoteCommand::Show,
            RemoteCommand::Hide,
            RemoteCommand::Theme("Classic Dark".into()),
            RemoteCommand::Opacity(0.5),
            RemoteCommand::Confidence(0.9),
            RemoteCommand::OnAir(false),
        ];

        for cmd in variants {
            let json = serde_json::to_string(&cmd).unwrap();
            let deserialized: RemoteCommand = serde_json::from_str(&json).unwrap();
            assert_eq!(cmd, deserialized, "Round-trip failed for {cmd}");
        }
    }
}
