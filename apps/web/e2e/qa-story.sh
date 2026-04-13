#!/usr/bin/env bash
set -uo pipefail

BASE_URL="${QA_BASE_URL:-http://localhost:4001}"
LOG_DIR="$(cd "$(dirname "$0")" && pwd)/qa-logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PASSED=0
FAILED=0
WARNED=0
TOTAL=0

# Session state (populated as we go)
TRANSLATION_ID=""
BOOK_NUMBER=""

rm -rf "$LOG_DIR"
mkdir -p "$LOG_DIR"

# -- helpers ---------------------------------------------------------------

# Run a curl and split into body + http status.
# Usage: api_get <log_file> <path>
api_get() {
  local log="$1" path="$2"
  local response http_code body

  response=$(curl -s -w "\n%{http_code}" "${BASE_URL}${path}")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  printf '%s' "$body" > "${LOG_DIR}/${log}"
  echo "$http_code"
}

# Usage: api_post <log_file> <path> <json_body>
api_post() {
  local log="$1" path="$2" payload="$3"
  local response http_code body

  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "${BASE_URL}${path}")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  printf '%s' "$body" > "${LOG_DIR}/${log}"
  echo "$http_code"
}

step_header() {
  local act="$1" label="$2"
  printf "\n${CYAN}[%s]${RESET} ${BOLD}%s${RESET}\n" "$act" "$label"
}

assert_status() {
  local got="$1" want="$2" label="$3"
  TOTAL=$((TOTAL + 1))
  if [[ "$got" == "$want" ]]; then
    printf "  ${GREEN}PASS${RESET} HTTP %s — %s\n" "$got" "$label"
    PASSED=$((PASSED + 1))
  else
    printf "  ${RED}FAIL${RESET} HTTP %s (expected %s) — %s\n" "$got" "$want" "$label"
    FAILED=$((FAILED + 1))
  fi
}

# assert_json <log_file> <jq_filter> <description>
# Succeeds when the jq filter outputs a non-empty, non-null, non-false result.
assert_json() {
  local file="${LOG_DIR}/$1" filter="$2" label="$3"
  TOTAL=$((TOTAL + 1))

  local val
  val=$(jq -r "$filter" < "$file" 2>/dev/null || echo "")

  if [[ -n "$val" && "$val" != "null" && "$val" != "false" ]]; then
    printf "  ${GREEN}PASS${RESET} %s (got: %s)\n" "$label" "$(echo "$val" | head -c 80)"
    PASSED=$((PASSED + 1))
  else
    printf "  ${RED}FAIL${RESET} %s (filter: %s)\n" "$label" "$filter"
    FAILED=$((FAILED + 1))
  fi
}

# assert_json_contains <log_file> <jq_filter_producing_string> <substring> <description>
assert_json_contains() {
  local file="${LOG_DIR}/$1" filter="$2" substring="$3" label="$4"
  TOTAL=$((TOTAL + 1))

  local val
  val=$(jq -r "$filter" < "$file" 2>/dev/null || echo "")

  if echo "$val" | grep -qi "$substring"; then
    printf "  ${GREEN}PASS${RESET} %s\n" "$label"
    PASSED=$((PASSED + 1))
  else
    printf "  ${RED}FAIL${RESET} %s (expected substring '%s' in: %s)\n" "$label" "$substring" "$(echo "$val" | head -c 120)"
    FAILED=$((FAILED + 1))
  fi
}

warn_msg() {
  TOTAL=$((TOTAL + 1))
  WARNED=$((WARNED + 1))
  printf "  ${YELLOW}WARN${RESET} %s\n" "$1"
}

bail() {
  printf "\n${RED}FATAL:${RESET} %s\n" "$1"
  print_summary
  exit 1
}

print_summary() {
  printf "\n${BOLD}────────────────────────────────────────${RESET}\n"
  printf "${BOLD}Summary:${RESET}  "
  printf "${GREEN}%d passed${RESET}  " "$PASSED"
  [[ "$WARNED" -gt 0 ]] && printf "${YELLOW}%d warnings${RESET}  " "$WARNED"
  printf "${RED}%d failed${RESET}  " "$FAILED"
  printf "(%d total)\n" "$TOTAL"
  printf "Logs:     %s/\n" "$LOG_DIR"
  printf "${BOLD}────────────────────────────────────────${RESET}\n"
}

# ==========================================================================
# Act 1: App Boot
# ==========================================================================

step_header "Act 1" "Health check — verify server is running"
status=$(api_get "01-health.log" "/api/health")
assert_status "$status" "200" "health endpoint reachable"
[[ "$status" != "200" ]] && bail "Server is not running at ${BASE_URL}"
assert_json "01-health.log" '.status' "status field present"
assert_json_contains "01-health.log" '.status' "ok" "status is ok"
assert_json "01-health.log" '.capabilities.bible' "bible capability reported"

# --------------------------------------------------------------------------

step_header "Act 1" "Load translations — fetch available Bible translations"
status=$(api_get "02-translations.log" "/api/bible/translations")
assert_status "$status" "200" "translations endpoint"
assert_json "02-translations.log" '.[0].id' "at least one translation returned"

TRANSLATION_ID=$(jq -r '.[0].id' < "${LOG_DIR}/02-translations.log")
TRANSLATION_ABBR=$(jq -r '.[0].abbreviation // .[0].name // "?"' < "${LOG_DIR}/02-translations.log")
printf "  ${CYAN}INFO${RESET} Using translation: id=%s (%s)\n" "$TRANSLATION_ID" "$TRANSLATION_ABBR"

# --------------------------------------------------------------------------

step_header "Act 1" "Load books list for translation ${TRANSLATION_ID}"
status=$(api_get "03-books.log" "/api/bible/books?translationId=${TRANSLATION_ID}")
assert_status "$status" "200" "books endpoint"
assert_json "03-books.log" '.[0].book_number' "books list is not empty"

# Find John (book_number 43)
BOOK_NUMBER=43
john_name=$(jq -r --argjson bn "$BOOK_NUMBER" '[.[] | select(.book_number == $bn)][0].name // empty' < "${LOG_DIR}/03-books.log")
if [[ -n "$john_name" ]]; then
  TOTAL=$((TOTAL + 1)); PASSED=$((PASSED + 1))
  printf "  ${GREEN}PASS${RESET} Found book_number 43: %s\n" "$john_name"
else
  warn_msg "Book number 43 (John) not found; using first book instead"
  BOOK_NUMBER=$(jq -r '.[0].book_number' < "${LOG_DIR}/03-books.log")
fi

# ==========================================================================
# Act 2: Book Navigation
# ==========================================================================

step_header "Act 2" "Load John chapter 3 — GET chapter/${TRANSLATION_ID}/${BOOK_NUMBER}/3"
status=$(api_get "04-chapter.log" "/api/bible/chapter/${TRANSLATION_ID}/${BOOK_NUMBER}/3")
assert_status "$status" "200" "chapter endpoint"
assert_json "04-chapter.log" '.[0].verse' "chapter has verses"

verse_count=$(jq 'length' < "${LOG_DIR}/04-chapter.log")
printf "  ${CYAN}INFO${RESET} Chapter returned %s verses\n" "$verse_count"

# --------------------------------------------------------------------------

step_header "Act 2" "Verify verse 16 exists in chapter response"
v16=$(jq -r '[.[] | select(.verse == 16)][0].text // empty' < "${LOG_DIR}/04-chapter.log")
if [[ -n "$v16" ]]; then
  TOTAL=$((TOTAL + 1)); PASSED=$((PASSED + 1))
  printf "  ${GREEN}PASS${RESET} Verse 16 present: %.70s...\n" "$v16"
else
  TOTAL=$((TOTAL + 1)); FAILED=$((FAILED + 1))
  printf "  ${RED}FAIL${RESET} Verse 16 not found in chapter response\n"
fi

# --------------------------------------------------------------------------

step_header "Act 2" "Fetch John 3:16 specifically"
status=$(api_get "06-verse.log" "/api/bible/verse/${TRANSLATION_ID}/${BOOK_NUMBER}/3/16")
assert_status "$status" "200" "single verse endpoint"
assert_json "06-verse.log" '.text' "verse text returned"
assert_json "06-verse.log" '.verse' "verse number present"

# --------------------------------------------------------------------------

step_header "Act 2" "Cross-references for John 3:16"
status=$(api_get "07-crossrefs.log" "/api/bible/cross-references/${BOOK_NUMBER}/3/16")
assert_status "$status" "200" "cross-references endpoint"

ref_count=$(jq 'if type == "array" then length else 0 end' < "${LOG_DIR}/07-crossrefs.log")
if [[ "$ref_count" -gt 0 ]]; then
  TOTAL=$((TOTAL + 1)); PASSED=$((PASSED + 1))
  printf "  ${GREEN}PASS${RESET} Got %s cross-references\n" "$ref_count"
else
  warn_msg "No cross-references returned (may be empty for this verse/DB)"
fi

# ==========================================================================
# Act 3: Search
# ==========================================================================

step_header "Act 3" "Full-text search for 'love'"
status=$(api_get "08-search.log" "/api/bible/search?q=love&translationId=${TRANSLATION_ID}&limit=10")
assert_status "$status" "200" "search endpoint"
assert_json "08-search.log" '.[0].text' "search returned results"

search_count=$(jq 'length' < "${LOG_DIR}/08-search.log")
printf "  ${CYAN}INFO${RESET} Search returned %s results\n" "$search_count"

# --------------------------------------------------------------------------

step_header "Act 3" "Verify search results contain 'love'"
love_hits=$(jq '[.[] | select(.text | ascii_downcase | contains("love"))] | length' < "${LOG_DIR}/08-search.log")
TOTAL=$((TOTAL + 1))
if [[ "$love_hits" -gt 0 ]]; then
  PASSED=$((PASSED + 1))
  printf "  ${GREEN}PASS${RESET} %s/%s results contain 'love'\n" "$love_hits" "$search_count"
else
  FAILED=$((FAILED + 1))
  printf "  ${RED}FAIL${RESET} No results contain the word 'love'\n"
fi

# --------------------------------------------------------------------------

step_header "Act 3" "Detection — run pipeline on known verse quote"
detect_payload='{"text":"For God so loved the world that he gave his only begotten son"}'
status=$(api_post "10-detect.log" "/api/detection/detect" "$detect_payload")
assert_status "$status" "200" "detection endpoint"

det_count=$(jq 'if type == "array" then length else 0 end' < "${LOG_DIR}/10-detect.log")
if [[ "$det_count" -gt 0 ]]; then
  TOTAL=$((TOTAL + 1)); PASSED=$((PASSED + 1))
  first_ref=$(jq -r '.[0].verse_ref' < "${LOG_DIR}/10-detect.log")
  printf "  ${GREEN}PASS${RESET} Detection returned %s result(s), first: %s\n" "$det_count" "$first_ref"
else
  warn_msg "Detection returned 0 results (pipeline may not have matched)"
fi

# ==========================================================================
# Act 4: Detection Pipeline Status
# ==========================================================================

step_header "Act 4" "Detection status — check available strategies"
status=$(api_get "12-detection-status.log" "/api/detection/status")
assert_status "$status" "200" "detection status endpoint"
assert_json "12-detection-status.log" '.has_direct' "has_direct field present"

has_semantic=$(jq -r '.has_semantic' < "${LOG_DIR}/12-detection-status.log")
printf "  ${CYAN}INFO${RESET} Semantic search available: %s\n" "$has_semantic"

# --------------------------------------------------------------------------

step_header "Act 4" "Quotation matching — Psalm 23:1"
quot_payload='{"text":"The Lord is my shepherd I shall not want"}'
status=$(api_post "13-quotation.log" "/api/detection/quotation" "$quot_payload")
assert_status "$status" "200" "quotation endpoint"

quot_count=$(jq 'if type == "array" then length else 0 end' < "${LOG_DIR}/13-quotation.log")
if [[ "$quot_count" -gt 0 ]]; then
  TOTAL=$((TOTAL + 1)); PASSED=$((PASSED + 1))
  first_quot=$(jq -r '.[0].verse_ref' < "${LOG_DIR}/13-quotation.log")
  printf "  ${GREEN}PASS${RESET} Quotation returned %s result(s), first: %s\n" "$quot_count" "$first_quot"
else
  warn_msg "Quotation returned 0 results (index may be empty or text didn't match)"
fi

# ==========================================================================
# Act 5: Remote Control
# ==========================================================================

step_header "Act 5" "Remote status — get current snapshot"
status=$(api_get "14-remote-status.log" "/api/remote/status")
assert_status "$status" "200" "remote status GET"
assert_json "14-remote-status.log" '. | has("on_air")' "on_air field present"
assert_json "14-remote-status.log" '. | has("confidence_threshold")' "confidence_threshold field present"

# --------------------------------------------------------------------------

step_header "Act 5" "Remote status — POST update"
update_payload='{"on_air":true,"live_verse":"John 3:16"}'
status=$(api_post "15-remote-update.log" "/api/remote/status" "$update_payload")
assert_status "$status" "200" "remote status POST accepts update"

# Verify the update stuck by re-reading status
status=$(api_get "15b-remote-verify.log" "/api/remote/status")
assert_status "$status" "200" "re-read remote status after update"
assert_json_contains "15b-remote-verify.log" '.live_verse' "John 3:16" "live_verse updated to John 3:16"

on_air_val=$(jq -r '.on_air' < "${LOG_DIR}/15b-remote-verify.log")
TOTAL=$((TOTAL + 1))
if [[ "$on_air_val" == "true" ]]; then
  PASSED=$((PASSED + 1))
  printf "  ${GREEN}PASS${RESET} on_air is true after update\n"
else
  FAILED=$((FAILED + 1))
  printf "  ${RED}FAIL${RESET} on_air expected true, got %s\n" "$on_air_val"
fi

# --------------------------------------------------------------------------

step_header "Act 5" "Control command — send 'next'"
control_payload='{"command":"next"}'
status=$(api_post "16-control.log" "/api/v1/control" "$control_payload")
assert_status "$status" "200" "control endpoint"
assert_json "16-control.log" '.success' "success field present"

# ==========================================================================
# Act 6: Transcription Status
# ==========================================================================

step_header "Act 6" "Transcription status — check STT availability"
status=$(api_get "17-transcription.log" "/api/transcription/status")
assert_status "$status" "200" "transcription status endpoint"
assert_json "17-transcription.log" '.available' "available field present"
assert_json "17-transcription.log" '.provider' "provider field present"

# ==========================================================================
# Cleanup: reset remote status so tests are idempotent
# ==========================================================================

api_post "99-cleanup.log" "/api/remote/status" '{"on_air":false,"live_verse":null}' > /dev/null 2>&1

# ==========================================================================
# Summary
# ==========================================================================

print_summary

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
exit 0
