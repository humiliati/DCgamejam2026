# audio-copy-and-verify.ps1
# Copies encoded audio assets into DG's media_assets/audio/ and verifies the manifest.
#
# Run from: DCgamejam2026/
# Prerequisites:
#   1. Run: node EyesOnly/scripts/encode-turtlebox.mjs
#   2. Verify EyesOnly/encoded_for_r2/turtlebox/ has .webm files
#
# Usage:
#   .\scripts\audio-copy-and-verify.ps1              # copy + verify
#   .\scripts\audio-copy-and-verify.ps1 -DryRun      # preview only

param([switch]$DryRun)

$ErrorActionPreference = "Stop"

$PROJECT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$R2      = Join-Path $PROJECT "EyesOnly\encoded_for_r2"
$TARGET  = Join-Path $PROJECT "media_assets\audio"

Write-Host "=== DG Audio Copy & Verify ===" -ForegroundColor Cyan
Write-Host "Source:  $R2"
Write-Host "Target:  $TARGET"
Write-Host ""

# ── Ensure target dirs exist ───────────────────────────────────────

New-Item -ItemType Directory -Force -Path (Join-Path $TARGET "sfx") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $TARGET "music") | Out-Null

# ── Step 1: Copy SFX (WebM only, flat into sfx/) ──────────────────

Write-Host "── Step 1: SFX ──" -ForegroundColor Yellow
$sfxDirs = @("card_sounds", "coin_sfx", "enemy_alert", "footsteps", "new_sfx")
$sfxCount = 0

foreach ($dir in $sfxDirs) {
    $srcDir = Join-Path $R2 $dir
    if (-not (Test-Path $srcDir)) {
        Write-Host "  SKIP: $dir (not found)" -ForegroundColor DarkGray
        continue
    }
    $files = Get-ChildItem -Path $srcDir -Filter "*.webm" -File
    Write-Host "  $dir : $($files.Count) WebM files"
    foreach ($f in $files) {
        $dest = Join-Path $TARGET "sfx\$($f.Name)"
        if ($DryRun) {
            Write-Host "    [dry] $($f.Name)" -ForegroundColor DarkGray
        } else {
            Copy-Item $f.FullName $dest -Force
        }
        $sfxCount++
    }
}
Write-Host "  Total SFX: $sfxCount" -ForegroundColor Green

# ── Step 2: Copy Aila Scott music (WebM only) ─────────────────────

Write-Host ""
Write-Host "── Step 2: Aila Scott Music ──" -ForegroundColor Yellow
$ailaDir = Join-Path $R2 "aila_scott"
$ailaCount = 0

if (Test-Path $ailaDir) {
    $files = Get-ChildItem -Path $ailaDir -Filter "*.webm" -File
    Write-Host "  Found: $($files.Count) tracks"
    foreach ($f in $files) {
        $dest = Join-Path $TARGET "music\$($f.Name)"
        if ($DryRun) {
            Write-Host "    [dry] $($f.Name)" -ForegroundColor DarkGray
        } else {
            Copy-Item $f.FullName $dest -Force
        }
        $ailaCount++
    }
} else {
    Write-Host "  SKIP: aila_scott not found" -ForegroundColor Red
}
Write-Host "  Total Aila: $ailaCount" -ForegroundColor Green

# ── Step 3: Copy Turtlebox music (WebM only) ──────────────────────

Write-Host ""
Write-Host "── Step 3: Turtlebox Music ──" -ForegroundColor Yellow
$turtleDir = Join-Path $R2 "turtlebox"
$turtleCount = 0

if (Test-Path $turtleDir) {
    $files = Get-ChildItem -Path $turtleDir -Filter "*.webm" -File
    Write-Host "  Found: $($files.Count) tracks"
    foreach ($f in $files) {
        $dest = Join-Path $TARGET "music\$($f.Name)"
        if ($DryRun) {
            Write-Host "    [dry] $($f.Name)" -ForegroundColor DarkGray
        } else {
            Copy-Item $f.FullName $dest -Force
        }
        $turtleCount++
    }
} else {
    Write-Host "  NOT FOUND: Run 'node EyesOnly/scripts/encode-turtlebox.mjs' first!" -ForegroundColor Red
}
Write-Host "  Total Turtlebox: $turtleCount" -ForegroundColor Green

# ── Step 4: Verify manifest against files ──────────────────────────

Write-Host ""
Write-Host "── Step 4: Manifest Verification ──" -ForegroundColor Yellow
$manifestPath = Join-Path $PROJECT "data\audio-manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

$missing = @()
$found = 0
$total = 0

foreach ($key in $manifest.PSObject.Properties.Name) {
    if ($key.StartsWith("_")) { continue }
    $total++
    $src = $manifest.$key.src
    $fullPath = Join-Path $TARGET $src
    if (Test-Path $fullPath) {
        $found++
    } else {
        $missing += "$key -> $src"
    }
}

Write-Host "  Manifest entries: $total"
Write-Host "  Files found:      $found" -ForegroundColor Green
if ($missing.Count -gt 0) {
    Write-Host "  MISSING:          $($missing.Count)" -ForegroundColor Red
    foreach ($m in $missing) {
        Write-Host "    $m" -ForegroundColor Red
    }
} else {
    Write-Host "  All files present!" -ForegroundColor Green
}

# ── Step 5: Size report ───────────────────────────────────────────

Write-Host ""
Write-Host "── Step 5: Size Report ──" -ForegroundColor Yellow
$sfxSize   = (Get-ChildItem -Path (Join-Path $TARGET "sfx") -File -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$musicSize = (Get-ChildItem -Path (Join-Path $TARGET "music") -File -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
$totalSize = $sfxSize + $musicSize

Write-Host ("  SFX:   {0:N1} MB" -f $sfxSize)
Write-Host ("  Music: {0:N1} MB" -f $musicSize)
Write-Host ("  Total: {0:N1} MB" -f $totalSize) -ForegroundColor Cyan

if ($totalSize -gt 50) {
    Write-Host "  WARNING: Audio over 50MB budget!" -ForegroundColor Red
} else {
    Write-Host "  Within 50MB budget." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done." -ForegroundColor Cyan
