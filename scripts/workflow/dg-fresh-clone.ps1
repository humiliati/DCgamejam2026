# Fresh-clone macro (PowerShell): first-time setup after `git clone`.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\dg-profile.ps1')
dg-fresh-clone
