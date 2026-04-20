# Dungeon Gleaner task runner (DOC-120)
# Usage: install `just` (https://just.systems) then run `just` or `just <recipe>`.
# Works cross-platform (Windows PowerShell, Git Bash, WSL, macOS, Linux).
#
# Philosophy: recipes wrap the canonical commands documented in docs/CLI_TOOLS.md.
# Do not add logic that doesn't exist as a standalone CLI — the CLI is the contract,
# the justfile is just a typing shortcut.

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]
set positional-arguments

# Default recipe: list everything available.
default:
    @just --list

# ---------- run the game locally ----------

# Serve the game on :8080 using Node (preferred).
serve:
    node serve.js

# Serve the game on :8080 using Python 3 (fallback).
serve-py:
    python3 serve.py

# Serve the game on :8080 using the stdlib http.server (minimal fallback).
serve-min:
    python -m http.server 8080

# ---------- data extraction ----------

# Rebuild tools/floor-data.json from engine IIFEs + payload sidecars.
extract-floors:
    node tools/extract-floors.js

# Rebuild all generated sidecars (enemies, archetypes, loot, schema, verb nodes).
extract-sidecars:
    node tools/generate-enemies-sidecar.js
    node tools/generate-archetype-sidecar.js
    node tools/generate-enemy-cards-sidecar.js
    node tools/generate-enemy-decks-sidecar.js
    node tools/generate-loot-tables-sidecar.js
    node tools/generate-schema-sidecar.js
    node tools/generate-verb-node-schema-sidecar.js
    node tools/generate-verb-node-overrides-schema-sidecar.js
    node tools/generate-verb-node-template-sidecar.js

# Extract all derived data (floors + sidecars + npcs + dialogue + verb nodes).
extract-all: extract-floors extract-sidecars
    node tools/extract-npcs.js
    node tools/extract-dialogue-trees.js
    node tools/extract-verb-nodes.js
    node tools/extract-verb-node-overrides.js

# ---------- validators ----------

# Validate all floor blockouts.
validate-blockouts:
    node tools/blockout-cli.js validate

# Budget checker (tile / sprite / perf budgets).
validate-budgets:
    node tools/check-budgets.js

# Run the full validator suite before committing.
validate-all: validate-blockouts validate-budgets

# ---------- authoring CLIs (pass-through) ----------

# Blockout authoring CLI — positional args forward to bo.
# Example: `just bo paint-rect 2.1 5 5 10 10 wall`
bo *args:
    node tools/blockout-cli.js {{args}}

# NPC authoring CLI — positional args forward.
# Example: `just npc list` or `just npc new --biome promenade`
npc *args:
    node tools/npc-cli.js {{args}}

# Boxforge CLI — positional args forward.
boxforge *args:
    node tools/boxforge-cli.js {{args}}

# ---------- test harnesses ----------

# Run the quest-chain / UIPrefs harness (DOC-107 Phase 4).
test-phase4:
    node tools/phase4-harness-v2.js
    node tools/phase4-uiprefs-harness.js

# Run the boxforge smoke tests.
test-boxforge:
    node tools/boxforge-phase1-smoke.js
    node tools/boxforge-phase3a-smoke.js

# ---------- build stamp (playtester version identifier, DOC-129) ----------

# Regenerate engine/game-build-stamp.js from the current git HEAD.
stamp-build:
    bash scripts/stamp-build.sh

# PowerShell variant (Windows).
stamp-build-ps:
    pwsh scripts/stamp-build.ps1

# Regenerate + fold into the current commit. Use before `git push`.
stamp-and-commit: stamp-build
    git add engine/game-build-stamp.js
    git commit --amend --no-edit

# ---------- deploy ----------

# Build the webOS whitelist-only dist/ (bash variant).
build-webos:
    bash scripts/build-webos.sh

# Build the webOS whitelist-only dist/ (PowerShell variant, Windows).
build-webos-ps:
    pwsh scripts/build-webos.ps1

# ---------- workflow macros ----------

# Fresh clone: first-time setup after git clone.
fresh-clone: extract-all validate-all
    @echo "Fresh clone ready. Run 'just serve' and open http://localhost:8080/."

# Pre-serve: re-extract derived data before launching the local server.
pre-serve: extract-floors
    @echo "Floor data refreshed. Launching server..."

# Pre-commit: re-extract + validate. Run before `git commit`.
pre-commit: extract-all validate-all
    @echo "Extract + validate clean. Safe to commit."

# Post-blockout-edit: rebuild floor-data.json and re-validate.
# Run after editing in the Blockout Visualizer or via `bo paint-rect` etc.
post-blockout-edit: extract-floors validate-blockouts
    @echo "Blockout changes extracted and validated."

# ---------- diagnostics ----------

# Print the versions of the core toolchain.
versions:
    @node --version
    @python --version
    @git --version

# Print the current git branch and short status.
status:
    @git branch --show-current
    @git status --short
