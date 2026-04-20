#!/usr/bin/env bash
# Pre-serve macro: refresh floor-data.json, then launch the local server.
set -euo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "$_here/../dg-profile.sh"

dg-pre-serve
