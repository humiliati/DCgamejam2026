# CLI Consolidation Memo (DOC-119)

Authored 2026-04-19 as part of the fresh-terminal ramp-up. Companion to `docs/CLI_TOOLS.md` (DOC-118) and the new `<repo-root>/justfile` (DOC-120).

**Scope:** this memo is *additive only*. It documents redundant or superseded surfaces in `tools/` and recommends archival actions for the maintainer to execute at their discretion. **No files were moved, renamed, or deleted** during the authoring of this memo.

Paths use `<repo-root>` as defined in `README.md` and `CLAUDE.md`. On the current machine, `<repo-root>` resolves to `C:\Users\hughe\Dev\Dungeon Gleaner Main\`.

## Summary of findings

Scan performed over `<repo-root>/tools/` and cross-referenced against `docs/`, `engine/`, `scripts/`, `index.html`, `test-harness.html`, and root-level wrappers:

- 11 phase-scratch cache directories at `tools/_*-cache/` (~700 KB total) are unreferenced by any shipping code path.
- 3 file-level scratch artifacts (`boxforge-cli-v2.js`, `extract-floors-v2.js`, `extract-floors.js.old`) contain only self-deprecation comment stubs.
- 2 `blockout-visualizer.html` sibling files (`.bak.css-extract`, `.fixed`) appear to be extraction snapshots predating the current shipped visualizer.
- v1/v2 pairs: only two genuine v1/v2 CLI pairs exist. One pair (boxforge, extract-floors) is already a stub-only situation; the other (`phase4-harness-v2.js`) is a live harness whose "v2" refers to a harness iteration, not a CLI variant.

No engine or production CLI surfaces were found to be duplicated.

## Detailed table

| Path | Size | Type | Referenced by | Recommendation |
|---|---|---|---|---|
| `tools/_debrief-categories-cache/` | 148 KB | phase scratch | none | archive |
| `tools/_doc116-cache/` | 60 KB | phase scratch (DOC-116) | none | archive |
| `tools/_phase2a-cache/` | 24 KB | phase scratch | none | archive |
| `tools/_phase2b-cache/` | 32 KB | phase scratch | none | archive |
| `tools/_phase3-cache/` | 32 KB | phase scratch | none | archive |
| `tools/_phase4-cache/` | 124 KB | phase scratch | none | archive |
| `tools/_phase5-cache/` | 104 KB | phase scratch | none | archive |
| `tools/_phase5b-cache/` | 20 KB | phase scratch | none | archive |
| `tools/_phase6-cache/` | 16 KB | phase scratch | none | archive |
| `tools/_readiness-phase3-cache/` | 72 KB | phase scratch | none | archive |
| `tools/_sprint-timer-cache/` | 68 KB | phase scratch | none | archive |
| `tools/_sync_probe.txt` | 21 B | bindfs probe | none | keep or remove |
| `tools/_sync_probe_dispose.txt` | 23 B | bindfs probe (disposable) | none | remove after verifying fresh-terminal stability |
| `tools/boxforge-cli-v2.js` | 78 B | comment stub | `docs/CLI_TOOLS.md` (marked deprecated) | archive |
| `tools/extract-floors-v2.js` | 110 B | comment stub | `docs/CLI_TOOLS.md` (marked deprecated) | archive |
| `tools/extract-floors.js.old` | 9 B | stale marker | none | remove |
| `tools/blockout-visualizer.html.bak.css-extract` | 34 KB | pre-extraction snapshot | none | archive |
| `tools/blockout-visualizer.html.fixed` | 58 KB | alternate draft | none | archive or compare + delete |
| `tools/phase4-harness-v2.js` | 5.4 KB | active test harness | `docs/CLI_TOOLS.md` | **keep** — the v2 suffix denotes a harness revision, not a deprecated CLI; still referenced by `phase4-uiprefs-harness.js` in test flow |
| `tools/phase4-quest-chain-copy.js` | 36 KB | fresh-copy for bindfs workaround | `tools/phase4-harness-v2.js` | reassess post fresh-terminal — if bindfs no longer truncates, this copy is redundant |

## Proposed archival layout

If the maintainer wants to act on this memo, the lowest-risk, most reversible move is to create a single `tools/_archive/` directory and move the candidates in. Nothing is deleted; history is preserved in git.

```text
tools/_archive/
    README.md                            (new — explains the archive)
    phase-caches/
        _debrief-categories-cache/
        _doc116-cache/
        _phase2a-cache/
        ...
    superseded/
        boxforge-cli-v2.js
        extract-floors-v2.js
        extract-floors.js.old
    snapshots/
        blockout-visualizer.html.bak.css-extract
        blockout-visualizer.html.fixed
```

Execute via:

```sh
# Windows PowerShell or Git Bash, from <repo-root>
mkdir -p tools/_archive/phase-caches
mkdir -p tools/_archive/superseded
mkdir -p tools/_archive/snapshots
mv tools/_*-cache tools/_archive/phase-caches/
mv tools/boxforge-cli-v2.js tools/extract-floors-v2.js tools/extract-floors.js.old \
   tools/_archive/superseded/
mv tools/blockout-visualizer.html.bak.css-extract tools/blockout-visualizer.html.fixed \
   tools/_archive/snapshots/
```

Then commit with message referencing this memo (DOC-119).

## Reassessment candidates

Two files are held back from the archive table pending a fresh-terminal check:

- `tools/phase4-quest-chain-copy.js` — this is a hand-maintained copy of `engine/quest-chain.js` used by `phase4-harness-v2.js` to dodge the bindfs stale-cache bug. On the fresh terminal, bindfs truncation does not reproduce (`CLAUDE.md` §Sandbox mount gotcha). If the harness passes against the live engine file directly, this copy can be retired.
- `tools/_sync_probe_dispose.txt` — a disposable probe file left from an earlier mount-sync investigation. Safe to remove after one or two successful sessions on the fresh terminal.

## Genuine v1/v2 pairs

After scanning, the only "real" v1/v2 pair (where v2 actively supersedes v1) is not in `tools/` at all — it is the `docs/BLOCKOUT_VISUALIZER_ROADMAPv2.md` document inside `tools/` (78 KB). That file is a roadmap document, not code. It is referenced by the cross-roadmap index and should stay in place. Flagging it here so future scans don't treat the filename pattern as a cleanup target.

## Non-candidates (for clarity)

These surfaces were inspected and are **not** cleanup targets:

- `tools/vendor/` — third-party libs (schema validators, etc.).
- `tools/templates/` — authoring templates referenced by CLI generators.
- `tools/recipes/` — active authoring recipes for `bo`/`npc`.
- `tools/cli/`, `tools/js/`, `tools/css/` — active sub-trees for authoring UIs.
- `tools/floor-payloads/` — the canonical per-floor payload JSONs.
- `tools/verb-node-overrides/` — per-node override manifests used at runtime.
- `tools/world-engine/` — world generation helpers referenced by several CLIs.

## Cross-references

- `docs/CLI_TOOLS.md` (DOC-118) — canonical CLI inventory.
- `docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md` — DOC index.
- `CLAUDE.md` §Sandbox mount gotcha — bindfs history that motivated the scratch caches.
- `<repo-root>/justfile` (DOC-120) — task runner.
