<#
.SYNOPSIS
Whole-repo drift watcher — polls every file in the repo from the Windows
side and logs every change. Companion to scripts\watch-drift-all.sh on
the sandbox side.

.DESCRIPTION
Leaves you with a timestamped CSV of every file that was created,
deleted, or modified anywhere under the repo (with noisy directories
filtered out). Merge with the sandbox-side log to find files that moved
through states in a different order on the two sides — that's mount
drift.

Design notes:
  * 1 Hz polling by default. Cheap: stat only on each tick, hash only on
    change. A ~5000-file repo samples in well under 100 ms per tick.
  * `.git\objects\` and `.git\logs\` are excluded by default because
    they generate thousands of transient events during normal git
    operations and drown out the signal. `.git\index*` IS watched —
    those files are the best drift tells.
  * `scripts\_watch-logs\` is excluded to avoid self-feedback.
  * On the first tick every existing file is logged as 'init' so you
    have a baseline snapshot.
  * Handle owners are captured at startup and on every change burst so
    you can tell which Windows process was touching the repo when drift
    happened.

Run this in its own PowerShell window; Ctrl+C stops it cleanly.

.PARAMETER RepoRoot
Repo to watch. Defaults to the parent of this script's directory.

.PARAMETER IntervalMs
Polling interval. Default 1000 ms.

.PARAMETER LogDir
Where to write CSV + handle log. Default: scripts\_watch-logs\

.PARAMETER ExcludePattern
Regex patterns (applied to the path as seen with backslash separators,
relative to RepoRoot) that skip files from consideration. Defaults cover
git internals and node_modules.

.PARAMETER HandleExe
Path to SysInternals handle.exe (auto-detected; pass '' to disable).

.EXAMPLE
.\scripts\watch-drift-all.ps1

.EXAMPLE
.\scripts\watch-drift-all.ps1 -IntervalMs 500 -ExcludePattern '^\.git\\', '^node_modules\\'
#>
[CmdletBinding()]
param(
    [string]$RepoRoot,
    [int]$IntervalMs = 1000,
    [string]$LogDir,
    [string[]]$ExcludePattern = @(
        '^\.git\\objects\\',
        '^\.git\\logs\\',
        '^\.git\\lfs\\',
        '^scripts\\_watch-logs\\',
        '^node_modules\\',
        '^dist\\',
        '^EyesOnly\\'
    ),
    [string]$HandleExe
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) { $RepoRoot = Split-Path -Parent $PSScriptRoot }
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath
if (-not $LogDir)   { $LogDir = Join-Path $PSScriptRoot '_watch-logs' }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Auto-detect handle.exe (same logic as watch-mount.ps1).
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
}
if ($HandleExe -eq '') { $HandleExe = $null }

$stamp     = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
$driftLog  = Join-Path $LogDir "drift-windows-$stamp.csv"
$handleLog = Join-Path $LogDir "drift-windows-handles-$stamp.log"
'timestamp,event,path,size,mtime,sha256' | Out-File -FilePath $driftLog -Encoding utf8

Write-Host 'watch-drift-all.ps1: starting' -ForegroundColor Cyan
Write-Host "  repo:      $RepoRoot"
Write-Host "  interval:  ${IntervalMs}ms"
Write-Host "  drift log: $driftLog"
Write-Host "  handle log: $handleLog"
Write-Host "  handle.exe: $(if ($HandleExe) { $HandleExe } else { '(disabled)' })"
Write-Host "  excludes:  $($ExcludePattern -join '  |  ')"
Write-Host "  Ctrl+C to stop."
Write-Host ''

function Get-Inventory {
    param([string]$Root, [string[]]$Excludes)
    $inv = @{}
    $rootLen = $Root.Length + 1  # +1 to strip the trailing separator
    Get-ChildItem -LiteralPath $Root -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $rel = $_.FullName.Substring($rootLen)
        $skip = $false
        foreach ($pat in $Excludes) {
            if ($rel -match $pat) { $skip = $true; break }
        }
        if (-not $skip) {
            $inv[$rel] = [PSCustomObject]@{
                Size  = $_.Length
                Mtime = $_.LastWriteTimeUtc.ToString('o')
                Abs   = $_.FullName
            }
        }
    }
    return $inv
}

function Get-Sha256Quick {
    param([string]$Path)
    try {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLower()
    } catch {
        return "ERR:$($_.Exception.Message.Split([char]10)[0])"
    }
}

function Write-DriftRow {
    param([string]$Timestamp, [string]$Event, [string]$Rel,
          [string]$Size, [string]$Mtime, [string]$Sha)
    $row = '{0},{1},"{2}",{3},{4},{5}' -f $Timestamp, $Event, $Rel, $Size, $Mtime, $Sha
    Add-Content -Path $driftLog -Value $row
}

function Write-Handles {
    param([string]$Reason)
    if (-not $HandleExe) { return }
    Add-Content -Path $handleLog -Value "`n===== $([DateTime]::UtcNow.ToString('o'))  reason=$Reason ====="
    try {
        & $HandleExe -nobanner -accepteula "$RepoRoot" 2>&1 | Add-Content -Path $handleLog
    } catch {
        Add-Content -Path $handleLog -Value "handle.exe error: $_"
    }
}

Write-Host 'Building initial inventory...' -NoNewline
$prev = Get-Inventory -Root $RepoRoot -Excludes $ExcludePattern
Write-Host " $($prev.Count) files." -ForegroundColor DarkGray

# Log every file as 'init' so the baseline is captured (helps merging).
$initTs = [DateTime]::UtcNow.ToString('o')
foreach ($k in $prev.Keys) {
    $v = $prev[$k]
    Write-DriftRow -Timestamp $initTs -Event 'init' -Rel $k `
        -Size $v.Size -Mtime $v.Mtime -Sha ''   # skip initial hash for speed
}
Write-Handles 'startup-baseline'

try {
    while ($true) {
        Start-Sleep -Milliseconds $IntervalMs
        $now = [DateTime]::UtcNow.ToString('o')
        $curr = Get-Inventory -Root $RepoRoot -Excludes $ExcludePattern

        $events = @()

        foreach ($k in $curr.Keys) {
            if (-not $prev.ContainsKey($k)) {
                $events += ,@($k, 'created', $curr[$k])
            } elseif ($curr[$k].Size -ne $prev[$k].Size -or $curr[$k].Mtime -ne $prev[$k].Mtime) {
                $events += ,@($k, 'changed', $curr[$k])
            }
        }
        foreach ($k in $prev.Keys) {
            if (-not $curr.ContainsKey($k)) {
                $events += ,@($k, 'deleted', $prev[$k])
            }
        }

        if ($events.Count -gt 0) {
            foreach ($e in $events) {
                $rel = $e[0]; $ev = $e[1]; $meta = $e[2]
                $sha = if ($ev -eq 'deleted') { '' } else { Get-Sha256Quick -Path $meta.Abs }
                Write-DriftRow -Timestamp $now -Event $ev -Rel $rel `
                    -Size $meta.Size -Mtime $meta.Mtime -Sha $sha

                $color = switch ($ev) {
                    'created' { 'Green' }
                    'deleted' { 'Red' }
                    'changed' { 'Yellow' }
                    default   { 'White' }
                }
                $shaShort = if ($sha) { $sha.Substring(0, [Math]::Min(12, $sha.Length)) } else { '-' }
                Write-Host ("{0}  {1,-7}  {2}  size={3}  sha={4}" -f $now, $ev, $rel, $meta.Size, $shaShort) -ForegroundColor $color
            }
            # Group of events in one tick = one handle snapshot.
            Write-Handles ("{0}-events" -f $events.Count)
            $prev = $curr
        }
    }
} finally {
    Write-Host ''
    Write-Host "watch-drift-all.ps1: stopped." -ForegroundColor Cyan
    Write-Host "  drift: $driftLog"
    Write-Host "  handles: $handleLog"
}
