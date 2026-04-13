#!/usr/bin/env bash
# Creates an empty rhema.db with the correct schema.
# Requires: sqlite3 CLI  (apt install sqlite3)
#
# To populate with Bible data, use the build-bible-db.ts script
# from the rhema repository, or copy an existing rhema.db here.
set -euo pipefail
cd "$(dirname "$0")"
rm -f rhema.db
sqlite3 rhema.db < schema.sql
echo "Created empty rhema.db at $(pwd)/rhema.db"
