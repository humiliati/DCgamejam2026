#!/usr/bin/env bash
# ============================================================
# build-webos.sh — Pass 5b.0 ship-whitelist builder
# ============================================================
# Assembles a webOS-ready `dist/` by copying ONLY the whitelisted
# runtime assets. Dev-only directories (tools/, node_modules/,
# vendor/, raycast.js-master/, EyesOnly/, docs/, tests/, debug/,
# portal/, cd/) MUST NOT appear in dist/.
#
# Usage: bash scripts/build-webos.sh
# Exit:  0 on success, non-zero if forbidden paths leak in.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"

echo "[build-webos] root=$ROOT"
rm -rf "$DIST"
mkdir -p "$DIST"

# ── Whitelist: everything the runtime game needs ─────────────
WHITELIST=(
  index.html
  engine
  css
  data
  audio
  assets
  media_assets
  dungeongleanerlogo.png
  dungeongleanerlogo2.png
)

for item in "${WHITELIST[@]}"; do
  src="$ROOT/$item"
  if [ -e "$src" ]; then
    cp -R "$src" "$DIST/"
    echo "  + $item"
  else
    echo "  ! missing: $item (skipped)"
  fi
done

# ── Blacklist check — these must NOT appear in dist/ ─────────
FORBIDDEN=(tools node_modules vendor raycast.js-master EyesOnly docs tests debug portal cd scripts serve.js serve.py combat-test.html test-harness.html)
FAIL=0
for bad in "${FORBIDDEN[@]}"; do
  if [ -e "$DIST/$bad" ]; then
    echo "[FAIL] forbidden path leaked into dist/: $bad"
    FAIL=1
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "[build-webos] FAILED — dist contains forbidden dev artifacts."
  exit 2
fi

echo "[build-webos] OK — dist/ is clean."
du -sh "$DIST" 2>/dev/null || true
