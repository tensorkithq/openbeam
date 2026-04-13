use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use openbeam_bible::{BibleDb, BibleError, SearchVerse};
use serde::Deserialize;
use std::sync::Arc;

pub fn bible_routes() -> Router<Arc<BibleDb>> {
    Router::new()
        .route("/api/bible/translations", get(list_translations))
        .route("/api/bible/books", get(list_books))
        .route(
            "/api/bible/chapter/{translation_id}/{book_number}/{chapter}",
            get(get_chapter),
        )
        .route(
            "/api/bible/verse/{translation_id}/{book_number}/{chapter}/{verse}",
            get(get_verse),
        )
        .route("/api/bible/verse/{id}", get(get_verse_by_id))
        .route("/api/bible/search", get(search_verses))
        .route(
            "/api/bible/cross-references/{book_number}/{chapter}/{verse}",
            get(get_cross_references),
        )
        .route(
            "/api/bible/verses-for-search/{translation_id}",
            get(get_verses_for_search),
        )
}

struct AppError(BibleError);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self.0 {
            BibleError::NotFound(_) => StatusCode::NOT_FOUND,
            BibleError::InvalidReference(_) => StatusCode::BAD_REQUEST,
            BibleError::DatabaseError(_) => StatusCode::INTERNAL_SERVER_ERROR,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, self.0.to_string()).into_response()
    }
}

impl From<BibleError> for AppError {
    fn from(e: BibleError) -> Self {
        Self(e)
    }
}

async fn list_translations(
    State(db): State<Arc<BibleDb>>,
) -> Result<impl IntoResponse, AppError> {
    let translations = db.list_translations()?;
    Ok(Json(translations))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BooksQuery {
    translation_id: i64,
}

async fn list_books(
    State(db): State<Arc<BibleDb>>,
    Query(params): Query<BooksQuery>,
) -> Result<impl IntoResponse, AppError> {
    let books = db.list_books(params.translation_id)?;
    Ok(Json(books))
}

async fn get_chapter(
    State(db): State<Arc<BibleDb>>,
    Path((translation_id, book_number, chapter)): Path<(i64, i32, i32)>,
) -> Result<impl IntoResponse, AppError> {
    let verses = db.get_chapter(translation_id, book_number, chapter)?;
    Ok(Json(verses))
}

async fn get_verse(
    State(db): State<Arc<BibleDb>>,
    Path((translation_id, book_number, chapter, verse)): Path<(i64, i32, i32, i32)>,
) -> Result<impl IntoResponse, AppError> {
    let verse = db.get_verse(translation_id, book_number, chapter, verse)?;
    Ok(Json(verse))
}

async fn get_verse_by_id(
    State(db): State<Arc<BibleDb>>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let verse = db.get_verse_by_id(id)?;
    Ok(Json(verse))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchQuery {
    q: String,
    translation_id: i64,
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_limit() -> usize {
    50
}

async fn search_verses(
    State(db): State<Arc<BibleDb>>,
    Query(params): Query<SearchQuery>,
) -> Result<impl IntoResponse, AppError> {
    let verses = db.search_verses(&params.q, params.translation_id, params.limit)?;
    Ok(Json(verses))
}

async fn get_cross_references(
    State(db): State<Arc<BibleDb>>,
    Path((book_number, chapter, verse)): Path<(i32, i32, i32)>,
) -> Result<impl IntoResponse, AppError> {
    let refs = db.get_cross_references(book_number, chapter, verse)?;
    Ok(Json(refs))
}

async fn get_verses_for_search(
    State(db): State<Arc<BibleDb>>,
    Path(translation_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let verses: Vec<SearchVerse> = db.load_translation_verses_for_search(translation_id)?;
    Ok(Json(verses))
}
