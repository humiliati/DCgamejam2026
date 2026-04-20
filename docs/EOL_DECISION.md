# EOL Configuration Decision Memo (DOC-123)

Authored 2026-04-19 on the fresh Cowork terminal. Companion to `CLAUDE.md` §Sandbox mount gotcha and `docs/CLI_CONSOLIDATION.md` (DOC-119).

**Audience:** the repo maintainer. **Recommendation below is advisory, not executed** — consistent with the "additive only" authoring scope for this session.

## Historical context

On the prior (pre-2026-04-19) Cowork sandbox, a three-way interaction caused recurring file-truncation and "you're seeing a stale file" incidents:

1. Git checkout on Windows with `core.autocrlf=true` (the installer default) rewrites LF → CRLF on disk.
2. A bindfs FUSE mount re-exported the working tree into the sandbox. bindfs cached stat inodes aggressively and, on some edits, handed out stale or truncated views.
3. The agent's Write tool wrote LF-only content through the sandbox; bindfs and NTFS disagreed on line-ending counts until a fresh stat, causing intermittent "file is truncated" diagnostics.

Mitigation applied at the time (see `CLAUDE.md`): pin `core.autocrlf=false`, `core.safecrlf=warn`, `core.eol=lf` in the local git config, plus keep `.gitattributes` with `* text=auto`.

## Current state (fresh terminal, 2026-04-19)

Verified on the new sandbox:

- `git config --local --get core.autocrlf` → unset (exit 1)
- `git config --local --get core.safecrlf` → unset (exit 1)
- `git config --local --get core.eol` → unset (exit 1)
- `git config --global --get core.autocrlf` → unset
- `.gitattributes` still contains the single line `* text=auto`

The sandbox-reproducer probe files (`tools/_sync_probe.txt`, `tools/_sync_probe_dispose.txt`) have not truncated in this session. Write-then-read round-trips through the sandbox now see fresh content. The bindfs failure mode has not reappeared.

## Risk surfaces that remain

Even without bindfs-sandbox contention, the pre-existing risk stays non-zero for the following reasons:

- If a user clones fresh on a Windows machine with a global `core.autocrlf=true` (installer default), git will still rewrite LF → CRLF during checkout. Any tool that reads bytes and expects LF (`node tools/extract-floors.js`, payload diffing, etc.) can still misbehave.
- `.gitattributes`'s `* text=auto` tells git to normalize on commit but does *not* force the working-tree line endings on checkout — that is still governed by `core.autocrlf` / `core.eol`.
- The Cowork sandbox is Linux-native; files arriving with CRLF trip bash scripts, causing `bad interpreter` or `no such file or directory` errors on shebang lines.
- Any future tool that hashes content (cache keys, diff-based commits in `bo`) becomes sensitive to EOL drift.

## Options considered

**Option A — Re-pin the three settings locally.** Run once on the working clone:

```sh
git config --local core.autocrlf false
git config --local core.safecrlf warn
git config --local core.eol lf
# Then re-normalize everything to the committed (LF) form:
git add --renormalize .
git status   # expect only EOL-only changes, review, then commit or discard
```

Pros: deterministic, works across all collaborators, matches what `.gitattributes` implies. Survives new clones provided the maintainer re-runs the three config lines (they are per-clone by design of `--local`).

Cons: re-normalization touches every file once; the resulting commit (if any) is noisy. The `--renormalize` step can surface existing inconsistencies.

**Option B — Upgrade `.gitattributes` to be prescriptive.** Replace the single `* text=auto` line with explicit rules:

```gitattributes
* text=auto eol=lf
*.ps1 text eol=crlf
*.bat text eol=crlf
*.cmd text eol=crlf
*.sh text eol=lf
*.js text eol=lf
*.json text eol=lf
*.html text eol=lf
*.md text eol=lf
*.css text eol=lf
# binary exclusions
*.png binary
*.jpg binary
*.webp binary
*.wav binary
*.ogg binary
*.mp3 binary
*.pdf binary
```

Pros: applies to every clone automatically without per-clone config. Keeps PowerShell files as CRLF (Windows-native), which some PowerShell versions require. Covers new collaborators.

Cons: a `.gitattributes` change typically triggers a one-time renormalize commit across the repo (noisy). Needs review of which binary extensions are already in use.

**Option C — Defer; rely on the fresh terminal.** Leave all three config keys unset, leave `.gitattributes` alone. Watch for the failure mode to reproduce and act only if it does.

Pros: zero churn. Matches the current empirical state (no truncation observed).

Cons: pushes the mitigation back onto the next person who hits the bug, which may be a fresh clone on a collaborator's Windows machine with default git installer settings.

## Recommendation

**Adopt Option A now, revisit Option B when/if a collaborator joins.**

Reasoning:

- Option A is a one-time three-line local config change, reversible with `git config --local --unset`. The blast radius is small and the benefit (predictable line endings in the sandbox, resilient to the next bindfs regression) is concrete.
- Option B's `.gitattributes` rewrite is the structurally correct answer but creates a one-time renormalize commit that is easier to land at a project-ready pause point rather than mid-jam. Revisit when the jam submission is done or when the team grows.
- Option C accepts a known latent risk that cost real engineering time in the prior sandbox. The fresh terminal has not yet been stressed enough to declare the risk gone.

## Apply Option A

From `<repo-root>` in any shell:

```sh
git config --local core.autocrlf false
git config --local core.safecrlf warn
git config --local core.eol lf

# Optional one-time renormalize. Review the diff before committing;
# if it's only EOL changes, commit with:
#   git commit -m "chore: normalize line endings to LF"
git add --renormalize .
git status
```

## Rollback

If anything surfaces as a regression, unset the three keys:

```sh
git config --local --unset core.autocrlf
git config --local --unset core.safecrlf
git config --local --unset core.eol
```

This returns the clone to the "fall through to global config" state it is in today.

## Cross-references

- `CLAUDE.md` §Sandbox mount gotcha — origin of the mitigation.
- `docs/CLI_CONSOLIDATION.md` (DOC-119) — reassesses `_sync_probe*` and the bindfs-workaround copy files.
- `.gitattributes` at `<repo-root>` — current EOL policy.
