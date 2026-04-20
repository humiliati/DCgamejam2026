#!/usr/bin/env bash
# Dungeon Gleaner — Bash profile snippet (DOC-121)
# -------------------------------------------------
# Source this file from your ~/.bashrc or ~/.zshrc to get short commands
# for the canonical CLIs documented in docs/CLI_TOOLS.md.
#
# Install once:
#   echo "source '<repo-root>/scripts/dg-profile.sh'" >> ~/.bashrc
# Or source manually per-session:
#   source ./scripts/dg-profile.sh
#
# All functions honor $DG_REPO_ROOT. If unset, they fall back to the
# directory this script lives in (its parent). Set DG_REPO_ROOT in your
# shell rc if you want the functions to work from anywhere.

if [ -z "${DG_REPO_ROOT:-}" ]; then
    # BASH_SOURCE[0] when sourced; $0 otherwise.
    _dg_src="${BASH_SOURCE[0]:-$0}"
    DG_REPO_ROOT="$(cd "$(dirname "$_dg_src")/.." && pwd)"
    export DG_REPO_ROOT
fi

dg-root() { printf '%s\n' "$DG_REPO_ROOT"; }
dg-cd()   { cd "$DG_REPO_ROOT" || return; }

# --- CLIs --------------------------------------------------------------

bo()       { node "$DG_REPO_ROOT/tools/blockout-cli.js" "$@"; }
npc()      { node "$DG_REPO_ROOT/tools/npc-cli.js"       "$@"; }
boxforge() { node "$DG_REPO_ROOT/tools/boxforge-cli.js"  "$@"; }

# --- extraction --------------------------------------------------------

dg-extract-floors() {
    node "$DG_REPO_ROOT/tools/extract-floors.js"
}

dg-extract-all() {
    (
        cd "$DG_REPO_ROOT" || return
        node tools/extract-floors.js \
        && node tools/generate-enemies-sidecar.js \
        && node tools/generate-archetype-sidecar.js \
        && node tools/generate-enemy-cards-sidecar.js \
        && node tools/generate-enemy-decks-sidecar.js \
        && node tools/generate-loot-tables-sidecar.js \
        && node tools/generate-schema-sidecar.js \
        && node tools/generate-verb-node-schema-sidecar.js \
        && node tools/generate-verb-node-overrides-schema-sidecar.js \
        && node tools/generate-verb-node-template-sidecar.js \
        && node tools/extract-npcs.js \
        && node tools/extract-dialogue-trees.js \
        && node tools/extract-verb-nodes.js \
        && node tools/extract-verb-node-overrides.js
    )
}

# --- validation --------------------------------------------------------

dg-validate() {
    (
        cd "$DG_REPO_ROOT" || return
        node tools/blockout-cli.js validate \
        && node tools/check-budgets.js
    )
}

# --- serve -------------------------------------------------------------

dg-serve() {
    (
        cd "$DG_REPO_ROOT" || return
        node serve.js
    )
}

# --- build stamp (DOC-129) ---------------------------------------------

dg-stamp-build() {
    bash "$DG_REPO_ROOT/scripts/stamp-build.sh"
}

# --- workflow macros ---------------------------------------------------

dg-pre-serve() {
    dg-extract-floors && dg-serve
}

dg-pre-commit() {
    dg-extract-all && dg-validate \
        && printf '\033[32mExtract + validate clean. Safe to commit.\033[0m\n'
}

dg-post-blockout-edit() {
    dg-extract-floors \
        && ( cd "$DG_REPO_ROOT" && node tools/blockout-cli.js validate ) \
        && printf '\033[32mBlockout changes extracted and validated.\033[0m\n'
}

dg-fresh-clone() {
    dg-extract-all && dg-validate \
        && printf '\033[32mFresh clone ready. Run "dg-serve" and open http://localhost:8080/.\033[0m\n'
}

# --- diagnostics -------------------------------------------------------

dg-versions() {
    node --version
    python --version 2>&1 || python3 --version
    git --version
}

printf '\033[90mDungeon Gleaner profile loaded. Repo root: %s\033[0m\n' "$DG_REPO_ROOT"
printf '\033[90mFunctions: bo, npc, boxforge, dg-cd, dg-serve, dg-extract-floors, dg-extract-all, dg-validate, dg-pre-serve, dg-pre-commit, dg-post-blockout-edit, dg-fresh-clone, dg-stamp-build, dg-versions\033[0m\n'
