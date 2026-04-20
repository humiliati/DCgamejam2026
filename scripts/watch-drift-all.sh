#!/usr/bin/env bash
# watch-drift-all.sh — sandbox-side whole-repo drift watcher. Companion to
# scripts/watch-drift-all.ps1.
#
# Walks every file in the repo each tick (default 1 Hz), diffs against the
# previous walk, and logs every change it sees through the mount. Merge
# its CSV with the Windows-side log to find rows where the two sides saw
# different sizes, hashes, or orderings — that's mount drift.
#
# CSV columns: timestamp,event,path,size,mtime,sha256
#   timestamp — UTC ISO-8601 with millisecond precision
#   event     — init | created | deleted | changed
#   path      — relative to repo root, forward slashes
#   size      — stat size through the mount
#   mtime     — stat mtime through the mount (epoch seconds w/ nanos)
#   sha256    — hash of the bytes readable through the mount (blank for
#               deletes and for the initial inventory)
#
# Usage:
#   scripts/watch-drift-all.sh
#   scripts/watch-drift-all.sh -i 500
#   scripts/watch-drift-all.sh --exclude '^docs/' --exclude '^audio/'
#
# Ctrl+C to stop.

set -uo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
_root="$(cd "$_here/.." && pwd)"

INTERVAL_MS=1000
LOG_DIR="$_here/_watch-logs"
declare -a EXCLUDES=(
    '^[.]git/objects/'
    '^[.]git/logs/'
    '^[.]git/lfs/'
    '^scripts/_watch-logs/'
    '^node_modules/'
    '^dist/'
    '^EyesOnly/'
)

while [[ $# -gt 0 ]]; do
    case "$1" in
        -i|--interval-ms) INTERVAL_MS="$2"; shift 2 ;;
        -l|--log-dir)     LOG_DIR="$2"; shift 2 ;;
        -e|--exclude)     EXCLUDES+=("$2"); shift 2 ;;
        -r|--repo)        _root="$(cd "$2" && pwd)"; shift 2 ;;
        -h|--help)
            sed -n 's/^# \{0,1\}//;1,/^$/p' "$0" | head -30
            exit 0 ;;
        *)
            echo "watch-drift-all.sh: unknown arg: $1" >&2
            exit 2 ;;
    esac
done

mkdir -p "$LOG_DIR"
STAMP="$(date -u +'%Y%m%d-%H%M%S')"
DRIFT_LOG="$LOG_DIR/drift-mount-$STAMP.csv"
echo 'timestamp,event,path,size,mtime,sha256' > "$DRIFT_LOG"

SLEEP_SECS="$(awk -v ms="$INTERVAL_MS" 'BEGIN { printf "%.3f", ms / 1000 }')"

echo "watch-drift-all.sh: starting"
echo "  repo:      $_root"
echo "  interval:  ${INTERVAL_MS}ms"
echo "  drift log: $DRIFT_LOG"
echo "  excludes:  ${EXCLUDES[*]}"
echo "  Ctrl+C to stop."
echo

now_iso() { date -u +'%Y-%m-%dT%H:%M:%S.%3NZ'; }

on_exit() {
    echo
    echo "watch-drift-all.sh: stopped. Log: $DRIFT_LOG"
    exit 0
}
trap on_exit INT TERM

# Join excludes into one regex, then filter with awk so the anchor (^)
# applies to the path field, not the start of the tab-separated line.
EXCLUDE_RE="$(IFS='|'; echo "${EXCLUDES[*]}")"

inventory() {
    (
        cd "$_root"
        # %s = size, %T@ = mtime (epoch seconds + nanoseconds), %P = path
        find . -type f -printf '%s\t%T@\t%P\n' 2>/dev/null \
          | awk -F'\t' -v re="$EXCLUDE_RE" '$3 !~ re'
    )
}

hashfile() {
    local p="$_root/$1"
    if [[ ! -e "$p" ]]; then echo ""; return; fi
    sha256sum "$p" 2>/dev/null | awk '{print $1}'
}

write_row() {
    # args: ts event rel size mtime sha
    printf '%s,%s,"%s",%s,%s,%s\n' "$1" "$2" "$3" "$4" "$5" "$6" >> "$DRIFT_LOG"
}

# ---- initial inventory ----
PREV_FILE="$(mktemp)"
CURR_FILE="$(mktemp)"
inventory > "$PREV_FILE"
INIT_COUNT="$(wc -l < "$PREV_FILE")"
echo "Initial inventory: $INIT_COUNT files."

INIT_TS="$(now_iso)"
while IFS=$'\t' read -r size mtime rel; do
    write_row "$INIT_TS" "init" "$rel" "$size" "$mtime" ""
done < "$PREV_FILE"

while true; do
    sleep "$SLEEP_SECS"
    NOW="$(now_iso)"
    inventory > "$CURR_FILE"

    # Diff previous vs current inventory. awk emits lines of:
    #   event<TAB>path<TAB>size<TAB>mtime
    awk -F'\t' '
        NR == FNR {
            prev_size[$3] = $1
            prev_mtime[$3] = $2
            next
        }
        {
            p = $3
            if (!(p in prev_size)) {
                print "created\t" p "\t" $1 "\t" $2
            } else if (prev_size[p] != $1 || prev_mtime[p] != $2) {
                print "changed\t" p "\t" $1 "\t" $2
            }
            seen[p] = 1
        }
        END {
            for (p in prev_size) {
                if (!(p in seen)) {
                    print "deleted\t" p "\t" prev_size[p] "\t" prev_mtime[p]
                }
            }
        }
    ' "$PREV_FILE" "$CURR_FILE" | while IFS=$'\t' read -r event rel size mtime; do
        if [[ "$event" = "deleted" ]]; then
            sha=""
        else
            sha="$(hashfile "$rel")"
        fi
        sha_short="${sha:0:12}"
        printf '%s  %-7s  %s  size=%s  sha=%s\n' \
            "$NOW" "$event" "$rel" "$size" "${sha_short:-'-'}"
        write_row "$NOW" "$event" "$rel" "$size" "$mtime" "$sha"
    done

    # Rotate inventories for next tick.
    mv "$CURR_FILE" "$PREV_FILE"
    CURR_FILE="$(mktemp)"
done
