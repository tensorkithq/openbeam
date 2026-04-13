/**
 * Pre-compute verse embeddings using OpenRouter API.
 * Run: bun run apps/server/scripts/compute-embeddings.ts
 *
 * Requires: OPENROUTER_API_KEY env var, .env file, or .idea/openrouter.env
 * Reads: apps/server/data/openbeam.db
 * Writes: apps/server/data/embeddings.bin, apps/server/data/embeddings-ids.bin
 */

import { Database } from "bun:sqlite";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const MODEL = "qwen/qwen3-embedding-8b";
const DIM = 4096;
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const DATA_DIR = "apps/server/data";
const DB_PATH = join(DATA_DIR, "openbeam.db");

function loadApiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;

  // Try .env at project root
  try {
    const text = require("fs").readFileSync(".env", "utf-8") as string;
    const match = text.match(/^OPENROUTER_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}

  // Try .idea/openrouter.env (raw key, no KEY= prefix)
  try {
    const key = require("fs").readFileSync(".idea/openrouter.env", "utf-8").trim();
    if (key && key.startsWith("sk-")) return key;
  } catch {}

  throw new Error(
    "OPENROUTER_API_KEY not found. Set it as env var, in .env, or in .idea/openrouter.env"
  );
}

async function embedBatch(apiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
    usage?: { prompt_tokens?: number; total_tokens?: number };
  };

  // Sort by index to guarantee order matches input
  const sorted = json.data.sort((a, b) => a.index - b.index);
  return sorted.map((d) => d.embedding);
}

async function embedBatchWithRetry(
  apiKey: string,
  texts: string[],
  batchNum: number
): Promise<number[][]> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await embedBatch(apiKey, texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_RETRIES) {
        throw new Error(`Batch ${batchNum} failed after ${MAX_RETRIES} attempts: ${msg}`);
      }
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.log(`  Batch ${batchNum} attempt ${attempt} failed (${msg}), retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const apiKey = loadApiKey();
  console.log("API key loaded");

  const db = new Database(DB_PATH, { readonly: true });
  const verses = db
    .query("SELECT id, text FROM verses WHERE translation_id = 1 ORDER BY id")
    .all() as { id: number; text: string }[];
  db.close();
  console.log(`Found ${verses.length} verses to embed`);

  const totalBatches = Math.ceil(verses.length / BATCH_SIZE);
  const allEmbeddings: number[][] = [];
  const allIds: number[] = [];
  let totalTokens = 0;
  const startTime = Date.now();

  for (let i = 0; i < verses.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = verses.slice(i, i + BATCH_SIZE);
    const texts = batch.map((v) => v.text);
    const ids = batch.map((v) => v.id);

    const embeddings = await embedBatchWithRetry(apiKey, texts, batchNum);

    // Validate dimensions
    for (let j = 0; j < embeddings.length; j++) {
      if (embeddings[j].length !== DIM) {
        throw new Error(
          `Embedding ${i + j} has ${embeddings[j].length} dims, expected ${DIM}`
        );
      }
    }

    allEmbeddings.push(...embeddings);
    allIds.push(...ids);

    // Rough token estimate: ~1.3 tokens per word, ~10 words per verse
    totalTokens += texts.reduce((sum, t) => sum + Math.ceil(t.split(/\s+/).length * 1.3), 0);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const done = Math.min(i + BATCH_SIZE, verses.length);
    const pct = ((done / verses.length) * 100).toFixed(1);
    const rate = (done / ((Date.now() - startTime) / 1000)).toFixed(0);
    console.log(
      `  [${batchNum}/${totalBatches}] ${done}/${verses.length} (${pct}%) — ${elapsed}s elapsed, ~${rate} verses/s`
    );

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < verses.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Write embeddings.bin — f32 array, native endian (little-endian on x86)
  const embBuffer = new Float32Array(allEmbeddings.length * DIM);
  for (let i = 0; i < allEmbeddings.length; i++) {
    embBuffer.set(allEmbeddings[i], i * DIM);
  }
  const embPath = join(DATA_DIR, "embeddings.bin");
  writeFileSync(embPath, Buffer.from(embBuffer.buffer));
  const embSizeMB = (embBuffer.buffer.byteLength / 1024 / 1024).toFixed(1);
  console.log(`Wrote ${embPath} (${embSizeMB} MB)`);

  // Write embeddings-ids.bin — i64 array, native endian
  const idsBuffer = new BigInt64Array(allIds.map((id) => BigInt(id)));
  const idsPath = join(DATA_DIR, "embeddings-ids.bin");
  writeFileSync(idsPath, Buffer.from(idsBuffer.buffer));
  const idsSizeKB = (idsBuffer.buffer.byteLength / 1024).toFixed(1);
  console.log(`Wrote ${idsPath} (${idsSizeKB} KB)`);

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  // Qwen3-embedding-8b pricing: ~$0.02 per 1M tokens (very cheap)
  const estimatedCost = (totalTokens / 1_000_000) * 0.02;
  console.log(
    `\nDone! ${allEmbeddings.length} verses embedded with ${MODEL} (dim=${DIM})` +
      `\nTime: ${totalElapsed}s | ~${totalTokens} tokens | Est. cost: $${estimatedCost.toFixed(4)}`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
