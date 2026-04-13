mod routes;

use axum::{routing::get, Json, Router};
use rhema_bible::BibleDb;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

fn find_bible_db() -> PathBuf {
    let candidates = [
        PathBuf::from("data/rhema.db"),
        PathBuf::from("../../data/rhema.db"),
    ];
    for path in &candidates {
        if path.exists() {
            return path.clone();
        }
    }
    // Fall back to first candidate; BibleDb::open will produce a clear error
    candidates[0].clone()
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let db_path = find_bible_db();
    tracing::info!("Opening Bible database at {}", db_path.display());

    let bible_db = match BibleDb::open(&db_path) {
        Ok(db) => {
            tracing::info!("Bible database loaded successfully");
            Arc::new(db)
        }
        Err(e) => {
            tracing::warn!("Bible database not available: {e}. Bible endpoints will 503.");
            // Open an in-memory DB so routes exist but return empty results
            Arc::new(BibleDb::open(":memory:".as_ref()).expect("in-memory SQLite"))
        }
    };

    let app = Router::new()
        .route("/api/health", get(health))
        .merge(routes::bible_routes().with_state(bible_db))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await.unwrap();
    tracing::info!("OpenBeam server listening on http://0.0.0.0:8080");
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "openbeam",
        "version": env!("CARGO_PKG_VERSION")
    }))
}
