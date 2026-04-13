#!/usr/bin/env bash
# Creates an empty openbeam.db with the correct schema.
# Requires: sqlite3 CLI  (apt install sqlite3)
#
# To populate with Bible data, use the build-bible-db.ts script
# from the openbeam repository, or copy an existing openbeam.db here.
set -euo pipefail
cd "$(dirname "$0")"
rm -f openbeam.db
sqlite3 openbeam.db < schema.sql
echo "Created empty openbeam.db at $(pwd)/openbeam.db"
