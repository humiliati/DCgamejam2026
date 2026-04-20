#!/usr/bin/env bash
# Fresh-clone macro: first-time setup after `git clone`.
# Extracts all derived data and runs the full validator suite.
set -euo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "$_here/../dg-profile.sh"

dg-fresh-clone
