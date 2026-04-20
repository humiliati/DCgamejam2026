# CLI_TOOLS.md — Dungeon Gleaner Command-Line Inventory

Canonical index of every command-line tool the project ships or depends on. Paths are given relative to `<repo-root>` (see the `## Environment` preamble in `CLAUDE.md` / `README.md` for the concrete binding on your machine).

**Scope.** This is the "what runs from a shell" surface. Browser-launched editors (`tools/*.html`) are listed under [Browser tools](#browser-tools) for discoverability but are not CLIs. Language runtimes (Node, Python, git) are assumed present on the contributor machine — see [Prerequisites](#prerequisites).

---

## Prerequisites

| Runtime | Min version | Used by | Notes |
|---|---|---|---|
| Node.js | 18+ (20/22 fine) | every `tools/*.js`, `serve.js`, `tests/*.js`, raycast.js-master | No package.json at repo root — the main game ships zero npm deps. `raycast.js-master/` has its own `package.json`. |
| Python | 3.8+ | `serve.py`, `python -m http.server`, `python -m code_review_graph` | Ships a stdlib-only `serve.py`; no pip deps unless you use the graph builder. |
| Git | 2.34+ | repo ops, pre-commit hooks | Older-than-current Windows git writes index extensions that git 2.34.1 (the sandbox default) can't parse — see `CLAUDE.md` §Sandbox mount gotcha. |
| Bash | 5+ (WSL/Git Bash/macOS/Linux) | `scripts/build-webos.sh` | PowerShell equivalents live next to the `.sh` versions. |
| PowerShell | 5.1+ / 7+ | `scripts/*.ps1` | Windows authoring path. |
| webOS CLI (`ares-*`) | TV SDK | `scripts/build-webos.*` deploy step | Install separately from LG; not checked into the repo. Optional until you're deploying to a real TV. |

---

## Optional supporting tools

These are not required to build or ship the game. They make certain agent tasks substantially faster or enable workflows (asset pipelines, structural search, bootstrapping a new machine). Each row notes why this project in particular benefits, and how an agent or contributor can install it.

### Media / asset pipelines

| Tool | Why Dungeon Gleaner wants it | Install (Windows) | Install (macOS) | Install (Linux) |
|---|---|---|---|---|
| **ffmpeg** | Encode/trim Hero-Day music cues, convert WAV → OGG for `media_assets/audio/`, probe bitrate/channel-layout mismatches in incoming assets, generate the splash-screen `.webm` loops. Also used to inspect `.webm` files before commit since browser-side playback errors are opaque. | `choco install ffmpeg` / `scoop install ffmpeg` / `winget install Gyan.FFmpeg` | `brew install ffmpeg` | `apt install ffmpeg` |
| **ImageMagick** (`magick` / `convert`) | Resize/atlas spritesheets, batch-reprocess AI-generated art to canonical widths (64, 96, 128), fix stray alpha channels in `media_assets/textures/`, quick-extract animation frames from GIFs. | `choco install imagemagick` / `scoop install imagemagick` / `winget install ImageMagick.ImageMagick` | `brew install imagemagick` | `apt install imagemagick` |
| **oxipng** | Strip PNG metadata and recompress for dist size. Runs as an optional step before `scripts/build-webos.*`. | `cargo install oxipng` / `scoop install oxipng` | `brew install oxipng` | `cargo install oxipng` |
| **sox** | Normalize dialogue/bark VO volumes, quick fade-in/fade-out, generate silence padding. Smaller than ffmpeg for simple audio edits. | `choco install sox.portable` / `scoop install sox` | `brew install sox` | `apt install sox` |
| **audiowaveform** | Generate peak data for HUD VU-meter and sound-debug UI. Optional — only needed if visualizing audio streams. | `scoop install audiowaveform` (or build from source) | `brew install audiowaveform` | `apt install audiowaveform` (Ubuntu 22.10+) |

**Agent rule:** never commit re-encoded assets without also committing a note in the relevant `*_ROADMAP.md` recording the parameters (bitrate, sample rate, codec). This project has had asset-drift incidents before.

### Code / repo tooling

| Tool | Why | Install |
|---|---|---|
| **ripgrep** (`rg`) | Strictly faster than `grep` on the 50+-module engine tree; respects `.gitignore` by default; supports structured output (`--json`) that code-review-graph builders consume. Preferred over the Grep tool for one-off shell searches. | `choco install ripgrep` / `scoop install ripgrep` / `winget install BurntSushi.ripgrep.MSVC` / `brew install ripgrep` |
| **fd** | Replacement for `find` with a friendlier syntax. Used by the profile aliases when enumerating `engine/*.js` or `tools/_*-cache` dirs. | `choco install fd` / `scoop install fd` / `brew install fd` / `apt install fd-find` (binary `fdfind` on Debian/Ubuntu) |
| **jq** | Sidecar surgery: diffing `tools/floor-data.json`, inspecting `tools/npc-manifest.json`, filtering `card-manifest.json` without loading into a JS VM. Also needed for any pipeline that parses `ares-device --system-info` output. | `choco install jq` / `scoop install jq` / `winget install jqlang.jq` / `brew install jq` |
| **yq** | YAML/JSON/XML query with jq-like syntax. Useful for `.github/workflows/` edits (if/when we add CI) and for inspecting any webOS `appinfo.json` variants. | `choco install yq` / `scoop install yq` / `brew install yq` |
| **git-lfs** | Not currently used — included here preemptively. If large binary assets (WAV masters, 4K splash renders) ever land, turn LFS on *before* the first push or history rewrites get painful. | `choco install git-lfs` / `scoop install git-lfs` / `winget install GitHub.GitLFS` / `brew install git-lfs` |
| **delta** | Syntax-highlighted `git diff` output. Huge quality-of-life improvement when reviewing the ~2,000-line raycaster module diffs. | `choco install delta` / `scoop install delta` / `winget install dandavison.delta` / `brew install git-delta` |
| **just** | Task runner the repo's `justfile` (DOC-120) targets. Optional — every recipe maps to an underlying `node`/`bash` command documented here. | `choco install just` / `scoop install just` / `winget install Casey.Just` / `brew install just` / `cargo install just` |
| **hyperfine** | Benchmark harness for the `extract-floors.js` and raycaster pipeline — used when profiling regressions (`RAYCASTER_EXTRACTION_ROADMAP.md` Phase 4 gate). | `choco install hyperfine` / `scoop install hyperfine` / `winget install sharkdp.hyperfine` / `brew install hyperfine` |

### Bootstrapping a fresh Windows machine

Agents occasionally set up a new development machine — pin one of these package managers so subsequent installs are one-liners instead of manual download-and-install rodeos.

| Package manager | What it is | When to prefer it |
|---|---|---|
| **winget** | Microsoft's official package manager, ships with Windows 11 and current Windows 10. Signed installers sourced primarily from vendor-maintained manifests. | Default. Install nothing — it's already there. `winget install <pkg>` works out of the box. Prefer this for anything vendor-maintained (`Python.Python.3.12`, `OpenJS.NodeJS.LTS`, `Git.Git`). |
| **scoop** | User-profile installer, no admin required. Installs into `%USERPROFILE%\scoop\`. Packages are easy to add a manifest for. | Best for CLI-only tools (`ripgrep`, `fd`, `jq`, `just`) where you want them on `PATH` without UAC prompts. Playtesters running with locked-down admin benefit. |
| **chocolatey** | Long-standing community package manager, admin required, broad catalog. | Best when a tool exists in Chocolatey but not yet in winget/scoop, or when you need pre-built binaries for niche dev tooling. |

**Bootstrap sequence for a brand-new playtester Windows box:**

```powershell
# winget comes preinstalled on Windows 11 and current Windows 10.
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Python.Python.3.12
# Optional:
winget install BurntSushi.ripgrep.MSVC
winget install Gyan.FFmpeg
winget install Casey.Just
```

For agents: prefer `winget` first (official, signed), fall back to `scoop` if the package isn't there or you don't have admin, fall back to `chocolatey` only if the other two don't carry it. Do not install three package managers on the same machine unless necessary.

---

## Running the game locally

Three interchangeable serve options. Pick whichever is installed.

| Command | When to use |
|---|---|
| `node <repo-root>/serve.js [port]` | Default. Serves `<repo-root>/` on `http://localhost:8080`. Handles MIME types the stdlib Python server bungles. |
| `python3 <repo-root>/serve.py [port]` | No Node available. Same endpoints, cd's into the script's own directory. |
| `python -m http.server 8080` (from `<repo-root>`) | Minimal fallback. Works but `.wasm`/`.webm` MIME edge cases may surprise you. |

**Must run `node tools/extract-floors.js` first** on any fresh clone or after editing `engine/floor-blockout-*.js` — the browser loads `tools/floor-data.json` via XHR, and that file is generated, not committed.

Entry points once running:

- `http://localhost:8080/index.html` — the game
- `http://localhost:8080/test-harness.html` — engine smoke harness
- `http://localhost:8080/combat-test.html` — combat sandbox
- `http://localhost:8080/tools/blockout-visualizer.html` — tile editor
- `http://localhost:8080/tools/world-designer.html` — floor-spec authoring
- `http://localhost:8080/tools/bark-workbench.html` — NPC bark authoring
- `http://localhost:8080/tools/bookshelf.test.html` — bookshelf decor harness

---

## Data extraction (run before serve)

These scripts rebuild generated JSON sidecars from source modules. They are safe to rerun and fast.

| Command | Reads | Writes |
|---|---|---|
| `node <repo-root>/tools/extract-floors.js` | `engine/floor-blockout-*.js`, `tools/floor-payloads/*.json` | `tools/floor-data.json` |
| `node <repo-root>/tools/extract-npcs.js` | `engine/npc-*.js` + dialogue trees | `tools/npcs.json` (sidecar for `npc-cli`) |
| `node <repo-root>/tools/extract-dialogue-trees.js` | `engine/npc-dialogue-trees.js` | `tools/dialogue-trees.json` |
| `node <repo-root>/tools/extract-verb-nodes.js` | `engine/verb-*.js` | `tools/verb-nodes.json` |
| `node <repo-root>/tools/extract-verb-node-overrides.js` | per-floor overrides | `tools/verb-node-overrides.json` |
| `node <repo-root>/tools/extract-floors-v2.js` | (deprecated — v2 spike) | superseded by v1 |

**Agent rule:** never hand-edit the generated JSON. Edit the source module, rerun the extractor.

---

## Authoring CLIs

### `bo` — Blockout CLI (`tools/blockout-cli.js`)

Primary floor-authoring tool. Headless sibling of the Blockout Visualizer (`tools/blockout-visualizer.html`) — identical action vocabulary.

```
node <repo-root>/tools/blockout-cli.js <command> [flags]
```

Typical Windows convenience alias (PowerShell profile):

```powershell
function bo { node "$env:REPO_ROOT/tools/blockout-cli.js" @args }
```

Command categories (run `bo help` for the full list, `bo help <command>` for per-command docs):

| Category | Commands |
|---|---|
| Tile mutation | `paint-rect`, `paint-line`, `flood-fill`, `replace` |
| Composite stamps | `stamp-room`, `stamp-corridor`, `stamp-torch-ring`, `stamp-tunnel-corridor`, `stamp-porthole-wall`, `stamp-alcove-flank` |
| Floor lifecycle | `create-floor`, `set-biome`, `set-spawn`, `set-door-target`, `place-entity` |
| Inspection | `render-ascii`, `describe-cell`, `diff-ascii`, `describe` |
| Validation | `validate`, `report-validation` |
| Round-trip | `ingest`, `emit` |
| Help | `help [command]` |

All mutating commands honor `--dry-run`. Exit codes: `0` ok, `1` usage error, `2` runtime error.

### `npc` — NPC authoring CLI (`tools/npc-cli.js`)

DOC-110 Phase 0 scaffold for NPC + enemy actor manipulation. Mirrors `bo`'s dispatcher shape.

```
node <repo-root>/tools/npc-cli.js <command> [flags]
```

Shipping commands: `list`, `validate`, `schema`, `help`. Planned (Phase 1+): `create`, `bark orphans`, `enemy hydrate`, `population report`.

### `tools/npc-designer.js`

Launcher/glue for the NPC designer workflow (extracted actor/archetype registry utilities). Not a user-facing dispatcher — called from other tools.

### Schema / sidecar generators

One-shot generators for schema + data sidecars consumed by the game and the authoring CLIs.

| Command | Output |
|---|---|
| `node <repo-root>/tools/generate-schema-sidecar.js` | Schema summary sidecar |
| `node <repo-root>/tools/generate-archetype-sidecar.js` | Archetype registry sidecar |
| `node <repo-root>/tools/generate-enemies-sidecar.js` | Enemy roster sidecar |
| `node <repo-root>/tools/generate-enemy-cards-sidecar.js` | Enemy card definitions |
| `node <repo-root>/tools/generate-enemy-decks-sidecar.js` | Enemy deck compositions |
| `node <repo-root>/tools/generate-loot-tables-sidecar.js` | Loot tables |
| `node <repo-root>/tools/generate-verb-node-schema-sidecar.js` | Verb-node schema |
| `node <repo-root>/tools/generate-verb-node-overrides-schema-sidecar.js` | Overrides schema |
| `node <repo-root>/tools/generate-verb-node-template-sidecar.js` | Template catalog |

---

## Validators

Run before committing data changes; most emit non-zero exit on failure so they're CI-friendly.

| Command | Validates |
|---|---|
| `node <repo-root>/tools/schema-validator.js` | Generic schema runner (used by other validators) |
| `node <repo-root>/tools/validate-archetypes.js` | `tools/archetype-registry.json` coherence |
| `node <repo-root>/tools/validate-dialogue-trees.js` | Dialogue tree shape + NPC binding |
| `node <repo-root>/tools/validate-npcs-preflight.js` | NPC actor preflight checks |
| `node <repo-root>/tools/validate-verb-nodes.js` | Verb node schema conformance |
| `node <repo-root>/tools/validate-verb-node-overrides.js` | Per-floor override conformance |
| `node <repo-root>/tools/validate-verb-node-templates.js` | Template validity |
| `node <repo-root>/tools/triage-curve-mismatches.js` | Enemy stat-curve drift (see `docs/P5_3_CURVE_MISMATCH_TRIAGE.md`) |

Also available via `bo validate` / `bo report-validation` for blockout-specific structural rules (room-has-walls, door-no-target, offset-no-height).

---

## Test harnesses & smoke tests

Headless Node harnesses that exercise engine modules in a VM sandbox, same pattern as `extract-floors.js`.

| Command | Exercises |
|---|---|
| `node <repo-root>/tools/phase4-harness-v2.js` | Phase-4 end-to-end harness |
| `node <repo-root>/tools/phase4-uiprefs-harness.js` | UI prefs persistence |
| `node <repo-root>/tools/phase5-harness.js` | Phase-5 harness |
| `node <repo-root>/tools/phase4-quest-chain-copy.js` | QuestChain copy-path smoke |
| `node <repo-root>/tools/smoke-enemy-hydrator.js` | Enemy hydrator baseline |
| `node <repo-root>/tools/smoke-enemy-hydrator-curve.js` | Stat-curve path |
| `node <repo-root>/tools/smoke-enemy-hydrator-deck.js` | Deck hydration path |
| `node <repo-root>/tools/smoke-enemy-hydrator-loot.js` | Loot path |
| `node <repo-root>/tools/smoke-enemy-hydrator-reanim.js` | Reanimator path |
| `node <repo-root>/tools/smoke-verb-node-overrides.js` | Override resolution |
| `node <repo-root>/tools/boxforge-phase1-smoke.js` | BoxForge phase-1 smoke |
| `node <repo-root>/tools/boxforge-phase3a-smoke.js` | BoxForge phase-3a smoke |

Runnable tests under `tests/`:

| Command | Covers |
|---|---|
| `node <repo-root>/tests/test-dungeon-schedule.js` | DungeonSchedule rotation logic |
| `node <repo-root>/tests/test-mailbox-system.js` | MailboxPeek delivery |
| `node <repo-root>/tests/test-hose-decal.js`, `test-hose-decal-raster.js`, `test-hose-overlay.js` | HoseState / spray / decal rendering |

---

## Diagnostics & hooks

| Command | Purpose |
|---|---|
| `node <repo-root>/tools/check-budgets.js` | File-size budget check. Wired into `core.hooksPath = tools/.githooks/pre-commit`. Read-only. |

---

## Deploy (webOS TV)

| Command | Platform | Notes |
|---|---|---|
| `bash <repo-root>/scripts/build-webos.sh` | Linux/macOS/WSL | Assembles `<repo-root>/dist/` from a whitelist — excludes `tools/`, `docs/`, `tests/`, `raycast.js-master/`, `EyesOnly/`, `debug/`, `portal/`, `cd/`. |
| `pwsh <repo-root>/scripts/build-webos.ps1` | Windows PowerShell | PS counterpart. |
| `pwsh <repo-root>/scripts/audio-copy-and-verify.ps1 [-DryRun]` | Windows | Copies encoded audio into `media_assets/audio/` and verifies manifest. Assumes audio was encoded upstream (out-of-repo pipeline). |
| `ares-package dist/` → `ares-install` → `ares-launch` | LG webOS SDK | Standard webOS deploy. SDK not checked in; install from LG's developer site. |

### webOS extras (optional, once the SDK is installed)

| Command | Purpose |
|---|---|
| `ares-setup-device` | Register / inspect the TV target used by subsequent `ares-*` commands. Run once per device; stores device profile under `~/.ares/`. |
| `ares-device --system-info -d <name>` | Pulls firmware version, WebKit version, RAM, storage free, and installed app count. Use to confirm a playtest TV meets the minimum webOS version. |
| `ares-inspect -d <name> <appId>` | Opens Chrome DevTools against the running app on the TV. Console logs, network panel, and CPU profiles match what the `node serve.js` DevTools give you — without this, the TV is a black box. |
| `ares-debug -d <name> <appId>` | Service-framework level tracing (SSDP, Luna Service calls, lifecycle events). Heavier than `ares-inspect`; use when `inspect` can't reach the app (startup crash, permission issue). |
| `ares-log -d <name>` | Streams `pmlog` from the TV. Good for catching native-layer errors that DevTools can't see. |
| `ares-install --list -d <name>` | Enumerate installed apps on the target; find orphaned builds from previous iteration attempts. |

All six tools ship with the webOS TV SDK. If `ares-package` / `ares-install` / `ares-launch` already work, these will too.

---

## Reference repo — `raycast.js-master/`

Vendored under `<repo-root>/raycast.js-master/` as a read-only reference for DDA, texture mapping, and skybox math. It has its own `package.json`:

```
cd <repo-root>/raycast.js-master
npm install            # once
npm run start          # serve on :3000
npm run start:debug    # DEBUG=1
npm run watch          # nodemon
npm run build          # production
npm run build:debug    # dev build
```

**Do not add deps to the main game.** The zero-build, zero-npm rule in `CLAUDE.md` applies to `<repo-root>/`, not to the vendored reference.

---

## Code & docs graphs (MCP)

Two separate graphs, surfaced via MCP in supported Cowork / Claude Code sessions. Build commands are Python.

| Graph | Build from | MCP tools |
|---|---|---|
| Main code-review-graph | `python -m code_review_graph build` at `<repo-root>/` | `detect_changes`, `get_review_context`, `get_impact_radius`, `get_affected_flows`, `query_graph`, `semantic_search_nodes`, `get_architecture_overview`, `list_communities`, `refactor_tool` |
| raycast.js-master sub-graph | `python -m code_review_graph build` inside `<repo-root>/raycast.js-master/` | Same tools; auto-switches when cwd is under the subdirectory |

**Agent rule:** always check the code-review-graph before `Grep`/`Glob`/`Read` on engine code — it's cheaper and gives structural context file scanning cannot. See `CLAUDE.md` § MCP Tools.

For the docs corpus, see `docs/DOC_GRAPH_BLOCKOUT_ARC.md` (a static Mermaid graph, not an MCP server) and `docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md` (flat catalog).

---

## Browser tools

Not CLIs, but often invoked in the same agent workflow. Open via a running serve (`http://localhost:8080/tools/…`).

| File | Purpose |
|---|---|
| `tools/blockout-visualizer.html` | Tile-level floor editor. `Ctrl+S` patches `GRID`, `SPAWN`, `doorTargets` in place. `window.BO.run({action,...})` is the agent API. Press `?` for help. |
| `tools/world-designer.html` | Creates §3.1 seed payloads (biome, dimensions, required cells) and hands off to BO-V via `sessionStorage['pendingFloorSpec']`. |
| `tools/bark-workbench.html` | NPC bark authoring surface. |
| `tools/bookshelf.test.html` | Bookshelf decor isolated harness. |
| `test-harness.html` (root) | Engine-level smoke harness. |
| `combat-test.html` (root) | Combat sandbox. |

See `docs/BLOCKOUT_VISUALIZER_README.md` (DOC-125) and `docs/BLOCKOUT_VISUALIZER_ROADMAP_V2.md` (DOC-127) for authoring workflows. `docs/TOOLS_SHORT_ROADMAP.md` (DOC-128) tracks in-flight tooling work.

---

## Common flows

**Fresh clone → running game:**

```sh
cd <repo-root>
node tools/extract-floors.js
node serve.js
# open http://localhost:8080/index.html
```

**Edited a floor blockout → verify:**

```sh
node tools/extract-floors.js
node tools/blockout-cli.js validate --floor <id>
node tools/blockout-cli.js render-ascii --floor <id>
# refresh browser
```

**Added an NPC → verify:**

```sh
node tools/extract-npcs.js
node tools/validate-dialogue-trees.js
node tools/validate-npcs-preflight.js
node tools/npc-cli.js list --floor <id>
```

**Full pre-commit sweep:**

```sh
node tools/extract-floors.js
node tools/extract-npcs.js
node tools/extract-dialogue-trees.js
node tools/extract-verb-nodes.js
node tools/extract-verb-node-overrides.js
node tools/validate-archetypes.js
node tools/validate-dialogue-trees.js
node tools/validate-npcs-preflight.js
node tools/validate-verb-nodes.js
node tools/validate-verb-node-overrides.js
node tools/validate-verb-node-templates.js
node tools/blockout-cli.js validate
# check-budgets.js runs automatically via the pre-commit hook
```

---

## Shortcuts and workflow wrappers

For day-to-day use the canonical commands above are wrapped by three optional surfaces. All three call the same underlying tools — no new logic.

- **`<repo-root>/justfile` (DOC-120).** Install [just](https://just.systems), then `just` lists everything. Common recipes: `just serve`, `just extract-all`, `just validate-all`, `just pre-commit`, `just pre-serve`, `just post-blockout-edit`, `just fresh-clone`. Pass-through recipes forward args: `just bo paint-rect 2.1 5 5 10 10 wall`, `just npc list`.
- **`<repo-root>/scripts/dg-profile.ps1` / `dg-profile.sh` (DOC-121).** Dot-source / source into your shell profile to get `bo`, `npc`, `boxforge`, `dg-serve`, `dg-extract-all`, `dg-validate`, `dg-pre-serve`, `dg-pre-commit`, `dg-post-blockout-edit`, `dg-fresh-clone`, `dg-versions`. Honors `$DG_REPO_ROOT` so the functions work from any cwd.
- **`<repo-root>/scripts/workflow/` (DOC-122).** Standalone `.sh` / `.ps1` wrappers for the same macros, for use without sourcing the profile. See `scripts/workflow/README.md`.

---

## Maintenance notes

- **Deprecated / superseded files:** `tools/boxforge-cli-v2.js` (cache-bust scratch, superseded by `boxforge-cli.js`), `tools/extract-floors-v2.js` (spike, superseded by `extract-floors.js`), `tools/extract-floors.js.old` (9-byte stale marker). Don't invoke these; they're kept for history. See `docs/CLI_CONSOLIDATION.md` (DOC-119) for the full cleanup inventory and the proposed `tools/_archive/` layout.
- **`tools/_*-cache/` directories:** agent scratch from prior phases (`_debrief-categories-cache`, `_doc116-cache`, `_phase2a-cache`, `_phase5-cache`, etc). Safe to ignore. DOC-119 recommends moving them under `tools/_archive/phase-caches/` at a calm pause point.
- **Line endings on Windows:** fresh clones on Windows can hit EOL drift (LF→CRLF via default `core.autocrlf`). See `docs/EOL_DECISION.md` (DOC-123) for the recommended `git config --local` pins and rollback.
- When you add a new CLI: update this file, add an entry to `docs/TABLE_OF_CONTENTS_CROSS_ROADMAP.md` if it's significant, and — if agent-facing — cross-link from `AGENTS.md`. If the flow is worth a shortcut, also add a `just` recipe and a `dg-*` profile function.
