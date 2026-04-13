mod config;
mod routes;
mod state;

use axum::{extract::State, routing::{get, post}, Json, Router};
use rhema_bible::BibleDb;
use rhema_detection::semantic::index::VectorIndex;
use rhema_detection::{DetectionPipeline, QuotationMatcher, SemanticDetector};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use config::Config;
use state::AppState;

fn find_bible_db(configured_path: &str) -> PathBuf {
    let candidates = [
        PathBuf::from(configured_path),
        PathBuf::from("data/rhema.db"),
        PathBuf::from("../../data/rhema.db"),
    ];
    for path in &candidates {
        if path.exists() {
            return path.clone();
        }
    }
    candidates[0].clone()
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=debug".into()))
        .with(fmt::layer().with_target(true).with_thread_ids(false))
        .init();

    let config = Config::from_env();
    config.log_config();

    let db_path = find_bible_db(&config.db_path);
    tracing::info!("Opening Bible database at {}", db_path.display());

    let bible_db = match BibleDb::open(&db_path) {
        Ok(db) => {
            tracing::info!("Bible database loaded successfully");
            Arc::new(db)
        }
        Err(e) => {
            tracing::warn!("Bible database not available: {e}. Bible endpoints will 503.");
            Arc::new(BibleDb::open(":memory:".as_ref()).expect("in-memory SQLite"))
        }
    };

    // Build detection pipeline
    let mut pipeline = DetectionPipeline::new();

    // Try to load HNSW vector index for semantic search
    let embeddings_path = PathBuf::from("data/embeddings.bin");
    let ids_path = PathBuf::from("data/embeddings-ids.bin");
    if embeddings_path.exists() && ids_path.exists() {
        match try_load_semantic(&embeddings_path, &ids_path) {
            Some(detector) => {
                tracing::info!("Semantic search enabled (vector index loaded)");
                pipeline.set_semantic(detector);
            }
            None => {
                tracing::info!("Semantic search disabled (vector index load failed)");
            }
        }
    } else {
        tracing::info!("Semantic search disabled (no vector index files)");
    }

    // Try to configure API-based embedder from config
    if let Some(ref api_key) = config.openrouter_api_key {
        if !api_key.is_empty() {
            let model = config.openrouter_embed_model.clone();
            let dimension = config.openrouter_embed_dim;

            tracing::info!("API embedder configured: model={model}, dim={dimension}");

            // If we also have a vector index, wire up a real semantic detector
            if embeddings_path.exists() && ids_path.exists() {
                if let Some(detector) = try_load_semantic_with_api(&embeddings_path, &ids_path, api_key.clone(), model, dimension) {
                    pipeline.set_semantic(detector);
                    tracing::info!("Semantic search enabled with API embedder");
                }
            }
        }
    }

    // Build quotation matcher from Bible database
    let quotation_matcher = build_quotation_matcher(&bible_db);

    let broadcast_relay = Arc::new(routes::BroadcastRelay::new());
    let remote_state = Arc::new(routes::RemoteState::new());

    let app_state = Arc::new(AppState {
        detection_pipeline: tokio::sync::Mutex::new(pipeline),
        quotation_matcher: tokio::sync::Mutex::new(quotation_matcher),
    });

    let app = Router::new()
        .route("/api/health", get(health))
        // Bible routes
        .merge(routes::bible_routes().with_state(bible_db))
        // Detection REST routes
        .route("/api/detection/detect", post(routes::detection::detect))
        .route("/api/detection/semantic", post(routes::detection::semantic_search))
        .route("/api/detection/quotation", post(routes::detection::quotation_search))
        .route("/api/detection/status", get(routes::detection::status))
        // Detection WebSocket
        .route("/ws/detection", get(routes::detection_ws::ws_handler))
        .with_state(app_state)
        // STT proxy (stateless — no shared state needed, each connection is independent)
        .route("/ws/transcription", get(routes::stt::ws_transcription))
        .route("/api/transcription/status", get(routes::stt::transcription_status))
        // Overlay relay (own state — BroadcastRelay, not AppState)
        .merge(
            Router::new()
                .route("/ws/overlay", get(routes::overlay::ws_overlay))
                .with_state(broadcast_relay),
        )
        // Remote control (own state — RemoteState)
        .merge(
            Router::new()
                .route("/ws/remote", get(routes::remote::ws_remote))
                .route("/api/remote/osc/start", post(routes::remote::start_osc))
                .route("/api/remote/osc/stop", post(routes::remote::stop_osc))
                .route("/api/remote/osc/status", get(routes::remote::osc_status))
                .route("/api/v1/control", post(routes::remote::control))
                .route("/api/remote/status", get(routes::remote::get_status).post(routes::remote::update_status))
                .with_state(remote_state),
        )
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    let addr = format!("{}:{}", config.host, config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("OpenBeam server listening on http://{addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("Ctrl+C received, shutting down"),
        _ = terminate => tracing::info!("SIGTERM received, shutting down"),
    }
}

async fn health(State(state): State<Arc<AppState>>) -> Json<Value> {
    let has_semantic = state
        .detection_pipeline
        .lock()
        .await
        .has_semantic();
    let quotation_ready = state
        .quotation_matcher
        .lock()
        .await
        .is_ready();

    Json(json!({
        "status": "ok",
        "service": "openbeam",
        "version": env!("CARGO_PKG_VERSION"),
        "capabilities": {
            "bible": true,
            "detection": {
                "direct": true,
                "semantic": has_semantic,
                "quotation": quotation_ready,
            },
            "stt": true,
            "overlay": true,
        }
    }))
}

/// Try to load a semantic detector with the stub embedder and HNSW index.
fn try_load_semantic(embeddings_path: &Path, ids_path: &Path) -> Option<SemanticDetector> {
    let dim = 4096; // Default for Qwen3 embeddings
    match rhema_detection::HnswVectorIndex::load(embeddings_path, ids_path, dim) {
        Ok(index) => {
            tracing::info!("Vector index loaded: {} vectors", index.len());
            Some(SemanticDetector::new(
                Box::new(rhema_detection::semantic::embedder::StubEmbedder::new(dim)),
                Box::new(index),
            ))
        }
        Err(e) => {
            tracing::warn!("Failed to load vector index: {e}");
            None
        }
    }
}

/// Try to load a semantic detector with the API embedder and HNSW index.
fn try_load_semantic_with_api(
    embeddings_path: &Path,
    ids_path: &Path,
    api_key: String,
    model: String,
    dimension: usize,
) -> Option<SemanticDetector> {
    match rhema_detection::HnswVectorIndex::load(embeddings_path, ids_path, dimension) {
        Ok(index) => {
            tracing::info!("Vector index loaded with API embedder: {} vectors", index.len());
            let embedder = rhema_detection::ApiEmbedder::new(api_key, model, dimension);
            Some(SemanticDetector::new(
                Box::new(embedder),
                Box::new(index),
            ))
        }
        Err(e) => {
            tracing::warn!("Failed to load vector index for API embedder: {e}");
            None
        }
    }
}

fn build_quotation_matcher(bible_db: &BibleDb) -> QuotationMatcher {
    match bible_db.load_all_verses_for_quotation(Some("en")) {
        Ok(verses) => {
            tracing::info!("Building quotation index from {} English verses", verses.len());
            QuotationMatcher::build(verses)
        }
        Err(e) => {
            tracing::warn!("Failed to load verses for quotation index: {e}");
            QuotationMatcher::new()
        }
    }
}
