//! Locate the semantic-search vector index on disk, fetching it if needed.
//!
//! `data/embeddings.bin` is tracked with Git LFS. Builds that clone without
//! LFS end up with the ~130-byte pointer file instead of the 500 MB index,
//! which used to surface only as "file size is not a multiple of 4" at boot.
//! When `EMBEDDINGS_URL` is set, a missing or pointer-only index is
//! downloaded into `EMBEDDINGS_DIR` (ideally a persistent volume) and
//! verified against `EMBEDDINGS_SHA256` when that is provided.

use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use tokio::io::AsyncWriteExt;

use crate::config::Config;

const LFS_POINTER_PREFIX: &[u8] = b"version https://git-lfs.github.com/spec/v1";
const EMBEDDINGS_FILE: &str = "embeddings.bin";
const IDS_FILE: &str = "embeddings-ids.bin";

/// Paths to a usable index, or `None` (already logged) if there is none.
pub struct EmbeddingsFiles {
    pub embeddings: PathBuf,
    pub ids: PathBuf,
}

pub async fn ensure_embeddings(config: &Config) -> Option<EmbeddingsFiles> {
    let dir = PathBuf::from(&config.embeddings_dir);
    let embeddings = dir.join(EMBEDDINGS_FILE);

    // The ids file is small and lives in git proper, so it is baked into the
    // image under data/ even when the index itself is fetched into a volume.
    let ids = [dir.join(IDS_FILE), PathBuf::from("data").join(IDS_FILE)]
        .into_iter()
        .find(|p| p.exists());
    let Some(ids) = ids else {
        tracing::warn!("Semantic search disabled: {IDS_FILE} not found");
        return None;
    };

    match classify(&embeddings) {
        FileState::Usable => return Some(EmbeddingsFiles { embeddings, ids }),
        FileState::LfsPointer => tracing::warn!(
            "{} is a Git LFS pointer, not the index (clone without LFS?)",
            embeddings.display()
        ),
        FileState::Missing => tracing::info!("{} not found", embeddings.display()),
    }

    let Some(url) = config.embeddings_url.as_deref() else {
        tracing::warn!("Semantic search disabled: set EMBEDDINGS_URL to fetch the index at startup");
        return None;
    };

    match download(url, &embeddings, config.embeddings_sha256.as_deref()).await {
        Ok(bytes) => {
            tracing::info!("Downloaded vector index ({} MB) to {}", bytes / 1_000_000, embeddings.display());
            Some(EmbeddingsFiles { embeddings, ids })
        }
        Err(e) => {
            tracing::warn!("Semantic search disabled: failed to download vector index: {e}");
            None
        }
    }
}

enum FileState {
    Usable,
    LfsPointer,
    Missing,
}

fn classify(path: &Path) -> FileState {
    let Ok(meta) = std::fs::metadata(path) else {
        return FileState::Missing;
    };
    if meta.len() < 1024 {
        if let Ok(head) = std::fs::read(path) {
            if head.starts_with(LFS_POINTER_PREFIX) {
                return FileState::LfsPointer;
            }
        }
    }
    FileState::Usable
}

/// Stream `url` into `dest` via a temp file, hashing as it goes. Returns the
/// byte count. The temp file is removed on any failure.
async fn download(url: &str, dest: &Path, expected_sha256: Option<&str>) -> Result<u64, String> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let tmp = dest.with_extension("bin.part");
    tracing::info!("Downloading vector index from {url}");

    let result = stream_to_file(url, &tmp).await;
    let (bytes, digest) = match result {
        Ok(v) => v,
        Err(e) => {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(e);
        }
    };

    if let Some(expected) = expected_sha256 {
        if digest != expected {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(format!("sha256 mismatch: expected {expected}, got {digest}"));
        }
    }

    tokio::fs::rename(&tmp, dest).await.map_err(|e| format!("rename to {}: {e}", dest.display()))?;
    Ok(bytes)
}

async fn stream_to_file(url: &str, tmp: &Path) -> Result<(u64, String), String> {
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    let response = response.error_for_status().map_err(|e| e.to_string())?;

    let mut file = tokio::fs::File::create(tmp).await.map_err(|e| format!("create {}: {e}", tmp.display()))?;
    let mut hasher = Sha256::new();
    let mut bytes: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        bytes += chunk.len() as u64;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    file.flush().await.map_err(|e| e.to_string())?;
    Ok((bytes, hex::encode(hasher.finalize())))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str, contents: &[u8]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openbeam-embeddings-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(EMBEDDINGS_FILE);
        std::fs::write(&path, contents).unwrap();
        path
    }

    #[test]
    fn missing_file_is_missing() {
        assert!(matches!(classify(Path::new("/nonexistent/embeddings.bin")), FileState::Missing));
    }

    #[test]
    fn lfs_pointer_is_recognised() {
        let path = temp_file(
            "pointer",
            b"version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 509575168\n",
        );
        assert!(matches!(classify(&path), FileState::LfsPointer));
    }

    #[test]
    fn small_binary_file_is_still_usable() {
        // Short but not a pointer: leave it to the index loader to judge.
        let path = temp_file("small", &[0u8; 16]);
        assert!(matches!(classify(&path), FileState::Usable));
    }

    #[tokio::test]
    async fn download_rejects_bad_url_and_leaves_no_partial_file() {
        let dest = temp_file("download", b"").with_file_name("fresh.bin");
        let err = download("http://127.0.0.1:9/embeddings.bin", &dest, None).await.unwrap_err();
        assert!(!err.is_empty());
        assert!(!dest.exists());
        assert!(!dest.with_extension("bin.part").exists());
    }
}
