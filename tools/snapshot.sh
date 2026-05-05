#!/usr/bin/env bash
# Capture a still image from each Madeira webcam and write a manifest.
# Used by .github/workflows/snapshots.yml (hourly cron) and runnable locally.
#
# Each cam is one of two kinds:
#   yt:<id>:<videoId>           YouTube live stream — pull i.ytimg.com/.../hqdefault_live.jpg
#   nm:<id>:<netmadeira-slug>   Netmadeira preview — scrape the page for a signed load URL

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/snapshots"
mkdir -p "$OUT"

ENTRIES=(
  "yt:funchal:kLsk1pZ5YeY"
  "yt:calheta:t4x0u0ARLwo"
  "nm:porto-moniz:porto-moniz"
  "yt:seixal:WwOuI_G5WUI"
  "yt:machico:wbGK0x5QZes"
)

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"
CAPTURED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

fetch_yt() {
  local yt="$1"; local out="$2"
  # Prefer the high-res live frame (1280x720 16:9 — no baked-in letterbox).
  for variant in maxresdefault_live maxresdefault hqdefault_live hqdefault; do
    if curl --fail --silent --show-error --max-time 20 \
            "https://i.ytimg.com/vi/$yt/$variant.jpg" -o "$out.new" \
       && [ -s "$out.new" ]; then
      mv "$out.new" "$out"
      return 0
    fi
  done
  rm -f "$out.new"
  return 1
}

fetch_nm() {
  local slug="$1"; local out="$2"
  local page_url="https://www.netmadeira.com/webcams-madeira/$slug"
  local load_path
  load_path="$(curl --silent --max-time 15 -L -A "$UA" "$page_url" \
              | grep -oE "load/netmadeira/$slug/[0-9]+/[a-f0-9]+" | head -1)"
  if [ -z "$load_path" ]; then
    return 1
  fi
  if curl --fail --silent --show-error --max-time 15 \
          -A "$UA" -H "Referer: $page_url" \
          "https://www.netmadeira.com/webcams-madeira/$load_path" \
          -o "$out.new"; then
    [ -s "$out.new" ] && mv "$out.new" "$out" && return 0
  fi
  rm -f "$out.new"
  return 1
}

tmp="$(mktemp)"
{
  echo "{"
  echo "  \"capturedAt\": \"$CAPTURED_AT\","
  echo "  \"items\": {"
  sep=""
  for entry in "${ENTRIES[@]}"; do
    kind="${entry%%:*}"
    rest="${entry#*:}"
    id="${rest%%:*}"
    src="${rest#*:}"
    file="$OUT/$id.jpg"

    ok=0
    case "$kind" in
      yt) fetch_yt "$src" "$file"  && ok=1 ;;
      nm) fetch_nm "$src" "$file"  && ok=1 ;;
    esac

    if [ "$ok" -eq 1 ]; then
      printf '%s    "%s": { "file": "%s.jpg", "kind": "%s", "src": "%s", "capturedAt": "%s" }\n' \
        "$sep" "$id" "$id" "$kind" "$src" "$CAPTURED_AT"
    elif [ -f "$file" ]; then
      printf '%s    "%s": { "file": "%s.jpg", "kind": "%s", "src": "%s", "capturedAt": "%s", "stale": true }\n' \
        "$sep" "$id" "$id" "$kind" "$src" "$CAPTURED_AT"
    else
      continue
    fi
    sep=",
"
  done
  echo
  echo "  }"
  echo "}"
} > "$tmp"

mv "$tmp" "$OUT/index.json"

echo "wrote $OUT/index.json"
ls -la "$OUT"
