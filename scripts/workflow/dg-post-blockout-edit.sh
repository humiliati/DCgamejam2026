#!/usr/bin/env bash
# Post-blockout-edit macro: rebuild floor-data.json and validate after
# any edit via the Blockout Visualizer or `bo` CLI.
set -euo pipefail

_here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
source "$_here/../dg-profile.sh"

dg-post-blockout-edit
