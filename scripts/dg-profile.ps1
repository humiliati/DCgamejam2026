# Dungeon Gleaner — PowerShell profile snippet (DOC-121)
# -------------------------------------------------------
# Dot-source this file from your PowerShell profile to get short aliases
# and functions for the canonical CLIs documented in docs/CLI_TOOLS.md.
#
# Install once:
#   Add-Content $PROFILE ". '<repo-root>\scripts\dg-profile.ps1'"
# Or source manually per-session:
#   . .\scripts\dg-profile.ps1
#
# All functions honor $env:DG_REPO_ROOT. If unset, they fall back to the
# directory this script lives in (its parent). Set $env:DG_REPO_ROOT in
# your profile if you want the functions to work from anywhere.

if (-not $env:DG_REPO_ROOT) {
    $script:DG_REPO_ROOT = Split-Path -Parent $PSScriptRoot
} else {
    $script:DG_REPO_ROOT = $env:DG_REPO_ROOT
}

function dg-root { Write-Output $script:DG_REPO_ROOT }

function dg-cd { Set-Location $script:DG_REPO_ROOT }

# --- CLIs --------------------------------------------------------------

function bo {
    node "$script:DG_REPO_ROOT\tools\blockout-cli.js" @args
}

function npc {
    node "$script:DG_REPO_ROOT\tools\npc-cli.js" @args
}

function boxforge {
    node "$script:DG_REPO_ROOT\tools\boxforge-cli.js" @args
}

# --- extraction --------------------------------------------------------

function dg-extract-floors {
    node "$script:DG_REPO_ROOT\tools\extract-floors.js"
}

function dg-extract-all {
    Push-Location $script:DG_REPO_ROOT
    try {
        node tools\extract-floors.js
        node tools\generate-enemies-sidecar.js
        node tools\generate-archetype-sidecar.js
        node tools\generate-enemy-cards-sidecar.js
        node tools\generate-enemy-decks-sidecar.js
        node tools\generate-loot-tables-sidecar.js
        node tools\generate-schema-sidecar.js
        node tools\generate-verb-node-schema-sidecar.js
        node tools\generate-verb-node-overrides-schema-sidecar.js
        node tools\generate-verb-node-template-sidecar.js
        node tools\extract-npcs.js
        node tools\extract-dialogue-trees.js
        node tools\extract-verb-nodes.js
        node tools\extract-verb-node-overrides.js
    } finally {
        Pop-Location
    }
}

# --- validation --------------------------------------------------------

function dg-validate {
    Push-Location $script:DG_REPO_ROOT
    try {
        node tools\blockout-cli.js validate
        node tools\check-budgets.js
    } finally {
        Pop-Location
    }
}

# --- serve -------------------------------------------------------------

function dg-serve {
    Push-Location $script:DG_REPO_ROOT
    try {
        node serve.js
    } finally {
        Pop-Location
    }
}

# --- build stamp (DOC-129) ---------------------------------------------

function dg-stamp-build {
    & "$script:DG_REPO_ROOT\scripts\stamp-build.ps1"
}

# --- workflow macros ---------------------------------------------------

function dg-pre-serve {
    dg-extract-floors
    dg-serve
}

function dg-pre-commit {
    dg-extract-all
    dg-validate
    Write-Host "Extract + validate clean. Safe to commit." -ForegroundColor Green
}

function dg-post-blockout-edit {
    dg-extract-floors
    Push-Location $script:DG_REPO_ROOT
    try {
        node tools\blockout-cli.js validate
    } finally {
        Pop-Location
    }
    Write-Host "Blockout changes extracted and validated." -ForegroundColor Green
}

function dg-fresh-clone {
    dg-extract-all
    dg-validate
    Write-Host "Fresh clone ready. Run 'dg-serve' and open http://localhost:8080/." -ForegroundColor Green
}

# --- diagnostics -------------------------------------------------------

function dg-versions {
    node --version
    python --version
    git --version
}

Write-Host "Dungeon Gleaner profile loaded. Repo root: $script:DG_REPO_ROOT" -ForegroundColor DarkGray
Write-Host "Functions: bo, npc, boxforge, dg-cd, dg-serve, dg-extract-floors, dg-extract-all, dg-validate, dg-pre-serve, dg-pre-commit, dg-post-blockout-edit, dg-fresh-clone, dg-stamp-build, dg-versions" -ForegroundColor DarkGray
