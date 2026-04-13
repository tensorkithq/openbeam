#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DB_PATH%/*}"
DATA_DIR="${DATA_DIR:-./data}"

mkdir -p "$DATA_DIR"

# Check if Bible DB exists
if [ ! -f "$DATA_DIR/openbeam.db" ]; then
  echo "Bible database not found at $DATA_DIR/openbeam.db"
  echo "Please copy openbeam.db from the Rhema project's data pipeline."
  echo "See: https://github.com/openbezal/rhema/tree/main/data"
  exit 1
fi

echo "Data check passed:"
echo "  Bible DB: $DATA_DIR/openbeam.db ($(du -h "$DATA_DIR/openbeam.db" | cut -f1))"

# Check for HNSW index (optional)
if [ -f "$DATA_DIR/embeddings/kjv-qwen3-8b.bin" ]; then
  echo "  HNSW index: found"
else
  echo "  HNSW index: not found (semantic detection will be disabled)"
fi
