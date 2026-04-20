# Post-blockout-edit macro (PowerShell): rebuild floor-data.json and validate.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\dg-profile.ps1')
dg-post-blockout-edit
