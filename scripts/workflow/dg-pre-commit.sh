#!/usr/bin/env bash
# Pre-commit macro: re-extract derived data and run all validators.
# Exit 0 means the working tree is safe to commit.
set -euo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "$_here/../dg-profile.sh"

dg-pre-commit
