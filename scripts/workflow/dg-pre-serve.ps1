# Pre-serve macro (PowerShell): refresh floor-data.json, then launch the local server.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\dg-profile.ps1')
dg-pre-serve
