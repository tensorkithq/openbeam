use axum::{routing::get, Json, Router};
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let app = Router::new()
        .route("/api/health", get(health))
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
