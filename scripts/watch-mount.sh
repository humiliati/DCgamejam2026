#!/usr/bin/env bash
# watch-mount.sh — sandbox-side companion to scripts/watch-mount.ps1.
#
# Runs inside the Cowork Linux sandbox. Samples the watched files through
# the mount every -i/--interval-ms milliseconds and writes a CSV with the
# same schema the PowerShell version produces, so the two logs can be
# merged by timestamp to see exactly when (and whether) Windows ground
# truth and the mount view diverge.
#
# CSV columns: timestamp,path,size,mtime,sha256,event
#   timestamp — UTC ISO-8601 with millisecond precision (matches PS version)
#   path      — as given on the command line (relative to repo root)
#   size      — bytes reported by stat through the mount
#   mtime     — stat's modification time as the mount presents it
#   sha256    — hash of the bytes we can read back through the mount
#   event     — init | init-missing | created | deleted | changed
#
# Usage:
#   scripts/watch-mount.sh                               # defaults
#   scripts/watch-mount.sh engine/floor-manager.js ...   # custom file list
#   scripts/watch-mount.sh -i 250 tools/floor-data.js    # faster sampling
#
# Run this AT THE SAME TIME as scripts\watch-mount.ps1 on Windows. Then
# after a reproduction, diff the two CSVs:
#
#   # In bash, on the same system or with the logs side-by-side:
#   paste -d, \
#       scripts/_watch-logs/samples-20260420-*.csv \
#       scripts/_watch-logs/samples-mount-20260420-*.csv \
#     | less -S
#
# Or sort -m them by timestamp for an interleaved view.
#
# Ctrl+C to stop; CSV is line-flushed so interrupts are safe.

set -uo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
_root="$(cd "$_here/.." && pwd)"

INTERVAL_MS=500
LOG_DIR="$_here/_watch-logs"
declare -a TARGETS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        -i|--interval-ms)
            INTERVAL_MS="$2"; shift 2 ;;
        -l|--log-dir)
            LOG_DIR="$2"; shift 2 ;;
        -h|--help)
            sed -n 's/^# \{0,1\}//;1,/^$/p' "$0" | head -40
            exit 0 ;;
        --)
            shift
            while [[ $# -gt 0 ]]; do TARGETS+=("$1"); shift; done ;;
        -*)
            echo "watch-mount.sh: unknown option: $1" >&2
            exit 2 ;;
        *)
            TARGETS+=("$1"); shift ;;
    esac
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
    TARGETS=(
        "engine/floor-manager.js"
        "tools/floor-data.js"
    )
fi

mkdir -p "$LOG_DIR"
STAMP="$(date -u +'%Y%m%d-%H%M%S')"
SAMPLE_LOG="$LOG_DIR/samples-mount-$STAMP.csv"
echo 'timestamp,path,size,mtime,sha256,event' > "$SAMPLE_LOG"

# Resolve absolute paths and build a rel-name lookup so the CSV stays readable.
declare -a ABS_TARGETS=()
declare -A REL_OF=()
declare -A PREV_EXISTS=() PREV_SIZE=() PREV_MTIME=() PREV_SHA=()
for t in "${TARGETS[@]}"; do
    if [[ "$t" = /* ]]; then
        abs="$t"
    else
        abs="$_root/$t"
    fi
    ABS_TARGETS+=("$abs")
    REL_OF["$abs"]="$t"
    PREV_EXISTS["$abs"]=""
    PREV_SIZE["$abs"]=""
    PREV_MTIME["$abs"]=""
    PREV_SHA["$abs"]=""
done

SLEEP_SECS="$(awk -v ms="$INTERVAL_MS" 'BEGIN { printf "%.3f", ms / 1000 }')"

echo "watch-mount.sh: starting"
echo "  repo:       $_root"
echo "  files:      ${TARGETS[*]}"
echo "  interval:   ${INTERVAL_MS}ms"
echo "  sample log: $SAMPLE_LOG"
echo "  (Ctrl+C to stop)"
echo

on_exit() {
    echo
    echo "watch-mount.sh: stopped. Log: $SAMPLE_LOG"
    exit 0
}
trap on_exit INT TERM

# ISO-8601 UTC with millisecond precision — matches the PS version's
# [DateTime]::UtcNow.ToString('o') so rows sort-merge cleanly.
now_iso() {
    date -u +'%Y-%m-%dT%H:%M:%S.%3NZ'
}

snapshot() {
    # Echoes: exists|size|mtime  (mtime may contain pipes on some locales;
    # we only use stat's default -c '%y' which is space-safe.)
    local p="$1"
    if [[ ! -e "$p" ]]; then
        printf 'false|0|'
        return
    fi
    local size mtime
    size="$(stat -c '%s' "$p" 2>/dev/null || echo 0)"
    mtime="$(stat -c '%y' "$p" 2>/dev/null || echo '')"
    printf 'true|%s|%s' "$size" "$mtime"
}

hashfile() {
    local p="$1"
    if [[ ! -e "$p" ]]; then
        echo ""
        return
    fi
    sha256sum "$p" 2>/dev/null | awk '{print $1}'
}

while true; do
    now="$(now_iso)"
    for abs in "${ABS_TARGETS[@]}"; do
        rel="${REL_OF[$abs]}"
        snap="$(snapshot "$abs")"
        exists="${snap%%|*}"
        rest="${snap#*|}"
        size="${rest%%|*}"
        mtime="${rest#*|}"

        prev_exists="${PREV_EXISTS[$abs]}"
        event=""

        if [[ -z "$prev_exists" ]]; then
            if [[ "$exists" = "true" ]]; then event="init"; else event="init-missing"; fi
        elif [[ "$exists" = "false" && "$prev_exists" = "true" ]]; then
            event="deleted"
        elif [[ "$exists" = "true" && "$prev_exists" = "false" ]]; then
            event="created"
        elif [[ "$exists" = "true" ]]; then
            if [[ "$size" != "${PREV_SIZE[$abs]}" || "$mtime" != "${PREV_MTIME[$abs]}" ]]; then
                event="changed"
            fi
        fi

        if [[ -n "$event" ]]; then
            sha=""
            if [[ "$exists" = "true" ]]; then
                sha="$(hashfile "$abs")"
            fi
            sha_short="${sha:0:12}"
            printf '%s  %-12s  %s  size=%s  sha=%s\n' \
                "$now" "$event" "$rel" "$size" "${sha_short:-'-'}"
            # CSV row — quote path in case it contains spaces.
            printf '%s,"%s",%s,%s,%s,%s\n' \
                "$now" "$rel" "$size" "$mtime" "$sha" "$event" >> "$SAMPLE_LOG"

            PREV_EXISTS["$abs"]="$exists"
            PREV_SIZE["$abs"]="$size"
            PREV_MTIME["$abs"]="$mtime"
            PREV_SHA["$abs"]="$sha"
        fi
    done
    sleep "$SLEEP_SECS"
done
