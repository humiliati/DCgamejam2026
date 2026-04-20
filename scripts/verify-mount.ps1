<#
.SYNOPSIS
Windows-side ground-truth snapshot of files under the repo.

.DESCRIPTION
Reports size, SHA256, LF-line-count, first line, and last 80 bytes of
each file — read directly from NTFS via PowerShell, bypassing the Cowork
mount cache entirely. Paste the output next to the sandbox's bash and
Read-tool views to triangulate whether the mount is lying to agents.

If Windows view matches sandbox bash ⇒ mount is coherent.
If Windows view matches Read tool but not bash ⇒ mount read-cache drift.
If Windows view matches bash but not Read tool ⇒ Read tool is returning a
staged/in-memory copy, not disk truth (CLAUDE.md guidance is inverted).
If Windows view matches NEITHER ⇒ external writer (sync tool, AV) is
mutating the file on disk underneath both of them.

.PARAMETER Path
Files to check. Absolute, or relative to the repo root. Defaults to the
two files the coding agent was editing when bindfs cache drift last hit.

.EXAMPLE
.\scripts\verify-mount.ps1

.EXAMPLE
.\scripts\verify-mount.ps1 engine\floor-manager.js data\quest-sidecars.js

.EXAMPLE
# Pass everything after the script name as file paths
.\scripts\verify-mount.ps1 tools\floor-data.js tools\floor-data.json
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Path = @(
        'engine\floor-manager.js',
        'tools\floor-data.js'
    )
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host 'verify-mount: Windows-side ground truth' -ForegroundColor Cyan
Write-Host "  repo: $RepoRoot"
Write-Host "  time: $(Get-Date -Format o)"
Write-Host "  host: $env:COMPUTERNAME  user: $env:USERNAME"

# Heads-up if the repo is inside a known cloud-sync root.
$cloudIndicators = @($env:OneDrive, $env:OneDriveCommercial, $env:OneDriveConsumer) |
    Where-Object { $_ -and (Test-Path $_) }
foreach ($c in $cloudIndicators) {
    if ($RepoRoot.StartsWith($c, [StringComparison]::OrdinalIgnoreCase)) {
        Write-Warning "Repo lives under a cloud-sync root ($c). This is a common cause of mount drift."
    }
}
Write-Host ''

foreach ($p in $Path) {
    $full = if ([IO.Path]::IsPathRooted($p)) { $p } else { Join-Path $RepoRoot $p }

    Write-Host "file: $p" -ForegroundColor Green

    if (-not (Test-Path -LiteralPath $full)) {
        Write-Warning "  missing: $full"
        Write-Host ''
        continue
    }

    $item = Get-Item -LiteralPath $full
    $bytes = [IO.File]::ReadAllBytes($full)
    $hash = Get-FileHash -LiteralPath $full -Algorithm SHA256

    # LF-line-count: count 0x0A bytes (matches `wc -l` semantics: trailing
    # newline-less line doesn't count). Avoids PowerShell's Get-Content
    # line-splitting heuristics.
    $lfCount = 0
    foreach ($b in $bytes) { if ($b -eq 0x0A) { $lfCount++ } }

    # First line as bytes then decode UTF-8, so an LF is the terminator.
    $firstLineEnd = [Array]::IndexOf($bytes, [byte]0x0A)
    if ($firstLineEnd -lt 0) { $firstLineEnd = $bytes.Length }
    $firstLineBytes = $bytes[0..([Math]::Max(0, $firstLineEnd - 1))]
    $firstLine = [Text.Encoding]::UTF8.GetString($firstLineBytes) -replace "`r", '\r'

    $tailLen = [Math]::Min(80, $bytes.Length)
    if ($tailLen -gt 0) {
        $tail = $bytes | Select-Object -Last $tailLen
        $tailText = ([Text.Encoding]::UTF8.GetString($tail)) -replace "`r", '\r' -replace "`n", '\n'
        $tailHex = ($tail | ForEach-Object { $_.ToString('x2') }) -join ''
    } else {
        $tailText = ''
        $tailHex = ''
    }

    # Cloud-sync pinned-state indicators (only meaningful on OneDrive paths)
    $attrs = $item.Attributes.ToString()

    '{0,-12} {1}' -f 'size:',     $item.Length | Write-Host
    '{0,-12} {1}' -f 'mtime UTC:', $item.LastWriteTimeUtc.ToString('o') | Write-Host
    '{0,-12} {1}' -f 'attrs:',    $attrs | Write-Host
    '{0,-12} {1}' -f 'sha256:',   $hash.Hash.ToLower() | Write-Host
    '{0,-12} {1}' -f 'LF lines:', $lfCount | Write-Host
    '{0,-12} {1}' -f 'first:',    $firstLine | Write-Host
    '{0,-12} {1}' -f 'tail(80):', $tailText | Write-Host
    '{0,-12} {1}' -f 'tailHex:',  $tailHex | Write-Host
    Write-Host ''
}

Write-Host 'Done. To cross-check from Cowork side, run in bash:' -ForegroundColor DarkGray
Write-Host '  cd "/sessions/<session>/mnt/Dev/Dungeon Gleaner Main"' -ForegroundColor DarkGray
Write-Host '  for f in <paths>; do stat -c "%s" "$f"; wc -l "$f"; sha256sum "$f"; done' -ForegroundColor DarkGray
