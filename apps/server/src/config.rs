use std::env;

pub struct Config {
    pub port: u16,
    pub host: String,
    pub openrouter_api_key: Option<String>,
    pub openrouter_embed_model: String,
    pub openrouter_embed_dim: usize,
    pub db_path: String,
    pub log_level: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            openrouter_api_key: env::var("OPENROUTER_API_KEY").ok(),
            openrouter_embed_model: env::var("OPENROUTER_EMBED_MODEL")
                .unwrap_or_else(|_| "qwen/qwen3-embedding-8b".to_string()),
            openrouter_embed_dim: env::var("OPENROUTER_EMBED_DIM")
                .ok()
                .and_then(|d| d.parse().ok())
                .unwrap_or(4096),
            db_path: env::var("DB_PATH").unwrap_or_else(|_| "./data/openbeam.db".to_string()),
            log_level: env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string()),
        }
    }

    pub fn log_config(&self) {
        tracing::info!("OpenBeam server config:");
        tracing::info!(
            "  listen: {}:{}",
            self.host, self.port
        );
        tracing::info!("  db: {}", self.db_path);
        tracing::info!("  log_level: {}", self.log_level);
        tracing::info!(
            "  embeddings: {} (dim={})",
            self.openrouter_embed_model, self.openrouter_embed_dim
        );
        tracing::info!(
            "  openrouter key: {}",
            if self.openrouter_api_key.is_some() {
                "configured"
            } else {
                "NOT SET"
            }
        );
    }
}
