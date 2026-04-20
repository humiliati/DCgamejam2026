<#
.SYNOPSIS
Continuously sample watched files from Windows and log every change, tagged
with the processes holding open handles at the moment of the change.

.DESCRIPTION
Leave this running in its own PowerShell window while the coding agent
works. Every -IntervalMs milliseconds it samples each watched file's
size, mtime, and (on change) SHA256. When something changes it appends a
row to samples-<timestamp>.csv and — if handle.exe is available — dumps
the current handle owners of the repo to handles-<timestamp>.log.

Next time the agent goes into a cache-coherence loop, the samples log
will show you exactly when the file changed on Windows, and the handles
log will show which process was holding it open at that instant. That's
almost always enough to identify whether the drift is caused by:
  - OneDrive/Dropbox sync partial-writes      (sync agent in handle log)
  - Windows Defender scanning during write    (MsMpEng.exe in handle log)
  - GitHub Desktop background watcher         (GitHubDesktop.exe in log)
  - Multiple IDEs' git integrations colliding (Code.exe / cursor.exe /...)
  - A genuine mount-layer bug                 (no unusual handle owners)

Sampling is cheap: stat only on each tick, hash only when size/mtime
changed, so we don't contend with the agent's own writes.

Ctrl+C to stop; log is flushed per-line so interrupting is safe.

.PARAMETER Path
Files to watch. Absolute or relative to the repo root.

.PARAMETER IntervalMs
Sample period. Default 500 ms.

.PARAMETER HandleExe
Explicit path to SysInternals handle.exe. Auto-detected from PATH and
common locations if omitted. Pass -HandleExe '' to disable handle logging.

.PARAMETER LogDir
Where to write log files. Default: scripts\_watch-logs\ (gitignore it).

.EXAMPLE
.\scripts\watch-mount.ps1

.EXAMPLE
.\scripts\watch-mount.ps1 engine\floor-manager.js -IntervalMs 250

.EXAMPLE
.\scripts\watch-mount.ps1 -HandleExe 'C:\Sysinternals\handle64.exe' `
    engine\floor-manager.js tools\floor-data.js data\quest-sidecars.js
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Path = @(
        'engine\floor-manager.js',
        'tools\floor-data.js'
    ),
    [int]$IntervalMs = 500,
    [string]$HandleExe,
    [string]$LogDir
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $LogDir) { $LogDir = Join-Path $PSScriptRoot '_watch-logs' }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Auto-detect handle.exe unless user passed -HandleExe '' to disable.
if ($null -eq $HandleExe) {
    $candidates = @(
        'handle.exe', 'handle64.exe',
        (Join-Path $RepoRoot 'handle.exe'),
        (Join-Path $RepoRoot 'handle64.exe'),
        (Join-Path $env:USERPROFILE 'Downloads\Handle\handle.exe'),
        (Join-Path $env:USERPROFILE 'Downloads\Handle\handle64.exe'),
        'C:\Sysinternals\handle.exe', 'C:\Sysinternals\handle64.exe',
        'C:\Tools\handle.exe', 'C:\Tools\handle64.exe'
    )
    foreach ($c in $candidates) {
        $cmd = Get-Command $c -ErrorAction SilentlyContinue
        if ($cmd) { $HandleExe = $cmd.Source; break }
    }
    if (-not $HandleExe) {
        Write-Warning "handle.exe not found on PATH or common locations."
        Write-Warning "  Sample logging will still work; handle-owner capture will not."
        Write-Warning "  Download from https://learn.microsoft.com/sysinternals/downloads/handle"
        Write-Warning "  and pass -HandleExe <full-path>, or add it to PATH."
    }
}
if ($HandleExe -eq '') { $HandleExe = $null }

$stamp      = Get-Date -Format 'yyyyMMdd-HHmmss'
$sampleLog  = Join-Path $LogDir "samples-$stamp.csv"
$handleLog  = Join-Path $LogDir "handles-$stamp.log"

'timestamp,path,size,mtime,sha256,event' | Out-File -FilePath $sampleLog -Encoding utf8

# Resolve watched paths to absolute form.
$targets = @()
foreach ($p in $Path) {
    $full = if ([IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $RepoRoot $p }
    $targets += [PSCustomObject]@{ Rel = $p; Abs = $full }
}

Write-Host 'watch-mount: starting' -ForegroundColor Cyan
Write-Host "  repo:       $RepoRoot"
Write-Host "  files:      $($targets.Rel -join ', ')"
Write-Host "  interval:   ${IntervalMs}ms"
Write-Host "  sample log: $sampleLog"
Write-Host "  handle log: $handleLog"
Write-Host "  handle.exe: $(if ($HandleExe) { $HandleExe } else { '(disabled)' })"
Write-Host "  Ctrl+C to stop."
Write-Host ''

$prev = @{}
foreach ($t in $targets) { $prev[$t.Abs] = $null }

function Get-Snapshot {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return [PSCustomObject]@{ Exists=$false; Size=0; Mtime=''; Sha='' }
    }
    $i = Get-Item -LiteralPath $Path
    return [PSCustomObject]@{
        Exists = $true
        Size   = $i.Length
        Mtime  = $i.LastWriteTimeUtc.ToString('o')
        Sha    = ''
    }
}

function Get-Sha256 {
    param([string]$Path)
    try {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()
    } catch {
        return "ERR:$($_.Exception.Message)"
    }
}

function Write-Handles {
    param([string]$Reason)
    if (-not $HandleExe) { return }
    $header = "`n===== $([DateTime]::UtcNow.ToString('o'))  reason=$Reason ====="
    Add-Content -Path $handleLog -Value $header
    try {
        $out = & $HandleExe -nobanner -accepteula "$RepoRoot" 2>&1
        Add-Content -Path $handleLog -Value $out
    } catch {
        Add-Content -Path $handleLog -Value "handle.exe error: $_"
    }
}

# Seed the handle log with an initial capture so we have a baseline.
Write-Handles 'startup-baseline'

try {
    while ($true) {
        $now = [DateTime]::UtcNow.ToString('o')
        foreach ($t in $targets) {
            $snap = Get-Snapshot -Path $t.Abs
            $p = $prev[$t.Abs]

            $event = $null
            if ($null -eq $p) {
                $event = if ($snap.Exists) { 'init' } else { 'init-missing' }
            } elseif (-not $snap.Exists -and $p.Exists) {
                $event = 'deleted'
            } elseif ($snap.Exists -and -not $p.Exists) {
                $event = 'created'
            } elseif ($snap.Size -ne $p.Size -or $snap.Mtime -ne $p.Mtime) {
                $event = 'changed'
            }

            if ($event) {
                # Hash only on events — avoids contending with agent writes every tick.
                if ($snap.Exists) { $snap.Sha = Get-Sha256 -Path $t.Abs }

                $row = '{0},"{1}",{2},{3},{4},{5}' -f `
                    $now, $t.Rel, $snap.Size, $snap.Mtime, $snap.Sha, $event
                Add-Content -Path $sampleLog -Value $row

                $shaShort = if ($snap.Sha) { $snap.Sha.Substring(0, [Math]::Min(12, $snap.Sha.Length)) } else { '-' }
                $color = switch ($event) {
                    'init'         { 'DarkGray' }
                    'init-missing' { 'DarkGray' }
                    'created'      { 'Green' }
                    'deleted'      { 'Red' }
                    'changed'      { 'Yellow' }
                    default        { 'White' }
                }
                Write-Host ("{0}  {1,-7}  {2}  size={3}  sha={4}" -f $now, $event, $t.Rel, $snap.Size, $shaShort) -ForegroundColor $color

                if ($event -in @('changed', 'deleted', 'created')) {
                    Write-Handles $event
                }
                $prev[$t.Abs] = $snap
            }
        }
        Start-Sleep -Milliseconds $IntervalMs
    }
} finally {
    Write-Host ''
    Write-Host "watch-mount: stopped. Logs in $LogDir" -ForegroundColor Cyan
    Write-Host "  samples: $sampleLog"
    Write-Host "  handles: $handleLog"
}
