# ============================================================
# build-webos.ps1 — Pass 5b.0 ship-whitelist builder (Windows)
# ============================================================
# Assembles a webOS-ready dist\ by copying ONLY the whitelisted
# runtime assets. Dev-only directories (tools\, node_modules\,
# vendor\, raycast.js-master\, EyesOnly\, docs\, tests\, debug\,
# portal\, cd\) MUST NOT appear in dist\.
#
# Usage: powershell -File scripts\build-webos.ps1
# Exit:  0 on success, 2 if forbidden paths leak in.
# ============================================================
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dist = Join-Path $root 'dist'

Write-Host "[build-webos] root=$root"
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist | Out-Null

$whitelist = @(
  'index.html',
  'engine',
  'css',
  'data',
  'audio',
  'assets',
  'media_assets',
  'dungeongleanerlogo.png',
  'dungeongleanerlogo2.png'
)

foreach ($item in $whitelist) {
  $src = Join-Path $root $item
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination $dist -Recurse
    Write-Host "  + $item"
  } else {
    Write-Host "  ! missing: $item (skipped)"
  }
}

$forbidden = @('tools','node_modules','vendor','raycast.js-master','EyesOnly','docs','tests','debug','portal','cd','scripts','serve.js','serve.py','combat-test.html','test-harness.html')
$fail = $false
foreach ($bad in $forbidden) {
  if (Test-Path (Join-Path $dist $bad)) {
    Write-Host "[FAIL] forbidden path leaked into dist\: $bad"
    $fail = $true
  }
}

if ($fail) {
  Write-Host "[build-webos] FAILED - dist contains forbidden dev artifacts."
  exit 2
}

Write-Host "[build-webos] OK - dist\ is clean."
