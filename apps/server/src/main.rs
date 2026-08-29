mod config;
mod embeddings;
mod routes;
mod state;

use axum::{extract::State, routing::{get, post}, Json, Router};
use openbeam_bible::BibleDb;
use openbeam_detection::semantic::index::VectorIndex;
use openbeam_detection::{DetectionPipeline, QuotationMatcher, SemanticDetector};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, EnvFilter, layer::SubscriberExt, util::SubscriberInitExt};

use config::Config;
use state::AppState;

fn find_bible_db(configured_path: &str) -> PathBuf {
    let candidates = [
        PathBuf::from(configured_path),
        PathBuf::from("data/openbeam.db"),
        PathBuf::from("../../data/openbeam.db"),
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
    dotenvy::dotenv().ok();

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

    // Semantic search needs the vector index; fetch it if the build shipped
    // without it (see embeddings.rs).
    let index_files = embeddings::ensure_embeddings(&config).await;

    let api_embedder = config
        .openrouter_api_key
        .as_deref()
        .filter(|k| !k.is_empty())
        .map(|k| (k.to_string(), config.openrouter_embed_model.clone(), config.openrouter_embed_dim));

    if let Some((_, model, dimension)) = &api_embedder {
        tracing::info!("API embedder configured: model={model}, dim={dimension}");
    }

    if let Some(files) = index_files {
        let detector = match &api_embedder {
            Some((api_key, model, dimension)) => {
                try_load_semantic_with_api(&files.embeddings, &files.ids, api_key.clone(), model.clone(), *dimension)
            }
            None => try_load_semantic(&files.embeddings, &files.ids),
        };
        match detector {
            Some(detector) => {
                tracing::info!(
                    "Semantic search enabled ({} embedder)",
                    if api_embedder.is_some() { "API" } else { "stub" }
                );
                pipeline.set_semantic(detector);
            }
            None => tracing::warn!("Semantic search disabled (vector index load failed)"),
        }
    }

    // Build quotation matcher from Bible database
    let quotation_matcher = build_quotation_matcher(&bible_db);

    let overlay_sessions = Arc::new(routes::SessionRelayMap::new());
    let remote_state = Arc::new(routes::RemoteState::new());

    let app_state = Arc::new(AppState {
        detection_pipeline: tokio::sync::Mutex::new(pipeline),
        quotation_matcher: tokio::sync::Mutex::new(quotation_matcher),
        bible_db: bible_db.clone(),
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
        // Overlay relay (own state — SessionRelayMap, not AppState)
        .merge(
            Router::new()
                .route("/ws/overlay", get(routes::overlay::ws_overlay))
                .with_state(overlay_sessions),
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

    // Serve the SPA static files in production (STATIC_DIR env var)
    let app = if let Some(static_dir) = config.static_dir.as_ref() {
        let static_path = Path::new(static_dir);
        if static_path.exists() {
            let index = static_path.join("index.html");
            tracing::info!("Serving static files from {static_dir}");
            app.fallback_service(
                ServeDir::new(static_dir).fallback(ServeFile::new(index)),
            )
        } else {
            tracing::warn!("STATIC_DIR={static_dir} does not exist, skipping static file serving");
            app
        }
    } else {
        app
    };

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
    match openbeam_detection::HnswVectorIndex::load(embeddings_path, ids_path, dim) {
        Ok(index) => {
            tracing::info!("Vector index loaded: {} vectors", index.len());
            Some(SemanticDetector::new(
                Box::new(openbeam_detection::semantic::embedder::StubEmbedder::new(dim)),
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
    match openbeam_detection::HnswVectorIndex::load(embeddings_path, ids_path, dimension) {
        Ok(index) => {
            tracing::info!("Vector index loaded with API embedder: {} vectors", index.len());
            let embedder = openbeam_detection::ApiEmbedder::new(api_key, model, dimension);
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
