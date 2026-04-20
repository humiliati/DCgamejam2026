# Workflow macros (DOC-122)

Standalone wrapper scripts for the common Dungeon Gleaner dev loops. Each
macro sources the shared profile at `scripts/dg-profile.{sh,ps1}` and then
calls the matching function, so logic stays in one place.

Use these when you do *not* want to permanently source `dg-profile` into
your shell — you can still double-click / invoke them directly.

| Macro | What it does | Bash | PowerShell |
|---|---|---|---|
| `dg-fresh-clone` | extract-all + validate-all after a new clone | `dg-fresh-clone.sh` | `dg-fresh-clone.ps1` |
| `dg-pre-serve` | rebuild floor-data.json, then `node serve.js` | `dg-pre-serve.sh` | `dg-pre-serve.ps1` |
| `dg-pre-commit` | extract-all + validate-all, gates `git commit` | `dg-pre-commit.sh` | `dg-pre-commit.ps1` |
| `dg-post-blockout-edit` | re-extract floors + validate blockouts | `dg-post-blockout-edit.sh` | `dg-post-blockout-edit.ps1` |

Equivalents also exist as `just` recipes (`just pre-serve`, `just pre-commit`, etc.) — see `<repo-root>/justfile`.

## Quick reference

```sh
# First time (after git clone)
bash scripts/workflow/dg-fresh-clone.sh

# Before starting a local session
bash scripts/workflow/dg-pre-serve.sh

# Before committing
bash scripts/workflow/dg-pre-commit.sh

# After editing a floor in the Blockout Visualizer
bash scripts/workflow/dg-post-blockout-edit.sh
```

PowerShell equivalents:

```powershell
.\scripts\workflow\dg-fresh-clone.ps1
.\scripts\workflow\dg-pre-serve.ps1
.\scripts\workflow\dg-pre-commit.ps1
.\scripts\workflow\dg-post-blockout-edit.ps1
```

## Design notes

- Each wrapper is ~4 lines — it sources the profile then invokes the function. Adding a new macro is: add the function to both profiles, then ship two wrappers (sh + ps1) that call it.
- No wrapper calls `node` or `python` directly. The canonical commands live in `tools/` and `serve.js` / `serve.py`; wrappers forward to them.
- `set -euo pipefail` (bash) and `$ErrorActionPreference = 'Stop'` (PowerShell) mean any failed step aborts the macro with a non-zero exit code — suitable for git hooks, CI, etc.

## Cross-references

- `<repo-root>/scripts/dg-profile.ps1` / `dg-profile.sh` — shell profile snippets (DOC-121).
- `<repo-root>/justfile` — task runner recipes for the same flows (DOC-120).
- `<repo-root>/docs/CLI_TOOLS.md` — canonical CLI inventory (DOC-118).
