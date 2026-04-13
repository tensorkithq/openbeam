use crate::error::DetectionError;
use super::embedder::TextEmbedder;

/// API-based text embedder that calls OpenRouter for embedding inference.
///
/// Replaces the ONNX-based local embedder. Uses the OpenAI-compatible
/// embeddings endpoint on OpenRouter with models like Qwen3-Embedding-8B.
pub struct ApiEmbedder {
    client: reqwest::Client,
    api_key: String,
    model: String,
    dimension: usize,
}

impl ApiEmbedder {
    pub fn new(api_key: String, model: String, dimension: usize) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
            model,
            dimension,
        }
    }
}

impl TextEmbedder for ApiEmbedder {
    fn embed(&self, text: &str) -> Result<Vec<f32>, DetectionError> {
        // The trait is sync but reqwest is async. Use block_in_place to
        // allow blocking within the tokio runtime without panicking.
        let rt = tokio::runtime::Handle::try_current().map_err(|e| {
            DetectionError::Internal(format!("no tokio runtime available: {e}"))
        })?;

        tokio::task::block_in_place(|| rt.block_on(async {
            let response = self
                .client
                .post("https://openrouter.ai/api/v1/embeddings")
                .header("Authorization", format!("Bearer {}", self.api_key))
                .header("Content-Type", "application/json")
                .json(&serde_json::json!({
                    "model": self.model,
                    "input": text
                }))
                .send()
                .await
                .map_err(|e| DetectionError::Internal(format!("embedding request failed: {e}")))?
                .json::<serde_json::Value>()
                .await
                .map_err(|e| DetectionError::Internal(format!("embedding response parse failed: {e}")))?;

            let embedding = response["data"][0]["embedding"]
                .as_array()
                .ok_or_else(|| DetectionError::Internal("no embedding in response".into()))?
                .iter()
                .map(|v| v.as_f64().unwrap_or(0.0) as f32)
                .collect::<Vec<f32>>();

            if embedding.is_empty() {
                return Err(DetectionError::Internal("empty embedding returned".into()));
            }

            Ok(embedding)
        }))
    }

    fn dimension(&self) -> usize {
        self.dimension
    }
}
