# Pre-commit macro (PowerShell): re-extract derived data and validate.
# Exit 0 means the working tree is safe to commit.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\dg-profile.ps1')
dg-pre-commit
